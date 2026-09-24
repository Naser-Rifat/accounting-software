'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  changePasswordSchema,
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@/lib/validation/user'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageUsers } from '@/server/auth/authorize'
import { requestMeta } from '@/server/auth/request'
import { createSession, requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/services/audit-service'
import { prisma } from '@/server/db/client'
import {
  changeOwnPassword,
  createUser,
  resetPassword,
  revokeSessions,
  setUserActive,
  updateUser,
} from '@/server/services/user-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

const NOT_ALLOWED = { error: 'Only an administrator can manage users.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')
const flag = (fd: FormData, key: string) => fd.get(key) === 'on' || fd.get(key) === 'true'
const firstIssue = (error: { issues: { message: string }[] }, fallback: string) =>
  error.issues[0]?.message ?? fallback

async function actorOf(user: { id: string; username: string }) {
  const { ip } = await requestMeta()
  return { id: user.id, username: user.username, ip }
}

function refresh() {
  revalidatePath('/admin/users')
  revalidatePath('/admin/audit')
}

export async function submitCreateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUsers(user.role)) return NOT_ALLOWED

  const parsed = createUserSchema.safeParse({
    username: text(formData, 'username'),
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    role: text(formData, 'role'),
    tempPassword: text(formData, 'tempPassword'),
    counselorId: text(formData, 'counselorId'),
    agentId: text(formData, 'agentId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  try {
    const created = await createUser({ ...parsed.data, actor: await actorOf(user) })
    refresh()
    return { message: `${created.name} added as ${created.username}. They must change the temporary password on first sign-in.` }
  } catch (error) {
    return fail(error, 'Could not add the user.')
  }
}

export async function submitUpdateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUsers(user.role)) return NOT_ALLOWED

  const parsed = updateUserSchema.safeParse({
    userId: text(formData, 'userId'),
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    role: text(formData, 'role'),
    counselorId: text(formData, 'counselorId'),
    agentId: text(formData, 'agentId'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the form and try again.') }

  try {
    const updated = await updateUser({ ...parsed.data, actor: await actorOf(user) })
    refresh()
    return { message: `${updated.username} saved.` }
  } catch (error) {
    return fail(error, 'Could not save the user.')
  }
}

export async function submitSetUserActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUsers(user.role)) return NOT_ALLOWED

  try {
    const result = await setUserActive({
      userId: text(formData, 'userId'),
      isActive: flag(formData, 'isActive'),
      actor: await actorOf(user),
    })
    refresh()
    return { message: `${result.username} is now ${result.isActive ? 'active' : 'inactive'}.` }
  } catch (error) {
    return fail(error, 'Could not update the user.')
  }
}

export async function submitResetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUsers(user.role)) return NOT_ALLOWED

  const parsed = resetPasswordSchema.safeParse({
    userId: text(formData, 'userId'),
    tempPassword: text(formData, 'tempPassword'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Enter a temporary password.') }

  try {
    const result = await resetPassword({ ...parsed.data, actor: await actorOf(user) })
    refresh()
    return {
      message: `Temporary password set for ${result.username}; ${result.sessionsRevoked} session(s) signed out. They must change it on next sign-in.`,
    }
  } catch (error) {
    return fail(error, 'Could not reset the password.')
  }
}

export async function submitRevokeSessions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageUsers(user.role)) return NOT_ALLOWED

  try {
    const result = await revokeSessions({ userId: text(formData, 'userId'), actor: await actorOf(user) })
    refresh()
    return { message: `${result.sessionsRevoked} session(s) of ${result.username} signed out.` }
  } catch (error) {
    return fail(error, 'Could not revoke the sessions.')
  }
}

/** Any signed-in user, including one whose password change is pending. */
export async function submitChangePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser({ allowPendingPasswordChange: true })

  const parsed = changePasswordSchema.safeParse({
    currentPassword: text(formData, 'currentPassword'),
    newPassword: text(formData, 'newPassword'),
    confirmPassword: text(formData, 'confirmPassword'),
  })
  if (!parsed.success) return { error: firstIssue(parsed.error, 'Check the passwords and try again.') }

  const meta = await requestMeta()
  try {
    await changeOwnPassword({
      userId: user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      actor: { id: user.id, username: user.username, ip: meta.ip },
    })
    // Every session was dropped; issue a fresh one for this browser.
    await createSession(user.id, { ipAddress: meta.ip, userAgent: meta.userAgent })
  } catch (error) {
    return fail(error, 'Could not change the password.')
  }
  redirect('/modules')
}

/** Sign out of every other device — for the account page. */
export async function submitSignOutEverywhere(): Promise<void> {
  const user = await requireUser({ allowPendingPasswordChange: true })
  const meta = await requestMeta()
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({ where: { userId: user.id } })
    await recordAudit(tx, {
      actor: { id: user.id, username: user.username },
      action: 'USER_SESSIONS_REVOKED',
      entity: 'User',
      entityId: user.id,
      after: { username: user.username, sessionsRevoked: count, self: true },
      ip: meta.ip,
    })
  })
  await createSession(user.id, { ipAddress: meta.ip, userAgent: meta.userAgent })
  redirect('/account/password')
}
