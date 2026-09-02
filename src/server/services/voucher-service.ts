import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { VoucherStatus, VoucherType } from '@/generated/prisma/enums'
import { approveEntry, postEntry, rejectEntry, reverseEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'
import * as repo from '@/server/db/repositories/vouchers'

/**
 * Vouchers: listing, detail, manual entry and reversal.
 *
 * Business logic and transaction boundaries live here. The posting mechanics
 * themselves belong to the engine — this service never writes a journal line.
 */

export type VoucherListItem = {
  id: string
  voucherNo: string
  voucherType: string
  date: string
  narration: string
  status: string
  period: string
  amount: string
}

export async function listVouchers(filters: {
  type?: VoucherType
  status?: VoucherStatus
  search?: string
  page?: number
  pageSize?: number
}) {
  const pageSize = filters.pageSize ?? 50
  const page = filters.page ?? 1

  const { rows, total } = await repo.listVouchers({
    type: filters.type,
    status: filters.status,
    search: filters.search,
    take: pageSize,
    skip: (page - 1) * pageSize,
  })

  return {
    total,
    page,
    pageSize,
    rows: rows.map<VoucherListItem>((entry) => ({
      id: entry.id,
      voucherNo: entry.voucherNo,
      voucherType: entry.voucherType,
      date: entry.entryDate.toISOString().slice(0, 10),
      narration: entry.narration,
      status: entry.status,
      period: entry.period.name,
      amount: entry.lines
        .reduce((sum, line) => sum + Number(line.debit ?? 0), 0)
        .toFixed(2),
    })),
  }
}

export async function getVoucher(id: string) {
  const entry = await repo.findVoucher(id)
  if (!entry) return null

  const lines = entry.lines.map((line) => ({
    seq: line.seq,
    accountCode: line.account.code,
    accountName: line.account.name,
    partyName: line.party?.name ?? null,
    costCenterName: line.costCenter?.name ?? null,
    lineNarration: line.lineNarration,
    debit: Number(line.debit ?? 0).toFixed(2),
    credit: Number(line.credit ?? 0).toFixed(2),
  }))

  return {
    id: entry.id,
    voucherNo: entry.voucherNo,
    voucherType: entry.voucherType,
    date: entry.entryDate.toISOString().slice(0, 10),
    narration: entry.narration,
    status: entry.status,
    currency: entry.currency,
    fxRate: Number(entry.fxRate).toString(),
    sourceType: entry.sourceType,
    period: entry.period.name,
    fiscalYear: entry.period.fiscalYear.name,
    periodStatus: entry.period.status,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
    postedAt: entry.postedAt?.toISOString() ?? null,
    reverses: entry.reverses,
    reversedBy: entry.reversedBy,
    lines,
    totalDebit: lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2),
    totalCredit: lines.reduce((s, l) => s + Number(l.credit), 0).toFixed(2),
  }
}

export type ManualVoucherInput = {
  entryDate: Date
  narration: string
  lines: {
    accountCode: string
    debit?: string
    credit?: string
    costCenterId?: string | null
    lineNarration?: string | null
  }[]
  createdBy: string
  canPostToSoftClosed: boolean
}

/**
 * Post a hand-entered journal voucher.
 *
 * `isManual` is set, so the engine refuses any line touching a control account —
 * those balances move only through their subsidiary ledger.
 */
export async function postManualVoucher(input: ManualVoucherInput) {
  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.entryDate,
      narration: input.narration,
      sourceType: 'MANUAL',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      isManual: true,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: input.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        costCenterId: line.costCenterId ?? null,
        lineNarration: line.lineNarration ?? null,
      })),
    }),
  )
}

export async function reverseVoucher(input: {
  entryId: string
  reversalDate: Date
  reason: string
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  return prisma.$transaction((tx) =>
    reverseEntry(tx, input.entryId, {
      reversalDate: input.reversalDate,
      reason: input.reason,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
    }),
  )
}

export type { Prisma }

// ---------------------------------------------------------------------------
// Maker-checker — docs/02-status-flows.md
// ---------------------------------------------------------------------------

/**
 * Submit a hand-entered journal voucher for approval.
 *
 * Identical validation to `postManualVoucher` — it balances, it respects the
 * period lock, it may not touch a control account — but it stops one step short
 * of the ledger. Nothing in any report moves until someone else approves it.
 */
export async function submitManualVoucher(input: ManualVoucherInput) {
  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.entryDate,
      narration: input.narration,
      sourceType: 'MANUAL',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      isManual: true,
      canPostToSoftClosed: input.canPostToSoftClosed,
      stopAt: 'PENDING_APPROVAL',
      lines: input.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        costCenterId: line.costCenterId ?? null,
        lineNarration: line.lineNarration ?? null,
      })),
    }),
  )
}

/**
 * Park a hand-entered voucher as a draft.
 *
 * Same validation as submitting — it must balance, respect the period lock and
 * keep off control accounts — but nobody is asked to review it yet, and it moves
 * no balance. A draft holds its voucher number: rule 6 means numbers are issued
 * once and never reused, so abandoning a draft leaves its number spent.
 */
export async function saveManualVoucherDraft(input: ManualVoucherInput) {
  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.entryDate,
      narration: input.narration,
      sourceType: 'MANUAL',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      isManual: true,
      canPostToSoftClosed: input.canPostToSoftClosed,
      stopAt: 'DRAFT',
      lines: input.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        costCenterId: line.costCenterId ?? null,
        lineNarration: line.lineNarration ?? null,
      })),
    }),
  )
}

export async function approveVoucher(input: {
  entryId: string
  approvedBy: string
  canPostToSoftClosed: boolean
}) {
  return prisma.$transaction((tx) =>
    approveEntry(tx, input.entryId, {
      approvedBy: input.approvedBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
    }),
  )
}

export async function rejectVoucher(input: {
  entryId: string
  rejectedBy: string
  reason: string
}) {
  return prisma.$transaction((tx) =>
    rejectEntry(tx, input.entryId, {
      rejectedBy: input.rejectedBy,
      reason: input.reason,
    }),
  )
}

export type PendingVoucher = {
  id: string
  voucherNo: string
  voucherType: string
  date: string
  narration: string
  submittedBy: string
  submittedAt: string | null
  amount: string
  /** True when the viewer submitted it, so the UI can explain the disabled buttons. */
  isOwn: boolean
}

/**
 * The review queue, oldest first — a voucher waiting on approval is money not
 * yet in the ledger, so the stalest one is the most urgent.
 */
export async function listPendingVouchers(viewer: string): Promise<PendingVoucher[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { status: 'PENDING_APPROVAL' },
    include: { lines: { select: { debit: true } } },
    orderBy: [{ entryDate: 'asc' }, { voucherNo: 'asc' }],
  })

  return entries.map((entry) => {
    const maker = entry.submittedBy ?? entry.createdBy
    return {
      id: entry.id,
      voucherNo: entry.voucherNo,
      voucherType: entry.voucherType,
      date: entry.entryDate.toISOString().slice(0, 10),
      narration: entry.narration,
      submittedBy: maker,
      submittedAt: entry.submittedAt?.toISOString().slice(0, 10) ?? null,
      amount: entry.lines
        .reduce((sum, line) => sum + Number(line.debit ?? 0), 0)
        .toFixed(2),
      isOwn: maker === viewer,
    }
  })
}
