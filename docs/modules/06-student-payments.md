# 6. Student Payment Management

Fees the agency charges students. The student is a **customer**; the subsidiary
ledger behind control account 1110. Independent of university commission.

## Fee types and income accounts

| feeType | Income account |
|---|---|
| APPLICATION | 4020 Student Service Fee Income |
| SERVICE | 4020 |
| VISA_PROCESSING | 4030 Visa Processing Fee Income |
| COUNSELING | 4040 Counseling Fee Income |
| DOCUMENTATION | 4050 Documentation Fee Income |
| OTHER | 4080 Other Operating Income |

## Invoice (SI)

```
StudentInvoice { invoiceNo, studentId, partyId, applicationId?, issuedOn, dueOn,
                 subtotal, discount, taxAmount, total, status }
StudentInvoiceLine { feeType, description, amount, taxCodeId? }
```

- `total = subtotal - discount + taxAmount`
- Status: DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID; CANCELLED, REFUNDED
- **Posting happens at ISSUED** (row 12): Dr 1110 AR – Students / Cr 40xx Income,
  plus Cr 2310 VAT Payable if the line carries an output tax code.
- Discounts post to **4090 Refunds, Discounts & Allowances** (row 13), a contra-revenue
  account — not netted into income and never treated as an expense. This keeps gross
  revenue and discount visible separately, which is what standard packages do.
- Only DRAFT invoices are editable. A posted invoice is corrected by credit note.

## Receipts

The same `Receipt` + `ReceiptAllocation` model as module 5 — one receipt may settle
several invoices.

Entries: rows **14–16** of [06-posting-matrix.md](../06-posting-matrix.md) —
against an issued invoice, before any invoice exists, and applying an advance.

Methods: CASH, BANK_TRANSFER, CARD, MOBILE_BANKING, CHEQUE. Every receipt names a
cash or bank account.

Advances are a **liability** until the service is invoiced. Never book unearned
money as income.

## Credit notes and refunds

Two separate steps, as in every standard package:

1. **Credit note (CN)** reduces the receivable — Dr 4090 / Cr 1110 (row 17).
2. **Refund payment (PV)** returns the cash — Dr 1110 / Cr 1020 Bank (row 18).

A refund without a credit note is not permitted: the obligation must be cancelled
in the books before cash leaves. Refunds require approval.

Cancelling a posted invoice is a full-value credit note (row 19), not a delete.

## Rules

1. Allocations may never exceed the invoice total or the receipt amount.
2. Student `totalDue` is derived from the party ledger, never stored on the student.
3. Sum of open student invoices must equal the 1110 control balance.
4. An invoice line with a tax code posts its tax to the code's GL account.

## Screens

| Route | Contents |
|---|---|
| `/sales/invoices` | List, filters by student, status, due; new and detail with record-receipt |
| `/sales/receipts` | All money in, filter by student, method, date, bank account |
| `/sales/credit-notes` | Credit notes with their source invoice |
| `/sales/refunds` | Refund requests, approval, payment |
| `/students/[id]` Payments tab | That student's ledger: invoices, receipts, credit notes, balance |
