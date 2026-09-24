import 'server-only'

import type { PrismaTransaction } from '@/server/db/client'

/**
 * A readable Party code derived from the name, made unique with a counter:
 * "City Bank Ltd" → CITYBANK, then CITYBANK-2 if that is taken.
 *
 * Runs on the caller's transaction so the code is checked and the party
 * written under the same snapshot.
 */
export async function allocatePartyCode(
  tx: PrismaTransaction,
  name: string,
  override?: string,
  fallback = 'PARTY',
): Promise<string> {
  const base =
    override?.trim().toUpperCase() ||
    name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ||
    fallback

  let code = base
  for (let i = 2; await tx.party.findUnique({ where: { code } }); i++) {
    code = `${base}-${i}`
  }
  return code
}
