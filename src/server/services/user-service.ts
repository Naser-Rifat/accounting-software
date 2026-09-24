import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { UserRole } from '@/generated/prisma/enums'
import type { CreateUserInput, UpdateUserInput } from '@/lib/validation/user'
import { AccountingError } from '@/server/accounting/errors'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'

/**
 * Users & roles — docs/modules/12-administration.md.
 *
 * Two invariants: an administrator cannot lock themselves out (no changing
 * your own role, no deactivating yourself), and the system always keeps at
 * least one active ADMIN. Passwords are set only as temporary ones that must
 * be changed on first use; nothing here ever logs or returns one.
 */

type Actor = AuditActor & { ip?: string }

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Which unique field collided. Prisma 7 puts it in `meta.target` or, with a
 *  driver adapter, in the underlying constraint name — search both. */
function uniqueMessage(error: Prisma.PrismaClientKnownRequestError) {
  const meta = JSON.stringify(error.meta ?? {})
  if (/username/.test(meta)) return 'That user ID is already taken.'
  if (/email/.test(meta)) return 'That email is already used by another user.'
  if (/counselorId/.test(meta)) return 'That counselor is already linked to a user.'
  if (/agentId/.test(meta)) return 'That agent is already linked to a user.'
  return 'A user with those details already exists.'
}

/** The fields the audit log records for a user — never the hash. */
function snapshot(u: {
  username: string
  name: string
  email: string | null
  role: UserRole
  isActive: boolean
  counselorId: string | null
  agentId: string | null
}) {
  return {
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    counselorId: u.counselorId,
    agentId: u.agentId,
  }
}

/** Refuse if `userId` is the last active administrator. Call with the row locked. */
async function assertNotLastAdmin(tx: PrismaTransaction, userId: string, verb: string) {
  const others = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: userId } } })
  if (others === 0) {
    throw new AccountingError('VALIDATION', `Cannot ${verb} the last active administrator.`)
  }
}

