import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { ApplicationStatus, VisaStatus } from '@/generated/prisma/enums'
import { calculateCommission } from '@/lib/commission/calculate'
import {
  APPLICATION_TRANSITIONS,
  canAdvanceVisa,
  canTransition,
  TERMINAL_APPLICATION_STATUSES,
} from '@/lib/students/status'
import type { ApplicationInput } from '@/lib/validation/application'
import { AccountingError } from '@/server/accounting/errors'
import { allocateNumber, fiscalYearFor } from '@/server/accounting/numbering'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { findAgreementInForce } from '@/server/services/agreement-service'
import { recordAudit } from '@/server/services/audit-service'
import { syncStudentStatus } from '@/server/services/student-service'

/**
 * Applications — docs/modules/03-applications.md.
 *
 * The unit of work: one student, one program, one intake. Every commission
 * originates here: reaching ENROLLED creates one Commission per schedule line
 * of the agreement in force, at EXPECTED — a forecast that never posts.
 * Recognising the revenue (APPROVED) is the commission module's job.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const fromDay = (s: string) => new Date(`${s}T00:00:00.000Z`)
const today = () => fromDay(toDay(new Date()))

const LIST_INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true, party: { select: { code: true } } } },
  university: { select: { id: true, name: true } },
  program: { select: { id: true, name: true, level: true } },
  intake: { select: { id: true, name: true } },
  counselor: { select: { id: true, name: true } },
  branch: { select: { code: true, name: true } },
  commissions: { select: { expectedAmount: true, currency: true, status: true } },
} satisfies Prisma.ApplicationInclude

function summarise(a: Prisma.ApplicationGetPayload<{ include: typeof LIST_INCLUDE }>) {
  const live = a.commissions.filter((c) => c.status !== 'CANCELLED')
  return {
    id: a.id,
    code: a.code,
    studentId: a.student.id,
    studentCode: a.student.party.code,
    student: `${a.student.firstName} ${a.student.lastName}`,
    universityId: a.university.id,
    university: a.university.name,
    programId: a.program.id,
    program: a.program.name,
    level: a.program.level,
    intakeId: a.intake.id,
    intake: a.intake.name,
    counselorId: a.counselor.id,
    counselor: a.counselor.name,
    branch: a.branch.name,
    appliedOn: a.appliedOn ? toDay(a.appliedOn) : null,
    status: a.status,
    visaStatus: a.visaStatus,
    tuitionFee: a.tuitionFee.toFixed(2),
    durationMonths: a.durationMonths,
    currency: a.currency,
    paidViaAgency: a.paidViaAgency,
    expectedCommission: live.reduce((s, c) => s + Number(c.expectedAmount), 0).toFixed(2),
    commissionCurrency: live[0]?.currency ?? null,
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type ApplicationFilter = {
  status?: ApplicationStatus
  universityId?: string
  intakeId?: string
  counselorId?: string
  studentId?: string
}

export async function listApplications(filter: ApplicationFilter = {}) {
  const rows = await prisma.application.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.universityId ? { universityId: filter.universityId } : {}),
      ...(filter.intakeId ? { intakeId: filter.intakeId } : {}),
      ...(filter.counselorId ? { counselorId: filter.counselorId } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: LIST_INCLUDE,
  })
  return rows.map(summarise)
}

export async function getApplication(id: string) {
  const a = await prisma.application.findUnique({
    where: { id },
    include: {
      ...LIST_INCLUDE,
      history: { orderBy: { changedAt: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      commissions: {
        orderBy: { instalmentSeq: 'asc' },
        include: { agreement: { select: { title: true } } },
      },
    },
  })
  if (!a) return null

  return {
    ...summarise(a),
    applicationFee: a.applicationFee.toFixed(2),
    offerDate: a.offerDate ? toDay(a.offerDate) : null,
    offerConditions: a.offerConditions,
    depositAmount: a.depositAmount?.toFixed(2) ?? null,
    depositPaidOn: a.depositPaidOn ? toDay(a.depositPaidOn) : null,
    depositReference: a.depositReference,
    enrolledOn: a.enrolledOn ? toDay(a.enrolledOn) : null,
    visaAppliedOn: a.visaAppliedOn ? toDay(a.visaAppliedOn) : null,
    visaDecisionOn: a.visaDecisionOn ? toDay(a.visaDecisionOn) : null,
    arrivedOn: a.arrivedOn ? toDay(a.arrivedOn) : null,
    outcomeReason: a.outcomeReason,
    createdBy: a.createdBy,
    createdAt: toDay(a.createdAt),
    nextStatuses: APPLICATION_TRANSITIONS[a.status],
    isTerminal: TERMINAL_APPLICATION_STATUSES.has(a.status),
    history: a.history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      changedBy: h.changedBy,
      changedAt: h.changedAt.toISOString(),
    })),
    documents: a.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      verified: d.verified,
      uploadedAt: toDay(d.uploadedAt),
      url: `/api/documents/${d.id}`,
    })),
    commissions: a.commissions.map((c) => ({
      id: c.id,
      instalmentSeq: c.instalmentSeq,
      instalmentLabel: c.instalmentLabel,
      agreement: c.agreement.title,
      baseAmount: c.baseAmount.toFixed(2),
      rateType: c.rateType,
      rate: c.rate.toString(),
      expectedAmount: c.expectedAmount.toFixed(2),
      netAmount: c.netAmount.toFixed(2),
      currency: c.currency,
      status: c.status,
    })),
  }
}

export type ApplicationDetail = NonNullable<Awaited<ReturnType<typeof getApplication>>>

/** Everything the new-application form needs to cascade its selects. */
export async function applicationFormOptions() {
  const [students, universities, intakes] = await Promise.all([
    prisma.student.findMany({
      where: { isActive: true, status: { not: 'DROPPED' } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, party: { select: { code: true } } },
    }),
    prisma.university.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        collectsTuitionViaAgency: true,
        programs: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, level: true, tuitionFee: true, currency: true, durationMonths: true },
        },
      },
    }),
    prisma.intake.findMany({ where: { isActive: true }, orderBy: [{ year: 'asc' }, { month: 'asc' }] }),
  ])
  return {
    students: students.map((s) => ({ id: s.id, code: s.party.code, name: `${s.firstName} ${s.lastName}` })),
    universities: universities.map((u) => ({
      id: u.id,
      name: u.name,
      collectsTuitionViaAgency: u.collectsTuitionViaAgency,
      programs: u.programs.map((p) => ({
        id: p.id,
        name: p.name,
        level: p.level,
        tuitionFee: p.tuitionFee.toFixed(2),
        currency: p.currency,
        durationMonths: p.durationMonths,
      })),
    })),
    intakes: intakes.map((i) => ({ id: i.id, name: i.name })),
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createApplication(input: ApplicationInput & { createdBy: string }) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      include: { counselor: { select: { id: true, branchId: true, isActive: true } } },
    })
    if (!student || !student.isActive) throw new AccountingError('VALIDATION', 'Choose an active student.')
    if (student.status === 'DROPPED') {
      throw new AccountingError('VALIDATION', 'This student was dropped — set them back to counseling first.')
    }

    const program = await tx.program.findUnique({
      where: { id: input.programId },
      include: { university: { select: { id: true, isActive: true, collectsTuitionViaAgency: true } } },
    })
    if (!program || !program.isActive || program.universityId !== input.universityId) {
      throw new AccountingError('VALIDATION', 'Choose an active program of that university.')
    }
    if (!program.university.isActive) throw new AccountingError('VALIDATION', 'That university is inactive.')

    const intake = await tx.intake.findUnique({ where: { id: input.intakeId } })
    if (!intake || !intake.isActive) throw new AccountingError('VALIDATION', 'Choose an active intake.')

    const fy = await fiscalYearFor(tx, new Date())
    const number = await allocateNumber(tx, 'APP', fy.id, fy.code)

    const application = await tx.application.create({
      data: {
        code: number.formatted,
        studentId: student.id,
        universityId: program.universityId,
        programId: program.id,
        intakeId: intake.id,
        counselorId: student.counselor.id,
        branchId: student.counselor.branchId,
        applicationFee: input.applicationFee,
        // Snapshots — the commission base never moves when the program is edited.
        tuitionFee: program.tuitionFee,
        durationMonths: program.durationMonths,
        currency: program.currency,
        paidViaAgency: program.university.collectsTuitionViaAgency,
        createdBy: input.createdBy,
        history: { create: { toStatus: 'DRAFT', changedBy: input.createdBy } },
      },
    })
    return { id: application.id, code: application.code }
  })
}

