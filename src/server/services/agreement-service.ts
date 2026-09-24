import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { generateScheduleLines, validateScheduleLines } from '@/lib/commission/schedule'
import type { CommissionAgreementInput } from '@/lib/validation/agreement'
import { AccountingError } from '@/server/accounting/errors'
import { prisma, type PrismaTransaction } from '@/server/db/client'

/**
 * Commission agreements — docs/modules/02-universities.md §Commission agreement.
 *
 * An agreement is the contract a commission was priced from, and the
 * Commission row stores its id (rule 1). So terms are never edited: an
 * agreement can only be ended early or deactivated, and a new one raised.
 *
 * Two invariants from docs/01-domain-model.md: active agreements of one
 * university never overlap in time (6), and schedule lines sum to 100% (9).
 * Both are checked here; the overlap is also an EXCLUDE constraint in the DB.
 */

const OVERLAP_CONSTRAINT = 'CommissionAgreement_no_overlap'

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const fromDay = (s: string) => new Date(`${s}T00:00:00.000Z`)
const today = () => toDay(new Date())

function inForce(a: { isActive: boolean; effectiveFrom: Date; effectiveTo: Date | null }, on = today()) {
  return a.isActive && toDay(a.effectiveFrom) <= on && (a.effectiveTo === null || toDay(a.effectiveTo) >= on)
}

/** The Postgres exclusion constraint fired — the belt to the service's braces. */
function isOverlapViolation(error: unknown) {
  return error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT)
}

/**
 * Refuse a range that touches an active agreement of the same university.
 * Runs after the university row is locked, so two concurrent inserts serialise.
 */
