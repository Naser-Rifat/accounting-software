# Navigation & Routes

Sidebar groups to routes. Route segment names are final; do not rename.

| Group | Item | Route |
|---|---|---|
| — | Dashboard | `/` |
| Students | Students | `/students` |
| | Leads | `/students/leads` |
| | Counseling | `/students/counseling` |
| | Applications | `/applications` |
| | Documents | `/documents` |
| Universities | Universities | `/universities` |
| | Programs | `/universities/programs` |
| | Commission Agreements | `/universities/agreements` |
| Commission | University Commission | `/commission` |
| | Commission Claims | `/commission/claims` |
| | Commission Receivables | `/commission/receivables` |
| | Counselor Commission | `/commission/counselor` |
| | Agent Commission | `/commission/agent` |
| Sales | Student Invoices | `/sales/invoices` |
| | Receipts | `/sales/receipts` |
| | Credit Notes | `/sales/credit-notes` |
| | Refunds | `/sales/refunds` |
| Tuition (pass-through) | Collections | `/finance/tuition/collections` |
| | Remittances | `/finance/tuition/remittances` |
| | Held Balance (trust) | `/finance/tuition/held` |
| Purchases | Expense Bills | `/purchases/bills` |
| | Payments | `/purchases/payments` |
| | Debit Notes | `/purchases/debit-notes` |
| | Vendors | `/purchases/vendors` |
| Banking | Bank & Cash Accounts | `/banking/accounts` |
| | Contra / Transfers | `/banking/transfers` |
| | Bank Reconciliation | `/banking/reconciliation` |
| Accounting | Chart of Accounts | `/accounting/accounts` |
| | Vouchers (all) | `/accounting/vouchers` |
| | Journal Voucher | `/accounting/vouchers/new` |
| | General Ledger | `/accounting/ledger` |
| | Party Ledger | `/accounting/party-ledger` |
| | Trial Balance | `/accounting/trial-balance` |
| | Cost Centers | `/accounting/cost-centers` |
| | Period Close | `/accounting/period-close` |
| | Year-End Close | `/accounting/year-end` |
| | Opening Balances | `/accounting/opening-balances` |
| Reports | Student Reports | `/reports/students` |
| | University Reports | `/reports/universities` |
| | Commission Reports | `/reports/commission` |
| | Financial Reports | `/reports/financial` |
| | Tax Reports | `/reports/tax` |
| Administration | Users & Roles | `/admin/users` |
| | Branches | `/admin/branches` |
| | Approval Workflow | `/admin/approvals` |
| | Currencies & Rates | `/admin/currencies` |
| | Tax Codes | `/admin/tax-codes` |
| | Fiscal Years | `/admin/fiscal-years` |
| | Notification Rules | `/admin/notification-rules` |
| | Audit Logs | `/admin/audit` |
| | Settings | `/admin/settings` |
| | — Company | `/admin/settings/company` |
| | — Tax | `/admin/settings/tax` |
| | — Numbering | `/admin/settings/numbering` |
| | — Fiscal Year | `/admin/settings/fiscal-year` |

Detail routes follow `/<list>/[id]`; create and edit follow `/<list>/new` and
`/<list>/[id]/edit`.

**Not in the sidebar** — both live in the top bar on every page:

| Feature | Trigger | Full page | Spec |
|---|---|---|---|
| Global search | `Ctrl/Cmd + K` | `/search` | [modules/14](modules/14-global-search.md) |
| Notifications | Bell icon | `/notifications` | [modules/15](modules/15-notifications.md) |

The original "Finance" group is split into **Sales** (debits a receivable),
**Purchases** (credits a payable) and **Banking** (moves cash), so each screen
binds to exactly one voucher type. Same features, regrouped.
