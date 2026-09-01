# 11. Reports

Every report: date-range filter, on-screen table, CSV + PDF export, and a header
stating entity, currency, date range, and run timestamp.

## Statutory financial reports (`/reports/financial`)

The set any standard package must produce. All read from `JournalLine` only.

| Report | Definition |
|---|---|
| Trial Balance | Every account with debit/credit totals and closing balance. Must foot to a zero difference — flag loudly if not. |
| Profit & Loss | 4xxx income less 5xxx direct costs = gross profit; less 6xxx opex = operating profit; plus/less 7xxx and 8xxx = net profit. With prior-period comparison. |
| Balance Sheet | Assets = Liabilities + Equity as of a date, with Current Year Earnings (3900) carrying the P&L result. Must balance. |
| Cash Flow | Movements on 1010/1020, classified operating / investing / financing (indirect method from the P&L, or direct from cash lines). |
| General Ledger | Per account: opening balance, every line, running balance, closing balance. |
| Party Ledger / Statement of Account | Same for one student, university, vendor, counselor or agent. |
| Receivables Aging | 1110 and 1120 by party, bucketed Current / 1–30 / 31–60 / 61–90 / 90+ from invoice due date. |
| Payables Aging | 2010 and 2020 by party, same buckets. |
| Day Book | All vouchers for a date or range, in posting order. |
| Cash Book / Bank Book | Receipts and payments per cash or bank account with running balance. |
| Control Account Reconciliation | Each control account vs its subsidiary total; difference must be zero. |
| Branch P&L | P&L by cost center, plus a consolidated column. One set of books, per-branch results. |
| Tuition Held (trust) | Client money held per student and university, aged, reconciled to 2130. Never presented as agency cash. |

## Tax reports (`/reports/tax`)

| Report | Contents |
|---|---|
| VAT Summary | Output VAT (2310) less input VAT (1320) for the period, net payable |
| Withholding Suffered | 1310 movements by university, with certificate references — supports the tax credit claim |
| Withholding Deducted | 2320 movements by payee, for statutory filing and payee certificates |
| FX Gain/Loss | 7100 realised and 7110 unrealised, separately, by currency |

## Commission reports (`/reports/commission`)

| Report | Columns |
|---|---|
| Commission Pipeline | Expected and eligible by university and intake — pipeline only, clearly labelled as not revenue |
| Commission Register | Every commission: student, university, base, rate, expected, adjustments, net, status |
| University Commission Statement | Per university: opening, billed, received, credit notes, adjustments, closing — the document reconciled against the university's own statement |
| Pending Commission | Approved and billed but unreceived, with age |
| Received Commission | Receipts by date, university, claim, gross, withheld, net |
| Counselor / Agent Commission | Earned, approved, paid, withheld, pending per payee |
| Commission Profitability | Per application: commission income less internal commission less directly attributed costs |

## Student reports (`/reports/students`)

| Report | Columns |
|---|---|
| Student-wise Revenue | Invoiced, received, due, commission earned from that student, net contribution |
| Application Status | Student, university, program, intake, status, days in current status |
| Enrollment Report | Intake, university, enrolled count, tuition volume |
| Visa Success | By counselor and by university: applied, approved, refused, success % |

## University reports (`/reports/universities`)

| Report | Columns |
|---|---|
| University-wise Students | Applications, offers, enrolled, conversion % |
| University-wise Enrollment | By intake, enrolled, tuition volume |
| University-wise Commission | Expected, approved, billed, received, outstanding |

## Rules

1. Financial reports read **only** from `JournalLine`. Never recompute a financial
   figure from source tables — the reports and the ledger would drift.
2. Operational reports (funnels, conversion, visa success) read from operational
   tables and must not present themselves as financial figures.
3. Trial balance, Balance Sheet, and control reconciliation each carry a hard
   assertion; a failure is surfaced as an error, never silently rounded away.
4. Every report is reproducible: the same parameters on the same data give the same
   numbers, and a run against a closed period never changes.
