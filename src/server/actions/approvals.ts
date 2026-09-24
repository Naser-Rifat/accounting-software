'use server'

import { revalidatePath } from 'next/cache'

import { isAccountingError } from '@/server/accounting/errors'
import { canDecideApprovals } from '@/server/auth/authorize'
import { requestMeta } from '@/server/auth/request'
import { requireUser } from '@/server/auth/session'
import { decideApprovalRequest } from '@/server/services/approval-service'

export type ActionState = { error?: string; message?: string }

export async function submitDecideApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canDecideApprovals(user.role)) return { error: 'Your role cannot decide approvals.' }

  const requestId = String(formData.get('requestId') ?? '')
  const approve = String(formData.get('decision') ?? '') === 'approve'
  const note = String(formData.get('note') ?? '').trim() || undefined
  const { ip } = await requestMeta()

  try {
    const result = await decideApprovalRequest({
      requestId,
      approve,
      note,
      actor: { id: user.id, username: user.username, ip },
    })
    revalidatePath('/admin/approvals')
    revalidatePath('/admin/audit')
    return { message: `${result.entityType} ${result.entityId} ${result.status.toLowerCase()}.` }
  } catch (error) {
    if (isAccountingError(error)) return { error: error.message }
    console.error('Could not decide the request.', error)
    return { error: 'Could not decide the request.' }
  }
}
