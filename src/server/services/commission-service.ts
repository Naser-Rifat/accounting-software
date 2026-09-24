import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { AdjustmentReason, CommissionStatus } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { getBaseCurrency, getRate, toBase } from '@/server/accounting/fx'
import { postEntry, reverseEntry } from '@/server/accounting/post'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'

/**
 * University commission — docs/modules/04-university-commission.md, the core.
 *
 *   EXPECTED -> ELIGIBLE -> APPROVED -> CLAIMED -> PARTIALLY_RECEIVED -> RECEIVED
 *
 * Revenue is recognised at APPROVED and nowhere else: row 2 of the posting
 * matrix, Dr 1130 Accrued Commission / Cr 4010. Everything before that is a
 * forecast that never touches the ledger; everything after moves between
 * 1130, 1120 and the bank in the claim and receipt services. Rate, agreement
 * and FX rate are snapshotted, so a later contract or rate change restates
 * nothing.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const ZERO = new Prisma.Decimal(0)

const INCLUDE = {
  application: {
    select: {
      id: true,
      code: true,
      branch: { select: { costCenterId: true } },
      student: { select: { id: true, firstName: true, lastName: true, agentId: true } },
      university: { select: { id: true, name: true, partyId: true } },
      intake: { select: { id: true, name: true } },
      counselor: { select: { id: true, name: true, partyId: true, commissionRate: true } },
    },
  },
  agreement: { select: { title: true, appliesTo: true, scheduleType: true, paymentTermsDays: true } },
  scheduleLine: { select: { label: true, triggerEvent: true, offsetDays: true } },
  claim: { select: { id: true, claimNo: true, status: true } },
} satisfies Prisma.CommissionInclude

type Row = Prisma.CommissionGetPayload<{ include: typeof INCLUDE }>

function summarise(c: Row) {
  return {
    id: c.id,
    applicationId: c.application.id,
    applicationCode: c.application.code,
    studentId: c.application.student.id,
    student: `${c.application.student.firstName} ${c.application.student.lastName}`,
    universityId: c.application.university.id,
    university: c.application.university.name,
    intakeId: c.application.intake.id,
    intake: c.application.intake.name,
    counselorId: c.application.counselor.id,
    counselor: c.application.counselor.name,
    instalmentSeq: c.instalmentSeq,
    instalmentLabel: c.instalmentLabel,
    agreement: c.agreement.title,
    baseAmount: c.baseAmount.toFixed(2),
    rateType: c.rateType,
    rate: c.rate.toString(),
    expectedAmount: c.expectedAmount.toFixed(2),
    netAmount: c.netAmount.toFixed(2),
    currency: c.currency,
    fxRate: c.fxRate?.toString() ?? null,
    baseCurrencyAmount: c.baseCurrencyAmount?.toFixed(2) ?? null,
    status: c.status,
    eligibleOn: c.eligibleOn ? toDay(c.eligibleOn) : null,
    approvedOn: c.approvedOn ? toDay(c.approvedOn) : null,
    receivedOn: c.receivedOn ? toDay(c.receivedOn) : null,
    claimId: c.claim?.id ?? null,
    claimNo: c.claim?.claimNo ?? null,
    ageDays: Math.floor((Date.now() - c.createdAt.getTime()) / 86_400_000),
  }
}

export type CommissionRow = ReturnType<typeof summarise>

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type CommissionFilter = {
  status?: CommissionStatus
  universityId?: string
  intakeId?: string
  counselorId?: string
  applicationId?: string
}

export async function listCommissions(filter: CommissionFilter = {}) {
  const rows = await prisma.commission.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
      application: {
        ...(filter.universityId ? { universityId: filter.universityId } : {}),
        ...(filter.intakeId ? { intakeId: filter.intakeId } : {}),
        ...(filter.counselorId ? { counselorId: filter.counselorId } : {}),
      },
    },
    orderBy: [{ createdAt: 'desc' }, { instalmentSeq: 'asc' }],
    include: INCLUDE,
  })
  return rows.map(summarise)
}

/** Summary tiles: totals per status, per currency (a forecast is never mixed into base). */
export function summariseByStatus(rows: CommissionRow[]) {
  const buckets: Record<string, Map<string, number>> = {
    EXPECTED: new Map(),
    ELIGIBLE: new Map(),
    APPROVED: new Map(),
    CLAIMED: new Map(),
    RECEIVED: new Map(),
  }
  for (const r of rows) {
    const key =
      r.status === 'PARTIALLY_RECEIVED' || r.status === 'RECEIVED'
        ? 'RECEIVED'
        : r.status in buckets
          ? r.status
          : null
    if (!key) continue
    const m = buckets[key]!
    m.set(r.currency, (m.get(r.currency) ?? 0) + Number(r.netAmount))
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([k, m]) => [
      k,
      [...m].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) })),
    ]),
  ) as Record<'EXPECTED' | 'ELIGIBLE' | 'APPROVED' | 'CLAIMED' | 'RECEIVED', { currency: string; amount: string }[]>
}

