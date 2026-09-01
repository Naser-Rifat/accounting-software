import { afterAll, describe, expect, it } from 'vitest'

import { postEntry, reverseEntry } from '@/server/accounting/post'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { prisma } from '@/server/db/client'
import { getGeneralLedger, getTrialBalance } from '@/server/services/reports-service'

const IN_PERIOD = new Date(Date.UTC(2026, 7, 20))
const AUTHOR = 'test'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('reports include reversed vouchers', () => {
  /**
   * Regression: reports once filtered on status = 'POSTED', which excluded a
   * reversed voucher's original lines while still counting its reversal. Account
   * balances were then wrong by the reversed amount in the reversal's direction,
   * even though the trial balance still footed.
   *
   * A reversed voucher is a real posting. It is cancelled by its reversal, not
   * by being hidden.
   */
  it('nets a reversed voucher to zero on the account', async () => {
    const account = ACCOUNTS.PRINTING

    const before = await getGeneralLedger(
      account,
      new Date(Date.UTC(2026, 6, 1)),
      new Date(Date.UTC(2027, 5, 30)),
    )

    const entry = await prisma.$transaction((tx) =>
      postEntry(tx, {
        voucherType: 'JV',
        entryDate: IN_PERIOD,
        narration: 'Stationery order, later cancelled',
        sourceType: 'MANUAL',
        currency: 'BDT',
        fxRate: 1,
        createdBy: AUTHOR,
        lines: [
          { accountCode: account, debit: '4321.00' },
          { accountCode: ACCOUNTS.BANK, credit: '4321.00' },
        ],
      }),
    )

    await prisma.$transaction((tx) =>
      reverseEntry(tx, entry.id, {
        reversalDate: IN_PERIOD,
        reason: 'Order cancelled',
        createdBy: AUTHOR,
      }),
    )

    const after = await getGeneralLedger(
      account,
      new Date(Date.UTC(2026, 6, 1)),
      new Date(Date.UTC(2027, 5, 30)),
    )

    // Both the original and its reversal appear...
    expect(after.rows.length).toBe(before.rows.length + 2)
    // ...and they cancel exactly.
    expect(after.closing).toBe(before.closing)
  })

  it('keeps the trial balance footing', async () => {
    const tb = await getTrialBalance(new Date(Date.UTC(2027, 5, 30)))
    expect(tb.totalDebit).toBe(tb.totalCredit)
    expect(tb.balanced).toBe(true)
  })
})
