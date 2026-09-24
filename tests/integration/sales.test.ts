import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { createCreditNote, createInvoice, decideRefund, getInvoice, issueInvoice, payRefund, requestRefund } from '@/server/services/invoice-service'
import { recordReceipt } from '@/server/services/receipt-service'
import { createBranch, createCounselor, setBranchActive, setCounselorActive } from '@/server/services/team-service'
import { createStudent, setStudentActive } from '@/server/services/student-service'

/**
 * Student fees — docs/modules/06. Invoice (row 12 + 13), receipt (row 14),
 * advance (row 15), credit note (row 17), refund (row 18). The 1110 party
 * balance must equal invoices less receipts less credit notes plus refunds.
 */

const AUTHOR = { username: 'test' }
const OTHER = { username: 'other-checker' }
const STAMP = Date.now()
const ON = new Date('2026-09-15T00:00:00Z')

let studentId: string
let partyId: string
let invoiceId: string
let branchId: string
let counselorId: string

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise
  } catch (error) {
    if (isAccountingError(error)) {
      expect(error.code).toBe(code)
      return
    }
    throw error
  }
  throw new Error(`Expected ${code} to be thrown`)
}

async function balance(code: string, party?: string) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId" JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${code} AND e."status" IN ('POSTED','REVERSED')
       AND (${party ?? null}::text IS NULL OR l."partyId" = ${party ?? null}::text)
  `
  return Number(rows[0]?.balance ?? 0)
}

beforeAll(async () => {
  const costCenter = await prisma.costCenter.findFirstOrThrow({ where: { type: 'BRANCH' } })
  const branch = await createBranch({ code: `S${String(STAMP).slice(-8)}`, name: `Sales Branch ${STAMP}`, costCenterId: costCenter.id })
  branchId = branch.id
  const counselor = await createCounselor({ name: `Sales Counselor ${STAMP}`, commissionRate: '0', branchId })
  counselorId = counselor.id
  const student = await createStudent({ firstName: 'Sales', lastName: `Student ${STAMP}`, counselorId, preferredCountries: [], passportNo: `S${STAMP}`, createdBy: AUTHOR.username })
  studentId = student.id
  partyId = (await prisma.student.findUniqueOrThrow({ where: { id: studentId } })).partyId
}, 60_000)

afterAll(async () => {
  await setStudentActive(studentId, false).catch(() => undefined)
  await setCounselorActive(counselorId, false).catch(() => undefined)
  await setBranchActive(branchId, false).catch(() => undefined)
  await prisma.$disconnect()
}, 60_000)

describe('invoice', () => {
  it('a draft posts nothing; issuing posts Dr 1110 (party) / Cr income (+ discount to 4090)', async () => {
    const draft = await createInvoice({
      studentId,
      discount: '500',
      lines: [
        { feeType: 'SERVICE', description: 'Service fee', amount: '10000' },
        { feeType: 'VISA_PROCESSING', description: 'Visa processing', amount: '2500' },
      ],
      actor: AUTHOR,
    })
    invoiceId = draft.id
    expect(draft.invoiceNo).toMatch(/^INV-2627-\d{5}$/)
    expect(draft.total).toBe('12000.00')
    expect(await balance(ACCOUNTS.AR_STUDENTS, partyId)).toBe(0)

    const before = { service: await balance(ACCOUNTS.SERVICE_FEE_INCOME), visa: await balance(ACCOUNTS.VISA_FEE_INCOME), disc: await balance(ACCOUNTS.REFUNDS_AND_DISCOUNTS) }
    const issued = await issueInvoice({ invoiceId, issuedOn: ON, actor: AUTHOR, canPostToSoftClosed: true })
    expect(issued.voucherNo).toMatch(/^SI-2627-/)
    expect(await balance(ACCOUNTS.AR_STUDENTS, partyId)).toBeCloseTo(12000, 2)
    expect(await balance(ACCOUNTS.SERVICE_FEE_INCOME)).toBeCloseTo(before.service - 10000, 2)
    expect(await balance(ACCOUNTS.VISA_FEE_INCOME)).toBeCloseTo(before.visa - 2500, 2)
    expect(await balance(ACCOUNTS.REFUNDS_AND_DISCOUNTS)).toBeCloseTo(before.disc + 500, 2)
    await expectCode(issueInvoice({ invoiceId, issuedOn: ON, actor: AUTHOR }), 'ILLEGAL_TRANSITION')
  })

  it('a receipt with an unallocated remainder settles the invoice and books the rest as an advance', async () => {
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { isActive: true, isClientAccount: false } })
    const advBefore = await balance(ACCOUNTS.STUDENT_ADVANCES)
    const r = await recordReceipt({ partyId, receivedOn: ON, amount: '13000', currency: 'BDT', bankAccountCode: bank.glAccountCode, method: 'CASH', allocations: [{ invoiceId, amount: '12000' }], actor: AUTHOR, canPostToSoftClosed: true })
    expect(r.unallocated).toBe('1000.00')
    expect(await balance(ACCOUNTS.AR_STUDENTS, partyId)).toBeCloseTo(0, 2)
    expect(await balance(ACCOUNTS.STUDENT_ADVANCES)).toBeCloseTo(advBefore - 1000, 2)
    expect((await getInvoice(invoiceId))?.status).toBe('PAID')
    await expectCode(recordReceipt({ partyId, receivedOn: ON, amount: '10', currency: 'BDT', bankAccountCode: bank.glAccountCode, method: 'CASH', allocations: [{ invoiceId, amount: '10' }], actor: AUTHOR, canPostToSoftClosed: true }), 'VALIDATION')
  })

  it('credit note then refund: obligation cancelled first, cash out second, never by the requester', async () => {
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { isActive: true, isClientAccount: false } })
    const note = await createCreditNote({ invoiceId, amount: '2500', reason: 'visa not required', issuedOn: ON, actor: AUTHOR, canPostToSoftClosed: true })
    expect(note.noteNo).toMatch(/^CN-2627-/)
    expect(await balance(ACCOUNTS.AR_STUDENTS, partyId)).toBeCloseTo(-2500, 2) // the student is now owed money

    const refund = await requestRefund({ creditNoteId: note.id, reason: 'return visa fee', actor: AUTHOR })
    await expectCode(decideRefund({ refundId: refund.id, approve: true, actor: AUTHOR }), 'SELF_APPROVAL')
    await expectCode(payRefund({ refundId: refund.id, paidOn: ON, bankAccountCode: bank.glAccountCode, method: 'CASH', actor: OTHER }), 'ILLEGAL_TRANSITION')
    await decideRefund({ refundId: refund.id, approve: true, actor: OTHER })
    const paid = await payRefund({ refundId: refund.id, paidOn: ON, bankAccountCode: bank.glAccountCode, method: 'CASH', actor: OTHER, canPostToSoftClosed: true })
    expect(paid.voucherNo).toMatch(/^PV-2627-/)
    expect(await balance(ACCOUNTS.AR_STUDENTS, partyId)).toBeCloseTo(0, 2)
    await expectCode(requestRefund({ creditNoteId: note.id, reason: 'again', actor: AUTHOR }), 'VALIDATION')
  })
})
