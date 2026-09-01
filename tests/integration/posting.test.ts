import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { postEntry, reverseEntry } from '@/server/accounting/post'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'

/**
 * The ledger's guarantees, exercised against a real database.
 *
 * These are not "does the code run" tests. Each one asserts a rule from
 * docs/03-accounting-standards.md that, if broken, would produce books that
 * cannot be trusted — and several assert that the DATABASE refuses, not just
 * the application.
 */

const IN_PERIOD = new Date(Date.UTC(2026, 7, 15)) // 15 Aug 2026, inside FY2026-27
const AUTHOR = 'test'

let universityPartyId: string

beforeAll(async () => {
  const party = await prisma.party.upsert({
    where: { code: 'TEST-UNI' },
    create: {
      code: 'TEST-UNI',
      name: 'Test University',
      type: 'UNIVERSITY',
      controlAccountCode: ACCOUNTS.AR_UNIVERSITIES,
      currency: 'USD',
    },
    update: {},
  })
  universityPartyId = party.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** Sum of every debit and credit in the ledger. Must always be equal. */
async function trialBalance() {
  const totals = await prisma.journalLine.aggregate({
    _sum: { debit: true, credit: true },
  })
  return {
    debit: totals._sum.debit?.toString() ?? '0',
    credit: totals._sum.credit?.toString() ?? '0',
  }
}

describe('postEntry', () => {
  it('posts a balanced voucher and allocates a formatted number', async () => {
    const result = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Office rent for August',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.OFFICE_RENT, debit: '25000.00' },
          { accountCode: ACCOUNTS.BANK, credit: '25000.00' },
        ],
      }),
    )

    expect(result.voucherNo).toMatch(/^JV-2627-\d{5}$/)
    expect(result.totalDebit.toFixed(2)).toBe('25000.00')
    expect(result.totalCredit.toFixed(2)).toBe(result.totalDebit.toFixed(2))

    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.id },
      include: { lines: true },
    })
    expect(entry?.status).toBe('POSTED')
    expect(entry?.lines).toHaveLength(2)
  })

  it('converts foreign currency to base at the given rate', async () => {
    // USD 1,500 commission at 110 BDT = 165,000 BDT in the ledger.
    const result = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Commission approved - Rahim',
        sourceType: 'COMMISSION',
        currency: 'USD',
        fxRate: '110',
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.ACCRUED_COMMISSION, debit: '1500.00' },
          { accountCode: ACCOUNTS.COMMISSION_INCOME, credit: '1500.00' },
        ],
      }),
    )

    expect(result.totalDebit.toFixed(2)).toBe('165000.00')

    const lines = await prisma.journalLine.findMany({ where: { entryId: result.id } })
    const debitLine = lines.find((l) => l.debit && !l.debit.isZero())
    expect(debitLine?.debit?.toFixed(2)).toBe('165000.00')
  })

  it('rejects an unbalanced voucher', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'JV',
          entryDate: IN_PERIOD,
          narration: 'Deliberately unbalanced',
          sourceType: 'MANUAL',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          lines: [
            { accountCode: ACCOUNTS.OFFICE_RENT, debit: '100.00' },
            { accountCode: ACCOUNTS.BANK, credit: '90.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && e.code === 'UNBALANCED_ENTRY',
    )
  })

  it('rejects a line with both debit and credit', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'JV',
          entryDate: IN_PERIOD,
          narration: 'Both sides on one line',
          sourceType: 'MANUAL',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          lines: [
            { accountCode: ACCOUNTS.OFFICE_RENT, debit: '100.00', credit: '100.00' },
            { accountCode: ACCOUNTS.BANK, credit: '100.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy((e: unknown) => isAccountingError(e) && e.code === 'INVALID_LINE')
  })

  it('refuses to post to a group heading', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'JV',
          entryDate: IN_PERIOD,
          narration: 'Posting to a group',
          sourceType: 'MANUAL',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          lines: [
            { accountCode: '6000', debit: '100.00' },
            { accountCode: ACCOUNTS.BANK, credit: '100.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy((e: unknown) => isAccountingError(e) && e.code === 'GROUP_ACCOUNT')
  })

  it('requires a party on a control-account line', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'SI',
          entryDate: IN_PERIOD,
          narration: 'Claim without a party',
          sourceType: 'COMMISSION_CLAIM',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          lines: [
            { accountCode: ACCOUNTS.AR_UNIVERSITIES, debit: '1000.00' },
            { accountCode: ACCOUNTS.ACCRUED_COMMISSION, credit: '1000.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && e.code === 'CONTROL_ACCOUNT_REQUIRES_PARTY',
    )
  })

  it('blocks a manual journal from touching a control account', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'JV',
          entryDate: IN_PERIOD,
          narration: 'Manual adjustment to receivables',
          sourceType: 'MANUAL',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          isManual: true,
          lines: [
            {
              accountCode: ACCOUNTS.AR_UNIVERSITIES,
              debit: '1000.00',
              partyId: universityPartyId,
            },
            { accountCode: ACCOUNTS.COMMISSION_INCOME, credit: '1000.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isAccountingError(e) && e.code === 'MANUAL_ENTRY_ON_CONTROL_ACCOUNT',
    )
  })

  it('rejects a date outside any accounting period', async () => {
    await expect(
      prisma.$transaction((tx) =>
        postEntry(tx, {
          voucherType: 'JV',
          entryDate: new Date(Date.UTC(2019, 0, 15)),
          narration: 'Long before the books existed',
          sourceType: 'MANUAL',
          currency: 'BDT',
          fxRate: 1,
          createdBy: AUTHOR,
          lines: [
            { accountCode: ACCOUNTS.OFFICE_RENT, debit: '100.00' },
            { accountCode: ACCOUNTS.BANK, credit: '100.00' },
          ],
        }),
      ),
    ).rejects.toSatisfy((e: unknown) => isAccountingError(e) && e.code === 'NO_OPEN_PERIOD')
  })
})

