import 'server-only'

import { randomUUID } from 'node:crypto'

import { Prisma } from '@/generated/prisma/client'
import type { PaymentMethod } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { getBaseCurrency, getRate, toBase } from '@/server/accounting/fx'
import { postEntry, reverseEntry } from '@/server/accounting/post'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'
import { getSetting } from '@/server/services/settings-service'

/**
 * Counselor and agent commission — docs/modules/08-internal-commission.md.
 *
 *   ACCRUED -> APPROVED -> PAID  (CANCELLED by reversal)
 *
 * Accrued when the university commission is APPROVED (commission-service),
 * recognised as a direct cost when approved here — row 29, Dr 5010/5020 /
 * Cr 2020 with the payee's party, dated into the period of the related
 * income — and paid by payment voucher (rows 30–31). The payable is booked in
 * base currency at the approval rate and settled at that amount.
 */

const ZERO = new Prisma.Decimal(0)
const toDay = (d: Date) => d.toISOString().slice(0, 10)

const INCLUDE = {
  party: { select: { id: true, name: true, type: true, code: true } },
  application: { select: { code: true, student: { select: { firstName: true, lastName: true } }, university: { select: { name: true } } } },
  commission: { select: { instalmentLabel: true, status: true, approvedOn: true, netAmount: true, currency: true } },
} satisfies Prisma.InternalCommissionInclude

function summarise(i: Prisma.InternalCommissionGetPayload<{ include: typeof INCLUDE }>) {
  return {
    id: i.id,
    partyId: i.party.id,
    payee: i.party.name,
    payeeType: i.party.type,
    payeeCode: i.party.code,
    counselorId: i.counselorId,
    agentId: i.agentId,
    applicationCode: i.application.code,
    student: `${i.application.student.firstName} ${i.application.student.lastName}`,
    university: i.application.university.name,
    instalmentLabel: i.commission.instalmentLabel,
    sourceStatus: i.commission.status,
    rate: i.rate.toString(),
    baseAmount: i.baseAmount.toFixed(2),
    earnedAmount: i.earnedAmount.toFixed(2),
    paidAmount: i.paidAmount.toFixed(2),
    currency: i.currency,
    baseCurrencyAmount: i.baseCurrencyAmount?.toFixed(2) ?? null,
    status: i.status,
    approvedOn: i.approvedOn ? toDay(i.approvedOn) : null,
    paidOn: i.paidOn ? toDay(i.paidOn) : null,
  }
}

export type InternalCommissionRow = ReturnType<typeof summarise>

export async function listInternalCommissions(filter: { payeeType: 'COUNSELOR' | 'AGENT'; partyId?: string }) {
  const rows = await prisma.internalCommission.findMany({
    where: { party: { type: filter.payeeType }, ...(filter.partyId ? { partyId: filter.partyId } : {}) },
    orderBy: [{ createdAt: 'desc' }],
    include: INCLUDE,
  })
  const items = rows.map(summarise)

  // Per-payee statement: earned, approved (unpaid), paid, and the 2020 balance from the ledger.
  const partyIds = [...new Set(items.map((i) => i.partyId))]
  const payable = await controlBalances(ACCOUNTS.AP_COUNSELORS_AGENTS, partyIds, 'CREDIT')
  const byPayee = new Map<string, { partyId: string; payee: string; code: string; earned: number; approved: number; paid: number; pending: number; currency: string }>()
  for (const i of items) {
    const p = byPayee.get(i.partyId) ?? { partyId: i.partyId, payee: i.payee, code: i.payeeCode, earned: 0, approved: 0, paid: 0, pending: 0, currency: i.currency }
    if (i.status !== 'CANCELLED') p.earned += Number(i.earnedAmount)
    if (i.status === 'APPROVED') p.approved += Number(i.earnedAmount)
    if (i.status === 'PAID') p.paid += Number(i.paidAmount)
    if (i.status === 'ACCRUED') p.pending += Number(i.earnedAmount)
    byPayee.set(i.partyId, p)
  }
  return {
    items,
    payees: [...byPayee.values()].map((p) => ({
      ...p,
      earned: p.earned.toFixed(2),
      approved: p.approved.toFixed(2),
      paid: p.paid.toFixed(2),
      pending: p.pending.toFixed(2),
      payableBase: payable.get(p.partyId) ?? '0.00',
    })),
  }
}

