import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { createAgreement } from '@/server/services/agreement-service'
import { createApplication, transitionApplication } from '@/server/services/application-service'
import { createClaim, getClaim, getReceivablesSummary, sendClaim } from '@/server/services/claim-service'
import { addAdjustment, approveCommission, cancelCommission, listCommissions, markEligible } from '@/server/services/commission-service'
import { approveInternalCommission, listInternalCommissions, payInternalCommission } from '@/server/services/internal-commission-service'
import { createProgram } from '@/server/services/program-service'
import { recordReceipt } from '@/server/services/receipt-service'
import { createBranch, createCounselor, intakeName, setBranchActive, setCounselorActive } from '@/server/services/team-service'
import { createStudent, setStudentActive } from '@/server/services/student-service'
import { createUniversity, setUniversityActive } from '@/server/services/university-service'

/**
 * The core: from an enrolled application to cash in the bank.
 *
 *   EXPECTED -> ELIGIBLE -> APPROVED (JV row 2) -> CLAIMED (SI row 3)
 *   -> receipt (RV rows 6–8, with withholding and realised FX) -> RECEIVED
 *
 * Every posting path here must leave the trial balance footing and the 1120
 * control equal to the sum of open claims — docs/03 rules and tests/README.
 */

const AUTHOR = { username: 'test' }
const STAMP = Date.now()
const IN_PERIOD = '2026-09-15'

let universityId: string
let universityPartyId: string
let studentId: string
let applicationId: string
let commissionIds: string[] = []
let claimId: string
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

