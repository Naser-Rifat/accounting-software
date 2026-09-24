import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { ClaimStatus } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { getBaseCurrency, getRate, toBase } from '@/server/accounting/fx'
import { allocateNumber, fiscalYearFor } from '@/server/accounting/numbering'
import { postEntry, reverseEntry } from '@/server/accounting/post'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'

/**
 * Commission claims — docs/modules/05-university-receivable.md.
 *
 * A claim is the sales invoice to a university: approved commissions grouped
 * into one billable document. DRAFT has no GL effect; SENT posts row 3
 * (Dr 1120 with the party / Cr 1130) and starts the aging clock. Receipts
 * settle claims in receipt-service; a claim is never deleted, only cancelled
 * by reversal.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const ZERO = new Prisma.Decimal(0)

const INCLUDE = {
  university: { select: { id: true, name: true } },
  party: { select: { code: true } },
  commissions: {
    select: {
      id: true,
      instalmentLabel: true,
      netAmount: true,
      currency: true,
      status: true,
      application: { select: { code: true, student: { select: { firstName: true, lastName: true } } } },
    },
  },
  allocations: {
    select: {
      id: true,
      amount: true,
      baseAmount: true,
      receipt: { select: { id: true, receiptNo: true, receivedOn: true, method: true, reference: true, withheldTax: true } },
    },
  },
} satisfies Prisma.CommissionClaimInclude

type Row = Prisma.CommissionClaimGetPayload<{ include: typeof INCLUDE }>

const OPEN_STATUSES: ClaimStatus[] = ['SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'DISPUTED']

function summarise(c: Row, today = toDay(new Date())) {
  const received = c.allocations.reduce((s, a) => s.add(a.amount), ZERO)
  const balance = c.totalAmount.sub(received)
  const due = c.dueOn ? toDay(c.dueOn) : null
  const overdueDays =
    due && OPEN_STATUSES.includes(c.status) && due < today
      ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000)
      : 0
  return {
    id: c.id,
    claimNo: c.claimNo,
    universityId: c.university.id,
    university: c.university.name,
    universityCode: c.party.code,
    claimedOn: c.claimedOn ? toDay(c.claimedOn) : null,
    dueOn: due,
    totalAmount: c.totalAmount.toFixed(2),
    received: received.toFixed(2),
    balance: balance.toFixed(2),
    currency: c.currency,
    fxRate: c.fxRate?.toString() ?? null,
    baseAmount: c.baseAmount?.toFixed(2) ?? null,
    status: c.status,
    overdueDays,
    members: c.commissions.length,
    createdAt: toDay(c.createdAt),
  }
}

export type ClaimRow = ReturnType<typeof summarise>

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listClaims(filter: { universityId?: string; status?: ClaimStatus } = {}) {
  const rows = await prisma.commissionClaim.findMany({
    where: {
      ...(filter.universityId ? { universityId: filter.universityId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: INCLUDE,
  })
  return rows.map((r) => summarise(r))
}

export async function getClaim(id: string) {
  const c = await prisma.commissionClaim.findUnique({ where: { id }, include: INCLUDE })
  if (!c) return null
  const voucherIds = [c.journalEntryId].filter((x): x is string => Boolean(x))
  const vouchers = voucherIds.length
    ? await prisma.journalEntry.findMany({
        where: { OR: [{ id: { in: voucherIds } }, { sourceType: 'COMMISSION_CLAIM', sourceId: c.id }] },
        select: { id: true, voucherNo: true, voucherType: true, entryDate: true, status: true, narration: true },
        orderBy: { entryDate: 'asc' },
      })
    : []
  return {
    ...summarise(c),
    partyId: c.partyId,
    notes: c.notes,
    createdBy: c.createdBy,
    journalEntryId: c.journalEntryId,
    commissions: c.commissions.map((m) => ({
      id: m.id,
      applicationCode: m.application.code,
      student: `${m.application.student.firstName} ${m.application.student.lastName}`,
      instalmentLabel: m.instalmentLabel,
      netAmount: m.netAmount.toFixed(2),
      status: m.status,
    })),
    receipts: c.allocations.map((a) => ({
      id: a.id,
      receiptId: a.receipt.id,
      receiptNo: a.receipt.receiptNo,
      receivedOn: toDay(a.receipt.receivedOn),
      method: a.receipt.method,
      reference: a.receipt.reference,
      amount: a.amount.toFixed(2),
      baseAmount: a.baseAmount.toFixed(2),
    })),
    vouchers: vouchers.map((v) => ({ ...v, entryDate: toDay(v.entryDate) })),
  }
}

export type ClaimDetail = NonNullable<Awaited<ReturnType<typeof getClaim>>>

/** Approved, unclaimed commissions of one university — the pick list for a new claim. */
export async function listClaimableCommissions(universityId: string) {
  const rows = await prisma.commission.findMany({
    where: { status: 'APPROVED', claimId: null, application: { universityId } },
    orderBy: [{ approvedOn: 'asc' }],
    include: {
      application: { select: { code: true, student: { select: { firstName: true, lastName: true } }, intake: { select: { name: true } } } },
      agreement: { select: { paymentTermsDays: true } },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    applicationCode: c.application.code,
    student: `${c.application.student.firstName} ${c.application.student.lastName}`,
    intake: c.application.intake.name,
    instalmentLabel: c.instalmentLabel,
    netAmount: c.netAmount.toFixed(2),
    currency: c.currency,
    approvedOn: c.approvedOn ? toDay(c.approvedOn) : null,
    paymentTermsDays: c.agreement.paymentTermsDays,
  }))
}

