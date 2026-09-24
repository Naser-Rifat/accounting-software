import 'server-only'

import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'
import { listPendingVouchers } from '@/server/services/voucher-service'

/**
 * Approval queue — docs/modules/12-administration.md §Approval workflow.
 *
 * Today the only approval-gated flow is the manual journal voucher, which has
 * its own PENDING_APPROVAL state; the queue shows those. `ApprovalRequest` is
 * the generic record later modules raise (commission approval, refunds, bills
 * above the threshold). Segregation of duties: the requester never decides
 * their own request, and the attempt is written to the audit log.
 */

const toIso = (d: Date) => d.toISOString()

export async function listApprovalQueue(viewer: string) {
  const [vouchers, requests] = await Promise.all([
    listPendingVouchers(viewer),
    prisma.approvalRequest.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'asc' } }),
  ])
  return {
    vouchers,
    requests: requests.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      requestedBy: r.requestedBy,
      requestedAt: toIso(r.requestedAt),
      note: r.note,
      isOwn: r.requestedBy === viewer,
    })),
  }
}

export async function listDecidedRequests(limit = 20) {
  const rows = await prisma.approvalRequest.findMany({
    where: { status: { not: 'PENDING' } },
    orderBy: { decidedOn: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy,
    status: r.status,
    decisionNote: r.decisionNote,
    decidedOn: r.decidedOn ? toIso(r.decidedOn) : null,
  }))
}

/** Raise a request. Exported for the modules that will gate actions on it. */
export async function createApprovalRequest(input: {
  entityType: string
  entityId: string
  requestedBy: string
  note?: string
}) {
  return prisma.approvalRequest.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      requestedBy: input.requestedBy,
      note: input.note ?? null,
    },
  })
}

export async function decideApprovalRequest(input: {
  requestId: string
  approve: boolean
  note?: string
  actor: AuditActor & { ip?: string }
}) {
  const { actor } = input
  const request = await prisma.approvalRequest.findUnique({ where: { id: input.requestId } })
  if (!request) throw new AccountingError('NOT_FOUND', 'Approval request not found.')

  if (request.requestedBy === actor.username) {
    // Flag it, then refuse — docs/12: "flag violations in the audit log".
    // Written outside the transaction because the refusal must not roll it back.
    await recordAudit(prisma, {
      actor,
      action: 'APPROVAL_SOD_VIOLATION',
      entity: request.entityType,
      entityId: request.entityId,
      after: { requestId: request.id, attempted: input.approve ? 'APPROVE' : 'REJECT' },
      ip: actor.ip,
    })
    throw new AccountingError('SELF_APPROVAL', 'You raised this request; someone else must decide it.')
  }

  const status = input.approve ? 'APPROVED' : 'REJECTED'
  return prisma.$transaction(async (tx) => {
    // Only a PENDING row can be decided, and only once — a second decision
    // racing the first finds no row to update.
    const { count } = await tx.approvalRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status, approvedBy: actor.username, decisionNote: input.note ?? null, decidedOn: new Date() },
    })
    if (count !== 1) throw new AccountingError('VALIDATION', 'This request has already been decided.')

    await recordAudit(tx, {
      actor,
      action: input.approve ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
      entity: request.entityType,
      entityId: request.entityId,
      before: { status: 'PENDING', requestedBy: request.requestedBy },
      after: { status, requestId: request.id, note: input.note ?? null },
      ip: actor.ip,
    })
    return { id: request.id, status, entityType: request.entityType, entityId: request.entityId }
  })
}
