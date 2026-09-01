# 8. Agent / Counselor Commission

What the agency pays its own counselors and sub-agents. A payable mirroring
module 4, and a **direct cost of revenue** — not an operating expense.
Subsidiary ledger behind control account 2020.

## Data

```
InternalCommission { applicationId, commissionId, partyId (counselor or agent),
                     rateType, rate, baseAmount, earnedAmount, currency, fxRate,
                     baseCurrencyAmount, status, approvedOn, paidOn }
```

`partyId` points at a Party of type COUNSELOR or AGENT. Rate defaults from the
Counselor/Agent record and is overridable per application, then snapshotted.

## Base

`baseAmount` is the **university commission net amount** for that application, not
the tuition fee. A counselor earning 10% on a USD 1,500 commission earns USD 150.

Governed by setting `internal_commission.base` = NET (default) or GROSS — NET means
after commission adjustments, GROSS means before.

## Flow

`ACCRUED -> APPROVED -> PARTIALLY_PAID -> PAID`; off-ramp `CANCELLED`.

Entries: rows **28–32** of [06-posting-matrix.md](../06-posting-matrix.md).
ACCRUED does not post; APPROVED books the expense against 2020; payment (with or
without withholding) clears it; cancellation reverses by debit note.

## Matching

This is the point of the module. Accrue only when the related university
`Commission` reaches APPROVED, and post the expense **in the same period as that
commission income**. The cost of earning revenue must land in the period the
revenue is recognised, or gross margin per period is meaningless.

Consequences:

1. No payable is booked on money the agency has not earned.
2. If the university commission is later adjusted down or cancelled, cascade a
   proportional adjustment to the internal commission (debit note, row 32).
3. Setting `internal_commission.payout_trigger` controls **when cash may leave**
   (APPROVED or RECEIVED) — it does **not** change when the expense is recognised.
   Recognition is always at approval. Payment timing is a cash-flow policy, not an
   accounting one.

## Rules

1. Exactly one of counselor or agent per record.
2. Withholding tax on payouts follows [07-multi-currency-and-tax.md](../07-multi-currency-and-tax.md).
3. Sum of unpaid internal commission must equal the 2020 control balance.
4. Payout is an approval-gated action.

## Screens

| Route | Contents |
|---|---|
| `/commission/counselor` | Person, students, applications, rate, earned, approved, paid, pending |
| `/commission/agent` | Same for sub-agents |
| `/commission/counselor/[id]` | Contributing applications, each with its source commission, plus the party ledger |

Bulk approve and bulk payment. Each payee gets a statement of account showing
earned, paid, withheld, and outstanding for a period.
