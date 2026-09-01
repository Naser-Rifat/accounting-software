import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { SourceType, VoucherType } from '@/generated/prisma/enums'

import { ACCOUNTS } from './accounts'
import { AccountingError } from './errors'
import { toBase } from './fx'
import { allocateNumber } from './numbering'
import { resolvePeriod } from './period'
import type { PrismaTransaction } from '@/server/db/client'

/**
 * THE POSTING ENGINE.
 *
 * `postEntry` is the only way anything reaches the general ledger. No module
 * writes JournalEntry or JournalLine directly — docs/10-conventions.md rule 8.
 *
 * Callers describe intent (which accounts, which amounts, in which currency) and
 * this function owns the mechanics: period resolution and locking, account
 * validation, control-account rules, currency conversion, balance proof, gapless
 * numbering, and the DRAFT -> POSTED flip that the immutability triggers expect.
 */

/** Amounts are given in the voucher's transaction currency, not base currency. */
export type PostLineInput = {
  accountCode: string
  debit?: Prisma.Decimal | string | number
  credit?: Prisma.Decimal | string | number
  /** Required for control accounts, forbidden otherwise. */
  partyId?: string | null
  costCenterId?: string | null
  lineNarration?: string | null
}

export type PostEntryInput = {
  voucherType: VoucherType
  entryDate: Date
  narration: string
  sourceType: SourceType
  sourceId?: string | null
  /** Transaction currency. Defaults to the base currency. */
  currency: string
  /** Rate from transaction currency to base. 1 when they are the same. */
  fxRate: Prisma.Decimal | string | number
  lines: PostLineInput[]
  createdBy: string
  /**
   * True for a hand-entered journal voucher. Manual entries may not touch a
   * control account — those balances move only through their subsidiary ledger.
   */
  isManual?: boolean
  /** ACCOUNTANT/ADMIN may post into a soft-closed period. */
  canPostToSoftClosed?: boolean
}

export type PostedEntry = {
  id: string
  voucherNo: string
  periodId: string
  totalDebit: Prisma.Decimal
  totalCredit: Prisma.Decimal
}

