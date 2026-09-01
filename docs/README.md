# Docs Index

Study-abroad agency ERP built to standard accounting-software rules.
Core value: **university commission tracking**, on a proper double-entry ledger.

Read only the file you need. Each file is self-contained and under ~110 lines.

## Cross-cutting

| File | Read when |
|---|---|
| [00-overview.md](00-overview.md) | You need the big picture, actors, money flows |
| [01-domain-model.md](01-domain-model.md) | You are writing schema, queries, or relations |
| [02-status-flows.md](02-status-flows.md) | You touch any status or state transition |
| [03-accounting-standards.md](03-accounting-standards.md) | **Before any accounting code.** The ten binding rules |
| [04-chart-of-accounts.md](04-chart-of-accounts.md) | You need an account code |
| [05-voucher-types.md](05-voucher-types.md) | You create a document that posts to the ledger |
| [06-posting-matrix.md](06-posting-matrix.md) | You need the exact debit/credit for an event |
| [07-multi-currency-and-tax.md](07-multi-currency-and-tax.md) | Foreign currency, VAT, or withholding tax is involved |
| [08-period-close.md](08-period-close.md) | Fiscal years, period locking, closing, opening balances |
| [09-navigation.md](09-navigation.md) | You build menus, routes, or page layout |
| [10-conventions.md](10-conventions.md) | **Before writing ANY code.** Stack, code rules, layout |
| [11-decisions.md](11-decisions.md) | You wonder why something was designed this way |
| [12-project-structure.md](12-project-structure.md) | **Before creating any file.** Backend/frontend split, layering, import rules |

## Modules

| # | File | Module |
|---|---|---|
| 1 | [modules/01-students.md](modules/01-students.md) | Student Management |
| 2 | [modules/02-universities.md](modules/02-universities.md) | University Management |
| 3 | [modules/03-applications.md](modules/03-applications.md) | Application Management |
| 4 | [modules/04-university-commission.md](modules/04-university-commission.md) | **University Commission (core)** |
| 5 | [modules/05-university-receivable.md](modules/05-university-receivable.md) | University Receivable |
| 6 | [modules/06-student-payments.md](modules/06-student-payments.md) | Student Payments |
| 7 | [modules/07-expenses.md](modules/07-expenses.md) | Expense Management |
| 8 | [modules/08-internal-commission.md](modules/08-internal-commission.md) | Agent / Counselor Commission |
| 9 | [modules/09-accounting.md](modules/09-accounting.md) | Accounting / General Ledger |
| 10 | [modules/10-dashboard.md](modules/10-dashboard.md) | Financial Dashboard |
| 11 | [modules/11-reports.md](modules/11-reports.md) | Reports |
| 12 | [modules/12-administration.md](modules/12-administration.md) | Users, Roles, Audit, Settings |
| 13 | [modules/13-tuition-remittance.md](modules/13-tuition-remittance.md) | Tuition Collection & Remittance (client money) |
| 14 | [modules/14-global-search.md](modules/14-global-search.md) | Global Search |
| 15 | [modules/15-notifications.md](modules/15-notifications.md) | Notifications & Reminders |
| 16 | [modules/16-settings.md](modules/16-settings.md) | Settings — company, tax, numbering, fiscal year |

## Single source of truth

Each fact lives in exactly one file. Module docs **reference** posting-matrix row
numbers; they never restate debits and credits. Keep it that way — duplication
costs tokens on every read and creates two versions of the truth to drift apart.

| Fact | Owned by |
|---|---|
| Account codes | 04 |
| Debits and credits | 06 |
| Status enums | 02 |
| Entity fields | 01 |
| Routes | 09 |
| Where a file goes | 12 |
| Rates, thresholds, config keys | modules/12 |

## Reading paths

| Task | Read |
|---|---|
| Any code at all | 10 → 12 |
| A non-financial module (students, universities) | 10 → 12 → the module file |
| Anything that touches money | 10 → 12 → 03 → 06 → the module file |
| The posting engine | 03 → 04 → 05 → 06 → 07 → 08 |
| Financial reports | 03 → 04 → modules/11 |
| Schema work | 01 → 03 → the module files |
