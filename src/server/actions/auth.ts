'use server'

import { redirect } from 'next/navigation'

import { loginSchema } from '@/lib/validation/auth'
import { verifyPassword } from '@/server/auth/password'
import { requestMeta } from '@/server/auth/request'
import { createSession, destroySession, getCurrentUser } from '@/server/auth/session'
import { prisma } from '@/server/db/client'
import { recordAudit } from '@/server/services/audit-service'

export type LoginState = { error?: string }

/**
 * Sign in.
 *
 * Server Actions are reachable by direct POST, not only through the form, so
 * everything is re-validated here regardless of what the browser did.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  }

  const meta = await requestMeta()
  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  })

  // One message for every failure. "No such user" would let anyone enumerate
  // valid IDs, and "wrong password" confirms an ID exists.
  const invalid = { error: 'Incorrect user ID or password' }

  if (!user || !user.isActive) {
    // Still spend the hashing time, so a missing user is not detectably faster.
    await verifyPassword(parsed.data.password, 'aa:bb')
    await recordAudit(prisma, {
      actor: { username: parsed.data.username },
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user?.id ?? parsed.data.username,
      after: { reason: user ? 'inactive' : 'unknown user' },
      ip: meta.ip,
    })
    return invalid
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) {
    await recordAudit(prisma, {
      actor: { id: user.id, username: user.username },
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      after: { reason: 'wrong password' },
      ip: meta.ip,
    })
    return invalid
  }

  await createSession(user.id, { ipAddress: meta.ip, userAgent: meta.userAgent })

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })
  await recordAudit(prisma, {
    actor: { id: user.id, username: user.username },
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    after: { userAgent: meta.userAgent ?? null },
    ip: meta.ip,
  })

  // A seeded or reset account cannot go anywhere until its password is its own.
  redirect(user.mustChangePassword ? '/account/password' : '/modules')
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser()
  if (user) {
    const { ip } = await requestMeta()
    await recordAudit(prisma, {
      actor: { id: user.id, username: user.username },
      action: 'LOGOUT',
      entity: 'User',
      entityId: user.id,
      ip,
    })
  }
  await destroySession()
  redirect('/login')
}
