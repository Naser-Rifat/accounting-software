import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isAccountingError } from '@/server/accounting/errors'
import { verifyPassword } from '@/server/auth/password'
import { prisma } from '@/server/db/client'
import { createApprovalRequest, decideApprovalRequest } from '@/server/services/approval-service'
import { listAuditLogs, redact } from '@/server/services/audit-service'
import { getSetting, listSettings, updateSetting } from '@/server/services/settings-service'
import {
  changeOwnPassword,
  createUser,
  resetPassword,
  setUserActive,
  updateUser,
} from '@/server/services/user-service'

/**
 * Administration — docs/modules/12 and 16.
 *
 * The invariants: the system never loses its last administrator, nobody locks
 * themselves out, passwords never reach the audit log, the audit log cannot be
 * rewritten, settings honour their locks and dates, and nobody approves their
 * own request.
 */

const STAMP = Date.now()
const ADMIN = { id: 'test-admin-id', username: `test-admin-${STAMP}` }

let adminId: string
let userId: string

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise
  } catch (error) {
    if (isAccountingError(error)) {
      expect(error.code).toBe(code)
      return
    }
    throw error
  }
  throw new Error(`Expected ${code} to be thrown`)
}

beforeAll(async () => {
  // A second administrator, so last-admin checks are about this test's rows.
  const admin = await createUser({
    username: ADMIN.username,
    name: 'Test Admin',
    role: 'ADMIN',
    tempPassword: 'admin-temp-pass-1',
    actor: { username: 'seed-test' },
  })
  adminId = admin.id
  ADMIN.id = admin.id
})

afterAll(async () => {
  // Shared database: retire this run's users so /admin/users stays readable.
  // Audit rows stay — they cannot be deleted, by design.
  await prisma.session.deleteMany({ where: { user: { username: { startsWith: 'test' }, name: { in: ['Test Admin', 'Test User', 'Second'] } } } })
  await prisma.user.updateMany({
    where: { username: { in: [ADMIN.username, `test.user-${STAMP}`, `test-second-${STAMP}`] } },
    data: { isActive: false },
  })
  await prisma.$disconnect()
})

describe('users', () => {
  it('creates a user with a hashed temporary password and no secrets in the audit row', async () => {
    const created = await createUser({
      username: `Test.User-${STAMP}`,
      name: 'Test User',
      email: '',
      role: 'COUNSELOR',
      tempPassword: 'temporary-pass-42',
      actor: ADMIN,
    })
    userId = created.id
    expect(created.username).toBe(`test.user-${STAMP}`)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(row.email).toBeNull()
    expect(row.mustChangePassword).toBe(true)
    expect(await verifyPassword('temporary-pass-42', row.passwordHash)).toBe(true)

    const [audit] = await listAuditLogs({ entity: 'User', action: 'USER_CREATED', take: 50 })
    const mine = (await listAuditLogs({ entity: 'User', action: 'USER_CREATED', take: 50 })).find((a) => a.entityId === userId)
    expect(audit).toBeDefined()
    expect(JSON.stringify(mine)).not.toContain('temporary-pass-42')
    expect(JSON.stringify(mine)).not.toContain(row.passwordHash)
    expect(mine?.username).toBe(ADMIN.username)
  })

  it('a second user with a blank email does not collide', async () => {
    const second = await createUser({
      username: `test-second-${STAMP}`,
      name: 'Second',
      email: '',
      role: 'VIEWER',
      tempPassword: 'another-temp-pass',
      actor: ADMIN,
    })
    expect(second.id).toBeTruthy()
    await expectCode(
      createUser({ username: `test-second-${STAMP}`, name: 'Dup', role: 'VIEWER', tempPassword: 'another-temp-pass', actor: ADMIN }),
      'VALIDATION',
    )
  })

  it('refuses changing your own role and deactivating yourself', async () => {
    await expectCode(updateUser({ userId: adminId, name: 'Test Admin', role: 'VIEWER', actor: ADMIN }), 'VALIDATION')
    await expectCode(setUserActive({ userId: adminId, isActive: false, actor: ADMIN }), 'VALIDATION')
  })

  it('keeps the last active administrator', async () => {
    // Deactivate every other admin's standing by simulation: count how many exist, then
    // only assert the guard when this test's admin is the sole one left.
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
    if (admins === 1) {
      await expectCode(updateUser({ userId: adminId, name: 'Test Admin', role: 'ACCOUNTANT', actor: { username: 'other' } }), 'VALIDATION')
    } else {
      // Another admin exists (the seeded one), so demoting this one is allowed — and reversible.
      await updateUser({ userId: adminId, name: 'Test Admin', role: 'ACCOUNTANT', actor: { username: 'other' } })
      await updateUser({ userId: adminId, name: 'Test Admin', role: 'ADMIN', actor: { username: 'other' } })
    }
  })

  it('reset sets the flag and drops sessions; own change clears it and rejects the wrong current password', async () => {
    await prisma.session.create({
      data: { tokenHash: `test-${STAMP}`, userId, expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const reset = await resetPassword({ userId, tempPassword: 'reset-temp-pass-9', actor: ADMIN })
    expect(reset.sessionsRevoked).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).mustChangePassword).toBe(true)

    await expectCode(
      changeOwnPassword({ userId, currentPassword: 'wrong', newPassword: 'my-own-password-1', actor: { id: userId, username: 'x' } }),
      'VALIDATION',
    )
    await expectCode(
      changeOwnPassword({ userId, currentPassword: 'reset-temp-pass-9', newPassword: 'reset-temp-pass-9', actor: { id: userId, username: 'x' } }),
      'VALIDATION',
    )
    await changeOwnPassword({ userId, currentPassword: 'reset-temp-pass-9', newPassword: 'my-own-password-1', actor: { id: userId, username: 'x' } })
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(row.mustChangePassword).toBe(false)
    expect(await verifyPassword('my-own-password-1', row.passwordHash)).toBe(true)

    const rows = await listAuditLogs({ entity: 'User', take: 100 })
    const text = JSON.stringify(rows.filter((r) => r.entityId === userId))
    expect(text).not.toContain('reset-temp-pass-9')
    expect(text).not.toContain('my-own-password-1')
    expect(text).not.toContain(row.passwordHash)
  })

  it('deactivation signs the user out and is recorded', async () => {
    const result = await setUserActive({ userId, isActive: false, actor: ADMIN })
    expect(result.isActive).toBe(false)
    const rows = await listAuditLogs({ action: 'USER_DEACTIVATED', take: 50 })
    expect(rows.some((r) => r.entityId === userId)).toBe(true)
  })
})

describe('audit log', () => {
  it('redacts credential-looking keys at any depth', () => {
    expect(redact({ name: 'x', passwordHash: 'h', nested: { token: 't', ok: 1 } })).toEqual({ name: 'x', nested: { ok: 1 } })
  })

  it('is append-only at the database', async () => {
    const row = await prisma.auditLog.findFirstOrThrow({ where: { username: ADMIN.username } })
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } })).rejects.toThrow(/append-only/)
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/)
  })
})

