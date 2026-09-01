# src/lib — SHARED

Pure utilities safe on both sides of the boundary. No I/O, no Prisma, no React.

| File / folder | Contents |
|---|---|
| `money.ts` | Money formatting and arithmetic on decimal strings |
| `format.ts` | Dates, numbers, document numbers, percentages |
| `validation/` | Zod schemas, shared by Server Actions and client forms |

`validation/` deliberately lives here and **not** under `src/server`, so a form can
reuse the exact schema the Server Action validates against. One schema, two
consumers, no drift.

## Rule

If it cannot run in a browser, it does not belong in `lib/`. Anything touching the
database, the filesystem, or a secret goes in `src/server/`.
