import 'server-only'

/**
 * Typed accounting errors.
 *
 * The posting engine refuses bad input rather than writing a ledger that cannot
 * be trusted. Each error names the rule it enforces, so a failure points at
 * docs/03-accounting-standards.md rather than at a stack trace.
 */

export type AccountingErrorCode =
  | 'UNBALANCED_ENTRY'
  | 'EMPTY_ENTRY'
  | 'INVALID_LINE'
  | 'UNKNOWN_ACCOUNT'
  | 'GROUP_ACCOUNT'
  | 'INACTIVE_ACCOUNT'
  | 'CONTROL_ACCOUNT_REQUIRES_PARTY'
  | 'PARTY_ON_NON_CONTROL_ACCOUNT'
  | 'MANUAL_ENTRY_ON_CONTROL_ACCOUNT'
  | 'NO_OPEN_PERIOD'
  | 'PERIOD_CLOSED'
  | 'PERIOD_SOFT_CLOSED'
  | 'FISCAL_YEAR_CLOSED'
  | 'BACKDATING_NOT_ALLOWED'
  | 'ALREADY_POSTED'
  | 'NOT_PENDING_APPROVAL'
  | 'SELF_APPROVAL'
  | 'NOT_POSTED'
  | 'ALREADY_REVERSED'
  | 'IMMUTABLE_VOUCHER'
  | 'MISSING_EXCHANGE_RATE'
  | 'MISSING_COST_CENTER'
  | 'SERIES_NOT_CONFIGURED'
  | 'DUPLICATE_ACCOUNT_CODE'
  | 'INVALID_ACCOUNT_PARENT'

export class AccountingError extends Error {
  readonly code: AccountingErrorCode
  readonly details?: Record<string, unknown>

  constructor(
    code: AccountingErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AccountingError'
    this.code = code
    this.details = details
  }
}

export function isAccountingError(e: unknown): e is AccountingError {
  return e instanceof AccountingError
}
