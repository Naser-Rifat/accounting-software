import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { createAgreement } from '@/server/services/agreement-service'
import {
  createApplication,
  getApplication,
  markArrived,
  transitionApplication,
  updateVisa,
} from '@/server/services/application-service'
import { removeDocument, storeDocument } from '@/server/services/document-service'
import { createProgram } from '@/server/services/program-service'
import {
  createBranch,
  createCounselor,
  intakeName,
  setBranchActive,
  setCounselorActive,
} from '@/server/services/team-service'
import {
  createStudent,
  getStudent,
  listStudents,
  setStudentActive,
  setStudentStatus,
} from '@/server/services/student-service'
import { createUniversity } from '@/server/services/university-service'

/**
 * Students and the pipeline end to end — docs/modules/01 and 03.
 *
 * The structural assertions: a student is a Party on 1110, an application
 * snapshots what it was priced on, only the documented transitions are legal,
 * ENROLLED creates the expected commission exactly as the agreement says, and
 * the student's status follows all of it.
 */

const AUTHOR = 'test'
const STAMP = Date.now()

let branchId: string
let counselorId: string
let studentId: string
let partyId: string
let universityId: string
let programId: string
let intakeId: string
let applicationId: string
let uploadDir: string

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

beforeAll(async () => {
  const costCenter = await prisma.costCenter.findFirstOrThrow({ where: { type: 'BRANCH' } })
  const branch = await createBranch({ code: `T${String(STAMP).slice(-8)}`, name: `Test Branch ${STAMP}`, costCenterId: costCenter.id })
  branchId = branch.id
  const counselor = await createCounselor({ name: `Test Counselor ${STAMP}`, commissionRate: '10', branchId })
  counselorId = counselor.id

  // An intake nobody else uses: year in the far future, month from the stamp.
  const year = 2100 + (STAMP % 300)
  const month = (STAMP % 12) + 1
  const intake = await prisma.intake.upsert({
    where: { year_month: { year, month } },
    create: { year, month, name: intakeName(month, year) },
    update: {},
  })
  intakeId = intake.id

  // Own university, program and PER_YEAR agreement — the overlap constraint is
  // per university, and the database is shared with the other test files.
  const university = await createUniversity({
    name: `Pipeline University ${STAMP}`,
    country: 'AU',
    currency: 'AUD',
    collectsTuitionViaAgency: false,
    createdBy: AUTHOR,
  })
  universityId = university.id
  const program = await createProgram({
    universityId,
    name: 'Master of Testing',
    level: 'MASTER',
    durationMonths: 24,
    tuitionFee: '46000.00',
    currency: 'AUD',
    intakeMonths: [2, 7],
    createdBy: AUTHOR,
  })
  programId = program.id
  await createAgreement({
    universityId,
    title: 'Test PER_YEAR',
    effectiveFrom: '2026-01-01',
    rateType: 'PERCENT',
    rate: '15',
    appliesTo: 'TOTAL_TUITION',
    eligibilityTrigger: 'ENROLLMENT',
    scheduleType: 'PER_YEAR',
    instalmentCount: 3,
    paymentTermsDays: 30,
    currency: 'AUD',
    createdBy: AUTHOR,
  })

  uploadDir = await mkdtemp(path.join(tmpdir(), 'acct-docs-'))
  process.env.UPLOAD_DIR = uploadDir
})

afterAll(async () => {
  await rm(uploadDir, { recursive: true, force: true })
  await prisma.$disconnect()
})

describe('a student is a party on 1110', () => {
  it('creates the Party and allocates a STU number', async () => {
    const created = await createStudent({
      firstName: 'Test',
      lastName: `Student ${STAMP}`,
      counselorId,
      preferredCountries: ['AU'],
      passportNo: `P${STAMP}`,
      passportExpiresOn: '2027-01-01',
      createdBy: AUTHOR,
    })
    studentId = created.id
    expect(created.code).toMatch(/^STU-2627-\d{5}$/)

    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { party: true } })
    partyId = student.partyId
    expect(student.party.type).toBe('STUDENT')
    expect(student.party.controlAccountCode).toBe(ACCOUNTS.AR_STUDENTS)
    expect(student.party.code).toBe(created.code)
    expect(student.status).toBe('LEAD')

    const row = (await listStudents({ counselorId })).find((s) => s.id === studentId)
    expect(row?.due).toBe('0.00')
  })

  it('refuses the derived statuses by hand, accepts counseling', async () => {
    await expectCode(setStudentStatus(studentId, 'ENROLLED' as never), 'VALIDATION')
    await setStudentStatus(studentId, 'COUNSELING')
    expect((await getStudent(studentId))?.status).toBe('COUNSELING')
  })
})