/** Debit − credit of one account, all posted/reversed entries, optionally one party. */
async function balance(code: string, partyId?: string) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${code}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND (${partyId ?? null}::text IS NULL OR l."partyId" = ${partyId ?? null}::text)
  `
  return Number(rows[0]?.balance ?? 0)
}

async function trialBalanceFoots() {
  const rows = await prisma.$queryRaw<{ debit: string; credit: string }[]>`
    SELECT COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
      FROM "JournalLine" l JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED','REVERSED')
  `
  return Number(rows[0]?.debit) === Number(rows[0]?.credit)
}

beforeAll(async () => {
  const costCenter = await prisma.costCenter.findFirstOrThrow({ where: { type: 'BRANCH' } })
  const branch = await createBranch({ code: `C${String(STAMP).slice(-8)}`, name: `Commission Branch ${STAMP}`, costCenterId: costCenter.id })
  branchId = branch.id
  const counselor = await createCounselor({ name: `Commission Counselor ${STAMP}`, commissionRate: '10', branchId })
  counselorId = counselor.id

  const year = 2100 + (STAMP % 300)
  const intake = await prisma.intake.upsert({ where: { year_month: { year, month: 3 } }, create: { year, month: 3, name: intakeName(3, year) }, update: {} })

  // A USD university with a two-instalment agreement, so FX and claims are exercised.
  // USD→BDT rates are seeded (indicative) from the fiscal year start.
  const university = await createUniversity({ name: `Commission University ${STAMP}`, country: 'US', currency: 'USD', collectsTuitionViaAgency: false, createdBy: AUTHOR.username })
  universityId = university.id
  universityPartyId = (await prisma.university.findUniqueOrThrow({ where: { id: universityId } })).partyId
  const program = await createProgram({ universityId, name: 'MS Testing', level: 'MASTER', durationMonths: 12, tuitionFee: '10000.00', currency: 'USD', intakeMonths: [3], createdBy: AUTHOR.username })
  await createAgreement({
    universityId,
    title: 'Test 60/40',
    effectiveFrom: '2026-01-01',
    rateType: 'PERCENT',
    rate: '15',
    appliesTo: 'FIRST_YEAR_TUITION',
    eligibilityTrigger: 'ENROLLMENT',
    scheduleType: 'CUSTOM',
    lines: [
      { label: 'On enrollment', percentOfTotal: '60', triggerEvent: 'ENROLLMENT', offsetDays: 0 },
      { label: 'After census', percentOfTotal: '40', triggerEvent: 'CENSUS_DATE', offsetDays: 14 },
    ],
    paymentTermsDays: 30,
    currency: 'USD',
    createdBy: AUTHOR.username,
  })

  const student = await createStudent({ firstName: 'Commission', lastName: `Student ${STAMP}`, counselorId, preferredCountries: ['US'], passportNo: `C${STAMP}`, createdBy: AUTHOR.username })
  studentId = student.id
  const application = await createApplication({ studentId, universityId, programId: program.id, intakeId: intake.id, applicationFee: '0', createdBy: AUTHOR.username })
  applicationId = application.id
  for (const [to, data] of [
    ['SUBMITTED', { appliedOn: '2026-08-01' }],
    ['UNDER_REVIEW', {}],
    ['OFFER_RECEIVED', { offerDate: '2026-08-15' }],
    ['DEPOSIT_PAID', { depositAmount: '1000', depositPaidOn: '2026-08-20' }],
    ['ENROLLED', { enrolledOn: IN_PERIOD }],
  ] as const) {
    await transitionApplication({ applicationId, to, data, changedBy: AUTHOR.username })
  }
  commissionIds = (await listCommissions({ applicationId })).map((c) => c.id)
}, 120_000)

afterAll(async () => {
  await setStudentActive(studentId, false).catch(() => undefined)
  await setUniversityActive(universityId, false).catch(() => undefined)
  await setCounselorActive(counselorId, false).catch(() => undefined)
  await setBranchActive(branchId, false).catch(() => undefined)
  await prisma.$disconnect()
}, 60_000)

describe('pipeline to approval', () => {
  it('starts as two EXPECTED forecasts that never posted', async () => {
    const rows = await listCommissions({ applicationId })
    expect(rows.map((r) => [r.instalmentLabel, r.expectedAmount, r.status])).toEqual([
      ['On enrollment', '900.00', 'EXPECTED'],
      ['After census', '600.00', 'EXPECTED'],
    ])
    expect(await prisma.journalEntry.count({ where: { sourceType: 'COMMISSION', sourceId: { in: commissionIds } } })).toBe(0)
  })

  it('refuses approval before eligibility, then approves and posts row 2 at the approval-date rate', async () => {
    const [first, second] = commissionIds
    await expectCode(approveCommission({ commissionId: first!, approvedOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR }), 'ILLEGAL_TRANSITION')

    await markEligible({ commissionIds: [first!, second!], eligibleOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR })
    const accruedBefore = await balance(ACCOUNTS.ACCRUED_COMMISSION)
    const incomeBefore = await balance(ACCOUNTS.COMMISSION_INCOME)

    const result = await approveCommission({ commissionId: first!, approvedOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR, canPostToSoftClosed: true })
    expect(result.voucherNo).toMatch(/^JV-2627-\d{5}$/)
    expect(result.internalAccrued).toBe(1)

    const c = await prisma.commission.findUniqueOrThrow({ where: { id: first! } })
    expect(c.status).toBe('APPROVED')
    expect(c.fxRate).not.toBeNull()
    const base = Number(c.baseCurrencyAmount)
    expect(base).toBeCloseTo(900 * Number(c.fxRate), 1)
    expect(await balance(ACCOUNTS.ACCRUED_COMMISSION)).toBeCloseTo(accruedBefore + base, 2)
    expect(await balance(ACCOUNTS.COMMISSION_INCOME)).toBeCloseTo(incomeBefore - base, 2)
    expect(await trialBalanceFoots()).toBe(true)

    const internal = await listInternalCommissions({ payeeType: 'COUNSELOR' })
    const mine = internal.items.find((i) => i.applicationCode && i.instalmentLabel === 'On enrollment' && i.university.startsWith('Commission University'))
    expect(mine?.earnedAmount).toBe('90.00')
    expect(mine?.status).toBe('ACCRUED')
  })

  it('an adjustment before billing moves 1130 and income, never the expected amount', async () => {
    const [first] = commissionIds
    const r = await addAdjustment({ commissionId: first!, amount: '-100', reason: 'SCHOLARSHIP_REDUCTION', adjustedOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR, canPostToSoftClosed: true })
    expect(r.voucherNo).toMatch(/^CN-2627-/)
    const c = await prisma.commission.findUniqueOrThrow({ where: { id: first! } })
    expect(c.expectedAmount.toFixed(2)).toBe('900.00')
    expect(c.netAmount.toFixed(2)).toBe('800.00')
    expect(await trialBalanceFoots()).toBe(true)
  })
})

describe('claim and receipt', () => {
  it('bills the approved commission: SI moves 1130 to 1120 with the party', async () => {
    const [first] = commissionIds
    await expectCode(createClaim({ universityId, commissionIds: commissionIds, actor: AUTHOR }), 'VALIDATION') // second is only ELIGIBLE
    const claim = await createClaim({ universityId, commissionIds: [first!], actor: AUTHOR })
    claimId = claim.id
    expect(claim.claimNo).toMatch(/^CLM-2627-\d{5}$/)
    expect(claim.totalAmount).toBe('800.00')
    expect((await prisma.commission.findUniqueOrThrow({ where: { id: first! } })).status).toBe('CLAIMED')

    const arBefore = await balance(ACCOUNTS.AR_UNIVERSITIES, universityPartyId)
    const sent = await sendClaim({ claimId, claimedOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR, canPostToSoftClosed: true })
    expect(sent.voucherNo).toMatch(/^SI-2627-/)
    expect(sent.dueOn).toBe('2026-10-15')
    const detail = await getClaim(claimId)
    expect(detail?.status).toBe('SENT')
    expect(await balance(ACCOUNTS.AR_UNIVERSITIES, universityPartyId)).toBeCloseTo(arBefore + Number(detail!.baseAmount), 2)
  })

  it('a partial receipt with tax withheld settles gross, books 1310 and realised FX, and leaves the control equal to open claims', async () => {
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { isActive: true, isClientAccount: false } })
    // A different rate on the receipt date than the claim date produces realised FX.
    const rateDate = new Date('2026-09-20T00:00:00Z')
    if (!(await prisma.exchangeRate.findFirst({ where: { fromCurrency: 'USD', toCurrency: 'BDT', rateDate } }))) {
      await prisma.exchangeRate.create({ data: { fromCurrency: 'USD', toCurrency: 'BDT', rateDate, rate: '125', source: 'test' } })
    }

    const withheldBefore = await balance(ACCOUNTS.WITHHOLDING_TAX_RECEIVABLE)
    const r = await recordReceipt({
      partyId: universityPartyId,
      receivedOn: new Date('2026-09-20T00:00:00Z'),
      amount: '500',
      withheldTax: '50',
      currency: 'USD',
      bankAccountCode: bank.glAccountCode,
      method: 'BANK_TRANSFER',
      reference: 'WIRE-1',
      allocations: [{ claimId, amount: '500' }],
      actor: AUTHOR,
      canPostToSoftClosed: true,
    })
    expect(r.receiptNo).toMatch(/^RV-2627-/)
    expect(Number(r.fxDifference)).not.toBe(0)
    expect(await balance(ACCOUNTS.WITHHOLDING_TAX_RECEIVABLE)).toBeCloseTo(withheldBefore + 50 * 125, 2)

    const claim = await getClaim(claimId)
    expect(claim?.status).toBe('PARTIALLY_PAID')
    expect(claim?.received).toBe('500.00')
    expect(claim?.balance).toBe('300.00')
    expect((await prisma.commission.findUniqueOrThrow({ where: { id: commissionIds[0]! } })).status).toBe('PARTIALLY_RECEIVED')

    // Control = what is still open on this party's claims, in base.
    const remainingBase = Number(claim!.baseAmount) - (await prisma.receiptAllocation.aggregate({ where: { claimId }, _sum: { baseAmount: true } }))._sum.baseAmount!.toNumber()
    expect(await balance(ACCOUNTS.AR_UNIVERSITIES, universityPartyId)).toBeCloseTo(remainingBase, 2)
    expect(await trialBalanceFoots()).toBe(true)

    await expectCode(
      recordReceipt({ partyId: universityPartyId, receivedOn: new Date('2026-09-21T00:00:00Z'), amount: '1000', currency: 'USD', bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', allocations: [{ claimId, amount: '1000' }], actor: AUTHOR, canPostToSoftClosed: true }),
      'VALIDATION',
    )
  })

  it('the receivables view shows the university with an open claim', async () => {
    const row = (await getReceivablesSummary()).find((r) => r.universityId === universityId)
    expect(row?.openClaims).toBe(1)
    expect(Number(row?.outstanding)).toBeGreaterThan(0)
  })
})

describe('internal commission', () => {
  it('approves into 2020 with the payee and pays it out with withholding', async () => {
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { isActive: true, isClientAccount: false } })
    const internal = await prisma.internalCommission.findFirstOrThrow({ where: { commissionId: commissionIds[0]! } })
    const apBefore = await balance(ACCOUNTS.AP_COUNSELORS_AGENTS, internal.partyId)

    const approved = await approveInternalCommission({ id: internal.id, actor: AUTHOR })
    expect(approved.voucherNo).toMatch(/^PB-2627-/)
    const row = await prisma.internalCommission.findUniqueOrThrow({ where: { id: internal.id } })
    expect(row.status).toBe('APPROVED')
    const payableBase = Number(row.baseCurrencyAmount)
    expect(await balance(ACCOUNTS.AP_COUNSELORS_AGENTS, internal.partyId)).toBeCloseTo(apBefore - payableBase, 2)

    const paid = await payInternalCommission({ id: internal.id, paidOn: new Date('2026-09-25T00:00:00Z'), bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', withheldTax: '100', actor: AUTHOR, canPostToSoftClosed: true })
    expect(paid.voucherNo).toMatch(/^PV-2627-/)
    expect(Number(paid.net)).toBeCloseTo(payableBase - 100, 2)
    expect(await balance(ACCOUNTS.AP_COUNSELORS_AGENTS, internal.partyId)).toBeCloseTo(apBefore, 2)
    expect(await trialBalanceFoots()).toBe(true)
  })
})

describe('cancellation', () => {
  it('cancelling an eligible instalment posts nothing; a claimed one is refused', async () => {
    const [first, second] = commissionIds
    const before = await prisma.journalEntry.count()
    await cancelCommission({ commissionId: second!, reason: 'student deferred', cancelledOn: new Date(`${IN_PERIOD}T00:00:00Z`), actor: AUTHOR })
    expect(await prisma.journalEntry.count()).toBe(before)
    expect((await prisma.commission.findUniqueOrThrow({ where: { id: second! } })).status).toBe('CANCELLED')
    await expectCode(cancelCommission({ commissionId: first!, reason: 'x', cancelledOn: new Date(), actor: AUTHOR }), 'ILLEGAL_TRANSITION')
  })
})
