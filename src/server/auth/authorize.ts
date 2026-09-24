import type { UserRole } from '@/generated/prisma/enums'

/**
 * Role rules — docs/modules/12-administration.md.
 *
 * Kept as pure predicates so both the UI (to hide an action) and the Server
 * Action (to refuse it) ask the same question. Hiding a button is a courtesy;
 * the check in the action is the actual control.
 */

export function canPostManualJournal(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

export function canPostToSoftClosedPeriod(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

export function canReverseVoucher(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

export function canClosePeriod(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

export function canReopenPeriod(role: UserRole): boolean {
  return role === 'ADMIN'
}

export function canManageChartOfAccounts(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

/** Universities, programs and commission agreements. Everyone else reads. */
export function canManageUniversities(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

/** Students, applications, documents and counseling notes. */
export function canManageStudents(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'COUNSELOR'
}

/** Branches, counselors, agents and intakes. */
export function canManageSetup(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

/** Commission pipeline, claims, receipts and payouts — the finance roles. */
export function canManageCommission(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

// --- Administration — docs/modules/12-administration.md role table -------

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN'
}

/** Users, roles and password resets. */
export function canManageUsers(role: UserRole): boolean {
  return role === 'ADMIN'
}

/** Company, tax and fiscal-year settings (not tax codes or numbering, which accountants own). */
export function canManageSettings(role: UserRole): boolean {
  return role === 'ADMIN'
}

/** The audit log is read by the people who keep the books. */
export function canViewAuditLog(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

/** Decide approval requests. Deciding one's own request is refused separately. */
export function canDecideApprovals(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}

/**
 * Who may approve a submitted voucher into the ledger.
 *
 * Being allowed to approve is not the same as being allowed to approve *this*
 * voucher: the engine separately refuses anyone approving their own submission,
 * and that check is the one that actually implements maker-checker.
 */
export function canApproveVoucher(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'ACCOUNTANT'
}
