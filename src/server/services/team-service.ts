import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { allocatePartyCode } from '@/server/services/party-service'

/**
 * The Students module's master data — docs/modules/12-administration.md
 * §Branches, docs/01-domain-model.md.
 *
 * A branch maps to a cost center so every voucher a student generates carries
 * it. Counselors and agents are Parties on 2020, the payable their internal
 * commission accrues to.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const intakeName = (month: number, year: number) => `${MONTHS[month - 1]} ${year}`

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function listBranches(includeInactive = false) {
  const rows = await prisma.branch.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      costCenter: { select: { code: true, name: true } },
      _count: { select: { counselors: { where: { isActive: true } } } },
    },
  })
  return rows.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    costCenterId: b.costCenterId,
    costCenter: `${b.costCenter.code} — ${b.costCenter.name}`,
    counselors: b._count.counselors,
    isActive: b.isActive,
  }))
}

export async function listCostCenterOptions() {
  const rows = await prisma.costCenter.findMany({
    where: { type: 'BRANCH', isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })
  return rows.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))
}

export async function createBranch(input: {
  code: string
  name: string
  address?: string
  costCenterId: string
}) {
  const costCenter = await prisma.costCenter.findUnique({ where: { id: input.costCenterId } })
  if (!costCenter || costCenter.type !== 'BRANCH') {
    throw new AccountingError('VALIDATION', 'Choose a BRANCH-type cost center.')
  }
  try {
    return await prisma.branch.create({ data: input })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountingError('VALIDATION', `Branch code ${input.code} is already used.`)
    }
    throw error
  }
}

export async function setBranchActive(id: string, isActive: boolean) {
  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Branch not found.')
  return prisma.branch.update({ where: { id }, data: { isActive } })
}

// ---------------------------------------------------------------------------
// Counselors & agents
// ---------------------------------------------------------------------------

export async function listCounselors(includeInactive = false) {
  const rows = await prisma.counselor.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      party: { select: { code: true } },
      branch: { select: { code: true, name: true } },
      _count: { select: { students: { where: { isActive: true } } } },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    code: c.party.code,
    name: c.name,
    email: c.email,
    phone: c.phone,
    commissionRate: c.commissionRate.toString(),
    branchId: c.branchId,
    branch: c.branch.name,
    branchCode: c.branch.code,
    students: c._count.students,
    isActive: c.isActive,
  }))
}

export async function createCounselor(input: {
  name: string
  email?: string
  phone?: string
  commissionRate: string
  branchId: string
}) {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } })
  if (!branch || !branch.isActive) throw new AccountingError('VALIDATION', 'Choose an active branch.')

  return prisma.$transaction(async (tx) => {
    const code = await allocatePartyCode(tx, input.name, undefined, 'CNS')
    const party = await tx.party.create({
      data: {
        code,
        name: input.name,
        type: 'COUNSELOR',
        controlAccountCode: ACCOUNTS.AP_COUNSELORS_AGENTS,
        currency: 'BDT',
      },
    })
    return tx.counselor.create({ data: { partyId: party.id, ...input } })
  })
}

export async function setCounselorActive(id: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.counselor.findUnique({ where: { id } })
    if (!existing) throw new AccountingError('NOT_FOUND', 'Counselor not found.')
    await tx.party.update({ where: { id: existing.partyId }, data: { isActive } })
    return tx.counselor.update({ where: { id }, data: { isActive } })
  })
}

export async function listAgents(includeInactive = false) {
  const rows = await prisma.agent.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      party: { select: { code: true } },
      _count: { select: { students: { where: { isActive: true } } } },
    },
  })
  return rows.map((a) => ({
    id: a.id,
    code: a.party.code,
    name: a.name,
    company: a.company,
    email: a.email,
    phone: a.phone,
    commissionRate: a.commissionRate.toString(),
    students: a._count.students,
    isActive: a.isActive,
  }))
}

export async function createAgent(input: {
  name: string
  company?: string
  email?: string
  phone?: string
  commissionRate: string
}) {
  return prisma.$transaction(async (tx) => {
    const code = await allocatePartyCode(tx, input.company ?? input.name, undefined, 'AGT')
    const party = await tx.party.create({
      data: {
        code,
        name: input.company ? `${input.name} (${input.company})` : input.name,
        type: 'AGENT',
        controlAccountCode: ACCOUNTS.AP_COUNSELORS_AGENTS,
        currency: 'BDT',
      },
    })
    return tx.agent.create({ data: { partyId: party.id, ...input } })
  })
}

export async function setAgentActive(id: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.agent.findUnique({ where: { id } })
    if (!existing) throw new AccountingError('NOT_FOUND', 'Agent not found.')
    await tx.party.update({ where: { id: existing.partyId }, data: { isActive } })
    return tx.agent.update({ where: { id }, data: { isActive } })
  })
}

// ---------------------------------------------------------------------------
// Intakes
// ---------------------------------------------------------------------------

export async function listIntakes(includeInactive = false) {
  const rows = await prisma.intake.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    include: { _count: { select: { applications: true } } },
  })
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    month: i.month,
    year: i.year,
    applications: i._count.applications,
    isActive: i.isActive,
  }))
}

export async function createIntake(input: { month: number; year: number }) {
  try {
    return await prisma.intake.create({
      data: { ...input, name: intakeName(input.month, input.year) },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AccountingError('VALIDATION', `${intakeName(input.month, input.year)} already exists.`)
    }
    throw error
  }
}

export async function setIntakeActive(id: string, isActive: boolean) {
  const existing = await prisma.intake.findUnique({ where: { id } })
  if (!existing) throw new AccountingError('NOT_FOUND', 'Intake not found.')
  return prisma.intake.update({ where: { id }, data: { isActive } })
}
