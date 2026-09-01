# Accounting Standards — binding rules

This system must behave like standard accounting software. These rules are not
optional and not negotiable per-module. If a feature conflicts with a rule here,
the rule wins.

## The ten rules

| # | Rule | Enforcement |
|---|---|---|
| 1 | **Double entry.** Every posting has equal debits and credits. | Validated in `postEntry()` before commit; DB constraint on entry totals |
| 2 | **Accrual basis.** Revenue and expense are recognised when earned/incurred, not when cash moves. Cash-basis is a *reporting view*, never the storage model. | Posting matrix (06) |
| 3 | **Revenue recognition.** Income is recognised when the performance obligation is satisfied — for commission, when the university's eligibility condition is met. Not at forecast, not at cash receipt. | 02-status-flows, modules/04 |
| 4 | **Matching.** Costs directly attributable to revenue (counselor/agent commission) are accrued in the same period as that revenue. | modules/08 |
| 5 | **Immutability.** A posted voucher is never edited or deleted. Corrections are made by reversal or credit/debit note, which leaves both the error and the fix visible. | No UPDATE/DELETE on posted JournalEntry; enforced in `lib/accounting` |
| 6 | **Sequential numbering.** Each voucher type has a gapless, sequential series per fiscal year. Cancelled documents keep their number and are marked cancelled — numbers are never reused. | 05-voucher-types |
| 7 | **Control accounts.** AR/AP control accounts are posted to only by their subsidiary ledgers. No manual journal may touch a control account directly. | `Account.isControl` blocks manual JV lines |
| 8 | **Period control.** No posting into a closed accounting period or fiscal year. Backdating within an open period is allowed and logged. | 08-period-close |
| 9 | **Audit trail.** Every posting records who, when, and from which source document. Append-only. | `AuditLog`, `JournalEntry.createdBy/sourceType/sourceId` |
| 10 | **Trial balance always balances.** Total debits equal total credits at every point in time, for any date range. | Reconciliation check + a monitored report |

## Accounting equation

`Assets = Liabilities + Equity + (Income − Expenses)`

The Balance Sheet must tie to the P&L through Current Year Earnings (3900).
If it does not, the system has a bug — surface it loudly, do not hide the difference.

## Normal balances

| Type | Increases with | Normal balance |
|---|---|---|
| ASSET | Debit | Debit |
| EXPENSE | Debit | Debit |
| LIABILITY | Credit | Credit |
| EQUITY | Credit | Credit |
| INCOME | Credit | Credit |

Contra accounts (Accumulated Depreciation, Refunds & Discounts, Drawings) carry
the opposite balance and are flagged `isContra` so reports present them as
deductions rather than as negative balances.

## Subsidiary ledgers

Detail lives in a subledger; the GL holds only the control-account total.

| Control account | Subsidiary ledger | Must reconcile |
|---|---|---|
| 1120 AR – Universities | Commission claims per university | Sum of open claims == 1120 balance |
| 1110 AR – Students | Student invoices per student | Sum of unpaid invoices == 1110 balance |
| 2010 AP – Vendors | Expense bills per vendor | Sum of unpaid bills == 2010 balance |
| 2020 AP – Counselors & Agents | Internal commission per person | Sum of unpaid == 2020 balance |

A nightly (or on-demand) reconciliation report compares each control balance to
its subledger total. A non-zero difference is a defect, not a rounding issue.

## Correction methods — in order of preference

| Situation | Correct method | Never |
|---|---|---|
| Wrong amount on an unposted draft | Edit the draft | — |
| Wrong amount on a posted sales invoice | Credit note | Edit the invoice |
| Wrong amount on a posted purchase bill | Debit note | Edit the bill |
| Wrong account on a posted voucher | Reversing JV + correct JV | Edit the line |
| Whole document raised in error | Cancel + reverse (number retained) | Delete |

## Materiality and rounding

- Store money at `Decimal(18,2)`; exchange rates at `Decimal(18,8)`; percentages at `Decimal(9,4)`.
- Round only at presentation. Never round an intermediate calculation.
- Allocation differences (e.g. splitting a receipt across claims) go to the last
  line, or to 7900 Rounding Difference if immaterial — never silently dropped.
