import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { StudentStatus } from '@/generated/prisma/enums'
import {
  deriveStudentStatus,
  MANUAL_STUDENT_STATUSES,
  TERMINAL_APPLICATION_STATUSES,
} from '@/lib/students/status'
import type {
  AcademicRecordInput,
  StudentActivityInput,
  StudentInput,
} from '@/lib/validation/student'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { allocateNumber, fiscalYearFor } from '@/server/accounting/numbering'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'

/**
 * Students — docs/modules/01-students.md.
 *
 * Master data, so nothing here posts. A student is a Party on 1110 AR –
 * Students, created in the same transaction as the record, so fee invoices
 * (module 6) can carry a party and the control account reconciles. "Due" is
 * read from the ledger, never stored.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const fromDay = (s: string) => new Date(`${s}T00:00:00.000Z`)
const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`

/** 1110 balance per student party: debit − credit, because it is a receivable. */
const dueByParty = (partyIds: string[]) => controlBalances(ACCOUNTS.AR_STUDENTS, partyIds, 'DEBIT')

function profileData(input: StudentInput) {
  const { counselorId, agentId, preferredCountries, ...rest } = input
  return {
    ...rest,
    dob: rest.dob ? fromDay(rest.dob) : null,
    passportIssuedOn: rest.passportIssuedOn ? fromDay(rest.passportIssuedOn) : null,
    passportExpiresOn: rest.passportExpiresOn ? fromDay(rest.passportExpiresOn) : null,
    preferredCountries,
    counselorId,
    agentId: agentId ?? null,
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Recompute the derived status from the applications (docs/01 rule 1).
 * Called after every application change, inside that change's transaction.
 */
export async function syncStudentStatus(tx: PrismaTransaction, studentId: string) {
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: {
      status: true,
      applications: { select: { status: true, visaStatus: true, arrivedOn: true } },
    },
  })
  if (!student) throw new AccountingError('NOT_FOUND', 'Student not found.')

  const next = deriveStudentStatus(
    student.status,
    student.applications.map((a) => ({
      status: a.status,
      visaStatus: a.visaStatus,
      arrived: a.arrivedOn !== null,
    })),
  )
  if (next !== student.status) {
    await tx.student.update({ where: { id: studentId }, data: { status: next } })
  }
  return next
}

/** The three statuses set by hand. Everything else comes from the pipeline. */
export async function setStudentStatus(studentId: string, status: StudentStatus) {
  if (!MANUAL_STUDENT_STATUSES.includes(status)) {
    throw new AccountingError('VALIDATION', `${status} is derived from applications, not set by hand.`)
  }
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: { applications: { select: { status: true } } },
    })
    if (!student) throw new AccountingError('NOT_FOUND', 'Student not found.')

    const live = student.applications.filter((a) => !TERMINAL_APPLICATION_STATUSES.has(a.status))
    if (status === 'DROPPED' && live.length > 0) {
      throw new AccountingError(
        'VALIDATION',
        `${fullName(student)} still has ${live.length} open application(s) — withdraw them first.`,
      )
    }
    if (status !== 'DROPPED' && live.some((a) => a.status !== 'DRAFT')) {
      throw new AccountingError(
        'VALIDATION',
        `${fullName(student)}'s status follows their applications while any is in progress.`,
      )
    }
    return tx.student.update({ where: { id: studentId }, data: { status } })
  })
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type StudentFilter = {
  q?: string
  status?: StudentStatus
  counselorId?: string
  /** Destination country (preferredCountries), ISO-2. */
  country?: string
  includeInactive?: boolean
}

