import type { PrismaClient } from '../../src/generated/prisma/client'
import { calculateCommission } from '../../src/lib/commission/calculate'
import { allocateSeedNumber } from './numbering'

/**
 * Branches, counselors, an agent, intakes, and four students at different
 * stages of the pipeline — one of them enrolled at Melbourne with the three
 * expected commission instalments the seeded PER_YEAR agreement implies.
 *
 * Idempotent: people are found by email or passport before anything is
 * allocated a number, so re-running never burns a STU/APP sequence.
 */

const AR_STUDENTS = '1110'
const AP_COUNSELORS_AGENTS = '2020'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

export async function seedStudents(prisma: PrismaClient, createdBy = 'seed') {
  const fiscalYear = await prisma.fiscalYear.findUniqueOrThrow({ where: { code: '2627' }, select: { id: true, code: true } })

  // -- Branches → existing BRANCH cost centers ------------------------------
  const branches: Record<string, string> = {}
  for (const b of [
    { code: 'DHK', name: 'Dhaka Branch', address: 'Gulshan 2, Dhaka', costCenter: 'DHK' },
    { code: 'CTG', name: 'Chattogram Branch', address: 'GEC Circle, Chattogram', costCenter: 'CTG' },
  ]) {
    const costCenter = await prisma.costCenter.findUniqueOrThrow({ where: { code: b.costCenter } })
    const branch = await prisma.branch.upsert({
      where: { code: b.code },
      create: { code: b.code, name: b.name, address: b.address, costCenterId: costCenter.id },
      update: { name: b.name },
    })
    branches[b.code] = branch.id
  }

  // -- Counselors & agent (Parties on 2020) --------------------------------
  const counselors: Record<string, string> = {}
  for (const c of [
    { key: 'farhana', code: 'CNS-FARHANA', name: 'Farhana Rahman', email: 'farhana@agency.example', phone: '+880 1711 000001', rate: '10', branch: 'DHK' },
    { key: 'imran', code: 'CNS-IMRAN', name: 'Imran Hossain', email: 'imran@agency.example', phone: '+880 1711 000002', rate: '10', branch: 'DHK' },
    { key: 'shaila', code: 'CNS-SHAILA', name: 'Shaila Akter', email: 'shaila@agency.example', phone: '+880 1811 000003', rate: '12.5', branch: 'CTG' },
  ]) {
    let counselor = await prisma.counselor.findFirst({ where: { email: c.email } })
    if (!counselor) {
      const party = await prisma.party.upsert({
        where: { code: c.code },
        create: { code: c.code, name: c.name, type: 'COUNSELOR', controlAccountCode: AP_COUNSELORS_AGENTS, currency: 'BDT' },
        update: {},
      })
      counselor = await prisma.counselor.create({
        data: { partyId: party.id, name: c.name, email: c.email, phone: c.phone, commissionRate: c.rate, branchId: branches[c.branch]! },
      })
    }
    counselors[c.key] = counselor.id
  }

  let agent = await prisma.agent.findFirst({ where: { email: 'contact@edulink.example' } })
  if (!agent) {
    const party = await prisma.party.upsert({
      where: { code: 'AGT-EDULINK' },
      create: { code: 'AGT-EDULINK', name: 'Rafiq Chowdhury (EduLink Consultancy)', type: 'AGENT', controlAccountCode: AP_COUNSELORS_AGENTS, currency: 'BDT' },
      update: {},
    })
    agent = await prisma.agent.create({
      data: { partyId: party.id, name: 'Rafiq Chowdhury', company: 'EduLink Consultancy', email: 'contact@edulink.example', commissionRate: '20' },
    })
  }

  // -- Intakes ---------------------------------------------------------------
  const intakes: Record<string, string> = {}
  for (const [month, year] of [[2, 2026], [7, 2026], [9, 2026], [2, 2027]] as const) {
    const intake = await prisma.intake.upsert({
      where: { year_month: { year, month } },
      create: { month, year, name: `${MONTHS[month - 1]} ${year}` },
      update: {},
    })
    intakes[`${year}-${month}`] = intake.id
  }

  // -- Students --------------------------------------------------------------
  type StudentSeed = {
    firstName: string
    lastName: string
    passportNo: string
    passportExpiresOn: string
    email: string
    phone: string
    dob: string
    city: string
    counselor: string
    agent?: boolean
    preferredCountries: string[]
    status: 'LEAD' | 'COUNSELING'
    academic: { level: string; institution: string; subject?: string; result?: string; yearOfPassing: number }[]
    notes: { kind: 'NOTE' | 'CALL' | 'MEETING'; body: string; nextFollowUpOn?: string; daysAgo: number }[]
  }

  const STUDENTS: StudentSeed[] = [
    {
      firstName: 'Rahim', lastName: 'Uddin', passportNo: 'A01234567', passportExpiresOn: '2031-03-12',
      email: 'rahim.uddin@example.com', phone: '+880 1712 345678', dob: '2004-05-21', city: 'Dhaka',
      counselor: 'farhana', preferredCountries: ['AU', 'GB'], status: 'LEAD',
      academic: [{ level: 'HSC', institution: 'Notre Dame College', subject: 'Science', result: 'GPA 5.00', yearOfPassing: 2023 }],
      notes: [{ kind: 'CALL', body: 'Walk-in enquiry about Australian IT programs. Sent the UNIMELB brochure.', nextFollowUpOn: '2026-10-02', daysAgo: 3 }],
    },
    {
      firstName: 'Nusrat', lastName: 'Jahan', passportNo: 'A07654321', passportExpiresOn: '2029-11-30',
      email: 'nusrat.jahan@example.com', phone: '+880 1813 222333', dob: '2005-01-09', city: 'Chattogram',
      counselor: 'shaila', preferredCountries: ['MY'], status: 'COUNSELING',
      academic: [{ level: 'HSC', institution: 'Chittagong College', subject: 'Business Studies', result: 'GPA 4.83', yearOfPassing: 2024 }],
      notes: [
        { kind: 'MEETING', body: 'Counseling session with parents. Budget suits Malaysia; foundation route at APU discussed.', daysAgo: 10 },
        { kind: 'NOTE', body: 'Draft application to APU foundation started; waiting for attested transcripts.', nextFollowUpOn: '2026-09-20', daysAgo: 4 },
      ],
    },
    {
      firstName: 'Tanvir', lastName: 'Ahmed', passportNo: 'B11223344', passportExpiresOn: '2027-01-15',
      email: 'tanvir.ahmed@example.com', phone: '+880 1914 555666', dob: '2001-08-30', city: 'Dhaka',
      counselor: 'imran', agent: true, preferredCountries: ['GB'], status: 'COUNSELING',
      academic: [
        { level: 'Bachelor', institution: 'BRAC University', subject: 'Computer Science', result: 'CGPA 3.62', yearOfPassing: 2024 },
        { level: 'HSC', institution: 'Dhaka City College', subject: 'Science', result: 'GPA 5.00', yearOfPassing: 2019 },
      ],
      notes: [{ kind: 'NOTE', body: 'Offer received from Greenwich. Passport expires Jan 2027 — must renew before the visa application.', nextFollowUpOn: '2026-09-28', daysAgo: 2 }],
    },
    {
      firstName: 'Sadia', lastName: 'Islam', passportNo: 'B99887766', passportExpiresOn: '2033-06-01',
      email: 'sadia.islam@example.com', phone: '+880 1615 777888', dob: '2002-11-14', city: 'Dhaka',
      counselor: 'farhana', preferredCountries: ['AU'], status: 'COUNSELING',
      academic: [{ level: 'Bachelor', institution: 'University of Dhaka', subject: 'Statistics', result: 'CGPA 3.81', yearOfPassing: 2025 }],
      notes: [{ kind: 'NOTE', body: 'Enrolled at Melbourne for the July intake. Visa granted; flight booked for late July.', daysAgo: 40 }],
    },
    {
      firstName: 'Mahmud', lastName: 'Hasan', passportNo: 'C55667788', passportExpiresOn: '2032-02-28',
      email: 'mahmud.hasan@example.com', phone: '+880 1716 999000', dob: '2003-03-03', city: 'Dhaka',
      counselor: 'imran', preferredCountries: ['GB'], status: 'COUNSELING',
      academic: [{ level: 'Bachelor', institution: 'North South University', subject: 'Computer Science & Engineering', result: 'CGPA 3.45', yearOfPassing: 2025 }],
      notes: [{ kind: 'NOTE', body: 'Enrolled at Greenwich for September. Visa granted; first commission instalment falls due on enrollment.', daysAgo: 12 }],
    },
    {
      firstName: 'Rumana', lastName: 'Akter', passportNo: 'C10203040', passportExpiresOn: '2030-08-19',
      email: 'rumana.akter@example.com', phone: '+880 1817 444555', dob: '2005-07-22', city: 'Chattogram',
      counselor: 'shaila', agent: true, preferredCountries: ['MY'], status: 'COUNSELING',
      academic: [{ level: 'HSC', institution: 'Chittagong Cantonment Public College', subject: 'Science', result: 'GPA 4.50', yearOfPassing: 2024 }],
      notes: [{ kind: 'CALL', body: 'Visa refused — insufficient evidence of funds. Family will re-apply for January with updated bank statements.', nextFollowUpOn: '2026-10-10', daysAgo: 6 }],
    },
  ]

  const studentIds: Record<string, string> = {}
  let created = 0
  for (const s of STUDENTS) {
    let student = await prisma.student.findFirst({ where: { passportNo: s.passportNo } })
    if (!student) {
      const code = await allocateSeedNumber(prisma, 'STU', fiscalYear)
      const party = await prisma.party.create({
        data: { code, name: `${s.firstName} ${s.lastName}`, type: 'STUDENT', controlAccountCode: AR_STUDENTS, currency: 'BDT' },
      })
      const lastFollowUp = [...s.notes].reverse().find((n) => n.nextFollowUpOn)?.nextFollowUpOn
      student = await prisma.student.create({
        data: {
          partyId: party.id,
          firstName: s.firstName,
          lastName: s.lastName,
          dob: day(s.dob),
          gender: undefined,
          nationality: 'Bangladeshi',
          passportNo: s.passportNo,
          passportExpiresOn: day(s.passportExpiresOn),
          passportCountry: 'Bangladesh',
          email: s.email,
          phone: s.phone,
          city: s.city,
          country: 'Bangladesh',
          preferredCountries: s.preferredCountries,
          counselorId: counselors[s.counselor]!,
          agentId: s.agent ? agent.id : null,
          status: s.status,
          nextFollowUpOn: lastFollowUp ? day(lastFollowUp) : null,
          createdBy,
          academic: { create: s.academic },
          activities: {
            create: s.notes.map((n) => ({
              kind: n.kind,
              body: n.body,
              occurredAt: new Date(Date.now() - n.daysAgo * 86_400_000),
              nextFollowUpOn: n.nextFollowUpOn ? day(n.nextFollowUpOn) : null,
              createdBy,
            })),
          },
        },
      })
      created++
    }
    studentIds[s.passportNo] = student.id
  }

  // -- Applications ----------------------------------------------------------
  async function program(universityCode: string, programName: string) {
    const university = await prisma.university.findFirstOrThrow({ where: { party: { code: universityCode } } })
    const p = await prisma.program.findFirstOrThrow({ where: { universityId: university.id, name: programName } })
    return { university, program: p }
  }

  async function ensureApplication(input: {
    passportNo: string
    universityCode: string
    programName: string
    intake: string
    steps: { to: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'OFFER_RECEIVED' | 'DEPOSIT_PAID' | 'ENROLLED'; on: string; note?: string }[]
    fields?: Record<string, unknown>
  }) {
    const studentId = studentIds[input.passportNo]!
    const { university, program: p } = await program(input.universityCode, input.programName)
    const intakeId = intakes[input.intake]!

    const existing = await prisma.application.findFirst({ where: { studentId, programId: p.id, intakeId } })
    if (existing) return existing

    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { counselor: true } })
    const code = await allocateSeedNumber(prisma, 'APP', fiscalYear)
    const last = input.steps[input.steps.length - 1]!
    const submitted = input.steps.find((s) => s.to === 'SUBMITTED')

    return prisma.application.create({
      data: {
        code,
        studentId,
        universityId: university.id,
        programId: p.id,
        intakeId,
        counselorId: student.counselorId,
        branchId: student.counselor.branchId,
        appliedOn: submitted ? day(submitted.on) : null,
        status: last.to,
        applicationFee: '150.00',
        tuitionFee: p.tuitionFee,
        durationMonths: p.durationMonths,
        currency: p.currency,
        paidViaAgency: university.collectsTuitionViaAgency,
        createdBy,
        ...input.fields,
        history: {
          create: input.steps.map((step, i) => ({
            fromStatus: i === 0 ? null : input.steps[i - 1]!.to,
            toStatus: step.to,
            note: step.note ?? null,
            changedBy: createdBy,
            changedAt: day(step.on),
          })),
        },
      },
    })
  }

  // Nusrat: a draft to APU (a draft does not move the student off COUNSELING).
  await ensureApplication({
    passportNo: 'A07654321',
    universityCode: 'APU-MY',
    programName: 'Foundation in Computing',
    intake: '2027-2',
    steps: [{ to: 'DRAFT', on: '2026-09-18' }],
  })

  // Tanvir: offer in hand from Greenwich.
  const tanvir = await ensureApplication({
    passportNo: 'B11223344',
    universityCode: 'GREENWICH',
    programName: 'MSc Data Science',
    intake: '2027-2',
    steps: [
      { to: 'DRAFT', on: '2026-08-20' },
      { to: 'SUBMITTED', on: '2026-08-22' },
      { to: 'UNDER_REVIEW', on: '2026-08-29' },
      { to: 'OFFER_RECEIVED', on: '2026-09-15', note: 'Conditional on IELTS 6.5' },
    ],
    fields: { offerDate: day('2026-09-15'), offerConditions: 'IELTS 6.5 overall, no band below 6.0' },
  })
  await prisma.student.update({ where: { id: tanvir.studentId }, data: { status: 'OFFER_RECEIVED' } })

  // Sadia: enrolled at Melbourne, visa approved → 3 EXPECTED instalments.
  const sadia = await ensureApplication({
    passportNo: 'B99887766',
    universityCode: 'UNIMELB',
    programName: 'Master of Information Technology',
    intake: '2026-7',
    steps: [
      { to: 'DRAFT', on: '2026-03-02' },
      { to: 'SUBMITTED', on: '2026-03-05' },
      { to: 'UNDER_REVIEW', on: '2026-03-12' },
      { to: 'OFFER_RECEIVED', on: '2026-04-20' },
      { to: 'DEPOSIT_PAID', on: '2026-05-10' },
      { to: 'ENROLLED', on: '2026-07-15', note: '3 instalment(s) expected under "2026 Agent Agreement"' },
    ],
    fields: {
      offerDate: day('2026-04-20'),
      depositAmount: '5000.00',
      depositPaidOn: day('2026-05-10'),
      depositReference: 'UoM-DEP-88213',
      enrolledOn: day('2026-07-15'),
      visaStatus: 'APPROVED',
      visaAppliedOn: day('2026-05-20'),
      visaDecisionOn: day('2026-06-25'),
    },
  })

  /** The EXPECTED instalments an enrolment implies under the agreement in force. */
  async function ensureCommissions(app: Awaited<ReturnType<typeof ensureApplication>>) {
    if ((await prisma.commission.count({ where: { applicationId: app.id } })) > 0) return
    const agreement = await prisma.commissionAgreement.findFirstOrThrow({
      where: { universityId: app.universityId, isActive: true, effectiveFrom: { lte: app.enrolledOn! } },
      include: { lines: { orderBy: { seq: 'asc' } } },
    })
    const calc = calculateCommission({
      appliesTo: agreement.appliesTo,
      rateType: agreement.rateType,
      rate: agreement.rate.toString(),
      tuitionFee: app.tuitionFee.toFixed(2),
      durationMonths: app.durationMonths,
      lines: agreement.lines.map((l) => ({ seq: l.seq, label: l.label, percentOfTotal: l.percentOfTotal.toString(), id: l.id })),
    })
    await prisma.commission.createMany({
      data: calc.lines.map((line) => ({
        applicationId: app.id,
        agreementId: agreement.id,
        scheduleLineId: line.scheduleLineId ?? null,
        instalmentSeq: line.seq,
        instalmentLabel: line.label,
        baseAmount: calc.baseAmount,
        rateType: agreement.rateType,
        rate: agreement.rate,
        expectedAmount: line.expectedAmount,
        netAmount: line.expectedAmount,
        currency: agreement.currency,
        createdBy,
      })),
    })
  }
  await ensureCommissions(sadia)
  await prisma.student.update({ where: { id: sadia.studentId }, data: { status: 'VISA_APPROVED' } })

  // Mahmud: enrolled at Greenwich (GBP) → 2 EXPECTED instalments, which the
  // demo seed (prisma/seed/demo.ts) drives through claim, receipt and payout.
  const mahmud = await ensureApplication({
    passportNo: 'C55667788',
    universityCode: 'GREENWICH',
    programName: 'MSc Data Science',
    intake: '2026-9',
    steps: [
      { to: 'DRAFT', on: '2026-06-01' },
      { to: 'SUBMITTED', on: '2026-06-03' },
      { to: 'UNDER_REVIEW', on: '2026-06-10' },
      { to: 'OFFER_RECEIVED', on: '2026-07-02' },
      { to: 'DEPOSIT_PAID', on: '2026-07-20' },
      { to: 'ENROLLED', on: '2026-09-10', note: '2 instalment(s) expected under "Representative Agreement 2026/27"' },
    ],
    fields: {
      offerDate: day('2026-07-02'),
      depositAmount: '3000.00',
      depositPaidOn: day('2026-07-20'),
      depositReference: 'GRE-DEP-20441',
      enrolledOn: day('2026-09-10'),
      visaStatus: 'APPROVED',
      visaAppliedOn: day('2026-07-28'),
      visaDecisionOn: day('2026-08-21'),
    },
  })
  await ensureCommissions(mahmud)
  await prisma.student.update({ where: { id: mahmud.studentId }, data: { status: 'VISA_APPROVED' } })

  // Rumana: deposit paid at APU, then the visa was refused.
  const rumana = await ensureApplication({
    passportNo: 'C10203040',
    universityCode: 'APU-MY',
    programName: 'BSc (Hons) Software Engineering',
    intake: '2026-9',
    steps: [
      { to: 'DRAFT', on: '2026-05-12' },
      { to: 'SUBMITTED', on: '2026-05-14' },
      { to: 'UNDER_REVIEW', on: '2026-05-20' },
      { to: 'OFFER_RECEIVED', on: '2026-06-08' },
      { to: 'DEPOSIT_PAID', on: '2026-06-25' },
    ],
    fields: {
      offerDate: day('2026-06-08'),
      depositAmount: '1000.00',
      depositPaidOn: day('2026-06-25'),
      depositReference: 'APU-DEP-7731',
      visaStatus: 'REFUSED',
      visaAppliedOn: day('2026-07-15'),
      visaDecisionOn: day('2026-09-05'),
    },
  })
  await prisma.student.update({ where: { id: rumana.studentId }, data: { status: 'DEPOSIT_PAID' } })

  console.log(`  students        ${STUDENTS.length} (${created} new) · 5 applications · ${Object.keys(counselors).length} counselors · 4 intakes`)
}
