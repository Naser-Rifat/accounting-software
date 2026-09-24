import type { PrismaClient } from '../../src/generated/prisma/client'

/**
 * Three partner universities with contacts, programs and one agreement each,
 * so every Universities screen renders non-empty and the three schedule shapes
 * (PER_YEAR, CUSTOM, ONE_TIME) each have a live example.
 *
 * Idempotent: keyed on Party.code, program (university, name, level) and
 * agreement (university, effectiveFrom). Raw Prisma rather than the services,
 * which import `server-only` and cannot run under tsx.
 */

const AR_UNIVERSITIES = '1120'

type ScheduleLine = {
  seq: number
  label: string
  percentOfTotal: string
  triggerEvent: 'ENROLLMENT' | 'CENSUS_DATE' | 'ARRIVAL' | 'RE_ENROLLMENT' | 'FIXED_DATE'
  offsetDays: number
}

type UniversitySeed = {
  code: string
  name: string
  country: string
  city: string
  website: string
  currency: string
  collectsTuitionViaAgency: boolean
  withholdingRate: string | null
  contacts: { name: string; role: string; email: string; phone?: string; isPrimary: boolean }[]
  programs: {
    name: string
    level: 'FOUNDATION' | 'DIPLOMA' | 'BACHELOR' | 'MASTER' | 'PHD'
    durationMonths: number
    tuitionFee: string
    intakeMonths: number[]
  }[]
  agreement: {
    title: string
    reference: string
    effectiveFrom: string
    rateType: 'PERCENT' | 'FIXED'
    rate: string
    appliesTo: 'FIRST_YEAR_TUITION' | 'TOTAL_TUITION' | 'PER_STUDENT'
    eligibilityTrigger: 'ENROLLMENT' | 'CENSUS_DATE' | 'ARRIVAL'
    scheduleType: 'ONE_TIME' | 'PER_YEAR' | 'PER_SEMESTER' | 'CUSTOM'
    paymentTermsDays: number
    lines: ScheduleLine[]
  }
}

export const UNIVERSITY_SEED: UniversitySeed[] = [
  {
    code: 'UNIMELB',
    name: 'University of Melbourne',
    country: 'AU',
    city: 'Melbourne',
    website: 'https://www.unimelb.edu.au',
    currency: 'AUD',
    collectsTuitionViaAgency: false,
    withholdingRate: null,
    contacts: [
      {
        name: 'Sarah Whitfield',
        role: 'International Partnerships Manager',
        email: 'partnerships@unimelb.example',
        phone: '+61 3 9035 5511',
        isPrimary: true,
      },
      {
        name: 'Daniel Okafor',
        role: 'Agent Commissions Officer',
        email: 'agent.commissions@unimelb.example',
        isPrimary: false,
      },
    ],
    programs: [
      { name: 'Master of Information Technology', level: 'MASTER', durationMonths: 24, tuitionFee: '46000.00', intakeMonths: [2, 7] },
      { name: 'Bachelor of Commerce', level: 'BACHELOR', durationMonths: 36, tuitionFee: '45000.00', intakeMonths: [2, 7] },
    ],
    agreement: {
      title: '2026 Agent Agreement',
      reference: 'UoM-AGT-2026-114',
      effectiveFrom: '2026-07-01',
      rateType: 'PERCENT',
      rate: '15',
      appliesTo: 'TOTAL_TUITION',
      eligibilityTrigger: 'ENROLLMENT',
      scheduleType: 'PER_YEAR',
      paymentTermsDays: 30,
      lines: [
        { seq: 1, label: 'Year 1', percentOfTotal: '33.3333', triggerEvent: 'ENROLLMENT', offsetDays: 0 },
        { seq: 2, label: 'Year 2', percentOfTotal: '33.3333', triggerEvent: 'RE_ENROLLMENT', offsetDays: 0 },
        { seq: 3, label: 'Year 3', percentOfTotal: '33.3334', triggerEvent: 'RE_ENROLLMENT', offsetDays: 0 },
      ],
    },
  },
  {
    code: 'GREENWICH',
    name: 'University of Greenwich',
    country: 'GB',
    city: 'London',
    website: 'https://www.gre.ac.uk',
    currency: 'GBP',
    collectsTuitionViaAgency: false,
    withholdingRate: null,
    contacts: [
      {
        name: 'Priya Raman',
        role: 'Regional Manager, South Asia',
        email: 'southasia@gre.example',
        phone: '+44 20 8331 8000',
        isPrimary: true,
      },
    ],
    programs: [
      { name: 'MSc Data Science', level: 'MASTER', durationMonths: 12, tuitionFee: '17500.00', intakeMonths: [1, 9] },
      { name: 'BSc (Hons) Computing', level: 'BACHELOR', durationMonths: 36, tuitionFee: '16500.00', intakeMonths: [9] },
    ],
    agreement: {
      title: 'Representative Agreement 2026/27',
      reference: 'GRE/INT/0932',
      effectiveFrom: '2026-08-01',
      rateType: 'PERCENT',
      rate: '20',
      appliesTo: 'FIRST_YEAR_TUITION',
      eligibilityTrigger: 'CENSUS_DATE',
      scheduleType: 'CUSTOM',
      paymentTermsDays: 45,
      lines: [
        { seq: 1, label: 'On enrollment', percentOfTotal: '60.0000', triggerEvent: 'ENROLLMENT', offsetDays: 0 },
        { seq: 2, label: 'After census date', percentOfTotal: '40.0000', triggerEvent: 'CENSUS_DATE', offsetDays: 14 },
      ],
    },
  },
  {
    code: 'APU-MY',
    name: 'Asia Pacific University of Technology & Innovation',
    country: 'MY',
    city: 'Kuala Lumpur',
    website: 'https://www.apu.edu.my',
    currency: 'USD',
    collectsTuitionViaAgency: true,
    withholdingRate: '5',
    contacts: [
      {
        name: 'Lim Wei Jian',
        role: 'Head of International Recruitment',
        email: 'recruit@apu.example',
        phone: '+60 3 8996 1000',
        isPrimary: true,
      },
    ],
    programs: [
      { name: 'Foundation in Computing', level: 'FOUNDATION', durationMonths: 12, tuitionFee: '5200.00', intakeMonths: [1, 4, 7, 9] },
      { name: 'BSc (Hons) Software Engineering', level: 'BACHELOR', durationMonths: 36, tuitionFee: '9800.00', intakeMonths: [1, 4, 9] },
    ],
    agreement: {
      title: 'Recruitment Partner Agreement',
      reference: 'APU-RP-0417',
      effectiveFrom: '2026-07-01',
      rateType: 'FIXED',
      rate: '1500',
      appliesTo: 'PER_STUDENT',
      eligibilityTrigger: 'ARRIVAL',
      scheduleType: 'ONE_TIME',
      paymentTermsDays: 60,
      lines: [
        { seq: 1, label: 'Full commission', percentOfTotal: '100.0000', triggerEvent: 'ARRIVAL', offsetDays: 0 },
      ],
    },
  },
]

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

