// Deliberately NOT marked `server-only`: the seed script imports this outside
// the Next.js runtime. It is pure crypto with no database or secret access, and
// `node:crypto` cannot be bundled for the browser anyway.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is deliberately slow and memory-hard, which is what makes a stolen hash
 * expensive to attack. No third-party dependency is involved, so there is one
 * less package in the supply chain of an application that holds financial data.
 *
 * Stored form: `<salt-hex>:<derivedKey-hex>`.
 */

const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

/**
 * Verify a password. Uses a constant-time comparison so an attacker cannot learn
 * the hash byte by byte from response timing.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false

  const expected = Buffer.from(key, 'hex')
  const actual = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer

  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
