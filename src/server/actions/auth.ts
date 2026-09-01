'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { loginSchema } from '@/lib/validation/auth'
import { verifyPassword } from '@/server/auth/password'
import { createSession, destroySession } from '@/server/auth/session'
import { prisma } from '@/server/db/client'

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

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  })

  // One message for every failure. "No such user" would let anyone enumerate
  // valid IDs, and "wrong password" confirms an ID exists.
  const invalid = { error: 'Incorrect user ID or password' }

  if (!user || !user.isActive) {
    // Still spend the hashing time, so a missing user is not detectably faster.
    await verifyPassword(parsed.data.password, 'aa:bb')
    return invalid
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!ok) return invalid

  const headerList = await headers()
  await createSession(user.id, {
    ipAddress: headerList.get('x-forwarded-for') ?? undefined,
    userAgent: headerList.get('user-agent') ?? undefined,
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  redirect('/modules')
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect('/login')
}