export async function getCommission(id: string) {
  const c = await prisma.commission.findUnique({
    where: { id },
    include: {
      ...INCLUDE,
      adjustments: { orderBy: { createdAt: 'asc' } },
      internal: { include: { party: { select: { name: true, type: true } } } },
      claim: { select: { id: true, claimNo: true, status: true, claimedOn: true, dueOn: true } },
    },
  })
  if (!c) return null

  const voucherIds = [
    c.journalEntryId,
    ...c.adjustments.map((a) => a.journalEntryId),
    ...c.internal.map((i) => i.journalEntryId),
  ].filter((x): x is string => Boolean(x))
  const vouchers = voucherIds.length
    ? await prisma.journalEntry.findMany({
        where: { id: { in: voucherIds } },
        select: { id: true, voucherNo: true, voucherType: true, entryDate: true, status: true, narration: true },
        orderBy: { entryDate: 'asc' },
      })
    : []
  const history = await prisma.auditLog.findMany({
    where: { entity: 'Commission', entityId: id },
    orderBy: { createdAt: 'asc' },
  })

  return {
    ...summarise(c),
    appliesTo: c.agreement.appliesTo,
    scheduleType: c.agreement.scheduleType,
    scheduleLine: c.scheduleLine,
    journalEntryId: c.journalEntryId,
    claim: c.claim
      ? { ...c.claim, claimedOn: c.claim.claimedOn ? toDay(c.claim.claimedOn) : null, dueOn: c.claim.dueOn ? toDay(c.claim.dueOn) : null }
      : null,
    adjustments: c.adjustments.map((a) => ({
      id: a.id,
      amount: a.amount.toFixed(2),
      reason: a.reason,
      note: a.note,
      journalEntryId: a.journalEntryId,
      createdBy: a.createdBy,
      createdAt: toDay(a.createdAt),
    })),
    internal: c.internal.map((i) => ({
      id: i.id,
      payee: i.party.name,
      payeeType: i.party.type,
      rate: i.rate.toString(),
      earnedAmount: i.earnedAmount.toFixed(2),
      paidAmount: i.paidAmount.toFixed(2),
      currency: i.currency,
      status: i.status,
    })),
    vouchers: vouchers.map((v) => ({ ...v, entryDate: toDay(v.entryDate) })),
    history: history.map((h) => ({
      at: h.createdAt.toISOString(),
      by: h.username,
      action: h.action,
      after: (h.after ?? null) as Record<string, unknown> | null,
    })),
  }
}

export type CommissionDetail = NonNullable<Awaited<ReturnType<typeof getCommission>>>

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function lockCommission(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Commission" WHERE "id" = ${id} FOR UPDATE`
  const c = await tx.commission.findUnique({ where: { id }, include: INCLUDE })
  if (!c) throw new AccountingError('NOT_FOUND', 'Commission not found.')
  return c
}

/** EXPECTED → ELIGIBLE. The trigger has fired; still no posting. */
export async function markEligible(input: { commissionIds: string[]; eligibleOn: Date; actor: AuditActor }) {
  let changed = 0
  for (const id of input.commissionIds) {
    await prisma.$transaction(async (tx) => {
      const c = await lockCommission(tx, id)
      if (c.status !== 'EXPECTED') return
      await tx.commission.update({ where: { id }, data: { status: 'ELIGIBLE', eligibleOn: input.eligibleOn } })
      await recordAudit(tx, {
        actor: input.actor,
        action: 'COMMISSION_ELIGIBLE',
        entity: 'Commission',
        entityId: id,
        before: { status: 'EXPECTED' },
        after: { status: 'ELIGIBLE', eligibleOn: toDay(input.eligibleOn) },
      })
      changed++
    })
  }
  return { changed }
}

/**
 * ELIGIBLE → APPROVED: revenue is earned. Row 2, in the commission currency at
 * the approval-date rate, which is snapshotted. Also accrues the counselor's
 * and agent's internal commission (docs/08 — no payable before the revenue).
 */