describe('reverseEntry', () => {
  it('reverses a posted voucher and marks the original REVERSED', async () => {
    const original = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Entry to be reversed',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.MARKETING, debit: '5000.00' },
          { accountCode: ACCOUNTS.BANK, credit: '5000.00' },
        ],
      }),
    )

    const reversal = await prisma.$transaction((tx) =>
      reverseEntry(tx, original.id, {
        reversalDate: IN_PERIOD,
        reason: 'Posted to the wrong account',
        createdBy: AUTHOR,
      }),
    )

    const [before, after] = await Promise.all([
      prisma.journalEntry.findUnique({ where: { id: original.id } }),
      prisma.journalEntry.findUnique({
        where: { id: reversal.id },
        include: { lines: { orderBy: { seq: 'asc' } } },
      }),
    ])

    expect(before?.status).toBe('REVERSED')
    expect(after?.reversesEntryId).toBe(original.id)
    // Debit and credit are mirrored.
    expect(after?.lines[0].credit?.toFixed(2)).toBe('5000.00')
    expect(after?.lines[1].debit?.toFixed(2)).toBe('5000.00')
  })

  it('refuses to reverse the same voucher twice', async () => {
    const entry = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Reverse once only',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.TRAVEL, debit: '750.00' },
          { accountCode: ACCOUNTS.CASH_IN_HAND, credit: '750.00' },
        ],
      }),
    )

    await prisma.$transaction((tx) =>
      reverseEntry(tx, entry.id, {
        reversalDate: IN_PERIOD,
        reason: 'First reversal',
        createdBy: AUTHOR,
      }),
    )

    await expect(
      prisma.$transaction((tx) =>
        reverseEntry(tx, entry.id, {
          reversalDate: IN_PERIOD,
          reason: 'Second reversal',
          createdBy: AUTHOR,
        }),
      ),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && e.code === 'ALREADY_REVERSED',
    )
  })
})

describe('database-level guarantees', () => {
  it('refuses to delete a posted voucher', async () => {
    const entry = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Attempt to delete this',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.UTILITIES, debit: '300.00' },
          { accountCode: ACCOUNTS.BANK, credit: '300.00' },
        ],
      }),
    )

    // The trigger refuses even though this bypasses the posting engine entirely.
    await expect(
      prisma.journalEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/posted and cannot be deleted/i)
  })

  it('refuses to edit a posted voucher', async () => {
    const entry = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Attempt to edit this',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: ACCOUNTS.COMMUNICATION, debit: '400.00' },
          { accountCode: ACCOUNTS.BANK, credit: '400.00' },
        ],
      }),
    )

    await expect(
      prisma.journalEntry.update({
        where: { id: entry.id },
        data: { narration: 'Quietly changed' },
      }),
    ).rejects.toThrow(/immutable/i)
  })

  it('keeps the trial balance in balance', async () => {
    const { debit, credit } = await trialBalance()
    expect(debit).toBe(credit)
  })
})
