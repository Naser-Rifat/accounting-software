import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import { prisma } from '@/server/db/client'
import type { UserRole } from '@/generated/prisma/enums'

/**
 * Server-side sessions.
 *
 * The cookie holds a random token; the database stores only its SHA-256. A leaked
 * database therefore does not hand over live sessions, and revoking access is a
 * DELETE rather than waiting for a token to expire.
 */

const COOKIE_NAME = 'session'
const SESSION_DAYS = 7

export type SessionUser = {
  id: string
  username: string
  name: string
  role: UserRole
  mustChangePassword: boolean
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  })

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

/**
 * The current user, or null.
 *
 * Wrapped in React `cache` so a request that checks auth in a layout, a page and
 * a Server Action still hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) return null
  if (!session.user.isActive) return null

  return {
    id: session.user.id,
    username: session.user.username,
    name: session.user.name,
    role: session.user.role,
    mustChangePassword: session.user.mustChangePassword,
  }
})

export type RequireOptions = {
  /** Only the password-change flow and sign-out may run while a change is pending. */
  allowPendingPasswordChange?: boolean
}

const PASSWORD_PAGE = '/account/password'

/**
 * For layouts and pages: send an anonymous visitor to sign in, and anyone whose
 * password must be changed (seeded or reset accounts) to the change page. Every
 * module shell calls this, so no route beneath can forget either rule.
 */
export async function requireSignedIn(options: RequireOptions = {}): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.mustChangePassword && !options.allowPendingPasswordChange) redirect(PASSWORD_PAGE)
  return user
}

/**
 * For pages and Server Actions that require a user. A direct POST from an
 * account with a pending password change is redirected too — the flow cannot
 * be skipped by never loading a page.
 */
export async function requireUser(options: RequireOptions = {}): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  if (user.mustChangePassword && !options.allowPendingPasswordChange) redirect(PASSWORD_PAGE)
  return user
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value

  if (token) {
    await prisma.session
      .delete({ where: { tokenHash: hashToken(token) } })
      .catch(() => {
        // Already gone — deleting a session that does not exist is not an error.
      })
  }

  store.delete(COOKIE_NAME)
}

/** Housekeeping: drop expired rows. Called from the reminder cron. */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return count
}