/** Rounding differences up to this much are absorbed into 7900 automatically. */
const ROUNDING_TOLERANCE = new Prisma.Decimal('1.00')

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | string | number | undefined | null): Prisma.Decimal {
  if (value === undefined || value === null) return ZERO
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

export async function postEntry(
  tx: PrismaTransaction,
  input: PostEntryInput,
): Promise<PostedEntry> {
  if (input.lines.length === 0) {
    throw new AccountingError('EMPTY_ENTRY', 'A voucher must have at least one line.')
  }

  // 1. Period — resolved from the entry date, and rejected if locked.
  const period = await resolvePeriod(tx, input.entryDate, {
    canPostToSoftClosed: input.canPostToSoftClosed,
  })

  // 2. Accounts — one query for every code used.
  const codes = [...new Set(input.lines.map((l) => l.accountCode))]
  const accounts = await tx.account.findMany({ where: { code: { in: codes } } })
  const byCode = new Map(accounts.map((a) => [a.code, a]))

  for (const code of codes) {
    const account = byCode.get(code)
    if (!account) {
      throw new AccountingError('UNKNOWN_ACCOUNT', `Account ${code} does not exist.`, { code })
    }
    if (account.isGroup) {
      throw new AccountingError(
        'GROUP_ACCOUNT',
        `Account ${code} is a group heading and cannot be posted to.`,
        { code },
      )
    }
    if (!account.isActive) {
      throw new AccountingError('INACTIVE_ACCOUNT', `Account ${code} is inactive.`, { code })
    }
  }

  // 3. Line-level rules, and conversion to base currency.
  const fxRate = dec(input.fxRate)
  const prepared: {
    accountId: string
    debit: Prisma.Decimal
    credit: Prisma.Decimal
    partyId: string | null
    costCenterId: string | null
    lineNarration: string | null
  }[] = []

  for (const [index, line] of input.lines.entries()) {
    const account = byCode.get(line.accountCode)!
    const rawDebit = dec(line.debit)
    const rawCredit = dec(line.credit)

    if (rawDebit.isNegative() || rawCredit.isNegative()) {
      throw new AccountingError(
        'INVALID_LINE',
        `Line ${index + 1} (${line.accountCode}): amounts cannot be negative. Swap debit and credit instead.`,
        { index },
      )
    }
    if (rawDebit.isZero() === rawCredit.isZero()) {
      throw new AccountingError(
        'INVALID_LINE',
        `Line ${index + 1} (${line.accountCode}): exactly one of debit or credit must be non-zero.`,
        { index },
      )
    }

    if (account.isControl) {
      if (input.isManual) {
        throw new AccountingError(
          'MANUAL_ENTRY_ON_CONTROL_ACCOUNT',
          `Account ${account.code} is a control account. Post through its subsidiary ledger, not a manual journal.`,
          { code: account.code },
        )
      }
      if (!line.partyId) {
        throw new AccountingError(
          'CONTROL_ACCOUNT_REQUIRES_PARTY',
          `Account ${account.code} is a control account and needs a party on line ${index + 1}.`,
          { code: account.code, index },
        )
      }
    } else if (line.partyId) {
      throw new AccountingError(
        'PARTY_ON_NON_CONTROL_ACCOUNT',
        `Account ${account.code} is not a control account; a party may not be set on line ${index + 1}.`,
        { code: account.code, index },
      )
    }

    prepared.push({
      accountId: account.id,
      debit: toBase(rawDebit, fxRate),
      credit: toBase(rawCredit, fxRate),
      partyId: line.partyId ?? null,
      costCenterId: line.costCenterId ?? null,
      lineNarration: line.lineNarration ?? null,
    })
  }

  // 4. Prove it balances. Per-line rounding can leave a few paisa; absorb a
  //    trivial difference into 7900 rather than refusing the whole voucher, and
  //    refuse anything larger because that is a real error, not rounding.
  let totalDebit = prepared.reduce((sum, l) => sum.add(l.debit), ZERO)
  let totalCredit = prepared.reduce((sum, l) => sum.add(l.credit), ZERO)
  const difference = totalDebit.sub(totalCredit)

  if (!difference.isZero()) {
    if (difference.abs().gt(ROUNDING_TOLERANCE)) {
      throw new AccountingError(
        'UNBALANCED_ENTRY',
        `Voucher does not balance: debits ${totalDebit.toFixed(2)}, credits ${totalCredit.toFixed(2)}, difference ${difference.toFixed(2)}.`,
        {
          totalDebit: totalDebit.toFixed(2),
          totalCredit: totalCredit.toFixed(2),
          difference: difference.toFixed(2),
        },
      )
    }

    const rounding = await tx.account.findUnique({
      where: { code: ACCOUNTS.ROUNDING_DIFFERENCE },
    })
    if (!rounding) {
      throw new AccountingError(
        'UNKNOWN_ACCOUNT',
        `Rounding difference of ${difference.toFixed(2)} needs account ${ACCOUNTS.ROUNDING_DIFFERENCE}, which is missing.`,
      )
    }

    prepared.push({
      accountId: rounding.id,
      debit: difference.isNegative() ? difference.abs() : ZERO,
      credit: difference.isPositive() ? difference : ZERO,
      partyId: null,
      costCenterId: null,
      lineNarration: 'Rounding difference on currency conversion',
    })

    totalDebit = prepared.reduce((sum, l) => sum.add(l.debit), ZERO)
    totalCredit = prepared.reduce((sum, l) => sum.add(l.credit), ZERO)
  }

  // 5. Number, then write. The entry is created DRAFT so the immutability
  //    trigger permits its lines to be inserted; the flip to POSTED freezes it.
  const number = await allocateNumber(
    tx,
    input.voucherType,
    period.fiscalYearId,
    period.fiscalYearCode,
  )

  const entry = await tx.journalEntry.create({
    data: {
      voucherType: input.voucherType,
      voucherNo: number.formatted,
      entryDate: input.entryDate,
      narration: input.narration,
      currency: input.currency,
      fxRate,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      status: 'DRAFT',
      periodId: period.periodId,
      createdBy: input.createdBy,
    },
  })

  await tx.journalLine.createMany({
    data: prepared.map((line, index) => ({
      entryId: entry.id,
      seq: index + 1,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      partyId: line.partyId,
      costCenterId: line.costCenterId,
      lineNarration: line.lineNarration,
    })),
  })

  await tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: 'POSTED', postedAt: new Date() },
  })

  return {
    id: entry.id,
    voucherNo: entry.voucherNo,
    periodId: period.periodId,
    totalDebit,
    totalCredit,
  }
}