export async function approveCommission(input: {
  commissionId: string
  approvedOn: Date
  actor: AuditActor
  canPostToSoftClosed?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const c = await lockCommission(tx, input.commissionId)
    if (c.status !== 'ELIGIBLE') {
      throw new AccountingError(
        'ILLEGAL_TRANSITION',
        `Only an eligible commission can be approved; this one is ${c.status.toLowerCase().replaceAll('_', ' ')}.`,
      )
    }
    if (c.netAmount.lte(ZERO)) throw new AccountingError('VALIDATION', 'Nothing to recognise: the net amount is zero.')

    const base = await getBaseCurrency(tx)
    const fxRate = await getRate(tx, c.currency, base, input.approvedOn)
    const costCenterId = c.application.branch.costCenterId

    const voucher = await postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.approvedOn,
      narration: `Commission earned — ${c.application.code} ${c.application.student.firstName} ${c.application.student.lastName} @ ${c.application.university.name} (${c.instalmentLabel})`,
      sourceType: 'COMMISSION',
      sourceId: c.id,
      currency: c.currency,
      fxRate,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.ACCRUED_COMMISSION, debit: c.netAmount.toFixed(2), costCenterId },
        { accountCode: ACCOUNTS.COMMISSION_INCOME, credit: c.netAmount.toFixed(2), costCenterId },
      ],
    })

    await tx.commission.update({
      where: { id: c.id },
      data: {
        status: 'APPROVED',
        approvedOn: input.approvedOn,
        fxRate,
        baseCurrencyAmount: toBase(c.netAmount, fxRate),
        journalEntryId: voucher.id,
      },
    })

    // Internal commission accrues now — docs/modules/08 §Matching.
    const payees: { partyId: string; counselorId?: string; agentId?: string; rate: Prisma.Decimal }[] = [
      { partyId: c.application.counselor.partyId, counselorId: c.application.counselor.id, rate: c.application.counselor.commissionRate },
    ]
    if (c.application.student.agentId) {
      const agent = await tx.agent.findUnique({ where: { id: c.application.student.agentId } })
      if (agent?.isActive) payees.push({ partyId: agent.partyId, agentId: agent.id, rate: agent.commissionRate })
    }
    let accrued = 0
    for (const p of payees) {
      if (p.rate.lte(ZERO)) continue
      const earned = c.netAmount.mul(p.rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      await tx.internalCommission.upsert({
        where: { commissionId_partyId: { commissionId: c.id, partyId: p.partyId } },
        create: {
          applicationId: c.applicationId,
          commissionId: c.id,
          partyId: p.partyId,
          counselorId: p.counselorId ?? null,
          agentId: p.agentId ?? null,
          rateType: 'PERCENT',
          rate: p.rate,
          baseAmount: c.netAmount,
          earnedAmount: earned,
          currency: c.currency,
          createdBy: input.actor.username,
        },
        update: {},
      })
      accrued++
    }

    await recordAudit(tx, {
      actor: input.actor,
      action: 'COMMISSION_APPROVED',
      entity: 'Commission',
      entityId: c.id,
      before: { status: c.status },
      after: { status: 'APPROVED', approvedOn: toDay(input.approvedOn), voucherNo: voucher.voucherNo, fxRate: fxRate.toString(), internalAccrued: accrued },
    })
    return { id: c.id, voucherNo: voucher.voucherNo, internalAccrued: accrued }
  })
}

/**
 * Cancel before it is billed. Nothing posted → just CANCELLED; already
 * APPROVED → the approval JV is reversed (row 9). A claimed commission is
 * cancelled by taking it off the claim or crediting the claim.
 */
export async function cancelCommission(input: {
  commissionId: string
  reason: string
  cancelledOn: Date
  actor: AuditActor
  canPostToSoftClosed?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const c = await lockCommission(tx, input.commissionId)
    if (!['EXPECTED', 'ELIGIBLE', 'APPROVED'].includes(c.status)) {
      throw new AccountingError(
        'ILLEGAL_TRANSITION',
        c.claim ? `Commission is on claim ${c.claim.claimNo}; remove it from the claim or credit the claim instead.` : `A ${c.status.toLowerCase().replaceAll('_', ' ')} commission cannot be cancelled.`,
      )
    }

    let reversalNo: string | null = null
    if (c.status === 'APPROVED' && c.journalEntryId) {
      const reversal = await reverseEntry(tx, c.journalEntryId, {
        reversalDate: input.cancelledOn,
        reason: `Commission cancelled: ${input.reason}`,
        createdBy: input.actor.username,
        canPostToSoftClosed: input.canPostToSoftClosed,
      })
      reversalNo = reversal.voucherNo
    }

    // Internal commission follows: an accrual simply goes; an approved one is reversed (row 32).
    const internal = await tx.internalCommission.findMany({ where: { commissionId: c.id } })
    for (const i of internal) {
      if (i.status === 'PAID' || i.status === 'PARTIALLY_PAID') {
        throw new AccountingError('VALIDATION', 'Internal commission on this row has been paid; recover it before cancelling.')
      }
      if (i.status === 'APPROVED' && i.journalEntryId) {
        await reverseEntry(tx, i.journalEntryId, {
          reversalDate: input.cancelledOn,
          reason: `Source commission cancelled: ${input.reason}`,
          createdBy: input.actor.username,
          canPostToSoftClosed: input.canPostToSoftClosed,
        })
      }
      if (i.status !== 'CANCELLED') {
        await tx.internalCommission.update({ where: { id: i.id }, data: { status: 'CANCELLED' } })
      }
    }

    await tx.commission.update({ where: { id: c.id }, data: { status: 'CANCELLED' } })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'COMMISSION_CANCELLED',
      entity: 'Commission',
      entityId: c.id,
      before: { status: c.status },
      after: { status: 'CANCELLED', reason: input.reason, reversalVoucherNo: reversalNo },
    })
    return { id: c.id, reversalNo }
  })
}