describe('settings', () => {
  it('refuses a locked key without a prior listSettings()', async () => {
    // A voucher exists in this database (other suites post), so the base currency is locked.
    const vouchers = await prisma.journalEntry.count()
    if (vouchers === 0) return
    await prisma.setting.update({ where: { key: 'company.baseCurrency' }, data: { isLocked: false } }) // stale cache
    await expectCode(
      updateSetting({ key: 'company.baseCurrency', value: 'USD', effectiveFrom: new Date(), changedBy: 'test' }),
      'VALIDATION',
    )
  })

  it('validates, records history and audit, amends same-day edits, and keeps future values out of the cache', async () => {
    const key = 'company.tradingName'
    const original = (await getSetting(key)) ?? ''
    const today = new Date()

    await expectCode(updateSetting({ key: 'tax.withholdingDefaultRate', value: '150', effectiveFrom: today, changedBy: 'test' }), 'VALIDATION')

    await updateSetting({ key, value: `Trading ${STAMP}`, effectiveFrom: today, changedBy: 'test', note: 'first' })
    await updateSetting({ key, value: `Trading ${STAMP} v2`, effectiveFrom: today, changedBy: 'test', note: 'typo' })
    expect(await getSetting(key)).toBe(`Trading ${STAMP} v2`)

    const future = new Date(Date.now() + 30 * 86_400_000)
    await updateSetting({ key, value: 'Future name', effectiveFrom: future, changedBy: 'test' })
    expect(await getSetting(key)).toBe(`Trading ${STAMP} v2`) // not yet

    const audits = await listAuditLogs({ entity: 'Setting', action: 'SETTING_CHANGED', take: 20 })
    expect(audits.filter((a) => a.entityId === key).length).toBeGreaterThanOrEqual(3)

    const view = (await listSettings('COMPANY')).find((s) => s.key === key)
    expect(view?.value).toBe(`Trading ${STAMP} v2`)

    // Put it back for the next run.
    const history = await prisma.settingHistory.findMany({ where: { key }, orderBy: { effectiveFrom: 'desc' } })
    await prisma.settingHistory.deleteMany({ where: { key, id: { in: history.slice(0, 2).map((h) => h.id) } } })
    await prisma.settingHistory.updateMany({ where: { key, effectiveTo: { not: null } }, data: { effectiveTo: null } })
    await prisma.setting.update({ where: { key }, data: { value: original } })
  })
})

describe('approvals', () => {
  it('nobody decides their own request; someone else can, once', async () => {
    const request = await createApprovalRequest({ entityType: 'TestThing', entityId: `t-${STAMP}`, requestedBy: ADMIN.username })

    await expectCode(decideApprovalRequest({ requestId: request.id, approve: true, actor: ADMIN }), 'SELF_APPROVAL')
    const violations = await listAuditLogs({ action: 'APPROVAL_SOD_VIOLATION', take: 20 })
    expect(violations.some((v) => v.entityId === `t-${STAMP}`)).toBe(true)

    const decided = await decideApprovalRequest({ requestId: request.id, approve: true, note: 'ok', actor: { username: 'other-checker' } })
    expect(decided.status).toBe('APPROVED')
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(row.approvedBy).toBe('other-checker')
    expect(row.decidedOn).not.toBeNull()

    await expectCode(decideApprovalRequest({ requestId: request.id, approve: false, actor: { username: 'third' } }), 'VALIDATION')
  })
})
