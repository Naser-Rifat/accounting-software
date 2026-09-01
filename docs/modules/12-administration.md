# 12. Administration

Auth is deferred (see [11-decisions.md](../11-decisions.md) #2), but these tables
ship in the first migration so nothing needs reshaping later. The accounting
configuration below is **not** deferred — the ledger cannot run without it.

## Users & roles

`User { name, email, role, active, counselorId?, agentId? }`

| Role | Can |
|---|---|
| ADMIN | Everything: settings, users, fiscal years, reopening periods |
| ACCOUNTANT | All finance, GL, manual vouchers, approvals, period close, reports |
| COUNSELOR | Own students and applications; read-only commission on those |
| AGENT | Own referred students; own commission statement only |
| VIEWER | Read-only dashboards and reports |

Segregation of duties: the user who raises a document should not be the one who
approves it. Enforce on approval actions and flag violations in the audit log.

## Approval workflow

`ApprovalRequest { entityType, entityId, requestedBy, approvedBy, status, note, decidedOn }`

Approval-gated actions:

| Action | Why |
|---|---|
| Commission APPROVED | Recognises revenue |
| Commission adjustment or write-off | Reduces revenue or creates bad debt |
| Student refund / credit note | Reduces revenue, moves cash |
| Expense bill above `expense.approvalThreshold` | Spend control |
| Internal commission payout | Moves cash |
| Manual journal voucher | Bypasses the document flow |
| Period reopen, year-end close | Changes what is locked |

## Audit log

`AuditLog { userId, action, entity, entityId, before, after, ip, createdAt }`

Append-only — never updated or deleted. Written for every create, status
transition, approval, posting, and reversal on a financial entity. This is the
record an auditor reads; treat it as part of the product, not as debug logging.

## Accounting configuration (required before go-live)

| Screen | Contents |
|---|---|
| `/admin/currencies` | Currency list, base currency (set once), exchange rate entry and history |
| `/admin/tax-codes` | VAT and withholding codes with rates and GL accounts |
| `/admin/fiscal-years` | Create a year, generate its periods, open/close, year-end |
| `/accounting/opening-balances` | Go-live migration ([08-period-close.md](../08-period-close.md)) |

## Settings

Full specification: **[16-settings.md](16-settings.md)** — sections, every key,
the effective-dating and locking rules, and the admin screens.

In short: rates, thresholds, patterns and company identity are configuration,
never constants in code ([11-decisions.md](../11-decisions.md) C2–C4). Phase 1
ships four sections — Company, Tax, Numbering, Fiscal Year. Values that affect
posted documents are effective-dated rather than overwritten, and settings that
prior postings depend on (base currency, timezone, fiscal year start) lock
permanently once used.

## Branches

`Branch { code, name, address, costCenterId, isActive }`

The agency runs multiple branches on **one set of books**. Each branch maps to a
cost center, and every posting carries it, giving per-branch P&L without
duplicating the chart of accounts. Counselors belong to a branch; their students
and applications inherit it, and that is what stamps the branch onto each voucher.

Screen: `/admin/branches`.

## Screens

`/admin/users` · `/admin/approvals` (pending queue with the requester, amount and
document) · `/admin/audit` (filter by user, entity, date, action) · `/admin/settings`
