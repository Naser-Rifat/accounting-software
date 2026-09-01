import { afterAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { approveEntry, postEntry, rejectEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'

/**
 * Maker-checker, exercised against a real database.
 *
 * The rule being defended is that a hand-entered voucher cannot reach the ledger
 * on one person's say-so. Several of these assert that the DATABASE refuses, not
 * only the service — a control enforced in one layer is one a future code path
 * can forget.
 */

const IN_PERIOD = new Date(Date.UTC(2026, 7, 20)) // inside FY2026-27
const MAKER = 'test-maker'
const CHECKER = 'test-checker'

/** A balanced, control-account-free pair of lines the engine will always accept. */
const LINES = [
  { accountCode: ACCOUNTS.PRINTING, debit: '100.00' },
  { accountCode: ACCOUNTS.CASH_IN_HAND, credit: '100.00' },
]

async function submit(narration: string, createdBy = MAKER) {
  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'JV',
      entryDate: IN_PERIOD,
      narration,
      sourceType: 'MANUAL',
      currency: 'BDT',
      fxRate: 1,
      createdBy,
      isManual: true,
      submitForApproval: true,
      lines: LINES,
    }),
  )
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('a submitted voucher is not in the ledger', () => {
  it('is PENDING_APPROVAL, not POSTED, and has no postedAt', async () => {
    const result = await submit('maker-checker: awaiting approval')

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })

    expect(entry?.status).toBe('PENDING_APPROVAL')
    expect(entry?.postedAt).toBeNull()
    expect(entry?.submittedBy).toBe(MAKER)
    expect(entry?.submittedAt).not.toBeNull()
  })

  it('is invisible to the trial balance until approved', async () => {
    const account = await prisma.account.findUniqueOrThrow({
      where: { code: ACCOUNTS.PRINTING },
    })

    const balance = async () => {
      const rows = await prisma.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM(l."debit"), 0)::text AS total
          FROM "JournalLine" l
          JOIN "JournalEntry" e ON e."id" = l."entryId"
         WHERE e."status" IN ('POSTED', 'REVERSED')
           AND l."accountId" = ${account.id}
      `
      return Number(rows[0]?.total ?? 0)
    }

    const before = await balance()
    await submit('maker-checker: excluded from reports')

    // The voucher exists, is numbered, and balances — and still moves nothing.
    expect(await balance()).toBe(before)
  })
})

describe('a voucher cannot be approved by the person who submitted it', () => {
  it('the engine refuses self-approval', async () => {
    const result = await submit('maker-checker: self approval')

    const error = await prisma
      .$transaction((tx) => approveEntry(tx, result.id, { approvedBy: MAKER }))
      .catch((e: unknown) => e)

    expect(isAccountingError(error)).toBe(true)
    if (isAccountingError(error)) expect(error.code).toBe('SELF_APPROVAL')

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })
    expect(entry?.status).toBe('PENDING_APPROVAL')
  })

  it('the database refuses it too, even bypassing the engine', async () => {
    const result = await submit('maker-checker: db trigger')

    // Straight UPDATE, exactly what a bad code path or a SQL client would do.
    const attempt = prisma.$executeRaw`
      UPDATE "JournalEntry"
         SET "status" = 'POSTED', "approvedBy" = ${MAKER}, "postedAt" = NOW()
       WHERE "id" = ${result.id}
    `

    await expect(attempt).rejects.toThrow(/cannot be approved by the same user/i)

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })
    expect(entry?.status).toBe('PENDING_APPROVAL')
  })

  it('the database refuses posting with no approver at all', async () => {
    const result = await submit('maker-checker: no approver')

    const attempt = prisma.$executeRaw`
      UPDATE "JournalEntry" SET "status" = 'POSTED' WHERE "id" = ${result.id}
    `

    await expect(attempt).rejects.toThrow(/without an approver/i)
  })
})

describe('a submitted voucher is frozen', () => {
  it('its lines cannot be changed while it waits', async () => {
    const result = await submit('maker-checker: frozen lines')

    const attempt = prisma.$executeRaw`
      UPDATE "JournalLine" SET "debit" = 999 WHERE "entryId" = ${result.id} AND "debit" > 0
    `

    await expect(attempt).rejects.toThrow(/cannot be changed/i)
  })

  it('its narration cannot be edited while it waits', async () => {
    const result = await submit('maker-checker: frozen header')

    const attempt = prisma.$executeRaw`
      UPDATE "JournalEntry" SET "narration" = 'tampered' WHERE "id" = ${result.id}
    `

    await expect(attempt).rejects.toThrow(/awaiting approval and immutable/i)
  })

  it('it cannot be deleted', async () => {
    const result = await submit('maker-checker: undeletable')

    const attempt = prisma.$executeRaw`
      DELETE FROM "JournalEntry" WHERE "id" = ${result.id}
    `

    await expect(attempt).rejects.toThrow(/cannot be deleted/i)
  })
})

describe('approval posts the voucher', () => {
  it('a different user can approve, and the entry reaches the ledger', async () => {
    const result = await submit('maker-checker: approved')

    await prisma.$transaction((tx) =>
      approveEntry(tx, result.id, { approvedBy: CHECKER }),
    )

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })

    expect(entry?.status).toBe('POSTED')
    expect(entry?.approvedBy).toBe(CHECKER)
    expect(entry?.postedAt).not.toBeNull()
  })

  it('an already-posted voucher cannot be approved twice', async () => {
    const result = await submit('maker-checker: double approval')

    await prisma.$transaction((tx) =>
      approveEntry(tx, result.id, { approvedBy: CHECKER }),
    )

    const error = await prisma
      .$transaction((tx) => approveEntry(tx, result.id, { approvedBy: CHECKER }))
      .catch((e: unknown) => e)

    expect(isAccountingError(error)).toBe(true)
    if (isAccountingError(error)) expect(error.code).toBe('ALREADY_POSTED')
  })
})

describe('rejection sends it back to the maker', () => {
  it('returns to DRAFT with the reason and reviewer recorded, keeping its number', async () => {
    const result = await submit('maker-checker: rejected')

    await prisma.$transaction((tx) =>
      rejectEntry(tx, result.id, { rejectedBy: CHECKER, reason: 'wrong expense head' }),
    )

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })

    expect(entry?.status).toBe('DRAFT')
    expect(entry?.rejectedBy).toBe(CHECKER)
    expect(entry?.rejectionReason).toBe('wrong expense head')
    // Rule 6: the number it was issued is the number it keeps.
    expect(entry?.voucherNo).toBe(result.voucherNo)
  })

  it('a rejected voucher is editable again, so the maker can correct it', async () => {
    const result = await submit('maker-checker: editable after rejection')

    await prisma.$transaction((tx) =>
      rejectEntry(tx, result.id, { rejectedBy: CHECKER, reason: 'fix the narration' }),
    )

    // Back in DRAFT the immutability triggers stand down — this must succeed.
    await prisma.$executeRaw`
      UPDATE "JournalEntry" SET "narration" = 'corrected' WHERE "id" = ${result.id}
    `

    const entry = await prisma.journalEntry.findUnique({ where: { id: result.id } })
    expect(entry?.narration).toBe('corrected')
  })

  it('cannot be rejected by its own maker', async () => {
    const result = await submit('maker-checker: self rejection')

    const error = await prisma
      .$transaction((tx) =>
        rejectEntry(tx, result.id, { rejectedBy: MAKER, reason: 'changed my mind' }),
      )
      .catch((e: unknown) => e)

    expect(isAccountingError(error)).toBe(true)
    if (isAccountingError(error)) expect(error.code).toBe('SELF_APPROVAL')
  })
})