async function lockUser(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`
  const user = await tx.user.findUnique({ where: { id } })
  if (!user) throw new AccountingError('NOT_FOUND', 'User not found.')
  return user
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listUsers() {
  const now = new Date()
  const rows = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
    include: {
      counselor: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
      _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    },
  })
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    activeSessions: u._count.sessions,
    counselorId: u.counselorId,
    counselor: u.counselor?.name ?? null,
    agentId: u.agentId,
    agent: u.agent?.name ?? null,
    createdAt: u.createdAt.toISOString().slice(0, 10),
  }))
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>[number]

/** Counselors and agents not yet linked to a login (plus the one already linked to `forUserId`). */
export async function linkOptions(forUserId?: string) {
  const [counselors, agents] = await Promise.all([
    prisma.counselor.findMany({
      where: { isActive: true, OR: [{ user: null }, ...(forUserId ? [{ user: { id: forUserId } }] : [])] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.agent.findMany({
      where: { isActive: true, OR: [{ user: null }, ...(forUserId ? [{ user: { id: forUserId } }] : [])] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  return { counselors, agents }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createUser(input: CreateUserInput & { actor: Actor }) {
  const { actor, tempPassword, ...fields } = input
  const passwordHash = await hashPassword(tempPassword)

  try {
    return await prisma.$transaction(async (tx) => {
      // Zod does this too; the service repeats it so a direct caller cannot
      // create "Admin" beside "admin", and a blank email never hits the unique index.
      const user = await tx.user.create({
        data: {
          username: fields.username.trim().toLowerCase(),
          name: fields.name,
          email: fields.email?.trim() || null,
          role: fields.role,
          counselorId: fields.counselorId ?? null,
          agentId: fields.agentId ?? null,
          passwordHash,
          mustChangePassword: true,
        },
      })
      await recordAudit(tx, {
        actor,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: user.id,
        after: { ...snapshot(user), mustChangePassword: true },
        ip: actor.ip,
      })
      return { id: user.id, username: user.username, name: user.name }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountingError('VALIDATION', uniqueMessage(error))
    throw error
  }
}

export async function updateUser(input: UpdateUserInput & { actor: Actor }) {
  const { actor, userId, ...fields } = input

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await lockUser(tx, userId)

      if (existing.id === actor.id && fields.role !== existing.role) {
        throw new AccountingError('VALIDATION', 'You cannot change your own role.')
      }
      if (existing.role === 'ADMIN' && existing.isActive && fields.role !== 'ADMIN') {
        await assertNotLastAdmin(tx, userId, 'demote')
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: fields.name,
          email: fields.email?.trim() || null,
          role: fields.role,
          counselorId: fields.counselorId ?? null,
          agentId: fields.agentId ?? null,
        },
      })
      await recordAudit(tx, {
        actor,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: user.id,
        before: snapshot(existing),
        after: snapshot(user),
        ip: actor.ip,
      })
      return { id: user.id, username: user.username, name: user.name }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountingError('VALIDATION', uniqueMessage(error))
    throw error
  }
}

export async function setUserActive(input: { userId: string; isActive: boolean; actor: Actor }) {
  const { actor, userId, isActive } = input
  return prisma.$transaction(async (tx) => {
    const existing = await lockUser(tx, userId)
    if (!isActive && existing.id === actor.id) {
      throw new AccountingError('VALIDATION', 'You cannot deactivate your own account.')
    }
    if (!isActive && existing.role === 'ADMIN' && existing.isActive) {
      await assertNotLastAdmin(tx, userId, 'deactivate')
    }

    const user = await tx.user.update({ where: { id: userId }, data: { isActive } })
    let sessionsRevoked = 0
    if (!isActive) {
      sessionsRevoked = (await tx.session.deleteMany({ where: { userId } })).count
    }
    await recordAudit(tx, {
      actor,
      action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
      entity: 'User',
      entityId: user.id,
      before: snapshot(existing),
      after: { ...snapshot(user), sessionsRevoked },
      ip: actor.ip,
    })
    return { id: user.id, username: user.username, name: user.name, isActive: user.isActive }
  })
}

/** An administrator sets a temporary password; the user must change it on next sign-in. */
export async function resetPassword(input: { userId: string; tempPassword: string; actor: Actor }) {
  const { actor, userId, tempPassword } = input
  const passwordHash = await hashPassword(tempPassword)

  return prisma.$transaction(async (tx) => {
    const existing = await lockUser(tx, userId)
    if (tempPassword.toLowerCase() === existing.username) {
      throw new AccountingError('VALIDATION', 'The password cannot be the user ID.')
    }
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } })
    const { count } = await tx.session.deleteMany({ where: { userId } })
    await recordAudit(tx, {
      actor,
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: userId,
      after: { username: existing.username, sessionsRevoked: count, mustChangePassword: true },
      ip: actor.ip,
    })
    return { id: userId, username: existing.username, name: existing.name, sessionsRevoked: count }
  })
}

/**
 * A user changes their own password. Every session is dropped — the action
 * then issues a fresh one, so the cookie that was live during the change
 * cannot be reused.
 */
export async function changeOwnPassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
  actor: Actor
}) {
  const { actor, userId } = input
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) throw new AccountingError('NOT_FOUND', 'User not found.')

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AccountingError('VALIDATION', 'The current password is not right.')
  }
  if (input.newPassword === input.currentPassword) {
    throw new AccountingError('VALIDATION', 'Choose a password you have not used.')
  }
  if (input.newPassword.toLowerCase() === user.username) {
    throw new AccountingError('VALIDATION', 'The password cannot be the user ID.')
  }

  const passwordHash = await hashPassword(input.newPassword)
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } })
    const { count } = await tx.session.deleteMany({ where: { userId } })
    await recordAudit(tx, {
      actor,
      action: 'USER_PASSWORD_CHANGED',
      entity: 'User',
      entityId: userId,
      after: { username: user.username, sessionsRevoked: count, mustChangePassword: false },
      ip: actor.ip,
    })
    return { id: userId, username: user.username, sessionsRevoked: count }
  })
}

export async function revokeSessions(input: { userId: string; actor: Actor }) {
  const { actor, userId } = input
  return prisma.$transaction(async (tx) => {
    const existing = await lockUser(tx, userId)
    const { count } = await tx.session.deleteMany({ where: { userId } })
    await recordAudit(tx, {
      actor,
      action: 'USER_SESSIONS_REVOKED',
      entity: 'User',
      entityId: userId,
      after: { username: existing.username, sessionsRevoked: count },
      ip: actor.ip,
    })
    return { id: userId, username: existing.username, sessionsRevoked: count }
  })
}
