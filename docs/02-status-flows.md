# Status Flows

All enums below are the single source of truth. Never invent a status outside these.
GL effects reference [06-posting-matrix.md](06-posting-matrix.md) row numbers.

## Student lifecycle

```
LEAD -> COUNSELING -> APPLIED -> OFFER_RECEIVED -> DEPOSIT_PAID
     -> ENROLLED -> VISA_APPROVED -> ARRIVED
```

Terminal off-ramps at any point: `DROPPED`, `REJECTED`.

## Application status

| Status | Meaning | Next |
|---|---|---|
| DRAFT | Being prepared | SUBMITTED |
| SUBMITTED | Sent to university | UNDER_REVIEW |
| UNDER_REVIEW | University assessing | OFFER_RECEIVED, REJECTED |
| OFFER_RECEIVED | Offer letter issued | DEPOSIT_PAID, DECLINED |
| DEPOSIT_PAID | Student paid deposit | ENROLLED |
| ENROLLED | Registered at university | — (creates the commission) |
| REJECTED / DECLINED / WITHDRAWN | Terminal | — |

## Visa status

`NOT_STARTED -> DOCUMENTS_PREPARED -> APPLIED -> INTERVIEW -> APPROVED | REFUSED`

## Commission status (core)

```
EXPECTED -> ELIGIBLE -> APPROVED -> CLAIMED -> PARTIALLY_RECEIVED -> RECEIVED
```

Off-ramps: `CANCELLED` (student withdrew or university refused), `WRITTEN_OFF`.

One application may hold several commission instalments, each running this
lifecycle independently — see [modules/04](modules/04-university-commission.md).

| Status | Set when | Voucher | GL effect |
|---|---|---|---|
| EXPECTED | Application reaches ENROLLED | — | none — pipeline forecast only |
| ELIGIBLE | The agreement's eligibility condition is met (enrollment / census date / arrival) | — | none |
| APPROVED | Revenue is earned and internally verified | JV | Dr 1130 Accrued Commission / Cr 4010 Income (row 2) |
| CLAIMED | Included on a claim invoiced to the university | SI | Dr 1120 AR – Universities / Cr 1130 (row 3) |
| PARTIALLY_RECEIVED | A receipt settles part of it | RV | Dr 1020 Bank / Cr 1120 (rows 6–8) |
| RECEIVED | Fully settled | RV | as above, remainder |
| CANCELLED | Reversed before or after approval | JV / CN | Reversal if already posted (rows 4, 9) |
| WRITTEN_OFF | Deemed uncollectible | JV | Dr 7200 Bad Debt / Cr 1120 (row 10) |

**The two rules that matter:** revenue is recognised at APPROVED, never at
EXPECTED; and unbilled revenue sits in 1130 until a claim is raised, only then
moving to the AR control account. See [11-decisions.md](11-decisions.md) #6 and #7.

## Commission claim status

`DRAFT -> SENT -> ACKNOWLEDGED -> PARTIALLY_PAID -> PAID`
Off-ramps: `DISPUTED`, `WRITTEN_OFF`, `CANCELLED`.

Posting happens at SENT (the SI voucher). A DRAFT claim has no GL effect, so lines
may still be added or removed. Overdue is derived (`dueOn < today AND status != PAID`),
never stored.

## Student invoice status

`DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID`
Off-ramps: `CANCELLED` (credit note, row 19), `REFUNDED` (rows 17–18).

Posting happens at ISSUED. Only DRAFT invoices are editable.

## Expense bill status

`DRAFT -> SUBMITTED -> APPROVED -> PARTIALLY_PAID -> PAID`
Off-ramp: `REJECTED`, `CANCELLED` (debit note, row 24).

Posting happens at APPROVED (row 20), not at payment — accrual basis.

## Internal commission status

`ACCRUED -> APPROVED -> PARTIALLY_PAID -> PAID`
Off-ramp: `CANCELLED` (row 32).

Accrue only when the related university commission reaches APPROVED, so the agency
never books a payable on money it has not earned. Posting happens at APPROVED (row 29).

## Tuition pass-through (module 13)

`COLLECTED -> HELD -> REMITTED -> CONFIRMED`
Off-ramps: `REFUNDED_TO_STUDENT`, `DISPUTED`.

Posts against liability 2130, never against an income account.

## Voucher status

`DRAFT -> POSTED -> REVERSED`. Only DRAFT is editable or deletable.
See [05-voucher-types.md](05-voucher-types.md).

## Period status

`OPEN -> SOFT_CLOSED -> CLOSED`. See [08-period-close.md](08-period-close.md).

## Transition rules

1. Illegal transitions are rejected at the Server Action, not just hidden in the UI.
2. Every transition that has a GL effect posts in the same DB transaction as the
   status change. A status without its posting is a corrupt ledger.
3. Every transition writes an `AuditLog` row with before/after.
4. A transition whose posting date falls in a CLOSED period is rejected — post the
   correction in an open period instead.
