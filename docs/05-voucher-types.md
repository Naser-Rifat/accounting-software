# Voucher Types & Numbering

Every GL posting belongs to a voucher type, exactly as in standard packages.
The source document and the journal entry are separate records: the document is
the business object, the journal entry is its accounting effect.

## Types

| Code | Voucher | Raised by | Typical entry |
|---|---|---|---|
| SI | Sales Invoice | Commission claim to a university; student fee invoice | Dr AR / Cr Income |
| CN | Credit Note | Commission reduction; student refund or discount | Dr Income (or 4090) / Cr AR |
| PB | Purchase Bill | Vendor expense bill; counselor/agent commission bill | Dr Expense / Cr AP |
| DN | Debit Note | Reduction of a vendor bill | Dr AP / Cr Expense |
| RV | Receipt Voucher | Money in — commission receipt, student payment | Dr Bank/Cash / Cr AR |
| PV | Payment Voucher | Money out — vendor payment, commission payout, refund | Dr AP / Cr Bank |
| CV | Contra Voucher | Cash-to-bank and bank-to-bank transfers only | Dr Bank A / Cr Bank B |
| JV | Journal Voucher | Accruals, corrections, depreciation, manual adjustments | any |
| OB | Opening Balance | Migration of balances at go-live | vs 9100 |
| CL | Closing / Year-end | Period close to Current Year Earnings | Income/Expense to 3900 |

## Numbering

Format `PREFIX-FY-SEQ` — e.g. `SI-2627-00042`, `RV-2627-00108`.

| Rule | Detail |
|---|---|
| Series | One counter per voucher type per fiscal year |
| Sequence | Gapless, allocated inside the same DB transaction as the posting |
| Cancellation | Number retained, document marked CANCELLED; never reused |
| Reversal | New number, links back via `reversesEntryId` |
| Business docs | Keep their own numbers too: `CLM-2627-0001`, `INV-2627-0042`, `EXP-2627-0031` |

Counter lives in `Setting` (`numbering.<type>.<fy>.nextSeq`), incremented with a
row lock — never `count(*) + 1`.

## Voucher lifecycle

```
DRAFT --post--> POSTED --reverse--> REVERSED
```

- Only DRAFT vouchers are editable or deletable.
- POSTED vouchers are immutable. Full stop.
- A reversal copies the original lines with debit and credit swapped, dated either
  on the original date (if the period is open) or on the correction date.

## Manual journal restrictions

A manual JV may not:

1. touch a control account (1110, 1120, 2010, 2020) — post through the subledger,
2. post into a closed period,
3. post to a group account,
4. be unbalanced,
5. be saved without a narration.

Manual JVs are restricted to ACCOUNTANT and ADMIN and are always audit-logged.

## Required fields

Every voucher: `voucherType, voucherNo, entryDate, narration, currency, fxRate,
createdBy, createdAt, sourceType, sourceId, periodId, status`

Every line: `accountId, debit, credit, partyId?, costCenterId?, lineNarration?`
— with exactly one of debit or credit non-zero, never both.
