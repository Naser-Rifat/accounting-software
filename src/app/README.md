# src/app — ROUTING ONLY

App Router. Routes, layouts, loading and error boundaries. Nothing else.

Route paths are fixed by [docs/09-navigation.md](../../docs/09-navigation.md) — do
not invent or rename segments.

```
app/
  layout.tsx              root layout: fonts, theme, providers
  page.tsx                dashboard
  globals.css
  (app)/                  route group — shares the sidebar shell, adds no URL segment
    students/
      page.tsx            list
      new/page.tsx        create
      [id]/page.tsx       detail
      [id]/edit/page.tsx  edit
      _components/        colocated UI used only by this route
    applications/ universities/ commission/ sales/ purchases/
    banking/ accounting/ reports/ admin/
  api/                    route handlers — webhooks, file exports, PDFs only
```

## Conventions

| Pattern | Use |
|---|---|
| `(group)` | Share a layout without adding a URL segment |
| `_folder` | Colocate non-routable files; never becomes a route |
| `[id]` | Dynamic segment |
| `loading.tsx` | Skeleton for a slow list or report |
| `error.tsx` | Per-section error boundary |

## Rules

1. A `page.tsx` fetches through a **service** (`@/server/services/*`) and renders a
   feature component. No queries, no Prisma, no business logic in a route file.
2. Mutations are Server Actions in `@/server/actions/*`, imported by the form. Do
   not define inline `"use server"` functions in page files — actions need to be
   testable and reusable.
3. `api/` route handlers exist only for things Server Actions cannot do: file
   downloads, PDFs, webhooks from a bank or payment provider.
4. Use `PageProps<"/route">` and `LayoutProps<"/">` — Next.js 16 generates these
   global types. Do not hand-write params/searchParams prop types.
