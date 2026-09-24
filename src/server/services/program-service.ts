import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { ProgramLevel } from '@/generated/prisma/enums'
import type { ProgramInput, UpdateProgramInput } from '@/lib/validation/program'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'

/**
 * Programs — docs/modules/02-universities.md §Programs.
 *
 * `tuitionFee` is only a default: the Application snapshots the fee it was
 * priced at, so changing a program here never touches historical commission.
 */

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export type ProgramFilter = {
  universityId?: string
  level?: ProgramLevel
  includeInactive?: boolean
}

/** By default only active programs of active universities; history on request. */
export async function listPrograms(filter: ProgramFilter = {}) {
  const programs = await prisma.program.findMany({
    where: {
      ...(filter.includeInactive ? {} : { isActive: true, university: { isActive: true } }),
      ...(filter.universityId ? { universityId: filter.universityId } : {}),
      ...(filter.level ? { level: filter.level } : {}),
    },
    orderBy: [{ university: { name: 'asc' } }, { level: 'asc' }, { name: 'asc' }],
    include: { university: { select: { name: true, party: { select: { code: true } } } } },
  })

  return programs.map((p) => ({
    id: p.id,
    universityId: p.universityId,
    universityName: p.university.name,
    universityCode: p.university.party.code,
    name: p.name,
    level: p.level,
    durationMonths: p.durationMonths,
    tuitionFee: p.tuitionFee.toFixed(2),
    currency: p.currency,
    intakeMonths: p.intakeMonths,
    isActive: p.isActive,
  }))
}

export async function getProgram(id: string) {
  const p = await prisma.program.findUnique({
    where: { id },
    include: { university: { select: { name: true, party: { select: { code: true } } } } },
  })
  if (!p) return null
  return {
    id: p.id,
    universityId: p.universityId,
    universityName: p.university.name,
    universityCode: p.university.party.code,
    name: p.name,
    level: p.level,
    durationMonths: p.durationMonths,
    tuitionFee: p.tuitionFee.toFixed(2),
    currency: p.currency,
    intakeMonths: p.intakeMonths,
    isActive: p.isActive,
  }
}

export async function createProgram(input: ProgramInput & { createdBy: string }) {
  const university = await prisma.university.findUnique({ where: { id: input.universityId } })
  if (!university) throw new AccountingError('NOT_FOUND', 'University not found.')
  if (!university.isActive) {
    throw new AccountingError('VALIDATION', `${university.name} is inactive — reactivate it first.`)
  }

  try {
    return await prisma.program.create({
      data: { ...input, level: input.level as ProgramLevel },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountingError(
        'VALIDATION',
        `${university.name} already has a ${input.level.toLowerCase()} program called "${input.name}".`,
      )
    }
    throw error
  }
}

export async function updateProgram(input: UpdateProgramInput) {
  const { programId, ...fields } = input
  const existing = await prisma.program.findUnique({ where: { id: programId } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Program not found.')

  try {
    return await prisma.program.update({
      where: { id: programId },
      data: { ...fields, level: fields.level as ProgramLevel },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountingError(
        'VALIDATION',
        `Another ${fields.level.toLowerCase()} program is already called "${fields.name}" here.`,
      )
    }
    throw error
  }
}

export async function setProgramActive(id: string, isActive: boolean) {
  const existing = await prisma.program.findUnique({ where: { id } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Program not found.')
  return prisma.program.update({ where: { id }, data: { isActive } })
}
