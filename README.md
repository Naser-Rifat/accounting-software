# Accounting System

Accounting and operations system for a study-abroad agency. The agency places
students at foreign universities and earns commission; this records, posts and
reports every financial transaction that results.

It is built as **standard double-entry accounting software** — voucher types,
control accounts with subsidiary ledgers, accounting periods with locking,
immutable postings, and statutory financial statements.

## Status

| Module | State |
|---|---|
| Accounting (ledger, vouchers, trial balance, periods) | Built |
| Fixed assets & depreciation | Built |
| Banking (accounts, transfers) | Built |
| Setup (currencies, tax codes, fiscal years, numbering) | Built |
| Bank reconciliation | Book balances only — statement matching not implemented |
| Commission, students, universities, sales, purchases | Specified in `docs/`, not built |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
PostgreSQL · Prisma 7 · Vitest

## Getting started

```bash
npm install

# Local Postgres — no Docker needed, Prisma ships one
npm run db:dev            # leave running; prints a DATABASE_URL

cp .env.example .env      # paste the URL it printed
npm run db:deploy         # apply migrations
npm run db:seed           # chart of accounts, currencies, fiscal year, admin user

npm run dev               # http://localhost:3000
```

Sign in with `admin` / `admin123` and change it before real use.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — unit + integration against the database |
| `npm run db:dev` | Local Prisma Postgres server |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:seed` | Idempotent seed |
| `npm run db:studio` | Browse the data |

## Documentation

Business requirements and accounting rules live in [`docs/`](docs/). Start at
[`docs/README.md`](docs/README.md) — it maps each file to when you need it.

Read before changing anything financial:

- [`docs/03-accounting-standards.md`](docs/03-accounting-standards.md) — the ten binding rules
- [`docs/06-posting-matrix.md`](docs/06-posting-matrix.md) — the exact debit/credit for every event
- [`docs/12-project-structure.md`](docs/12-project-structure.md) — where files go and which layer may import which

## How the ledger protects itself

- **Every posting goes through `postEntry()`.** No module writes a journal line directly.
- **The database refuses bad data**, not just the app: check constraints and triggers
  enforce debit-XOR-credit per line, balanced vouchers (deferred to commit),
  a party on every control-account line, and immutability of posted vouchers.
- **Corrections are reversals, credit notes or debit notes** — never edits.
- **Gapless voucher numbering** per type per fiscal year, allocated under a row lock.
- **Revenue is recognised when earned**, not when forecast and not when cash arrives.

## Licence

Private project. All rights reserved.
