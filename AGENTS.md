<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Study-abroad agency ERP

Business requirements live in [docs/](docs/). **Do not read all of it.**
Start at [docs/README.md](docs/README.md) — it maps each file to when you need it.

Minimum before writing code: [docs/10-conventions.md](docs/10-conventions.md) and
[docs/12-project-structure.md](docs/12-project-structure.md) (where files go and
which layer may import which). Then read only the one module file you are
implementing, plus [docs/02-status-flows.md](docs/02-status-flows.md) if you touch
a status.

Backend is `src/server/` (server-only); frontend is `src/app/`, `src/components/`,
`src/features/`. No frontend file imports `@/server/**`; no server file imports React.

**This is a standard double-entry accounting system, not a simple ledger.**
If your change touches money, you must also read
[docs/03-accounting-standards.md](docs/03-accounting-standards.md) (the ten binding
rules) and [docs/06-posting-matrix.md](docs/06-posting-matrix.md) (the exact
debit/credit for your event). Never write a `JournalLine` yourself — all postings
go through `postEntry()`.

Core module is university commission — [docs/modules/04-university-commission.md](docs/modules/04-university-commission.md).
