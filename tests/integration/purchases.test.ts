import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import {
  approveBill,
  createBill,
  createDebitNote,
  createVendor,
  getPayablesAging,
  listOpenBills,
  payVendor,
} from '@/server/services/purchases-service'

/**
 * Purchases end to end.
 *
 * This is the first module to post to a control account, so it also proves the
 * machinery the ledger has been carrying since the beginning: a payable line
 * must name a party, and the vendor subledger must agree with 2010.
 */

const AUTHOR = 'test'
const IN_PERIOD = new Date(Date.UTC(2026, 8, 15)) // 15 Sep 2026

let vendorId: string
let categoryId: string
let billId: string

/** Balance of 2010 for one vendor, straight from the ledger. */
async function apBalance(partyId?: string) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."credit") - SUM(l."debit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${ACCOUNTS.AP_VENDORS}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND (${partyId ?? null}::text IS NULL OR l."partyId" = ${partyId ?? null}::text)
  `
  return Number(rows[0]?.balance ?? 0)
}

beforeAll(async () => {
  const vendor = await createVendor({ name: `Test Vendor ${Date.now()}`, createdBy: AUTHOR })
  vendorId = vendor.id

  const category = await prisma.expenseCategory.findFirstOrThrow({ where: { code: 'RENT' } })
  categoryId = category.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('bills', () => {
  it('creates a draft that does not touch the ledger', async () => {
    const before = await apBalance(vendorId)

    const bill = await createBill({
      partyId: vendorId,
      categoryId,
      incurredOn: IN_PERIOD,
      dueOn: new Date(Date.UTC(2026, 9, 15)),
      amount: '50000',
      taxAmount: '7500',
      vendorRef: 'INV-9001',
      description: 'Office rent for September',
      createdBy: AUTHOR,
    })
    billId = bill.id

    expect(bill.billNo).toMatch(/^EXP-2627-\d{5}$/)
    expect(bill.status).toBe('DRAFT')
    expect(bill.total.toFixed(2)).toBe('57500.00')
    // A draft is not an accounting event.
    expect(await apBalance(vendorId)).toBe(before)
  })

  it('posts expense, input VAT and payable on approval', async () => {
    const result = await approveBill({
      billId,
      approvedBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.voucherNo).toMatch(/^PB-2627-\d{5}$/)

    const voucher = await prisma.journalEntry.findFirstOrThrow({
      where: { voucherNo: result.voucherNo },
      include: { lines: { include: { account: true } } },
    })

    const byCode = new Map(
      voucher.lines.map((l) => [
        l.account.code,
        { debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0), partyId: l.partyId },
      ]),
    )

    expect(byCode.get('6020')?.debit).toBe(50000)
    expect(byCode.get(ACCOUNTS.INPUT_VAT)?.debit).toBe(7500)
    expect(byCode.get(ACCOUNTS.AP_VENDORS)?.credit).toBe(57500)
    // The control-account line names the vendor — without it the subledger
    // could never be reconciled.
    expect(byCode.get(ACCOUNTS.AP_VENDORS)?.partyId).toBe(vendorId)
  })

  it('refuses to approve the same bill twice', async () => {
    await expect(
      approveBill({ billId, approvedBy: AUTHOR, canPostToSoftClosed: true }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /already approved/i.test(e.message),
    )
  })
})

describe('payments', () => {
  it('refuses to pay more than is owed', async () => {
    await expect(
      payVendor({
        partyId: vendorId,
        paidOn: IN_PERIOD,
        amount: '999999',
        withheldTax: '0',
        bankAccountCode: ACCOUNTS.BANK,
        method: 'BANK_TRANSFER',
        reference: null,
        createdBy: AUTHOR,
        canPostToSoftClosed: true,
      }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /outstanding/i.test(e.message),
    )
  })

  it('settles part of a bill and leaves the rest outstanding', async () => {
    const result = await payVendor({
      partyId: vendorId,
      paidOn: IN_PERIOD,
      amount: '20000',
      withheldTax: '0',
      bankAccountCode: ACCOUNTS.BANK,
      method: 'BANK_TRANSFER',
      reference: 'TRF-1',
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.paymentNo).toMatch(/^PV-2627-\d{5}$/)
    expect(result.netPaid).toBe('20000.00')

    const bill = await prisma.expenseBill.findUniqueOrThrow({ where: { id: billId } })
    expect(bill.status).toBe('PARTIALLY_PAID')

    const open = await listOpenBills(vendorId)
    expect(open[0].outstanding).toBe('37500.00')
  })

  it('withholds tax without short-changing the vendor', async () => {
    const result = await payVendor({
      partyId: vendorId,
      paidOn: IN_PERIOD,
      amount: '10000',
      withheldTax: '1000',
      bankAccountCode: ACCOUNTS.BANK,
      method: 'BANK_TRANSFER',
      reference: 'TRF-2',
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    // 9,000 leaves the bank, but the vendor is settled for the full 10,000.
    expect(result.netPaid).toBe('9000.00')

    const voucher = await prisma.journalEntry.findFirstOrThrow({
      where: { voucherNo: result.voucherNo },
      include: { lines: { include: { account: true } } },
    })
    const byCode = new Map(
      voucher.lines.map((l) => [
        l.account.code,
        { debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0) },
      ]),
    )

    expect(byCode.get(ACCOUNTS.AP_VENDORS)?.debit).toBe(10000)
    expect(byCode.get(ACCOUNTS.BANK)?.credit).toBe(9000)
    expect(byCode.get(ACCOUNTS.WITHHOLDING_TAX_PAYABLE)?.credit).toBe(1000)
  })

  it('gives the payment the same number as its voucher', async () => {
    // Regression: the PV document series and the PV voucher type share a key,
    // so allocating a document number separately burned two numbers per payment
    // and left gaps in the voucher series.
    const result = await payVendor({
      partyId: vendorId,
      paidOn: IN_PERIOD,
      amount: '1000',
      withheldTax: '0',
      bankAccountCode: ACCOUNTS.BANK,
      method: 'CASH',
      reference: 'numbering-check',
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.paymentNo).toBe(result.voucherNo)
  })

  it('rejects withholding greater than the amount settled', async () => {
    await expect(
      payVendor({
        partyId: vendorId,
        paidOn: IN_PERIOD,
        amount: '100',
        withheldTax: '500',
        bankAccountCode: ACCOUNTS.BANK,
        method: 'BANK_TRANSFER',
        reference: null,
        createdBy: AUTHOR,
        canPostToSoftClosed: true,
      }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /withheld tax/i.test(e.message),
    )
  })
})

describe('debit notes', () => {
  it('reduces the payable and the expense', async () => {
    const before = await apBalance(vendorId)

    const result = await createDebitNote({
      billId,
      issuedOn: IN_PERIOD,
      amount: '2500',
      reason: 'Overcharged for one week',
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.noteNo).toMatch(/^DN-2627-\d{5}$/)
    expect(await apBalance(vendorId)).toBeCloseTo(before - 2500, 2)

    const voucher = await prisma.journalEntry.findFirstOrThrow({
      where: { voucherNo: result.voucherNo },
      include: { lines: { include: { account: true } } },
    })
    const byCode = new Map(
      voucher.lines.map((l) => [
        l.account.code,
        { debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0) },
      ]),
    )
    expect(byCode.get(ACCOUNTS.AP_VENDORS)?.debit).toBe(2500)
    expect(byCode.get('6020')?.credit).toBe(2500)
  })

  it('refuses a note larger than what is outstanding', async () => {
    await expect(
      createDebitNote({
        billId,
        issuedOn: IN_PERIOD,
        amount: '999999',
        reason: 'Too much',
        createdBy: AUTHOR,
        canPostToSoftClosed: true,
      }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /outstanding/i.test(e.message),
    )
  })
})

describe('control account', () => {
  it('vendor subledger reconciles to 2010', async () => {
    const aging = await getPayablesAging(new Date(Date.UTC(2030, 0, 1)))
    const control = await apBalance()
    expect(Number(aging.totals.total)).toBeCloseTo(control, 2)
  })

  it('every payable line names a party', async () => {
    const orphans = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n
        FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId"
       WHERE a."code" = ${ACCOUNTS.AP_VENDORS} AND l."partyId" IS NULL
    `
    expect(Number(orphans[0].n)).toBe(0)
  })
})
