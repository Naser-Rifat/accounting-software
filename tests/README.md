# tests

```
tests/
  unit/          pure logic — money, aging, commission calculation, FX
  integration/   posting engine and services against a real test database
```

## What must be tested

The ledger is the part of this system where a bug is expensive and silent. These
are not optional:

| Test | Asserts |
|---|---|
| Balanced postings | Every `postEntry()` call produces `sum(debit) == sum(credit)` |
| Trial balance | After any sequence of business operations, the trial balance foots to zero |
| Control reconciliation | AR/AP control balances equal their subsidiary ledger totals |
| Period locking | Posting into a CLOSED period is rejected |
| Immutability | A posted voucher cannot be updated or deleted |
| Gapless numbering | Concurrent postings produce no duplicate or skipped voucher numbers |
| Commission calculation | Rate, instalment split, and adjustments produce the documented amounts |
| FX | Realised gain/loss on settlement matches the rate difference exactly |
| Pass-through | Tuition collection and remittance never touch a 4xxx income account |

Every new posting path in `docs/06-posting-matrix.md` needs an integration test
proving the trial balance still balances afterwards. That is the definition-of-done
item in `docs/10-conventions.md`.
