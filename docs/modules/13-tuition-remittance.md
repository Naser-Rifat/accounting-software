# 13. Tuition Collection & Remittance (pass-through)

For universities where the agency collects tuition or deposit money from the
student and forwards it. **This money is never revenue.** It is client money held
in trust, and mishandling it is the single largest financial risk in the system.

Applies only where `University.collectsTuitionViaAgency = true`, or where the
individual application is flagged. Everywhere else, students pay the university
directly and nothing touches the agency's ledger.

## The rule

Money in and money out are the same amount. The agency's income from a
pass-through is **zero** — any service charge for handling it is a separate
student fee invoice (module 6), raised and recognised on its own.

If the agency keeps FX margin on the conversion, that margin is income and must be
invoiced explicitly. It is never taken silently out of the student's balance.

## Data

```
TuitionCollection { collectionNo, studentId, applicationId, partyId, receivedOn,
                    amount, currency, fxRate, baseAmount, bankAccountId, method,
                    reference, purpose, status }
TuitionRemittance { remittanceNo, universityId, partyId, remittedOn, amount,
                    currency, fxRate, baseAmount, bankAccountId, bankCharges,
                    swiftReference, status, *allocations }
RemittanceAllocation { remittanceId, tuitionCollectionId, amount }
```

`purpose`: DEPOSIT, TUITION_INSTALMENT, FULL_TUITION, OTHER.

One remittance may forward several students' money in a single wire — which is how
it actually happens — so allocations map each collection to its remittance.

## Flow

```
COLLECTED -> HELD -> REMITTED -> CONFIRMED
```

Off-ramps: `REFUNDED_TO_STUDENT` (application failed, visa refused), `DISPUTED`.

## Postings

Rows **49–54** of [06-posting-matrix.md](../06-posting-matrix.md), all against
liability **2130 Tuition Held for Remittance**. No 4xxx income account appears in
the collection or remittance entries — if a pass-through credits revenue, that is
a bug.

## Guardrails

1. `2130` must always reconcile to the sum of collections in HELD status. This is a
   month-end checklist item alongside the other control accounts.
2. A remittance can never exceed what was collected for those students.
3. Held money is reported by age — money sitting over 30 days needs an explanation.
4. Refunding held money requires approval, like any other outbound cash.
5. Ideally the agency keeps a **separate bank account** for client money. The system
   supports flagging a `BankAccount.isClientAccount` and warns if pass-through money
   is mixed with operating funds.
6. Held tuition is a liability on the Balance Sheet. It must never be presented as
   cash available to the business, and the dashboard's cash tile excludes it.

## Screens

| Route | Contents |
|---|---|
| `/finance/tuition/collections` | Money received from students for onward payment; filter by university, status, age |
| `/finance/tuition/remittances` | Outbound wires, with per-student allocation and SWIFT reference |
| `/finance/tuition/held` | **Trust balance**: what is held right now, per student, per university, with age. Must equal 2130. |
| Student detail | A separate tab from Payments — held money is not the student's fee ledger |

## Reports

- Trust/held balance as of a date, reconciled to 2130
- Collections and remittances per university per period
- Aged held money, flagging anything over the policy threshold
- Per-student pass-through history for dispute resolution