describe('applications', () => {
  it('snapshots tuition, duration, currency, routing and branch at creation', async () => {
    const created = await createApplication({ studentId, universityId, programId, intakeId, applicationFee: '150.00', createdBy: AUTHOR })
    applicationId = created.id
    expect(created.code).toMatch(/^APP-2627-\d{5}$/)

    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })
    expect(app.tuitionFee.toFixed(2)).toBe('46000.00')
    expect(app.durationMonths).toBe(24)
    expect(app.currency).toBe('AUD')
    expect(app.paidViaAgency).toBe(false)
    expect(app.branchId).toBe(branchId)
    expect(app.counselorId).toBe(counselorId)
    expect(app.status).toBe('DRAFT')

    // A draft does not move the student out of counseling.
    expect((await getStudent(studentId))?.status).toBe('COUNSELING')
  })

  it('rejects an illegal jump', async () => {
    await expectCode(
      transitionApplication({ applicationId, to: 'ENROLLED', data: { enrolledOn: '2026-07-15' }, changedBy: AUTHOR }),
      'ILLEGAL_TRANSITION',
    )
  })

  it('walks the path and the student follows', async () => {
    await transitionApplication({ applicationId, to: 'SUBMITTED', data: { appliedOn: '2026-03-01' }, changedBy: AUTHOR })
    expect((await getStudent(studentId))?.status).toBe('APPLIED')

    await transitionApplication({ applicationId, to: 'UNDER_REVIEW', changedBy: AUTHOR })
    await expectCode(transitionApplication({ applicationId, to: 'OFFER_RECEIVED', changedBy: AUTHOR }), 'VALIDATION')
    await transitionApplication({ applicationId, to: 'OFFER_RECEIVED', data: { offerDate: '2026-04-20', offerConditions: 'IELTS 6.5' }, changedBy: AUTHOR })
    expect((await getStudent(studentId))?.status).toBe('OFFER_RECEIVED')

    await transitionApplication({ applicationId, to: 'DEPOSIT_PAID', data: { depositAmount: '5000.00', depositPaidOn: '2026-05-10' }, changedBy: AUTHOR })
    expect((await getStudent(studentId))?.status).toBe('DEPOSIT_PAID')
  })

  it('ENROLLED creates one EXPECTED commission per schedule line, priced from the agreement', async () => {
    const result = await transitionApplication({ applicationId, to: 'ENROLLED', data: { enrolledOn: '2026-07-15' }, changedBy: AUTHOR })
    expect(result.commissionsCreated).toBe(3)
    expect(result.studentStatus).toBe('ENROLLED')

    const app = await getApplication(applicationId)
    expect(app?.commissions).toHaveLength(3)
    expect(app?.commissions.every((c) => c.status === 'EXPECTED')).toBe(true)
    expect(app?.commissions.map((c) => c.expectedAmount)).toEqual(['4600.00', '4600.00', '4600.00'])
    expect(app?.commissions[0]?.rate).toBe('15')
    expect(app?.commissions[0]?.baseAmount).toBe('92000.00')
    expect(app?.expectedCommission).toBe('13800.00')

    const rows = await prisma.commission.findMany({ where: { applicationId } })
    expect(new Set(rows.map((r) => r.agreementId)).size).toBe(1)
    expect(rows.every((r) => r.scheduleLineId !== null)).toBe(true)
    expect(rows.every((r) => r.journalEntryId === null)).toBe(true) // a forecast never posts
  })

  it('refuses a second enrollment for the same intake', async () => {
    const second = await createApplication({ studentId, universityId, programId, intakeId, applicationFee: '0', createdBy: AUTHOR })
    await transitionApplication({ applicationId: second.id, to: 'SUBMITTED', changedBy: AUTHOR })
    await transitionApplication({ applicationId: second.id, to: 'UNDER_REVIEW', changedBy: AUTHOR })
    await transitionApplication({ applicationId: second.id, to: 'OFFER_RECEIVED', data: { offerDate: '2026-05-01' }, changedBy: AUTHOR })
    await transitionApplication({ applicationId: second.id, to: 'DEPOSIT_PAID', data: { depositAmount: '1.00', depositPaidOn: '2026-05-02' }, changedBy: AUTHOR })
    await expectCode(
      transitionApplication({ applicationId: second.id, to: 'ENROLLED', data: { enrolledOn: '2026-07-20' }, changedBy: AUTHOR }),
      'VALIDATION',
    )
    await transitionApplication({ applicationId: second.id, to: 'WITHDRAWN', data: { reason: 'duplicate' }, changedBy: AUTHOR })
    expect((await prisma.commission.count({ where: { applicationId: second.id } }))).toBe(0)
  })

  it('refuses dropping a student with a live application', async () => {
    await expectCode(setStudentStatus(studentId, 'DROPPED'), 'VALIDATION')
  })

  it('visa moves forward only, then arrival', async () => {
    // A refusal needs an application to refuse; nothing goes backwards.
    await expectCode(updateVisa({ applicationId, visaStatus: 'REFUSED', visaDecisionOn: '2026-06-25' }), 'ILLEGAL_TRANSITION')
    await updateVisa({ applicationId, visaStatus: 'APPLIED', visaAppliedOn: '2026-05-20' })
    await expectCode(updateVisa({ applicationId, visaStatus: 'DOCUMENTS_PREPARED' }), 'ILLEGAL_TRANSITION')
    await expectCode(markArrived({ applicationId, arrivedOn: '2026-07-25' }), 'VALIDATION')

    const approved = await updateVisa({ applicationId, visaStatus: 'APPROVED', visaDecisionOn: '2026-06-25' })
    expect(approved.studentStatus).toBe('VISA_APPROVED')
    await expectCode(updateVisa({ applicationId, visaStatus: 'INTERVIEW' }), 'ILLEGAL_TRANSITION') // decided

    const arrived = await markArrived({ applicationId, arrivedOn: '2026-07-25' })
    expect(arrived.studentStatus).toBe('ARRIVED')
  })

  it('withdrawing after enrollment cancels the expected commission and returns the student to counseling', async () => {
    await transitionApplication({ applicationId, to: 'WITHDRAWN', data: { reason: 'family reasons' }, changedBy: AUTHOR })
    const rows = await prisma.commission.findMany({ where: { applicationId } })
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.status === 'CANCELLED')).toBe(true)
    expect((await getApplication(applicationId))?.expectedCommission).toBe('0.00')
    expect((await getStudent(studentId))?.status).toBe('COUNSELING')

    const history = await prisma.applicationStatusHistory.findMany({ where: { applicationId }, orderBy: { changedAt: 'asc' } })
    expect(history.map((h) => h.toStatus)).toEqual(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED', 'WITHDRAWN'])
  })
})