/**
 * Reverse a posted voucher with its mirror image.
 *
 * The original is never edited or deleted — both the error and the correction
 * stay visible, which is the whole point of rule 5. If the original's period is
 * closed, date the reversal into an open one.
 */
export async function reverseEntry(
  tx: PrismaTransaction,
  entryId: string,
  options: {
    reversalDate: Date
    reason: string
    createdBy: string
    canPostToSoftClosed?: boolean
  },
): Promise<PostedEntry> {
  const original = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: { include: { account: true }, orderBy: { seq: 'asc' } } },
  })

  if (!original) {
    throw new AccountingError('UNKNOWN_ACCOUNT', `Voucher ${entryId} does not exist.`)
  }
  if (original.status === 'DRAFT') {
    throw new AccountingError(
      'NOT_POSTED',
      `Voucher ${original.voucherNo} is a draft — delete it instead of reversing.`,
    )
  }
  if (original.status === 'REVERSED') {
    throw new AccountingError(
      'ALREADY_REVERSED',
      `Voucher ${original.voucherNo} has already been reversed.`,
    )
  }

  const period = await resolvePeriod(tx, options.reversalDate, {
    canPostToSoftClosed: options.canPostToSoftClosed,
  })

  const number = await allocateNumber(
    tx,
    original.voucherType,
    period.fiscalYearId,
    period.fiscalYearCode,
  )

  const reversal = await tx.journalEntry.create({
    data: {
      voucherType: original.voucherType,
      voucherNo: number.formatted,
      entryDate: options.reversalDate,
      narration: `Reversal of ${original.voucherNo}: ${options.reason}`,
      currency: original.currency,
      fxRate: original.fxRate,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      status: 'DRAFT',
      periodId: period.periodId,
      reversesEntryId: original.id,
      createdBy: options.createdBy,
    },
  })

  // Lines are already in base currency, so they are copied with debit and credit
  // swapped — no reconversion, which would reintroduce rounding.
  await tx.journalLine.createMany({
    data: original.lines.map((line, index) => ({
      entryId: reversal.id,
      seq: index + 1,
      accountId: line.accountId,
      debit: line.credit ?? ZERO,
      credit: line.debit ?? ZERO,
      partyId: line.partyId,
      costCenterId: line.costCenterId,
      lineNarration: line.lineNarration,
    })),
  })

  await tx.journalEntry.update({
    where: { id: reversal.id },
    data: { status: 'POSTED', postedAt: new Date() },
  })

  await tx.journalEntry.update({
    where: { id: original.id },
    data: { status: 'REVERSED' },
  })

  const totalDebit = original.lines.reduce(
    (sum, l) => sum.add(new Prisma.Decimal(l.credit ?? 0)),
    ZERO,
  )
  const totalCredit = original.lines.reduce(
    (sum, l) => sum.add(new Prisma.Decimal(l.debit ?? 0)),
    ZERO,
  )

  return {
    id: reversal.id,
    voucherNo: reversal.voucherNo,
    periodId: period.periodId,
    totalDebit,
    totalCredit,
  }
}