/** Open claims of a party, for receipt allocation. */
export async function listOpenClaims(partyId: string) {
  const rows = await prisma.commissionClaim.findMany({
    where: { partyId, status: { in: OPEN_STATUSES } },
    orderBy: [{ dueOn: 'asc' }],
    include: INCLUDE,
  })
  return rows.map((r) => summarise(r))
}

/**
 * The receivables view — docs/05 §Screens: per university, unbilled (1130),
 * billed, received, outstanding, aging buckets by due date. Outstanding is the
 * 1120 party balance from the ledger, in base currency.
 */
export async function getReceivablesSummary() {
  const today = toDay(new Date())
  const [universities, unbilled, claims] = await Promise.all([
    prisma.university.findMany({ where: { isActive: true }, select: { id: true, name: true, partyId: true, currency: true }, orderBy: { name: 'asc' } }),
    prisma.commission.groupBy({
      by: ['applicationId'],
      where: { status: 'APPROVED', claimId: null },
      _sum: { baseCurrencyAmount: true },
    }),
    prisma.commissionClaim.findMany({ where: { status: { in: [...OPEN_STATUSES, 'PAID'] } }, include: INCLUDE }),
  ])
  const appToUniversity = new Map(
    (await prisma.application.findMany({ where: { id: { in: unbilled.map((u) => u.applicationId) } }, select: { id: true, universityId: true } })).map((a) => [a.id, a.universityId]),
  )
  const outstanding = await controlBalances(ACCOUNTS.AR_UNIVERSITIES, universities.map((u) => u.partyId), 'DEBIT')

  const buckets = ['current', '1-30', '31-60', '61-90', '90+'] as const
  const bucketOf = (row: ClaimRow) => {
    const d = row.overdueDays
    return d <= 0 ? 'current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+'
  }

  return universities.map((u) => {
    const rows = claims.filter((c) => c.universityId === u.id).map((c) => summarise(c, today))
    const open = rows.filter((r) => OPEN_STATUSES.includes(r.status as ClaimStatus))
    const aging = Object.fromEntries(buckets.map((b) => [b, 0])) as Record<(typeof buckets)[number], number>
    for (const r of open) aging[bucketOf(r)] += Number(r.baseAmount ?? 0) * (Number(r.balance) / Math.max(Number(r.totalAmount), 0.01))
    const unbilledBase = unbilled
      .filter((x) => appToUniversity.get(x.applicationId) === u.id)
      .reduce((s, x) => s + Number(x._sum.baseCurrencyAmount ?? 0), 0)
    return {
      universityId: u.id,
      university: u.name,
      currency: u.currency,
      unbilled: unbilledBase.toFixed(2),
      billed: rows.reduce((s, r) => s + Number(r.baseAmount ?? 0), 0).toFixed(2),
      received: rows.reduce((s, r) => s + Number(r.received) * Number(r.fxRate ?? 1), 0).toFixed(2),
      outstanding: outstanding.get(u.partyId) ?? '0.00',
      openClaims: open.length,
      oldestOverdue: Math.max(0, ...open.map((r) => r.overdueDays)),
      aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, v.toFixed(2)])) as Record<(typeof buckets)[number], string>,
    }
  })
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function lockClaim(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "CommissionClaim" WHERE "id" = ${id} FOR UPDATE`
  const c = await tx.commissionClaim.findUnique({ where: { id }, include: INCLUDE })
  if (!c) throw new AccountingError('NOT_FOUND', 'Claim not found.')
  return c
}

/** A DRAFT claim from approved commissions of one university in one currency. */
export async function createClaim(input: { universityId: string; commissionIds: string[]; notes?: string; actor: AuditActor }) {
  if (input.commissionIds.length === 0) throw new AccountingError('VALIDATION', 'Pick at least one commission.')

  return prisma.$transaction(async (tx) => {
    const university = await tx.university.findUnique({ where: { id: input.universityId } })
    if (!university || !university.isActive) throw new AccountingError('VALIDATION', 'Choose an active university.')

    const commissions = await tx.commission.findMany({
      where: { id: { in: input.commissionIds } },
      include: { application: { select: { universityId: true } } },
    })
    if (commissions.length !== input.commissionIds.length) throw new AccountingError('NOT_FOUND', 'A selected commission no longer exists.')
    for (const c of commissions) {
      if (c.application.universityId !== input.universityId) throw new AccountingError('VALIDATION', 'Every commission on a claim belongs to the same university.')
      if (c.status !== 'APPROVED' || c.claimId) throw new AccountingError('VALIDATION', `Only approved, unclaimed commissions can be billed (${c.instalmentLabel} is ${c.status.toLowerCase()}).`)
    }
    const currencies = new Set(commissions.map((c) => c.currency))
    if (currencies.size !== 1) throw new AccountingError('VALIDATION', 'One claim, one currency — split the selection by currency.')
    const [currency] = [...currencies]

    const fy = await fiscalYearFor(tx, new Date())
    const number = await allocateNumber(tx, 'CLM', fy.id, fy.code)
    const total = commissions.reduce((s, c) => s.add(c.netAmount), ZERO)

    const claim = await tx.commissionClaim.create({
      data: {
        claimNo: number.formatted,
        universityId: university.id,
        partyId: university.partyId,
        totalAmount: total,
        currency: currency!,
        notes: input.notes ?? null,
        createdBy: input.actor.username,
      },
    })
    await tx.commission.updateMany({
      where: { id: { in: input.commissionIds } },
      data: { status: 'CLAIMED', claimId: claim.id },
    })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'CLAIM_CREATED',
      entity: 'CommissionClaim',
      entityId: claim.id,
      after: { claimNo: claim.claimNo, university: university.name, commissions: input.commissionIds.length, totalAmount: total.toFixed(2), currency },
    })
    return { id: claim.id, claimNo: claim.claimNo, totalAmount: total.toFixed(2), currency: currency! }
  })
}

/** Take a commission off a DRAFT claim; it goes back to APPROVED. */
export async function removeFromClaim(input: { claimId: string; commissionId: string; actor: AuditActor }) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, input.claimId)
    if (claim.status !== 'DRAFT') throw new AccountingError('ILLEGAL_TRANSITION', 'Only a draft claim can be edited.')
    const member = claim.commissions.find((c) => c.id === input.commissionId)
    if (!member) throw new AccountingError('NOT_FOUND', 'That commission is not on this claim.')
    await tx.commission.update({ where: { id: member.id }, data: { status: 'APPROVED', claimId: null } })
    await tx.commissionClaim.update({ where: { id: claim.id }, data: { totalAmount: { decrement: member.netAmount } } })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'CLAIM_LINE_REMOVED',
      entity: 'CommissionClaim',
      entityId: claim.id,
      after: { commissionId: member.id, amount: member.netAmount.toFixed(2) },
    })
    return { id: claim.id }
  })
}

/**
 * DRAFT → SENT: the invoice goes to the university and row 3 posts —
 * Dr 1120 (party) / Cr 1130 at the claim-date rate. Due date from the
 * agreement's payment terms.
 */
export async function sendClaim(input: { claimId: string; claimedOn: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, input.claimId)
    if (claim.status !== 'DRAFT') throw new AccountingError('ILLEGAL_TRANSITION', 'Only a draft claim can be sent.')
    if (claim.commissions.length === 0 || claim.totalAmount.lte(ZERO)) throw new AccountingError('VALIDATION', 'The claim is empty.')

    const first = await tx.commission.findFirstOrThrow({
      where: { claimId: claim.id },
      include: { agreement: { select: { paymentTermsDays: true } }, application: { select: { branch: { select: { costCenterId: true } } } } },
    })
    const dueOn = new Date(input.claimedOn)
    dueOn.setUTCDate(dueOn.getUTCDate() + first.agreement.paymentTermsDays)

    const base = await getBaseCurrency(tx)
    const fxRate = await getRate(tx, claim.currency, base, input.claimedOn)
    const costCenterId = first.application.branch.costCenterId

    const voucher = await postEntry(tx, {
      voucherType: 'SI',
      entryDate: input.claimedOn,
      narration: `Commission claim ${claim.claimNo} — ${claim.university.name}`,
      sourceType: 'COMMISSION_CLAIM',
      sourceId: claim.id,
      currency: claim.currency,
      fxRate,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.AR_UNIVERSITIES, debit: claim.totalAmount.toFixed(2), partyId: claim.partyId, costCenterId },
        { accountCode: ACCOUNTS.ACCRUED_COMMISSION, credit: claim.totalAmount.toFixed(2), costCenterId },
      ],
    })

    await tx.commissionClaim.update({
      where: { id: claim.id },
      data: { status: 'SENT', claimedOn: input.claimedOn, dueOn, fxRate, baseAmount: toBase(claim.totalAmount, fxRate), journalEntryId: voucher.id },
    })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'CLAIM_SENT',
      entity: 'CommissionClaim',
      entityId: claim.id,
      before: { status: 'DRAFT' },
      after: { status: 'SENT', claimedOn: toDay(input.claimedOn), dueOn: toDay(dueOn), voucherNo: voucher.voucherNo, fxRate: fxRate.toString() },
    })
    return { id: claim.id, claimNo: claim.claimNo, voucherNo: voucher.voucherNo, dueOn: toDay(dueOn) }
  })
}

export async function setClaimStatus(input: { claimId: string; status: 'ACKNOWLEDGED' | 'DISPUTED' | 'SENT'; actor: AuditActor }) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, input.claimId)
    const allowed: Record<string, string[]> = {
      SENT: ['ACKNOWLEDGED', 'DISPUTED'],
      ACKNOWLEDGED: ['DISPUTED'],
      DISPUTED: ['SENT', 'ACKNOWLEDGED'],
    }
    if (!allowed[claim.status]?.includes(input.status)) {
      throw new AccountingError('ILLEGAL_TRANSITION', `A ${claim.status.toLowerCase()} claim cannot become ${input.status.toLowerCase()}.`)
    }
    await tx.commissionClaim.update({ where: { id: claim.id }, data: { status: input.status } })
    await recordAudit(tx, { actor: input.actor, action: 'CLAIM_STATUS', entity: 'CommissionClaim', entityId: claim.id, before: { status: claim.status }, after: { status: input.status } })
    return { id: claim.id, status: input.status }
  })
}

/**
 * Cancel: a draft is simply released; a sent claim with nothing received is
 * reversed (the credit note) and its commissions return to APPROVED so they
 * can be billed again.
 */
export async function cancelClaim(input: { claimId: string; reason: string; cancelledOn: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, input.claimId)
    if (!['DRAFT', 'SENT', 'ACKNOWLEDGED', 'DISPUTED'].includes(claim.status)) {
      throw new AccountingError('ILLEGAL_TRANSITION', `A ${claim.status.toLowerCase().replaceAll('_', ' ')} claim cannot be cancelled.`)
    }
    if (claim.allocations.length > 0) throw new AccountingError('VALIDATION', 'Money has been received against this claim; it cannot be cancelled.')

    let reversalNo: string | null = null
    if (claim.journalEntryId) {
      const reversal = await reverseEntry(tx, claim.journalEntryId, {
        reversalDate: input.cancelledOn,
        reason: `Claim ${claim.claimNo} cancelled: ${input.reason}`,
        createdBy: input.actor.username,
        canPostToSoftClosed: input.canPostToSoftClosed,
      })
      reversalNo = reversal.voucherNo
    }
    await tx.commission.updateMany({ where: { claimId: claim.id }, data: { status: 'APPROVED', claimId: null } })
    await tx.commissionClaim.update({ where: { id: claim.id }, data: { status: 'CANCELLED' } })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'CLAIM_CANCELLED',
      entity: 'CommissionClaim',
      entityId: claim.id,
      before: { status: claim.status },
      after: { status: 'CANCELLED', reason: input.reason, reversalVoucherNo: reversalNo },
    })
    return { id: claim.id, reversalNo }
  })
}

/** Row 10: the unpaid remainder is bad debt — Dr 7200 / Cr 1120, in base at the booked rate. */
export async function writeOffClaim(input: { claimId: string; reason: string; writtenOffOn: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const claim = await lockClaim(tx, input.claimId)
    if (!OPEN_STATUSES.includes(claim.status)) throw new AccountingError('ILLEGAL_TRANSITION', 'Only an open, sent claim can be written off.')

    const relievedBase = claim.allocations.reduce((s, a) => s.add(a.baseAmount), ZERO)
    const remainingBase = (claim.baseAmount ?? ZERO).sub(relievedBase)
    if (remainingBase.lte(ZERO)) throw new AccountingError('VALIDATION', 'Nothing is outstanding on this claim.')

    const first = await tx.commission.findFirstOrThrow({ where: { claimId: claim.id }, include: { application: { select: { branch: { select: { costCenterId: true } } } } } })
    const costCenterId = first.application.branch.costCenterId
    const base = await getBaseCurrency(tx)

    const voucher = await postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.writtenOffOn,
      narration: `Claim ${claim.claimNo} written off: ${input.reason}`,
      sourceType: 'COMMISSION_CLAIM',
      sourceId: claim.id,
      currency: base,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.BAD_DEBT, debit: remainingBase.toFixed(2), costCenterId },
        { accountCode: ACCOUNTS.AR_UNIVERSITIES, credit: remainingBase.toFixed(2), partyId: claim.partyId, costCenterId },
      ],
    })
    await tx.commissionClaim.update({ where: { id: claim.id }, data: { status: 'WRITTEN_OFF' } })
    await tx.commission.updateMany({ where: { claimId: claim.id, status: { in: ['CLAIMED', 'PARTIALLY_RECEIVED'] } }, data: { status: 'WRITTEN_OFF' } })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'CLAIM_WRITTEN_OFF',
      entity: 'CommissionClaim',
      entityId: claim.id,
      before: { status: claim.status },
      after: { status: 'WRITTEN_OFF', reason: input.reason, badDebtBase: remainingBase.toFixed(2), voucherNo: voucher.voucherNo },
    })
    return { id: claim.id, voucherNo: voucher.voucherNo, badDebt: remainingBase.toFixed(2) }
  })
}
