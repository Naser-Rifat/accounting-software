# Decisions

All dated 2026-08-31.

## Confirmed by the client

| # | Decision | Consequence |
|---|---|---|
| C1 | Base currency **BDT** | GL and statements in BDT; foreign receipts convert at transaction-date rate. Locked after the first posting. |
| C2 | Fiscal year start **from settings** | `company.fiscalYearStart` (default 07-01) drives periods, year-end and voucher series. Locked once a year exists. |
| C3 | VAT rate **from settings** | Tax codes hold rates, editable in admin. Ships enabled; set to zero if not registered. |
| C4 | Universities **deduct tax at source** | Withholding path active. Deducted tax to 1310, claimable — never netted off income. Rate per country/university. |
| C5 | Commission structure **varies by university** | Agreement carries a payment schedule; one application generates one commission per instalment, each with its own lifecycle. |
| C6 | Agency **sometimes collects tuition** | Adds [module 13](modules/13-tuition-remittance.md): client money against liability 2130, never revenue. Flag on the university picks the route. |
| C7 | Existing books **must be migrated** | Opening-balance module required: account balances plus every open invoice, claim and bill. See [08-period-close.md](08-period-close.md). |
| C8 | **Multiple branches, one set of books** | Branch is a mandatory cost-center dimension on every posting, giving per-branch P&L from one ledger. |
| C9 | Notifications **in-app only** in phase 1 | Bell + inbox, no external provider or cost. Channels are modelled from the start, so email/SMS/WhatsApp is later a provider adapter plus config, not a rewrite. [modules/15](modules/15-notifications.md) |
| C10 | Scheduled scans run via a **provider-agnostic cron endpoint** | `POST /api/cron/run-reminders` behind a secret, callable by Vercel Cron, crontab or any scheduler. Hosting stays undecided without blocking the feature. |
| C11 | **Daily digest**, with approvals and escalations immediate | One summary item per morning keeps the inbox useful; only blocking items interrupt. |

**Principle behind C2–C4:** rates, thresholds and periods are configuration, never
constants. Anything an accountant might renegotiate lives in `Setting` or `TaxCode`.

## Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | PostgreSQL + Prisma | Exact decimals, aging queries, ~45 related tables, typed migrations. |
| D2 | Auth deferred | Commission engine first. `User`/`Role` ship in migration 1 so nothing reshapes later. |
| D3 | Schema-first build order | Cross-module reports would otherwise force reshaping. |
| D4 | shadcn/ui | Owned components; strong data-table and form primitives for dense screens. |
| D5 | Full standard-accounting model | Client requirement. Retrofitting vouchers, control accounts and period locking later would mean re-migrating every posted transaction. |
| D6 | Revenue recognised at commission APPROVED | Accrual basis. EXPECTED is a forecast; cash-receipt recognition would be cash-basis. |
| D7 | Unbilled (1130) split from billed AR (1120) | Aging must run from invoice date, not enrollment date. |
| D8 | Amount + currency + rate + base on every money row; 7100 realised vs 7110 unrealised | Single-currency GL with auditable FX. |
| D9 | Internal commission is a direct cost (5010/5020), on commission not tuition, accrued at approval | Matching principle; makes gross margin per student computable. |
| D10 | No hard deletes in the ledger | Audit trail. Corrections are reversals, credit notes, debit notes. |
| D11 | Withholding suffered is a receivable (1310) | Tax paid on the agency's behalf and claimable; netting would understate revenue. |
| D12 | Menu grouped Sales / Purchases / Banking | Each screen binds to one voucher type. |
| D13 | Pass-through tuition is a liability (2130), reported apart from operating cash | Client money. Showing it as cash overstates the agency's position. |
| D14 | **Prisma pinned to 7.10.0**, not the `latest` tag | npm's `latest` for `prisma` is `8.0.0-rc.12` — a release candidate with a different platform CLI that "may change quickly" per its own README, and it mismatched the stable `@prisma/client` 7.10.0. A ledger needs predictable migrations. Revisit when 8.x is stable. |
| D15 | **Accounting core is schema file 01** and is built first | The system exists to record the accounting department's transactions; students, universities and applications are feeders that generate vouchers. Build order follows that priority. |

## Still open

Each has a working default, so nothing is blocked.

| # | Question | Assumed |
|---|---|---|
| O1 | Default VAT rate; which fee types are taxable | 15%, all service fees |
| O2 | Withholding rate per country | Zero; set before go-live |
| O3 | Commission eligibility trigger per university | Agreement field, default ENROLLMENT |
| O4 | Sub-agent paid on gross or net commission | `internal_commission.base` = NET |
| O5 | Counselor paid at approval or at receipt | `internal_commission.payout_trigger` = APPROVED |
| O6 | Separate client-money bank account for tuition? | `BankAccount.isClientAccount`; warns if mixed |
| O7 | Go-live date; how much history migrates | Balances + open items, no historical transactions |
| O8 | Branch list; one branch per counselor? | One branch per counselor, inherited by their students |
| O9 | Fixed assets and depreciation in phase 1? | Accounts exist; no asset register module |
| O10 | Approval thresholds and approvers | `expense.approvalThreshold` = 50000; ADMIN approves |