export async function listStudents(filter: StudentFilter = {}) {
  const where: Prisma.StudentWhereInput = {
    ...(filter.includeInactive ? {} : { isActive: true }),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.counselorId ? { counselorId: filter.counselorId } : {}),
    ...(filter.country ? { preferredCountries: { has: filter.country } } : {}),
    ...(filter.q
      ? {
          OR: [
            { firstName: { contains: filter.q, mode: 'insensitive' } },
            { lastName: { contains: filter.q, mode: 'insensitive' } },
            { email: { contains: filter.q, mode: 'insensitive' } },
            { passportNo: { contains: filter.q, mode: 'insensitive' } },
            { party: { code: { contains: filter.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      party: { select: { code: true } },
      counselor: { select: { name: true } },
      _count: { select: { applications: true } },
    },
  })
  const due = await dueByParty(students.map((s) => s.partyId))

  return students.map((s) => ({
    id: s.id,
    code: s.party.code,
    name: fullName(s),
    email: s.email,
    phone: s.phone,
    counselorId: s.counselorId,
    counselor: s.counselor.name,
    status: s.status,
    preferredCountries: s.preferredCountries,
    applications: s._count.applications,
    nextFollowUpOn: s.nextFollowUpOn ? toDay(s.nextFollowUpOn) : null,
    due: due.get(s.partyId) ?? '0.00',
    isActive: s.isActive,
  }))
}

export async function listStudentOptions() {
  const rows = await prisma.student.findMany({
    where: { isActive: true, status: { notIn: ['DROPPED'] } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, party: { select: { code: true } } },
  })
  return rows.map((s) => ({ id: s.id, code: s.party.code, name: fullName(s) }))
}

function passportWarning(
  expiresOn: Date | null,
  intakes: { month: number; year: number }[],
): string | null {
  if (!expiresOn) return null
  const sixMonths = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 6, d.getUTCDate()))
  const starts = intakes.map((i) => new Date(Date.UTC(i.year, i.month - 1, 1)))
  const anchors = starts.length ? starts : [new Date()]
  const latest = anchors.reduce((a, b) => (a > b ? a : b))
  if (expiresOn < new Date()) return `Passport expired on ${toDay(expiresOn)}.`
  if (expiresOn < sixMonths(latest)) {
    return `Passport expires ${toDay(expiresOn)} — within 6 months of ${
      starts.length ? 'the intake start' : 'today'
    }. Renew before applying for the visa.`
  }
  return null
}

export async function getStudent(id: string) {
  const s = await prisma.student.findUnique({
    where: { id },
    include: {
      party: { select: { code: true } },
      counselor: { select: { id: true, name: true, branch: { select: { name: true } } } },
      agent: { select: { id: true, name: true } },
      academic: { orderBy: { yearOfPassing: 'desc' } },
      activities: { orderBy: { occurredAt: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' }, include: { application: { select: { code: true } } } },
      applications: {
        orderBy: { createdAt: 'desc' },
        include: {
          university: { select: { name: true } },
          program: { select: { name: true, level: true } },
          intake: { select: { name: true, month: true, year: true } },
          history: { orderBy: { changedAt: 'desc' } },
          commissions: { where: { status: { not: 'CANCELLED' } }, select: { expectedAmount: true, currency: true } },
        },
      },
    },
  })
  if (!s) return null

  const due = await dueByParty([s.partyId])
  const liveIntakes = s.applications
    .filter((a) => !TERMINAL_APPLICATION_STATUSES.has(a.status))
    .map((a) => a.intake)

  type TimelineItem = {
    at: string
    kind: 'ACTIVITY' | 'STATUS' | 'DOCUMENT'
    title: string
    body: string | null
    by: string
    followUp?: string | null
  }
  const timeline: TimelineItem[] = [
    ...s.activities.map((a) => ({
      at: a.occurredAt.toISOString(),
      kind: 'ACTIVITY' as const,
      title: a.kind.toLowerCase(),
      body: a.body,
      by: a.createdBy,
      followUp: a.nextFollowUpOn ? toDay(a.nextFollowUpOn) : null,
    })),
    ...s.applications.flatMap((app) =>
      app.history.map((h) => ({
        at: h.changedAt.toISOString(),
        kind: 'STATUS' as const,
        title: `${app.code} → ${h.toStatus.toLowerCase().replaceAll('_', ' ')}`,
        body: h.note,
        by: h.changedBy,
      })),
    ),
    ...s.documents.map((d) => ({
      at: d.uploadedAt.toISOString(),
      kind: 'DOCUMENT' as const,
      title: `${d.type.toLowerCase().replaceAll('_', ' ')} uploaded`,
      body: d.fileName,
      by: d.uploadedBy,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  return {
    id: s.id,
    partyId: s.partyId,
    code: s.party.code,
    firstName: s.firstName,
    lastName: s.lastName,
    name: fullName(s),
    dob: s.dob ? toDay(s.dob) : null,
    gender: s.gender,
    nationality: s.nationality,
    passportNo: s.passportNo,
    passportIssuedOn: s.passportIssuedOn ? toDay(s.passportIssuedOn) : null,
    passportExpiresOn: s.passportExpiresOn ? toDay(s.passportExpiresOn) : null,
    passportCountry: s.passportCountry,
    passportWarning: passportWarning(s.passportExpiresOn, liveIntakes),
    email: s.email,
    phone: s.phone,
    whatsapp: s.whatsapp,
    address: s.address,
    city: s.city,
    country: s.country,
    emergencyContact: s.emergencyContact,
    preferredCountries: s.preferredCountries,
    preferredIntake: s.preferredIntake,
    counselorId: s.counselorId,
    counselor: s.counselor.name,
    branch: s.counselor.branch.name,
    agentId: s.agentId,
    agent: s.agent?.name ?? null,
    status: s.status,
    nextFollowUpOn: s.nextFollowUpOn ? toDay(s.nextFollowUpOn) : null,
    isActive: s.isActive,
    createdBy: s.createdBy,
    createdAt: toDay(s.createdAt),
    due: due.get(s.partyId) ?? '0.00',
    academic: s.academic.map((a) => ({
      id: a.id,
      level: a.level,
      institution: a.institution,
      subject: a.subject,
      result: a.result,
      yearOfPassing: a.yearOfPassing,
    })),
    applications: s.applications.map((a) => ({
      id: a.id,
      code: a.code,
      university: a.university.name,
      program: a.program.name,
      level: a.program.level,
      intake: a.intake.name,
      status: a.status,
      visaStatus: a.visaStatus,
      tuitionFee: a.tuitionFee.toFixed(2),
      currency: a.currency,
      expectedCommission: a.commissions.reduce((sum, c) => sum + Number(c.expectedAmount), 0).toFixed(2),
      commissionCurrency: a.commissions[0]?.currency ?? a.currency,
    })),
    documents: s.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      verified: d.verified,
      expiresOn: d.expiresOn ? toDay(d.expiresOn) : null,
      uploadedAt: toDay(d.uploadedAt),
      applicationCode: d.application?.code ?? null,
      url: `/api/documents/${d.id}`,
    })),
    timeline,
  }
}

export type StudentDetail = NonNullable<Awaited<ReturnType<typeof getStudent>>>

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createStudent(
  input: StudentInput & { createdBy: string; academic?: Omit<AcademicRecordInput, 'studentId'>[] },
) {
  const { createdBy, academic = [], ...profile } = input

  const counselor = await prisma.counselor.findUnique({ where: { id: profile.counselorId } })
  if (!counselor || !counselor.isActive) throw new AccountingError('VALIDATION', 'Choose an active counselor.')

  return prisma.$transaction(async (tx) => {
    const fy = await fiscalYearFor(tx, new Date())
    const number = await allocateNumber(tx, 'STU', fy.id, fy.code)

    const party = await tx.party.create({
      data: {
        code: number.formatted,
        name: fullName(profile),
        type: 'STUDENT',
        controlAccountCode: ACCOUNTS.AR_STUDENTS,
        currency: 'BDT',
      },
    })

    const student = await tx.student.create({
      data: {
        partyId: party.id,
        ...profileData(profile),
        createdBy,
        academic: { create: academic },
      },
    })
    return { id: student.id, code: number.formatted, name: fullName(student) }
  })
}

export async function updateStudent(input: StudentInput & { studentId: string }) {
  const { studentId, ...profile } = input
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({ where: { id: studentId } })
    if (!existing) throw new AccountingError('NOT_FOUND', 'Student not found.')

    const student = await tx.student.update({ where: { id: studentId }, data: profileData(profile) })
    await tx.party.update({ where: { id: existing.partyId }, data: { name: fullName(student) } })
    return { id: student.id, name: fullName(student) }
  })
}

/** Deactivate, never delete — a student with applications is history (rule 4). */
export async function setStudentActive(id: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.student.findUnique({ where: { id } })
    if (!existing) throw new AccountingError('NOT_FOUND', 'Student not found.')
    await tx.student.update({ where: { id }, data: { isActive } })
    await tx.party.update({ where: { id: existing.partyId }, data: { isActive } })
    return { id, name: fullName(existing), isActive }
  })
}

export async function addAcademicRecord(input: AcademicRecordInput) {
  const { studentId, ...fields } = input
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new AccountingError('NOT_FOUND', 'Student not found.')
  return prisma.academicRecord.create({ data: { studentId, ...fields } })
}

export async function removeAcademicRecord(id: string) {
  const existing = await prisma.academicRecord.findUnique({ where: { id } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Record not found.')
  return prisma.academicRecord.delete({ where: { id } })
}

/** A counseling note. The follow-up date, if given, becomes the student's next one. */
export async function addActivity(input: StudentActivityInput & { createdBy: string }) {
  const { studentId, nextFollowUpOn, createdBy, ...fields } = input
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId } })
    if (!student) throw new AccountingError('NOT_FOUND', 'Student not found.')

    const activity = await tx.studentActivity.create({
      data: {
        studentId,
        ...fields,
        nextFollowUpOn: nextFollowUpOn ? fromDay(nextFollowUpOn) : null,
        createdBy,
      },
    })
    if (nextFollowUpOn) {
      await tx.student.update({ where: { id: studentId }, data: { nextFollowUpOn: fromDay(nextFollowUpOn) } })
    }
    return activity
  })
}
