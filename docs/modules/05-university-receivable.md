# 5. University Receivable

Accounts receivable for commission. The university is a **customer**; the claim is
a **sales invoice**; the subsidiary ledger behind control account 1120.
Answers: who owes us, how much, how late.

## Commission claim = sales invoice (SI)

Groups approved commissions into one billable document to one university.

| Field | Notes |
|---|---|
| claimNo | CLM-2627-0001 |
| universityId / partyId | One university, one currency per claim |
| claimedOn / dueOn | dueOn = claimedOn + agreement.paymentTermsDays |
| totalAmount, currency, fxRate, baseAmount | Sum of member commissions' net amounts |
| status | DRAFT -> SENT -> ACKNOWLEDGED -> PARTIALLY_PAID -> PAID; DISPUTED, WRITTEN_OFF, CANCELLED |
| invoiceUrl | Generated PDF sent to the university |

Only APPROVED commissions may be added. Adding one sets it to CLAIMED; removing it
from a DRAFT claim returns it to APPROVED.

**Posting happens at SENT**, not at DRAFT (row 3):

```
Dr 1120 AR – Universities   (partyId = the university)
Cr 1130 Accrued Commission Income
```

Cancelling a sent claim raises a credit note; it is never deleted.

## Receipts

One `Receipt` per money-in event, allocated across claims — the standard
receipt-and-allocation model, not a payment glued to a single invoice.

```
Receipt { receiptNo, partyId, receivedOn, amount, currency, fxRate, baseAmount,
          bankAccountId, method, reference, withheldTax }
ReceiptAllocation { receiptId, commissionClaimId, amount }
```

On posting a receipt — rows **6–8** of [06-posting-matrix.md](../06-posting-matrix.md):

1. Allocate across the party's open claims — oldest first, or explicitly.
2. Post the receipt: net cash to bank, withheld tax to 1310, **gross** against
   1120, FX difference to 7100. The claim is settled at gross, not at cash.
3. Update each commission to PARTIALLY_RECEIVED or RECEIVED, and each claim to
   PARTIALLY_PAID or PAID.

An unidentified receipt posts to 9000 Suspense and is reallocated once identified
(rows 47–48). Money is never left off-ledger while it is being investigated.

## Aging

Bucket open claims by `dueOn` relative to today: `Current`, `1–30`, `31–60`,
`61–90`, `90+`. Group by university. Aging runs from the **invoice date**, which is
exactly why unbilled commission sits in 1130 and is excluded from this report.

Overdue is always derived at query time, never stored.

## Reconciliation

Sum of open claim balances **must equal** the 1120 control-account balance at any
date. This check ships as a report and runs in the month-end checklist
([08-period-close.md](../08-period-close.md)). A difference is a defect.

## Statement of account

Per university, per date range: opening balance, claims raised, receipts, credit
notes, adjustments, closing balance. This is the document reconciled against the
university's own records, so it must foot exactly to the party ledger.

## Screens

| Route | Contents |
|---|---|
| `/commission/receivables` | University-wise outstanding with aging buckets: unbilled (1130), billed, received, outstanding, oldest overdue |
| `/commission/claims` | claimNo, university, claimedOn, dueOn, total, received, balance, status, days overdue |
| `/commission/claims/new` | Pick university, multi-select its APPROVED commissions, generate claim |
| `/commission/claims/[id]` | Line items, allocations, receipts, record-receipt, PDF, linked vouchers |
| `/sales/receipts` | All receipts across parties, with allocation detail |
| `/accounting/party-ledger` | Full ledger for any party, and the statement of account |
