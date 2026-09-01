# Posting Matrix

Every business event and the exact voucher it produces. Account codes from
[04-chart-of-accounts.md](04-chart-of-accounts.md). All GL amounts are in **base currency**.

## University commission (core)

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 1 | Commission EXPECTED / ELIGIBLE | — | *no posting — pipeline only* | |
| 2 | Commission APPROVED (obligation satisfied, not yet billed) | JV | 1130 Accrued Commission Income | 4010 Commission Income |
| 3 | Claim (invoice) issued to university | SI | 1120 AR – Universities | 1130 Accrued Commission Income |
| 4 | Commission reduced (adjustment / scholarship) | CN | 4010 Commission Income | 1130 or 1120 |
| 5 | Commission increased (bonus) | SI | 1130 or 1120 | 4010 Commission Income |
| 6 | Receipt from university, no tax | RV | 1020 Bank | 1120 AR – Universities |
| 7 | Receipt with tax deducted at source | RV | 1020 Bank + 1310 Withholding Tax Receivable | 1120 AR – Universities |
| 8 | FX difference on receipt | RV | 7100 Realised FX (or credit) | 1120 AR – Universities |
| 9 | Commission cancelled before billing | JV | 4010 Commission Income | 1130 Accrued Commission |
| 10 | Commission written off as uncollectible | JV | 7200 Bad Debt Expense | 1120 AR – Universities |
| 11 | University pays in advance | RV | 1020 Bank | 2120 Commission Received in Advance |

## Student fees

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 12 | Invoice issued | SI | 1110 AR – Students | 40xx Fee Income (+ 2310 VAT Payable if taxable) |
| 13 | Discount granted on invoice | SI | 4090 Refunds & Discounts | 1110 AR – Students |
| 14 | Payment received | RV | 1010 Cash / 1020 Bank | 1110 AR – Students |
| 15 | Payment received before invoicing | RV | 1020 Bank | 2110 Student Advances |
| 16 | Advance applied to a later invoice | JV | 2110 Student Advances | 1110 AR – Students |
| 17 | Refund approved (credit note) | CN | 4090 Refunds & Discounts | 1110 AR – Students |
| 18 | Refund paid out | PV | 1110 AR – Students | 1020 Bank |
| 19 | Invoice cancelled after posting | CN | 40xx Fee Income | 1110 AR – Students |

## Expenses

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 20 | Bill approved (unpaid) | PB | 5xxx / 6xxx Expense | 2010 AP – Vendors |
| 21 | Bill paid | PV | 2010 AP – Vendors | 1010 Cash / 1020 Bank |
| 22 | Bill paid with tax withheld | PV | 2010 AP – Vendors | 1020 Bank + 2320 Withholding Tax Payable |
| 23 | Paid directly, no bill | PV | 5xxx / 6xxx Expense | 1010 Cash / 1020 Bank |
| 24 | Bill reduced after posting | DN | 2010 AP – Vendors | 5xxx / 6xxx Expense |
| 25 | Prepaid expense recorded | PB | 1220 Prepaid Expenses | 2010 AP – Vendors |
| 26 | Prepaid amortised monthly | JV | 6xxx Expense | 1220 Prepaid Expenses |
| 27 | Expense accrued at period end | JV | 6xxx Expense | 2030 Accrued Expenses |

## Counselor & agent commission

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 28 | Accrued (pipeline only) | — | *no posting* | |
| 29 | Approved — matched to the period of the related income | PB | 5010 / 5020 Commission Expense | 2020 AP – Counselors & Agents |
| 30 | Paid | PV | 2020 AP – Counselors & Agents | 1020 Bank |
| 31 | Paid with tax withheld | PV | 2020 AP – Counselors & Agents | 1020 Bank + 2320 Withholding Tax Payable |
| 32 | Cancelled after approval | DN | 2020 AP – Counselors & Agents | 5010 / 5020 Commission Expense |

## Banking, payroll, assets

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 33 | Cash deposited to bank / transfer between banks | CV | 1020 Bank | 1010 Cash |
| 34 | Bank charges | JV | 6120 Bank Charges | 1020 Bank |
| 35 | Salary accrued | JV | 6010 Salaries & Wages | 2040 Salaries Payable + 2320 Withholding |
| 36 | Salary paid | PV | 2040 Salaries Payable | 1020 Bank |
| 37 | Asset purchased | PB | 15xx Fixed Asset | 2010 AP / 1020 Bank |
| 38 | Monthly depreciation | JV | 6130 Depreciation Expense | 1590 Accumulated Depreciation |

## Tax settlement

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 39 | VAT settled with authority | PV | 2310 VAT Payable | 1020 Bank |
| 40 | Withheld tax remitted | PV | 2320 Withholding Tax Payable | 1020 Bank |
| 41 | AIT receivable offset against income tax | JV | 2330 Income Tax Payable | 1310 Withholding Tax Receivable |

## Period end & opening

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 42 | Unrealised FX revaluation of AR | JV | 1120 AR – Universities (or credit) | 7110 Unrealised FX |
| 43 | Year-end close of income | CL | 4xxx Income accounts | 3900 Current Year Earnings |
| 44 | Year-end close of expense | CL | 3900 Current Year Earnings | 5xxx / 6xxx Expense accounts |
| 45 | Transfer to retained earnings | CL | 3900 Current Year Earnings | 3200 Retained Earnings |
| 46 | Opening balances at go-live | OB | Asset accounts | Liability / Equity accounts + 9100 |
| 47 | Unidentified receipt | RV | 1020 Bank | 9000 Suspense |
| 48 | Suspense cleared once identified | JV | 9000 Suspense | 1110 / 1120 AR |

## Pass-through tuition (client money)

Only where the agency collects tuition on the university's behalf.
Full module: [modules/13-tuition-remittance.md](modules/13-tuition-remittance.md).

| # | Event | Vch | Debit | Credit |
|---|---|---|---|---|
| 49 | Tuition collected from student | RV | 1020 Bank | 2130 Tuition Held for Remittance |
| 50 | Remitted to the university | PV | 2130 Tuition Held for Remittance | 1020 Bank |
| 51 | Wire charges borne by the agency | PV | 6120 Bank Charges | 1020 Bank |
| 52 | Wire charges recovered from the student | SI | 1110 AR – Students | 4080 Other Operating Income |
| 53 | FX difference between collection and remittance | JV | 7100 Realised FX (or credit) | 2130 Tuition Held for Remittance |
| 54 | Held tuition refunded to the student | PV | 2130 Tuition Held for Remittance | 1020 Bank |

No 4xxx income account appears in rows 49, 50 or 54. Pass-through money is never
revenue — if it credits income, that is a bug.

## Rules

1. Commission `EXPECTED` never posts. Recognition begins at row 2.
2. Rows 2 and 3 keep unbilled and billed receivables separate — standard practice,
   and required for a correct AR aging (aging runs from the invoice date).
3. Every receipt and payment names a bank or cash account. No floating money.
4. Never post directly to a control account outside its subledger flow.
