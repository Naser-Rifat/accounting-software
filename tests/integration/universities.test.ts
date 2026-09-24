import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import {
  createAgreement,
  endAgreement,
  findAgreementInForce,
  setAgreementActive,
} from '@/server/services/agreement-service'
import { createProgram } from '@/server/services/program-service'
import {
  createUniversity,
  getUniversity,
  listUniversities,
  setUniversityActive,
  updateUniversity,
} from '@/server/services/university-service'

/**
 * Universities end to end — docs/modules/02-universities.md.
 *
 * Master data, so the interesting assertions are structural: a university is a
 * Party on the 1120 control account, agreements never overlap, schedules sum to
 * 100, and deactivation leaves history where it was.
 */

const AUTHOR = 'test'
const STAMP = Date.now()

let universityId: string
let partyId: string

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

const agreementInput = (over: Partial<Parameters<typeof createAgreement>[0]> = {}) => ({
  universityId,
  title: 'Agreement',
  effectiveFrom: '2026-07-01',
  rateType: 'PERCENT' as const,
  rate: '15',
  appliesTo: 'TOTAL_TUITION' as const,
  eligibilityTrigger: 'ENROLLMENT' as const,
  scheduleType: 'ONE_TIME' as const,
  paymentTermsDays: 30,
  currency: 'AUD',
  createdBy: AUTHOR,
  ...over,
})

beforeAll(async () => {
  const created = await createUniversity({
    name: `Test University ${STAMP}`,
    country: 'AU',
    city: 'Melbourne',
    currency: 'AUD',
    collectsTuitionViaAgency: false,
    primaryContact: { name: 'Test Contact', email: 'contact@test.example' },
    createdBy: AUTHOR,
  })
  universityId = created.id
  const u = await prisma.university.findUniqueOrThrow({ where: { id: universityId } })
  partyId = u.partyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('a university is a party on the receivable control account', () => {
  it('creates the Party on 1120 with the university currency and a derived code', async () => {
    const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } })
    expect(party.type).toBe('UNIVERSITY')
    expect(party.controlAccountCode).toBe(ACCOUNTS.AR_UNIVERSITIES)
    expect(party.currency).toBe('AUD')
    expect(party.code).toMatch(/^TESTUNIV(-\d+)?$/)
  })

  it('shows a zero outstanding read from the ledger and the primary contact', async () => {
    const row = (await listUniversities()).find((u) => u.id === universityId)
    expect(row?.outstanding).toBe('0.00')
    expect(row?.activeAgreement).toBeNull()

    const detail = await getUniversity(universityId)
    expect(detail?.contacts).toHaveLength(1)
    expect(detail?.contacts[0]?.isPrimary).toBe(true)
  })

  it('keeps Party name and currency in step on update', async () => {
    await updateUniversity({
      universityId,
      name: `Test University ${STAMP} Renamed`,
      country: 'AU',
      currency: 'USD',
      collectsTuitionViaAgency: true,
      withholdingRate: '5',
    })
    const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } })
    expect(party.name).toBe(`Test University ${STAMP} Renamed`)
    expect(party.currency).toBe('USD')
  })
})

describe('programs', () => {
  it('rejects a duplicate name at the same level for one university', async () => {
    const input = {
      universityId,
      name: 'Master of Testing',
      level: 'MASTER',
      durationMonths: 24,
      tuitionFee: '40000.00',
      currency: 'AUD',
      intakeMonths: [2, 7],
      createdBy: AUTHOR,
    }
    await createProgram(input)
    await expectCode(createProgram(input), 'VALIDATION')
  })
})

