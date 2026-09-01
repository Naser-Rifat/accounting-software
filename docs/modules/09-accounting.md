# 9. Accounting — General Ledger

The ledger everything else posts into. This module owns the posting engine; no
other module writes to the GL directly.

Binding rules: [03-accounting-standards.md](../03-accounting-standards.md).
Accounts: [04-chart-of-accounts.md](../04-chart-of-accounts.md).
Vouchers: [05-voucher-types.md](../05-voucher-types.md).
Entries: [06-posting-matrix.md](../06-posting-matrix.md).

## Chart of accounts

`Account { code, name, type, parentId, isGroup, isControl, isContra, isSystem, isActive }`

Self-referencing tree, seeded from doc 04. Users may add sub-accounts under any
group. System accounts cannot be deleted or re-coded — posting code references
them by constant. Only leaf accounts accept postings.

## The posting engine

`src/lib/accounting/post.ts` — the single write path into the ledger:

```
postEntry(tx, {
  voucherType, entryDate, narration, sourceType, sourceId, currency, fxRate,
  lines: [{ accountCode, debit, credit, partyId?, costCenterId?, lineNarration? }]
})
```

It is responsible for, in order:

1. Resolving the accounting period from `entryDate` and rejecting closed periods.
2. Resolving account codes to ids; rejecting group accounts.
3. Enforcing the control-account rule — a control account line must carry a `partyId`;
   a manual JV may not touch one at all.
4. Converting to base currency at the stored rate.
5. Validating `sum(debit) == sum(credit)` and `debit XOR credit` per line.
6. Allocating the next gapless voucher number for the type and fiscal year, under a row lock.
7. Writing the entry and its lines inside the caller's transaction.

`reverseEntry(tx, entryId, reversalDate, reason)` writes the mirror-image entry,
links it via `reversesEntryId`, and marks the original REVERSED. These two
functions are the only code in the system that inserts a `JournalLine`.

## Subsidiary ledgers

The GL holds control totals; detail lives in the subledgers. Party ledger =
journal lines filtered by `partyId`, which is why `partyId` is mandatory on
control-account lines. Reconciliation of each control account against its
subledger is a shipped report and a month-end checklist item.

## Cost centers

`CostCenter { code, name, type, isActive }` — optional analysis dimension on any
line. Types: BRANCH, COUNSELOR, INTAKE, CAMPAIGN. Enables segment P&L without
multiplying the chart of accounts, which is the standard alternative to encoding
branches into account codes.

## Bank & cash

`BankAccount { name, accountNo, bankName, currency, openingBalance, glAccountCode }`
Each bank account auto-creates its own sub-account under 1020, so per-account
balances come from the ledger rather than a parallel running total.

## Bank reconciliation

`BankReconciliation { bankAccountId, statementDate, statementBalance, reconciledOn, status }`
with `BankReconciliationLine { journalLineId, matched, statementRef }`.

Unmatched book entries are outstanding cheques and deposits in transit. The
reconciliation cannot be closed until:

```
statement balance + deposits in transit - unpresented cheques = book balance
```

difference equals zero. Closing a reconciliation locks its matched lines.

## Screens

| Route | Contents |
|---|---|
| `/accounting/accounts` | CoA tree, add sub-account, activate/deactivate |
| `/accounting/vouchers` | All vouchers, filter by type, date, party, source, amount |
| `/accounting/vouchers/new` | Manual JV entry with running debit/credit totals and a live balance check |
| `/accounting/vouchers/[id]` | Voucher detail, source document link, reverse action |
| `/accounting/ledger` | Account picker, date range, opening balance, lines, running balance, closing |
| `/accounting/party-ledger` | Same for one party, plus statement of account |
| `/accounting/trial-balance` | All accounts, debit/credit totals, must foot to zero difference |
| `/accounting/cost-centers` | Manage dimensions, segment P&L |
| `/accounting/period-close` | Month-end checklist ([08-period-close.md](../08-period-close.md)) |
| `/accounting/year-end` | Year-end closing wizard |
| `/accounting/opening-balances` | Go-live migration entry |
| `/banking/*` | Bank accounts, transfers (CV), reconciliation |
