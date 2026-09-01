# prisma

Schema, migrations and seed data. **Prisma 7.10.0**, pinned deliberately — see below.

```
prisma/
  schema/                  multi-file schema; Prisma merges every .prisma here
    schema.prisma          datasource + generator only
    01-accounting.prisma   THE CORE — accounts, vouchers, periods, parties,
                           cost centers, banks, currencies, tax, numbering
    02-commission.prisma   agreements, schedules, commissions, claims
    03-sales.prisma        student invoices, receipts, credit notes
    04-purchases.prisma    expense bills, payments, debit notes, internal commission
    05-tuition.prisma      pass-through collections and remittances
    06-master.prisma       students, universities, programs, counselors, branches
    07-pipeline.prisma     applications, documents
    08-admin.prisma        users, approvals, audit log, notifications
  migrations/              generated; never hand-edited after being applied
  seed/
    index.ts               entry point
    accounts.ts            chart of accounts (docs/04)
    currencies.ts          currencies and opening exchange rates
    settings.ts            SETTING_DEFAULTS from src/config/app.ts
    demo.ts                sample data so screens render non-empty
```

Accounting is file 01 because it is the core of the system; every other file
describes something that feeds vouchers into it.

## Prisma 7 specifics

These differ from older Prisma and from most tutorials:

| Change | Consequence |
|---|---|
| `url` is **not** allowed in `schema.prisma` | The connection URL lives in `/prisma.config.ts` |
| `PrismaClient` needs a **driver adapter** | `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` |
| Generator is `prisma-client`, not `prisma-client-js` | Output is explicit: `src/generated/prisma` (gitignored) |
| `.env` is no longer auto-loaded for the config file | `prisma.config.ts` calls `process.loadEnvFile('.env')` |
| Seed command moved out of `package.json` | Configured under `migrations.seed` in `prisma.config.ts` |

**Version is pinned to 7.10.0 on purpose.** npm's `latest` tag for `prisma` is
currently `8.0.0-rc.12`, a release candidate with a different, platform-oriented
CLI whose own README says it may change quickly. A ledger needs migrations that
behave predictably, so we track the stable line. Ignore the CLI's upgrade banner.

## Commands

```bash
npx prisma dev                 # local Prisma Postgres for development — no Docker needed
npx prisma validate            # check the schema
npx prisma format              # canonical formatting
npx prisma generate            # regenerate the client after schema changes
npx prisma migrate dev --name  # create and apply a migration
npx prisma studio              # browse data
```

## Rules

1. Never edit an applied migration. Roll forward with a new one.
2. Money is `Decimal @db.Decimal(18, 2)`; exchange rates `Decimal(18, 8)`;
   percentages `Decimal(9, 4)`. Never `Float` for anything financial.
3. Constraints PSL cannot express are added as raw SQL in the migration:
   - `JournalLine`: exactly one of debit/credit non-zero, both non-negative
   - `JournalEntry`: sum of debits equals sum of credits (deferred constraint)
   - `JournalLine.partyId` NOT NULL when the account is a control account
4. Seed is idempotent — safe to re-run. Upsert by natural key (account code,
   currency code, setting key).
5. `seed/accounts.ts` must stay in sync with `src/server/accounting/accounts.ts`
   and `docs/04-chart-of-accounts.md`.