export type TransitionData = {
  appliedOn?: string
  offerDate?: string
  offerConditions?: string
  depositAmount?: string
  depositPaidOn?: string
  depositReference?: string
  enrolledOn?: string
  reason?: string
}

async function lockApplication(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id" = ${id} FOR UPDATE`
  const application = await tx.application.findUnique({
    where: { id },
    include: { commissions: { select: { id: true, status: true } } },
  })
  if (!application) throw new AccountingError('NOT_FOUND', 'Application not found.')
  return application
}

/**
 * Move an application one step. Every status change is one transaction:
 * the legality check, the fields that step needs, the history row, any
 * commission effect, and the student's derived status.
 */
export async function transitionApplication(input: {
  applicationId: string
  to: ApplicationStatus
  data?: TransitionData
  changedBy: string
}) {
  const { to, changedBy } = input
  const data = input.data ?? {}

  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, input.applicationId)

    if (!canTransition(app.status, to)) {
      throw new AccountingError(
        'ILLEGAL_TRANSITION',
        `${app.code} is ${app.status.toLowerCase().replaceAll('_', ' ')} and cannot move to ${to
          .toLowerCase()
          .replaceAll('_', ' ')}.`,
      )
    }

    const patch: Prisma.ApplicationUpdateInput = { status: to }
    let note: string | null = null
    let commissionsCreated = 0

    switch (to) {
      case 'SUBMITTED':
        patch.appliedOn = data.appliedOn ? fromDay(data.appliedOn) : (app.appliedOn ?? today())
        break
      case 'OFFER_RECEIVED':
        if (!data.offerDate) throw new AccountingError('VALIDATION', 'Enter the offer date.')
        patch.offerDate = fromDay(data.offerDate)
        patch.offerConditions = data.offerConditions ?? null
        break
      case 'DEPOSIT_PAID':
        if (!data.depositAmount || !data.depositPaidOn) {
          throw new AccountingError('VALIDATION', 'Enter the deposit amount and date.')
        }
        patch.depositAmount = data.depositAmount
        patch.depositPaidOn = fromDay(data.depositPaidOn)
        patch.depositReference = data.depositReference ?? null
        break
      case 'ENROLLED': {
        if (!data.enrolledOn) throw new AccountingError('VALIDATION', 'Enter the enrollment date.')
        const enrolledOn = fromDay(data.enrolledOn)
        patch.enrolledOn = enrolledOn

        // docs/03 rule 4: one enrollment per student per intake. The student
        // row is locked so two applications cannot both pass this check.
        await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${app.studentId} FOR UPDATE`
        const clash = await tx.application.findFirst({
          where: { studentId: app.studentId, intakeId: app.intakeId, status: 'ENROLLED', id: { not: app.id } },
          select: { code: true },
        })
        if (clash) {
          throw new AccountingError(
            'VALIDATION',
            `This student is already enrolled for this intake on ${clash.code}.`,
          )
        }

        // docs/03 rule 2: price from the agreement in force on the enrollment date.
        const agreement = await findAgreementInForce(app.universityId, enrolledOn, tx)
        if (!agreement) {
          throw new AccountingError(
            'NO_AGREEMENT_IN_FORCE',
            `No commission agreement is in force for this university on ${data.enrolledOn}. Add one under Universities first.`,
          )
        }
        if (agreement.rateType === 'PERCENT' && agreement.currency !== app.currency) {
          throw new AccountingError(
            'VALIDATION',
            `The agreement pays in ${agreement.currency} but tuition is in ${app.currency}; a percentage cannot be priced across currencies.`,
          )
        }

        const calc = calculateCommission({
          appliesTo: agreement.appliesTo,
          rateType: agreement.rateType,
          rate: agreement.rate,
          tuitionFee: app.tuitionFee.toFixed(2),
          durationMonths: app.durationMonths,
          lines: agreement.lines,
        })
        await tx.commission.createMany({
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
            createdBy: changedBy,
          })),
        })
        commissionsCreated = calc.lines.length
        note = `${calc.lines.length} instalment(s), ${agreement.currency} ${calc.totalAmount} expected under "${agreement.title}"`
        break
      }
      case 'REJECTED':
      case 'DECLINED':
      case 'WITHDRAWN': {
        if (!data.reason) throw new AccountingError('VALIDATION', 'Give a reason.')
        patch.outcomeReason = data.reason
        note = data.reason

        // docs/03 rule 3. Anything already recognised needs a reversal, which
        // is the commission module's job — refuse rather than silently skip.
        const recognised = app.commissions.filter(
          (c) => !['EXPECTED', 'ELIGIBLE', 'CANCELLED'].includes(c.status),
        )
        if (recognised.length > 0) {
          throw new AccountingError(
            'VALIDATION',
            `${recognised.length} commission(s) on ${app.code} are already approved or claimed — cancel them in Commission first.`,
          )
        }
        await tx.commission.updateMany({
          where: { applicationId: app.id, status: { in: ['EXPECTED', 'ELIGIBLE'] } },
          data: { status: 'CANCELLED' },
        })
        break
      }
      default:
        break
    }

    await tx.application.update({ where: { id: app.id }, data: patch })
    await tx.applicationStatusHistory.create({
      data: { applicationId: app.id, fromStatus: app.status, toStatus: to, note, changedBy },
    })
    await recordAudit(tx, {
      actor: { username: changedBy },
      action: 'APPLICATION_STATUS',
      entity: 'Application',
      entityId: app.id,
      before: { code: app.code, status: app.status },
      after: { code: app.code, status: to, note, commissionsCreated },
    })
    const studentStatus = await syncStudentStatus(tx, app.studentId)

    return { id: app.id, code: app.code, status: to, commissionsCreated, studentStatus }
  })
}

const VISA_ALLOWED_FROM: readonly ApplicationStatus[] = ['OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED']

export async function updateVisa(input: {
  applicationId: string
  visaStatus: VisaStatus
  visaAppliedOn?: string
  visaDecisionOn?: string
}) {
  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, input.applicationId)
    if (!VISA_ALLOWED_FROM.includes(app.status)) {
      throw new AccountingError('VALIDATION', 'Visa processing starts once an offer has been received.')
    }
    if (!canAdvanceVisa(app.visaStatus, input.visaStatus)) {
      throw new AccountingError(
        'ILLEGAL_TRANSITION',
        `Visa is ${app.visaStatus.toLowerCase().replaceAll('_', ' ')} and cannot move to ${input.visaStatus
          .toLowerCase()
          .replaceAll('_', ' ')}.`,
      )
    }
    await tx.application.update({
      where: { id: app.id },
      data: {
        visaStatus: input.visaStatus,
        ...(input.visaAppliedOn ? { visaAppliedOn: fromDay(input.visaAppliedOn) } : {}),
        ...(input.visaDecisionOn ? { visaDecisionOn: fromDay(input.visaDecisionOn) } : {}),
      },
    })
    const studentStatus = await syncStudentStatus(tx, app.studentId)
    return { id: app.id, code: app.code, visaStatus: input.visaStatus, studentStatus }
  })
}

export async function markArrived(input: { applicationId: string; arrivedOn: string }) {
  return prisma.$transaction(async (tx) => {
    const app = await lockApplication(tx, input.applicationId)
    if (app.status !== 'ENROLLED' || app.visaStatus !== 'APPROVED') {
      throw new AccountingError('VALIDATION', 'Arrival needs an enrolled student with an approved visa.')
    }
    await tx.application.update({ where: { id: app.id }, data: { arrivedOn: fromDay(input.arrivedOn) } })
    const studentStatus = await syncStudentStatus(tx, app.studentId)
    return { id: app.id, code: app.code, studentStatus }
  })
}