async function assertNoOverlap(
  tx: PrismaTransaction,
  universityId: string,
  from: Date,
  to: Date | null,
  excludeId?: string,
) {
  const clash = await tx.commissionAgreement.findFirst({
    where: {
      universityId,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(to ? { effectiveFrom: { lte: to } } : {}),
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
    orderBy: { effectiveFrom: 'asc' },
  })
  if (clash) {
    const until = clash.effectiveTo ? toDay(clash.effectiveTo) : 'open-ended'
    throw new AccountingError(
      'AGREEMENT_OVERLAP',
      `Overlaps "${clash.title}" (${toDay(clash.effectiveFrom)} → ${until}). End that agreement first, or start this one after it.`,
      { agreementId: clash.id },
    )
  }
}

async function lockUniversity(tx: PrismaTransaction, universityId: string) {
  const rows = await tx.$queryRaw<{ id: string; name: string; isActive: boolean }[]>`
    SELECT "id", "name", "isActive" FROM "University" WHERE "id" = ${universityId} FOR UPDATE
  `
  const university = rows[0]
  if (!university) throw new AccountingError('NOT_FOUND', 'University not found.')
  return university
}

type AgreementRow = Prisma.CommissionAgreementGetPayload<{
  include: { lines: true; university: { select: { name: true; party: { select: { code: true } } } } }
}>

function toDto(a: AgreementRow) {
  return {
    id: a.id,
    universityId: a.universityId,
    universityName: a.university.name,
    universityCode: a.university.party.code,
    title: a.title,
    reference: a.reference,
    effectiveFrom: toDay(a.effectiveFrom),
    effectiveTo: a.effectiveTo ? toDay(a.effectiveTo) : null,
    rateType: a.rateType,
    rate: a.rate.toString(),
    appliesTo: a.appliesTo,
    eligibilityTrigger: a.eligibilityTrigger,
    scheduleType: a.scheduleType,
    paymentTermsDays: a.paymentTermsDays,
    currency: a.currency,
    contractUrl: a.contractUrl,
    notes: a.notes,
    isActive: a.isActive,
    inForce: inForce(a),
    lines: [...a.lines]
      .sort((x, y) => x.seq - y.seq)
      .map((l) => ({
        id: l.id,
        seq: l.seq,
        label: l.label,
        percentOfTotal: l.percentOfTotal.toFixed(4),
        triggerEvent: l.triggerEvent,
        offsetDays: l.offsetDays,
      })),
  }
}

export type AgreementDTO = ReturnType<typeof toDto>

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** By default only active agreements of active universities; history on request. */
export async function listAgreements(filter: { universityId?: string; includeInactive?: boolean } = {}) {
  const rows = await prisma.commissionAgreement.findMany({
    where: {
      ...(filter.includeInactive ? {} : { isActive: true, university: { isActive: true } }),
      ...(filter.universityId ? { universityId: filter.universityId } : {}),
    },
    orderBy: [{ university: { name: 'asc' } }, { effectiveFrom: 'desc' }],
    include: { lines: true, university: { select: { name: true, party: { select: { code: true } } } } },
  })
  return rows.map(toDto)
}

export async function getAgreement(id: string) {
  const row = await prisma.commissionAgreement.findUnique({
    where: { id },
    include: { lines: true, university: { select: { name: true, party: { select: { code: true } } } } },
  })
  return row ? toDto(row) : null
}

/**
 * The agreement a commission is priced from: the active one covering `onDate`
 * (docs/modules/02 rule 1). Pass the transaction when the caller is inside one,
 * so the read shares its snapshot.
 */
export async function findAgreementInForce(
  universityId: string,
  onDate: Date,
  db: PrismaTransaction = prisma,
) {
  const row = await db.commissionAgreement.findFirst({
    where: {
      universityId,
      isActive: true,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { lines: true, university: { select: { name: true, party: { select: { code: true } } } } },
  })
  return row ? toDto(row) : null
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createAgreement(input: CommissionAgreementInput & { createdBy: string }) {
  const lines = generateScheduleLines({
    scheduleType: input.scheduleType,
    eligibilityTrigger: input.eligibilityTrigger,
    instalmentCount: input.instalmentCount,
    lines: input.lines,
  })
  const problem = validateScheduleLines(lines)
  if (problem) throw new AccountingError('INVALID_SCHEDULE', problem)

  const from = fromDay(input.effectiveFrom)
  const to = input.effectiveTo ? fromDay(input.effectiveTo) : null

  try {
    return await prisma.$transaction(async (tx) => {
      const university = await lockUniversity(tx, input.universityId)
      if (!university.isActive) {
        throw new AccountingError('VALIDATION', `${university.name} is inactive — reactivate it first.`)
      }
      await assertNoOverlap(tx, input.universityId, from, to)

      const created = await tx.commissionAgreement.create({
        data: {
          universityId: input.universityId,
          title: input.title,
          reference: input.reference,
          effectiveFrom: from,
          effectiveTo: to,
          rateType: input.rateType,
          rate: input.rate,
          appliesTo: input.appliesTo,
          eligibilityTrigger: input.eligibilityTrigger,
          scheduleType: input.scheduleType,
          paymentTermsDays: input.paymentTermsDays,
          currency: input.currency,
          contractUrl: input.contractUrl,
          notes: input.notes,
          createdBy: input.createdBy,
          lines: {
            create: lines.map((l) => ({
              seq: l.seq,
              label: l.label,
              percentOfTotal: l.percentOfTotal,
              triggerEvent: l.triggerEvent,
              offsetDays: l.offsetDays,
            })),
          },
        },
      })
      return { id: created.id, title: created.title, lineCount: lines.length }
    })
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw new AccountingError('AGREEMENT_OVERLAP', 'Overlaps another active agreement of this university.')
    }
    throw error
  }
}

/**
 * Close an agreement's range. Only ever shrinks it — extending could create
 * an overlap, and a longer agreement is a new agreement.
 */
export async function endAgreement(agreementId: string, effectiveTo: string) {
  const to = fromDay(effectiveTo)
  const existing = await prisma.commissionAgreement.findUnique({ where: { id: agreementId } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Agreement not found.')

  if (to < existing.effectiveFrom) {
    throw new AccountingError('VALIDATION', `End date cannot be before the start (${toDay(existing.effectiveFrom)}).`)
  }
  if (existing.effectiveTo && to > existing.effectiveTo) {
    throw new AccountingError(
      'VALIDATION',
      `This agreement already ends on ${toDay(existing.effectiveTo)}; an end date can only be brought forward.`,
    )
  }

  return prisma.commissionAgreement.update({
    where: { id: agreementId },
    data: { effectiveTo: to },
  })
}

export async function setAgreementActive(agreementId: string, isActive: boolean) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.commissionAgreement.findUnique({ where: { id: agreementId } })
      if (!existing) throw new AccountingError('NOT_FOUND', 'Agreement not found.')

      if (isActive) {
        await lockUniversity(tx, existing.universityId)
        await assertNoOverlap(tx, existing.universityId, existing.effectiveFrom, existing.effectiveTo, existing.id)
      }
      return tx.commissionAgreement.update({ where: { id: agreementId }, data: { isActive } })
    })
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw new AccountingError('AGREEMENT_OVERLAP', 'Overlaps another active agreement of this university.')
    }
    throw error
  }
}
