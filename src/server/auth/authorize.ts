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
