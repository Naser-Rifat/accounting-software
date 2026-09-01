# Project Structure

Next.js is full-stack, so "backend" and "frontend" are folders and import rules,
not separate deployables. The boundary is enforced by the `server-only` package,
which fails the build if client code reaches into server code.

Each folder also carries its own short `README.md` at point of use.

## Tree

```
accounting-system/
  src/
    app/                    FRONTEND — routing only
      layout.tsx  page.tsx  globals.css
      (app)/                shell route group; adds no URL segment
        students/ applications/ universities/ commission/
        sales/ purchases/ banking/ accounting/ reports/ admin/
          page.tsx  new/page.tsx  [id]/page.tsx  _components/
      api/                  route handlers: cron, webhooks, PDFs, exports only
        cron/run-reminders/ scheduled reminder scans (modules/15)
    components/             FRONTEND — presentation
      ui/                   shadcn primitives
      layout/               sidebar, top bar, page header
      shared/               data table, money cell, status badge
    features/               FRONTEND — per-module screens
      students/ commission/ accounting/ reports/ ...
    server/                 BACKEND — server-only
      actions/              Server Actions (thin controllers)
      services/             business logic, owns transactions
      db/
        client.ts           PrismaClient singleton
        repositories/       data access, one file per entity
      accounting/
        accounts.ts         account code constants
        post.ts             postEntry(), reverseEntry()
        numbering.ts  period.ts  fx.ts
        reports/            trial balance, P&L, balance sheet, aging
      auth/                 sessions and authorization (deferred)
    lib/                    SHARED — pure, runs on both sides
      money.ts  format.ts
      validation/           zod schemas, reused by actions and forms
    types/                  DTOs crossing the boundary
    config/                 nav.ts, app.ts
  prisma/                   schema/, migrations/, seed/
  tests/                    unit/, integration/
  docs/
```

## Layering

```
app/ (routes)  ->  server/actions/  ->  server/services/  ->  server/db/repositories/  ->  Prisma
                                              |
                                              +-->  server/accounting/
```

Dependencies point one way only. No layer may skip the next one down.

| Layer | Does | Must not |
|---|---|---|
| `app/` | Fetch through a service, render a feature component | Query the DB, hold business logic |
| `actions/` | Validate, authorize, call one service, revalidate | Contain business rules or touch Prisma |
| `services/` | Business logic, opens the transaction, returns DTOs | Import React, know about HTTP |
| `repositories/` | Queries and writes for one entity | Contain business rules or post to the GL |
| `accounting/` | The only writer of `JournalEntry` / `JournalLine` | Be bypassed by any other module |
| `lib/`, `types/`, `config/` | Pure helpers, importable anywhere | Touch the DB, the filesystem, or secrets |

## Import rules

| From | May import |
|---|---|
| `app/**` | `features`, `components`, `server/actions`, `server/services`, `lib`, `types`, `config` |
| `features/**` | `components`, `lib`, `types`, `config` |
| `components/**` | `components`, `lib`, `types` |
| `server/**` | `server` (downward only), `lib`, `types`, `config` |
| `lib/**`, `types/**`, `config/**` | each other only |

Two rules do the heavy lifting:

1. **No frontend file imports `@/server/**`.** Data comes in as props from a page,
   or through a Server Action the form calls.
2. **No server file imports React or a component.** If a service needs to shape
   output for display, it returns a DTO and the UI formats it.

## Why this shape

Next.js 16's own guidance for new projects is a **Data Access Layer**: server-only,
authorization-checked, returning DTOs rather than models. `src/server/` is that
layer, split by responsibility so the accounting rules in
[03-accounting-standards.md](03-accounting-standards.md) have exactly one place to
live and exactly one way to be enforced.

The alternative — queries inline in components — makes rules like "every posting
balances" and "no manual entry touches a control account" unenforceable, because
there is no single place to enforce them.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Folder | kebab-case | `credit-notes/` |
| Component file | PascalCase | `CommissionTable.tsx` |
| Non-component file | kebab-case | `post-entry.ts`, `commission-service.ts` |
| Server Action | verb-first | `approveCommission`, `postReceipt` |
| Repository function | `findX` / `createX` / `updateX` | `findOpenClaimsByUniversity` |
| Zod schema | `xSchema` | `commissionApprovalSchema` |
| Test | mirrors source path | `tests/unit/money.test.ts` |

## Where a new feature goes

Adding "record a commission receipt":

| Step | File |
|---|---|
| 1. Input schema | `lib/validation/receipt.ts` |
| 2. Data access | `server/db/repositories/receipt.ts` |
| 3. Business logic + posting | `server/services/receipt-service.ts` |
| 4. Server Action | `server/actions/receipt.ts` |
| 5. Form and table | `features/receivables/` |
| 6. Route | `app/(app)/commission/claims/[id]/page.tsx` |
| 7. Tests | `tests/integration/receipt.test.ts` |

Any step you are tempted to skip is the one that will hurt later — usually 3,
because that is where the transaction and the GL posting belong together.
