import 'server-only'

import { headers } from 'next/headers'

/**
 * Where a request came from, for the audit log and session rows.
 *
 * `x-forwarded-for` is a comma list and the first hop is whatever the client
 * sent unless a trusted proxy overwrote it — treat it as a hint, not evidence.
 */
export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const list = await headers()
  const forwarded = list.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || undefined
  return { ip, userAgent: list.get('user-agent') ?? undefined }
}
