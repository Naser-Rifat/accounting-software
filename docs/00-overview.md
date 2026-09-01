# Overview

**This is the accounting department's transaction system.** Its purpose is to
record, post and report every financial transaction the agency makes. The student,
university and application modules exist to generate those transactions and to
explain where each one came from — they are feeders, not the point.

The agency places students at foreign universities and earns commission for each
enrolled student. It also charges students service fees, and pays its own
counselors and sub-agents commission.

It is built as **standard double-entry accounting software** — voucher types,
control accounts with subsidiary ledgers, accounting periods with locking,
immutable postings, and statutory financial statements. See
[03-accounting-standards.md](03-accounting-standards.md).

## Actors

| Actor | Does |
|---|---|
| Student | Applies to universities via the agency; pays service fees |
| University | Accepts students; pays the agency commission |
| Counselor | Agency staff assigned to students; earns internal commission |
| Sub-agent | External partner sourcing students; earns internal commission |
| Accountant | Approves documents, records receipts, closes periods, runs statements |
| Admin | Users, roles, approval workflow, fiscal years, settings |

Each of these is also a `Party` in the ledger — that is what makes the subsidiary
ledgers reconcile to their control accounts.

## Core pipeline

```
Student -> Application -> University -> Enrollment
        -> Commission Expected      (pipeline, no GL)
        -> Commission Approved      (revenue recognised)
        -> Commission Claim         (invoiced to the university)
        -> Commission Received      (cash, tax withheld, FX settled)
```

## Two receivable streams (keep them separate)

| Stream | Owed by | Control account | Module |
|---|---|---|---|
| Commission receivable | University | 1120 (1130 while unbilled) | 04, 05 |
| Student receivable | Student | 1110 | 06 |

## Two payable streams

| Stream | Owed to | Control account | Module |
|---|---|---|---|
| Internal commission | Counselor / sub-agent | 2020 | 08 |
| Expenses | Vendors, staff, landlord | 2010 | 07 |

## One pass-through stream

| Stream | Held for | Control account | Module |
|---|---|---|---|
| Tuition collected from students | The university | 2130 | 13 |

For some universities the agency collects tuition or deposit money and forwards
it. That is **client money held in trust, never revenue** — it must never appear
as income or as available cash.

## Non-negotiables

1. Commission is the most important module. Design tradeoffs favour it.
2. Every money movement produces a balanced voucher through `postEntry()`.
3. Revenue is recognised when earned (commission approved), not when forecast and
   not when cash arrives.
4. The cost of earning that revenue (counselor/agent commission) is recognised in
   the same period as the revenue.
5. Multi-currency: universities pay in their own currency; the books are kept in
   one base currency. Every row stores amount, currency, rate, and base amount.
6. Nothing posted is ever edited or deleted. Corrections are reversals, credit
   notes, or debit notes.
