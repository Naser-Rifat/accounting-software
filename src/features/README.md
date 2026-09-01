# src/features — FRONTEND, per module

Feature UI, one folder per module from `docs/modules/`. This is where module-specific
screens are assembled, so route files stay thin.

```
features/
  students/       StudentTable, StudentForm, StudentStatusBadge
  applications/
  commission/     CommissionTable, CommissionCalculationPanel, ClaimBuilder
  receivables/
  sales/
  purchases/
  banking/
  accounting/     VoucherEditor, AccountTree, LedgerTable
  reports/
  tuition/
  admin/
```

A route file (`src/app/**/page.tsx`) should read as: fetch data through a service,
render one feature component, nothing else.

## Rules

1. Feature folders may import `@/components/*`, `@/lib/*`, `@/types`.
2. Feature folders may **not** import `@/server/*` or another feature folder. If two
   features need the same component, promote it to `components/shared/`.
3. Naming: `PascalCase.tsx` for components, colocated `*.test.tsx` for tests.