describe('documents', () => {
  const pdf = () => new File([new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')], 'passport scan.pdf', { type: 'application/pdf' })

  it('stores a real PDF under the upload root and records what it sniffed', async () => {
    const doc = await storeDocument({ file: pdf(), type: 'PASSPORT', studentId, expiresOn: '2027-01-01', uploadedBy: AUTHOR })
    expect(doc.mimeType).toBe('application/pdf')
    expect(doc.fileName).toBe('passport scan.pdf')

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(row.storageKey).toMatch(/^\d{4}\/\d{2}\/[a-f0-9]{32}\.pdf$/)
    const abs = path.join(uploadDir, ...row.storageKey.split('/'))
    expect((await readFile(abs, 'utf8')).startsWith('%PDF-')).toBe(true)

    expect((await getStudent(studentId))?.documents.some((d) => d.id === doc.id)).toBe(true)

    await removeDocument(doc.id)
    await expect(stat(abs)).rejects.toThrow()
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull()
  })

  it('rejects a renamed executable, an empty file and an unknown owner', async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], 'transcript.pdf', { type: 'application/pdf' })
    await expectCode(storeDocument({ file: exe, type: 'ACADEMIC_TRANSCRIPT', studentId, uploadedBy: AUTHOR }), 'INVALID_DOCUMENT')
    await expectCode(storeDocument({ file: new File([], 'empty.pdf'), type: 'OTHER', studentId, uploadedBy: AUTHOR }), 'INVALID_DOCUMENT')
    await expectCode(storeDocument({ file: pdf(), type: 'OTHER', studentId: 'nope', uploadedBy: AUTHOR }), 'NOT_FOUND')
    expect(await prisma.document.count({ where: { studentId } })).toBe(0)
  })
})

describe('ledger', () => {
  it('none of this touched the journal', async () => {
    expect(await prisma.journalLine.count({ where: { partyId } })).toBe(0)
  })
})

describe('deactivation', () => {
  it('keeps history and flips the Party; the test rows leave the default lists', async () => {
    const before = await getStudent(studentId)
    const result = await setStudentActive(studentId, false)
    expect(result.isActive).toBe(false)

    const after = await getStudent(studentId)
    expect(after?.applications).toHaveLength(before?.applications.length ?? -1)
    expect((await prisma.party.findUniqueOrThrow({ where: { id: partyId } })).isActive).toBe(false)
    expect((await listStudents()).some((s) => s.id === studentId)).toBe(false)

    // Shared database: retire this run's master data so the setup screens stay readable.
    await setCounselorActive(counselorId, false)
    await setBranchActive(branchId, false)
  })
})
