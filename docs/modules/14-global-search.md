# 14. Global Search

One search box that finds anything by the identifier a person actually remembers —
a student's name, a passport number, a voucher number, a phone number — and jumps
straight to it.

Entry points: a top-bar input on every page, `Ctrl/Cmd + K` to open it as a command
palette, and `/search?q=` for the full results page.

## What is searchable

| Entity | Matched on | Result shows |
|---|---|---|
| Student | code, full name, passport no, email, phone | name, code, status, counselor |
| Application | code, student name, university name | code, student, university, status |
| University | name, country, contact name | name, country, active agreement |
| Program | name, university | name, level, tuition |
| Commission | student name, university, commission id | student, university, net amount, status |
| Commission claim | claimNo, university | claimNo, university, total, status |
| Student invoice | invoiceNo, student name | invoiceNo, student, total, balance |
| Expense bill | billNo, vendor, description | billNo, vendor, amount, status |
| Voucher | voucherNo, narration | voucherNo, type, date, amount |
| Receipt / Payment | receiptNo, paymentNo, reference, party | number, party, amount, date |
| Party | name, code | name, type, balance |
| Account | code, name | code, name, type |

## Ranking

Results are grouped by entity type, and within the whole result set ordered by:

1. **Exact identifier match** — `CLM-2627-0001`, a passport number, an account code.
   A single exact match navigates straight there instead of showing a list.
2. **Prefix match** on a code or name.
3. **Fuzzy / partial match** on a name or narration.
4. Recency — more recently updated records first among equal matches.

Each group returns at most 5 rows in the palette, with "see all" linking to
`/search?q=&type=`.

## Implementation

Phase 1 queries the tables directly — no separate index to keep in sync:

- Exact-identifier fast path first: if the query matches a document-number pattern
  (`^[A-Z]{2,3}-\d{4}-\d+$`) or an account code, query that one table and return.
- Otherwise `UNION ALL` of one indexed query per entity, each `LIMIT 5`.
- Fuzzy name matching via PostgreSQL `pg_trgm` with GIN indexes on the searched
  columns; exact columns (codes, passport, phone) get plain B-tree indexes.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX student_name_trgm ON "Student" USING gin (name gin_trgm_ops);
CREATE INDEX student_code_idx  ON "Student" (code);
```

Move to a materialised `SearchDocument` table (entityType, entityId, title,
subtitle, keywords, tsvector, branchId, updatedAt) only when the union query
exceeds ~200ms on real data. Documented here so the upgrade is a known step rather
than a rewrite — but do not build it up front; a denormalised index that drifts out
of sync is worse than a slightly slower query.

## Authorization — the part that matters

Search is the classic place where an app leaks the *existence* of records a user
may not see. Rules:

1. Every search query is scoped by the caller's role and branch, using the same
   scoping helpers as the list screens — never a separate, looser query path.
2. A COUNSELOR searching finds only their own students and applications. An AGENT
   finds only their referred students. A VIEWER sees no financial documents.
3. Scoping is applied **in SQL**, not by filtering results afterwards. Filtering
   after the fact still exposes counts and timing.
4. Search runs through a service (`server/services/search-service.ts`) like any
   other read, and returns DTOs — never raw models.

## Behaviour

| Rule | Detail |
|---|---|
| Minimum length | 2 characters; below that, show recent items instead |
| Debounce | 250ms after the last keystroke |
| Limit | 5 per group, 40 total in the palette |
| Empty state | "No matches for X" plus the entity filters, not a blank panel |
| Keyboard | Up/down to move, Enter to open, Esc to close, `Ctrl/Cmd+K` to reopen |
| Recent | Last 8 opened records per user, shown before typing (client-side only) |
| Money | A bare number searches document numbers and amounts, not names |

## Screens

| Route | Contents |
|---|---|
| Palette overlay | `Ctrl/Cmd+K` from anywhere; grouped results, keyboard-first |
| `/search` | Full results with entity-type tabs, date-range and branch filters, pagination |

## Files

| Piece | Location |
|---|---|
| Service + scoping | `src/server/services/search-service.ts` |
| Queries per entity | `src/server/db/repositories/search.ts` |
| Palette + results UI | `src/features/search/` |
| Top-bar trigger | `src/components/layout/` |
