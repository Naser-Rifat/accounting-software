import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { prisma, type PrismaTransaction } from '@/server/db/client'

/**
 * The audit trail — docs/modules/12-administration.md §Audit log.
 *
 * Append-only (the database refuses UPDATE and DELETE), written inside the
 * caller's transaction so an action and its record commit or roll back
 * together. Passwords, hashes and tokens never enter it: every snapshot is
 * redacted by key name before it is stored.
 */

export type AuditActor = { id?: string | null; username: string }

export type AuditInput = {
  actor: AuditActor
  /** SCREAMING_SNAKE verb: USER_CREATED, SETTING_CHANGED, APPLICATION_STATUS, LOGIN … */
  action: string
  entity: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ip?: string | null
}

const SECRET_KEY = /password|hash|token|secret/i

/** Drop any key that smells like a credential, at any depth. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue
      out[k] = redact(v)
    }
    return out
  }
  return value
}

export async function recordAudit(db: PrismaTransaction | typeof prisma, input: AuditInput) {
  return db.auditLog.create({
    data: {
      userId: input.actor.id ?? null,
      username: input.actor.username,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before ? (redact(input.before) as Prisma.InputJsonValue) : undefined,
      after: input.after ? (redact(input.after) as Prisma.InputJsonValue) : undefined,
      ip: input.ip ?? null,
    },
  })
}

export type AuditFilter = {
  username?: string
  entity?: string
  action?: string
  from?: Date
  to?: Date
  take?: number
}

export async function listAuditLogs(filter: AuditFilter = {}) {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filter.username ? { username: { contains: filter.username, mode: 'insensitive' } } : {}),
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filter.take ?? 200,
  })
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    before: (r.before ?? null) as Record<string, unknown> | null,
    after: (r.after ?? null) as Record<string, unknown> | null,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type AuditRow = Awaited<ReturnType<typeof listAuditLogs>>[number]

/** For the filter dropdowns. */
export async function auditFacets() {
  const [actions, entities] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
  ])
  return { actions: actions.map((a) => a.action), entities: entities.map((e) => e.entity) }
}