/**
 * Adjust after approval — never edit `expectedAmount`. A reduction is a credit
 * note (row 4), an increase a sales invoice (row 5); against 1130 while
 * unbilled, against 1120 (with the university party) once claimed.
 */
export async function addAdjustment(input: {
  commissionId: string
  amount: string
  reason: AdjustmentReason
  note?: string
  adjustedOn: Date
  actor: AuditActor
  canPostToSoftClosed?: boolean
}) {
  const delta = new Prisma.Decimal(input.amount)
  if (delta.isZero()) throw new AccountingError('VALIDATION', 'An adjustment cannot be zero.')

  return prisma.$transaction(async (tx) => {
    const c = await lockCommission(tx, input.commissionId)
    if (c.status !== 'APPROVED' && c.status !== 'CLAIMED') {
      throw new AccountingError('ILLEGAL_TRANSITION', 'Only an approved or claimed commission can be adjusted.')
    }
    const newNet = c.netAmount.add(delta)
    if (newNet.isNegative()) throw new AccountingError('VALIDATION', 'The adjustment would make the commission negative.')

    const base = await getBaseCurrency(tx)
    const fxRate = await getRate(tx, c.currency, base, input.adjustedOn)
    const abs = delta.abs().toFixed(2)
    const costCenterId = c.application.branch.costCenterId
    const receivable =
      c.status === 'CLAIMED'
        ? { accountCode: ACCOUNTS.AR_UNIVERSITIES, partyId: c.application.university.partyId }
        : { accountCode: ACCOUNTS.ACCRUED_COMMISSION }

    const voucher = await postEntry(tx, {
      voucherType: delta.isNegative() ? 'CN' : 'SI',
      entryDate: input.adjustedOn,
      narration: `Commission ${delta.isNegative() ? 'reduced' : 'increased'} — ${c.application.code} (${input.reason.toLowerCase().replaceAll('_', ' ')})`,
      sourceType: 'COMMISSION',
      sourceId: c.id,
      currency: c.currency,
      fxRate,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: delta.isNegative()
        ? [
            { accountCode: ACCOUNTS.COMMISSION_INCOME, debit: abs, costCenterId },
            { ...receivable, credit: abs, costCenterId },
          ]
        : [
            { ...receivable, debit: abs, costCenterId },
            { accountCode: ACCOUNTS.COMMISSION_INCOME, credit: abs, costCenterId },
          ],
    })

    const adjustment = await tx.commissionAdjustment.create({
      data: {
        commissionId: c.id,
        amount: delta,
        reason: input.reason,
        note: input.note ?? null,
        journalEntryId: voucher.id,
        createdBy: input.actor.username,
      },
    })
    await tx.commission.update({
      where: { id: c.id },
      data: {
        netAmount: newNet,
        baseCurrencyAmount: c.fxRate ? toBase(newNet, c.fxRate) : undefined,
      },
    })
    if (c.claimId) {
      await tx.commissionClaim.update({ where: { id: c.claimId }, data: { totalAmount: { increment: delta } } })
    }
    await recordAudit(tx, {
      actor: input.actor,
      action: 'COMMISSION_ADJUSTED',
      entity: 'Commission',
      entityId: c.id,
      before: { netAmount: c.netAmount.toFixed(2) },
      after: { netAmount: newNet.toFixed(2), delta: delta.toFixed(2), reason: input.reason, voucherNo: voucher.voucherNo },
    })
    return { id: adjustment.id, voucherNo: voucher.voucherNo, netAmount: newNet.toFixed(2) }
  })
}
