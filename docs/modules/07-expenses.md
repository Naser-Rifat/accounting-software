# 7. Expense Management

Everything the agency spends. Purchase-side documents: the vendor is a **party**,
the bill is a **purchase bill (PB)**, the subsidiary ledger behind control
account 2010.

## Categories (seeded, each mapped to a GL account)

| Category | GL |
|---|---|
| Visa & Immigration Costs | 5040 |
| University Application Costs | 5030 |
| Salaries & Wages | 6010 |
| Office Rent | 6020 |
| Utilities | 6030 |
| Marketing & Advertising | 6040 |
| University Events & Fairs | 6050 |
| Travel & Conveyance | 6060 |
| Software Subscriptions | 6070 |
| Professional & Legal Fees | 6080 |
| Communication | 6090 |
| Printing & Stationery | 6100 |
| Repairs & Maintenance | 6110 |
| Bank Charges | 6120 |
| Miscellaneous | 6900 |

Counselor and agent commission are **not** entered here — they are posted by
[module 8](08-internal-commission.md) to 5010/5020 as direct costs of revenue.
The 5000-range is cost of revenue; the 6000-range is operating overhead. Keeping
them apart is what makes gross margin per student computable.

Category-to-account mapping is data, not code.

## Data

```
ExpenseBill { billNo, partyId (vendor), categoryId, incurredOn, dueOn, amount,
              currency, fxRate, baseAmount, taxCodeId?, taxAmount, vendorRef,
              description, receiptUrl, status, applicationId?, costCenterId?,
              recurring, recurrenceFrequency }
```

`applicationId` is optional — set it for student-specific costs so per-student
profitability is computable. `costCenterId` carries branch/campaign analysis.

## Flow

`DRAFT -> SUBMITTED -> APPROVED -> PARTIALLY_PAID -> PAID`; off-ramp `REJECTED`, `CANCELLED`.

Entries: rows **20–24** of [06-posting-matrix.md](../06-posting-matrix.md)
(approval, payment, payment with withholding, direct payment, debit note).

**Posting happens at APPROVED, not at payment** — accrual basis. The expense
belongs to the period it was incurred in, regardless of when it is settled.

Payments use the same `Payment` + `PaymentAllocation` model as module 8, so one
payment can settle several bills.

## Period-end items

| Item | Treatment | Row |
|---|---|---|
| Prepaid (annual subscription, advance rent) | Dr 1220 Prepaid Expenses at bill; amortise monthly to expense | 25, 26 |
| Incurred but not billed at period end | Accrue Dr expense / Cr 2030 Accrued Expenses; reverse next period | 27 |
| Recurring (rent, salary, subscriptions) | `recurring` flag + frequency generates the next bill as DRAFT | — |

## Rules

1. A bill above `expense.approvalThreshold` requires ADMIN approval
   ([12-administration.md](12-administration.md)).
2. Approving into a closed period is rejected.
3. Posted bills are corrected by debit note, never edited.
4. Every payment names a bank or cash account.

## Screens

`/purchases/bills` (filters: category, vendor, status, date; totals) ·
`/purchases/bills/new` · `/purchases/bills/[id]` with approve and pay actions ·
`/purchases/payments` · `/purchases/debit-notes` · `/purchases/vendors` with
vendor ledger and aging
