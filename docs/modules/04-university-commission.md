# 4. University Commission — CORE MODULE

Money the agency earns from universities for placing students.
This module drives the value of the whole system; other modules serve it.

## Worked example

```
Student      Rahim
University   XYZ University
Tuition fee  USD 10,000   (snapshotted on the Application)
Agreement    15% PERCENT of FIRST_YEAR_TUITION, Net 60
Expected     USD 1,500
```

Then: `EXPECTED -> ELIGIBLE -> APPROVED -> CLAIMED -> RECEIVED`

## Instalments

Commission structure varies by university, so one application can generate several
commission rows — one per `CommissionScheduleLine` on the agreement
([02-universities.md](02-universities.md)).

```
XYZ University, PER_YEAR over a 3-year degree, 15% of USD 10,000:
  Commission 1/3  "Year 1"  USD 500  eligible on ENROLLMENT
  Commission 2/3  "Year 2"  USD 500  eligible on RE_ENROLLMENT + 0 days
  Commission 3/3  "Year 3"  USD 500  eligible on RE_ENROLLMENT + 0 days
```

Each instalment carries `instalmentSeq` and `instalmentLabel`, and runs its own
independent lifecycle — separately eligible, approved, claimed and received. Later
instalments may be cancelled (student drops out in year 2) without disturbing
instalments already received.

Rules:

1. Instalment rows are generated at ENROLLMENT from the schedule in force, and the
   schedule line id is snapshotted on each.
2. Only the instalment whose trigger has fired becomes ELIGIBLE; the rest stay EXPECTED.
3. A ONE_TIME agreement generates exactly one row, so the simple case carries no
   extra complexity for the user.
4. `sum(instalment.expectedAmount)` must equal the total commission for the application.

## Commission record

| Field | Notes |
|---|---|
| applicationId | Origin; one commission per application unless split into instalments |
| agreementId | Snapshot of which contract produced this |
| baseAmount | Tuition (or other base) the rate applied to |
| rateType / rate | Snapshotted, never read live from the agreement |
| expectedAmount | baseAmount x rate, or the fixed amount |
| netAmount | expectedAmount + sum(adjustments) — the billable figure |
| currency | The university's currency |
| fxRate / baseCurrencyAmount | Set at APPROVED using the rate on the approval date |
| status | See [02-status-flows.md](../02-status-flows.md) |
| eligibleOn / approvedOn / claimId / receivedOn | Audit timestamps |

## Calculation

```
base   = appliesTo == FIRST_YEAR_TUITION ? application.tuitionFee
       : appliesTo == TOTAL_TUITION      ? application.tuitionFee * programYears
       : /* PER_STUDENT */                 1

total    = rateType == PERCENT ? base * rate / 100 : rate
expected = total * scheduleLine.percentOfTotal / 100     // per instalment
net      = expected + sum(adjustments)
```

## Adjustments

`CommissionAdjustment { commissionId, amount (+/-), reason, createdBy, createdAt }`

Reasons: SCHOLARSHIP_REDUCTION, PARTIAL_WITHDRAWAL, UNIVERSITY_DISPUTE,
CURRENCY_DIFFERENCE, BONUS, CORRECTION.

Never edit `expectedAmount` after approval. Add an adjustment row so the history
stays auditable, and post the delta:

- **Reduction** → credit note (CN), row 4 of the posting matrix
- **Increase** → sales invoice (SI), row 5

If the commission is already claimed, the adjustment moves against 1120; if only
approved, against 1130.

## GL effects

Entries are defined once in [06-posting-matrix.md](../06-posting-matrix.md) — never
restated here. This module posts rows **2** (approval), **4–5** (adjustments),
**9** (cancellation) and **10** (write-off). Claiming and receipts are rows 3, 6–8,
owned by [05-university-receivable.md](05-university-receivable.md).

## Views

| Route | Contents |
|---|---|
| `/commission` | All commissions: student, university, base, rate, expected, net, status, age. Filters: status, university, intake, counselor, date range. Summary tiles: Expected / Approved / Claimed / Received. |
| `/commission/[id]` | Calculation breakdown, agreement snapshot, adjustments, status history, linked claim, receipts, and the vouchers it generated |

Bulk actions: mark ELIGIBLE, approve, add to claim.

## Guardrails

1. Expected commission is a forecast — it never touches the ledger.
2. Rate and agreement are snapshotted at creation; later contract changes never
   restate existing commissions.
3. A commission belongs to at most one claim.
4. Received total can never exceed `netAmount` — validate before allocating a receipt.
5. Approval is an approval-gated action (see [12-administration.md](12-administration.md))
   because it recognises revenue.
6. Approving into a closed period is rejected.