describe('agreements', () => {
  let openEndedId: string

  it('PER_YEAR persists evenly split lines that sum to exactly 100', async () => {
    const created = await createAgreement(
      agreementInput({ title: 'Per year', scheduleType: 'PER_YEAR', instalmentCount: 3 }),
    )
    openEndedId = created.id
    expect(created.lineCount).toBe(3)

    const lines = await prisma.commissionScheduleLine.findMany({
      where: { agreementId: created.id },
      orderBy: { seq: 'asc' },
    })
    expect(lines.map((l) => l.percentOfTotal.toFixed(4))).toEqual(['33.3333', '33.3333', '33.3334'])
    expect(lines.map((l) => l.triggerEvent)).toEqual(['ENROLLMENT', 'RE_ENROLLMENT', 'RE_ENROLLMENT'])
    const total = lines.reduce((s, l) => s + Number(l.percentOfTotal), 0)
    expect(total).toBeCloseTo(100, 4)
  })

  it('is the agreement in force for a date inside its range', async () => {
    const inForce = await findAgreementInForce(universityId, new Date(Date.UTC(2026, 8, 1)))
    expect(inForce?.id).toBe(openEndedId)
    const before = await findAgreementInForce(universityId, new Date(Date.UTC(2026, 5, 1)))
    expect(before).toBeNull()
  })

  it('rejects a schedule that does not sum to 100', async () => {
    await expectCode(
      createAgreement(
        agreementInput({
          scheduleType: 'CUSTOM',
          effectiveFrom: '2030-01-01',
          lines: [
            { label: 'A', percentOfTotal: '60', triggerEvent: 'ENROLLMENT', offsetDays: 0 },
            { label: 'B', percentOfTotal: '50', triggerEvent: 'CENSUS_DATE', offsetDays: 0 },
          ],
        }),
      ),
      'INVALID_SCHEDULE',
    )
  })

  it('rejects an agreement overlapping the open-ended one', async () => {
    await expectCode(
      createAgreement(agreementInput({ title: 'Clash', effectiveFrom: '2027-01-01' })),
      'AGREEMENT_OVERLAP',
    )
  })

  it('allows a new agreement once the old one is ended', async () => {
    await endAgreement(openEndedId, '2026-12-31')
    const next = await createAgreement(
      agreementInput({ title: 'Successor', effectiveFrom: '2027-01-01', effectiveTo: '2027-12-31' }),
    )
    expect(next.id).toBeTruthy()

    // …but an end date can only be brought forward, never pushed out.
    await expectCode(endAgreement(next.id, '2028-06-30'), 'VALIDATION')
  })

  it('refuses to reactivate an agreement into an overlap', async () => {
    const parked = await createAgreement(
      agreementInput({ title: 'Parked', effectiveFrom: '2028-01-01', effectiveTo: '2028-12-31' }),
    )
    await setAgreementActive(parked.id, false)

    // With Parked inactive, another agreement may take 2028.
    const taker = await createAgreement(
      agreementInput({ title: 'Taker', effectiveFrom: '2028-03-01', effectiveTo: '2028-06-30' }),
    )
    expect(taker.id).toBeTruthy()
    await expectCode(setAgreementActive(parked.id, true), 'AGREEMENT_OVERLAP')
  })
})

describe('deactivation keeps history intact', () => {
  it('flips University and Party to inactive without touching programs or agreements', async () => {
    const before = await getUniversity(universityId)
    await setUniversityActive(universityId, false)

    const after = await getUniversity(universityId)
    expect(after?.isActive).toBe(false)
    expect(after?.programs).toHaveLength(before?.programs.length ?? -1)
    expect(after?.agreements).toHaveLength(before?.agreements.length ?? -1)

    const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } })
    expect(party.isActive).toBe(false)

    expect((await listUniversities()).some((u) => u.id === universityId)).toBe(false)
    expect((await listUniversities({ includeInactive: true })).some((u) => u.id === universityId)).toBe(true)
  })

  it('refuses new agreements and programs for an inactive university', async () => {
    await expectCode(createAgreement(agreementInput({ effectiveFrom: '2031-01-01' })), 'VALIDATION')
    await expectCode(
      createProgram({
        universityId,
        name: 'Late program',
        level: 'DIPLOMA',
        durationMonths: 12,
        tuitionFee: '1000.00',
        currency: 'AUD',
        intakeMonths: [],
        createdBy: AUTHOR,
      }),
      'VALIDATION',
    )
  })
})
