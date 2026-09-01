# Conventions — read before writing code

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.3 (App Router), React 19 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui |
| DB | PostgreSQL |
| ORM | Prisma |
| Auth | none yet (see [11-decisions.md](11-decisions.md)) |

**Next.js 16 is not the version in your training data.** Read the relevant guide in
`node_modules/next/dist/docs/01-app/` before writing routes, layouts, or data
fetching. Note that `LayoutProps<"/">` / `PageProps<"/route">` global types are used
instead of hand-written prop types.

## Code rules

1. Server Components by default. `"use client"` only for interactive leaves.
2. Mutations go through Server Actions in `src/app/**/actions.ts`, never API routes.
3. All DB access lives in `src/server/db/repositories/`. Components never import
   `PrismaClient` directly. Full layering: [12-project-structure.md](12-project-structure.md).
4. One shared Prisma client: `src/server/db/client.ts` (globalThis singleton, dev-safe).
5. Validate every Server Action input with Zod before touching the DB. Schemas live
   in `src/lib/validation/` so the form and the action share one definition.
6. Money: Prisma `Decimal`. Convert to string at the Client Component boundary —
   never pass Decimal objects into client code.
7. Anything that changes a balance runs inside `prisma.$transaction`, and the
   voucher is written in the same transaction as the business record. A business
   record that should have posted but did not is a corrupt ledger.

## Accounting code rules

These exist because of [03-accounting-standards.md](03-accounting-standards.md).
Breaking them breaks the books.

8. **All postings go through `postEntry()`** in `src/server/accounting/post.ts`.
   No module writes `JournalEntry` or `JournalLine` directly — ever.
9. `postEntry()` is responsible for: balance validation, period resolution and
   lock check, voucher number allocation, account-code resolution, control-account
   guard, and FX conversion to base currency. Callers supply intent, not mechanics.
10. Accounts are referenced by **code** (`"1120"`), never by a hardcoded id. Codes
    live in `src/lib/accounting/accounts.ts` as named constants (`AR_UNIVERSITIES`).
11. Never `UPDATE` or `DELETE` a posted voucher. Corrections call
    `reverseEntry()` or raise a credit/debit note.
12. Reports read from `JournalLine`, never recomputed from source tables — or the
    reports and the ledger will drift.
13. Every posting names its `sourceType` + `sourceId`. An entry that cannot be
    traced to a business event should not exist.

## Naming

| Thing | Convention | Example |
|---|---|---|
| DB model | PascalCase singular | `CommissionClaim` |
| DB field | camelCase | `expectedAmount` |
| Enum value | SCREAMING_SNAKE | `PARTIALLY_RECEIVED` |
| Route folder | kebab-case | `credit-notes` |
| Voucher numbers | `TYPE-FY-SEQ` | `SI-2627-00042` |
| Document numbers | `PREFIX-FY-SEQ` | `CLM-2627-0001` |

Prefixes: `STU` student, `APP` application, `CLM` commission claim, `INV` student
invoice, `EXP` expense bill. Voucher types: `SI CN PB DN RV PV CV JV OB CL`.

## Directory layout

Backend is `src/server/` (server-only), frontend is `src/app/` + `src/components/`
+ `src/features/`, shared pure code is `src/lib/`. Full tree, layering and import
rules: [12-project-structure.md](12-project-structure.md).

## Definition of done for a module

- [ ] Prisma models + migration
- [ ] Zod schema in `lib/validation/`
- [ ] Repository + service functions
- [ ] List page with filters, detail page, create/edit form
- [ ] GL posting wired through `postEntry()` per [06-posting-matrix.md](06-posting-matrix.md)
- [ ] Reversal/credit-note path for every posting path
- [ ] Trial balance still balances after every new posting path (test it)
- [ ] Seed data so the page renders non-empty
