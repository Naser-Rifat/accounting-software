# src/server — BACKEND

Server-only code. Nothing here may be imported by a Client Component.

Every file in this tree starts with:

```ts
import 'server-only'
```

That import makes the build fail loudly if client code ever reaches in, which is
the boundary this whole layout exists to protect.

## Layers, and the only legal direction of dependency

```
app/ (routes)  ->  actions/  ->  services/  ->  db/repositories/  ->  Prisma
                       |             |
                       |             +-------->  accounting/
                       +-------------------------------> (never skips a layer)
```

| Folder | Responsibility | May import |
|---|---|---|
| `actions/` | Server Actions. Thin controllers: validate input, check authorization, call one service, revalidate, return a result. **No business logic, no Prisma.** | services, lib/validation, lib |
| `services/` | Business logic, one file per module. Owns transactions: a service opens `prisma.$transaction` and calls repositories + the posting engine inside it. | repositories, accounting, lib |
| `db/repositories/` | Data access only. One file per entity. Queries and writes, no business rules. Returns domain rows. | db/client, lib |
| `db/client.ts` | The single `PrismaClient` instance. | — |
| `accounting/` | The posting engine and GL reads. The only code that writes `JournalEntry` / `JournalLine`. | db/client, lib |
| `auth/` | Session and authorization helpers (deferred; see docs 11-decisions D2). | db, lib |

## Rules

1. A route or component **never** imports a repository or Prisma directly. It goes
   through an action (writes) or a service (reads).
2. A service **never** writes a journal line by hand. It calls `accounting/post.ts`.
3. Services return **DTOs**, not Prisma models: `Decimal` becomes `string` before it
   crosses to the client. See `src/types`.
4. Every Server Action re-validates its input with Zod. Actions are reachable by
   direct POST, so client-side validation is a convenience, never a guarantee.
5. Anything that changes a balance runs in one transaction with its posting.