export async function seedUniversities(prisma: PrismaClient, createdBy = 'seed') {
  let agreements = 0
  let programs = 0

  for (const seed of UNIVERSITY_SEED) {
    const party = await prisma.party.upsert({
      where: { code: seed.code },
      create: {
        code: seed.code,
        name: seed.name,
        type: 'UNIVERSITY',
        controlAccountCode: AR_UNIVERSITIES,
        currency: seed.currency,
      },
      update: { name: seed.name },
    })

    const university = await prisma.university.upsert({
      where: { partyId: party.id },
      create: {
        partyId: party.id,
        name: seed.name,
        country: seed.country,
        city: seed.city,
        website: seed.website,
        currency: seed.currency,
        collectsTuitionViaAgency: seed.collectsTuitionViaAgency,
        withholdingRate: seed.withholdingRate,
        createdBy,
      },
      update: { name: seed.name, city: seed.city, website: seed.website },
    })

    for (const contact of seed.contacts) {
      const existing = await prisma.universityContact.findFirst({
        where: { universityId: university.id, email: contact.email },
      })
      if (!existing) {
        await prisma.universityContact.create({ data: { universityId: university.id, ...contact } })
      }
    }

    for (const program of seed.programs) {
      await prisma.program.upsert({
        where: {
          universityId_name_level: {
            universityId: university.id,
            name: program.name,
            level: program.level,
          },
        },
        create: { universityId: university.id, currency: seed.currency, createdBy, ...program },
        update: { durationMonths: program.durationMonths, intakeMonths: program.intakeMonths },
      })
      programs++
    }

    const { lines, effectiveFrom, ...agreement } = seed.agreement
    const existing = await prisma.commissionAgreement.findFirst({
      where: { universityId: university.id, effectiveFrom: day(effectiveFrom) },
    })
    if (!existing) {
      await prisma.commissionAgreement.create({
        data: {
          universityId: university.id,
          effectiveFrom: day(effectiveFrom),
          currency: seed.currency,
          createdBy,
          ...agreement,
          lines: { create: lines },
        },
      })
      agreements++
    }
  }

  console.log(
    `  universities    ${UNIVERSITY_SEED.length} · programs ${programs} · agreements ${agreements} new`,
  )
}