async function lock(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "InternalCommission" WHERE "id" = ${id} FOR UPDATE`
  const i = await tx.internalCommission.findUnique({ where: { id }, include: { ...INCLUDE, application: { select: { code: true, branch: { select: { costCenterId: true } }, student: { select: { firstName: true, lastName: true } }, university: { select: { name: true } } } } } })
  if (!i) throw new AccountingError('NOT_FOUND', 'Internal commission not found.')
  return i
}

/** ACCRUED → APPROVED: the expense is recognised in the period of the related income (row 29). */
export async function approveInternalCommission(input: { id: string; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const i = await lock(tx, input.id)
    if (i.status !== 'ACCRUED') throw new AccountingError('ILLEGAL_TRANSITION', `Only an accrued internal commission can be approved; this one is ${i.status.toLowerCase()}.`)
    if (!i.commission.approvedOn) throw new AccountingError('VALIDATION', 'The university commission has not been approved yet.')

    const entryDate = i.commission.approvedOn // matched to the income's period
    const base = await getBaseCurrency(tx)
    const fxRate = await getRate(tx, i.currency, base, entryDate)
    const expense = i.party.type === 'AGENT' ? ACCOUNTS.AGENT_COMMISSION_EXPENSE : ACCOUNTS.COUNSELOR_COMMISSION_EXPENSE
    const costCenterId = i.application.branch.costCenterId

    const voucher = await postEntry(tx, {
      voucherType: 'PB',
      entryDate,
      narration: `${i.party.type === 'AGENT' ? 'Agent' : 'Counselor'} commission — ${i.party.name} on ${i.application.code} (${i.commission.instalmentLabel})`,
      sourceType: 'INTERNAL_COMMISSION',
      sourceId: i.id,
      currency: i.currency,
      fxRate,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed ?? true,
      lines: [
        { accountCode: expense, debit: i.earnedAmount.toFixed(2), costCenterId },
        { accountCode: ACCOUNTS.AP_COUNSELORS_AGENTS, credit: i.earnedAmount.toFixed(2), partyId: i.partyId, costCenterId },
      ],
    })
    await tx.internalCommission.update({
      where: { id: i.id },
      data: { status: 'APPROVED', approvedOn: entryDate, fxRate, baseCurrencyAmount: toBase(i.earnedAmount, fxRate), journalEntryId: voucher.id },
    })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'INTERNAL_COMMISSION_APPROVED',
      entity: 'InternalCommission',
      entityId: i.id,
      before: { status: 'ACCRUED' },
      after: { status: 'APPROVED', voucherNo: voucher.voucherNo, earned: i.earnedAmount.toFixed(2), currency: i.currency },
    })
    return { id: i.id, voucherNo: voucher.voucherNo }
  })
}

/**
 * APPROVED → PAID (rows 30–31): Dr 2020 (party) at the booked base amount,
 * Cr bank for the net, Cr 2320 for tax withheld. Settled in base currency.
 * The payout trigger setting may require the university's money first.
 */
export async function payInternalCommission(input: {
  id: string
  paidOn: Date
  bankAccountCode: string
  method: PaymentMethod
  withheldTax?: string
  reference?: string
  actor: AuditActor
  canPostToSoftClosed?: boolean
}) {
  const withheld = new Prisma.Decimal(input.withheldTax || 0)
  return prisma.$transaction(async (tx) => {
    const i = await lock(tx, input.id)
    if (i.status !== 'APPROVED') throw new AccountingError('ILLEGAL_TRANSITION', `Only an approved internal commission can be paid; this one is ${i.status.toLowerCase()}.`)

    const trigger = (await getSetting('internal_commission.payout_trigger')) ?? 'APPROVED'
    if (trigger === 'RECEIVED' && i.commission.status !== 'RECEIVED') {
      throw new AccountingError('VALIDATION', 'Payout policy: the university must pay before the counselor or agent is paid.')
    }
    const bank = await tx.bankAccount.findFirst({ where: { glAccountCode: input.bankAccountCode, isActive: true } })
    if (!bank) throw new AccountingError('VALIDATION', 'Choose an active bank or cash account.')

    const gross = i.baseCurrencyAmount ?? ZERO
    if (gross.lte(ZERO)) throw new AccountingError('VALIDATION', 'Nothing is payable.')
    if (withheld.isNegative() || withheld.gt(gross)) throw new AccountingError('VALIDATION', 'Withheld tax must be between zero and the amount payable.')
    const net = gross.sub(withheld)
    const base = await getBaseCurrency(tx)
    const costCenterId = i.application.branch.costCenterId

    // Posted vouchers are immutable, so the payment's id is fixed before posting.
    const paymentId = randomUUID()
    const voucher = await postEntry(tx, {
      voucherType: 'PV',
      entryDate: input.paidOn,
      narration: `Commission paid to ${i.party.name} — ${i.application.code}${input.reference ? ` (${input.reference})` : ''}`,
      sourceType: 'PAYMENT',
      sourceId: paymentId,
      currency: base,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.AP_COUNSELORS_AGENTS, debit: gross.toFixed(2), partyId: i.partyId, costCenterId },
        { accountCode: input.bankAccountCode, credit: net.toFixed(2) },
        ...(withheld.gt(ZERO) ? [{ accountCode: ACCOUNTS.WITHHOLDING_TAX_PAYABLE, credit: withheld.toFixed(2), lineNarration: 'Tax deducted from payee' }] : []),
      ],
    })
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
        paymentNo: voucher.voucherNo,
        partyId: i.partyId,
        paidOn: input.paidOn,
        amount: gross,
        withheldTax: withheld,
        netPaid: net,
        currency: base,
        fxRate: 1,
        method: input.method,
        reference: input.reference ?? null,
        bankAccountCode: input.bankAccountCode,
        journalEntryId: voucher.id,
        createdBy: input.actor.username,
      },
    })
    await tx.internalCommission.update({
      where: { id: i.id },
      data: { status: 'PAID', paidOn: input.paidOn, paidAmount: i.earnedAmount, paymentId: payment.id },
    })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'INTERNAL_COMMISSION_PAID',
      entity: 'InternalCommission',
      entityId: i.id,
      before: { status: 'APPROVED' },
      after: { status: 'PAID', voucherNo: voucher.voucherNo, gross: gross.toFixed(2), withheld: withheld.toFixed(2), net: net.toFixed(2) },
    })
    return { id: i.id, voucherNo: voucher.voucherNo, net: net.toFixed(2) }
  })
}

/** Cancel: an accrual just goes; an approved one is reversed (row 32). */
export async function cancelInternalCommission(input: { id: string; reason: string; cancelledOn: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const i = await lock(tx, input.id)
    if (i.status !== 'ACCRUED' && i.status !== 'APPROVED') throw new AccountingError('ILLEGAL_TRANSITION', `A ${i.status.toLowerCase()} internal commission cannot be cancelled.`)
    let reversalNo: string | null = null
    if (i.status === 'APPROVED' && i.journalEntryId) {
      const reversal = await reverseEntry(tx, i.journalEntryId, { reversalDate: input.cancelledOn, reason: input.reason, createdBy: input.actor.username, canPostToSoftClosed: input.canPostToSoftClosed })
      reversalNo = reversal.voucherNo
    }
    await tx.internalCommission.update({ where: { id: i.id }, data: { status: 'CANCELLED' } })
    await recordAudit(tx, {
      actor: input.actor,
      action: 'INTERNAL_COMMISSION_CANCELLED',
      entity: 'InternalCommission',
      entityId: i.id,
      before: { status: i.status },
      after: { status: 'CANCELLED', reason: input.reason, reversalVoucherNo: reversalNo },
    })
    return { id: i.id, reversalNo }
  })
}
