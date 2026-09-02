'use client'

import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Amount } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddAccountDialog, type ParentOption } from '@/features/accounting/add-account-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type AccountRow = {
  id: string
  parentId: string | null
  code: string
  name: string
  type: string
  depth: number
  isGroup: boolean
  isControl: boolean
  isContra: boolean
  isSystem: boolean
  isActive: boolean
  balance: string
  hasChildren: boolean
}

/**
 * The chart as a tree you can fold.
 *
 * A flat 77-row list is a wall: you cannot see the shape of the chart, which is
 * the thing the chart is for. Headings collapse to their totals, so you start
 * with the ~15 top-level categories and open only the branch you care about.
 *
 * Search overrides folding rather than filtering rows away — a matching account
 * is shown together with its ancestors, so you always see where a hit sits in
 * the chart rather than a context-free row.
 */
export function ChartOfAccountsTree({
  accounts,
  parents,
  canManage,
}: {
  accounts: AccountRow[]
  parents: ParentOption[]
  canManage: boolean
}) {
  // Every code in use, so the dialog can suggest one that is not.
  const existingCodes = useMemo(() => accounts.map((a) => a.code), [accounts])
  // null = closed. '' = open with no parent chosen. A code = open under it.
  const [addUnder, setAddUnder] = useState<string | null>(null)
  // Start with the top level showing and everything under it folded away.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null

    const hits = new Set<string>()
    for (const account of accounts) {
      if (
        account.code.toLowerCase().includes(q) ||
        account.name.toLowerCase().includes(q)
      ) {
        // Keep every ancestor visible, so a hit never appears out of context.
        let node: AccountRow | undefined = account
        while (node) {
          hits.add(node.id)
          node = node.parentId ? byId.get(node.parentId) : undefined
        }
      }
    }
    return hits
  }, [query, accounts, byId])

  const visible = useMemo(() => {
    if (matches) return accounts.filter((a) => matches.has(a.id))

    return accounts.filter((account) => {
      // Visible only if every ancestor is expanded.
      let parentId = account.parentId
      while (parentId) {
        if (!expanded.has(parentId)) return false
        parentId = byId.get(parentId)?.parentId ?? null
      }
      return true
    })
  }, [accounts, expanded, matches, byId])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allParents = useMemo(
    () => accounts.filter((a) => a.hasChildren).map((a) => a.id),
    [accounts],
  )

  // How many accounts each heading folds away. Computed once for the whole
  // tree rather than per row, which would be quadratic on every render.
  const descendantCount = useMemo(() => {
    const childrenOf = new Map<string, string[]>()
    for (const account of accounts) {
      if (!account.parentId) continue
      const list = childrenOf.get(account.parentId)
      if (list) list.push(account.id)
      else childrenOf.set(account.parentId, [account.id])
    }

    const counts = new Map<string, number>()
    const count = (id: string): number => {
      const cached = counts.get(id)
      if (cached !== undefined) return cached
      let total = 0
      for (const child of childrenOf.get(id) ?? []) total += 1 + count(child)
      counts.set(id, total)
      return total
    }
    for (const account of accounts) count(account.id)
    return counts
  }, [accounts])

  const searching = matches !== null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or name…"
            aria-label="Search the chart of accounts"
            className="pl-8"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="inline-flex overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={() => setExpanded(new Set(allParents))}
            disabled={searching}
            className="px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            disabled={searching}
            className="border-l px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            Collapse all
          </button>
        </div>

        <span className="text-xs text-muted-foreground tabular-nums">
          {searching
            ? `${visible.filter((a) => !a.isGroup).length} matching`
            : `${visible.length} of ${accounts.length} rows`}
        </span>

        {canManage ? (
          <Button type="button" size="sm" className="ml-auto" onClick={() => setAddUnder('')}>
            <Plus className="size-4" />
            Add account
          </Button>
        ) : null}
      </div>

      <div
        className={
          visible.length > 25
            ? 'max-h-[65vh] overflow-auto rounded-md border [&_[data-slot=table-container]]:overflow-visible'
            : 'rounded-md border'
        }
      >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24">Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-28">Type</TableHead>
            <TableHead className="w-32">Flags</TableHead>
            <TableHead className="w-40 text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                No account matches “{query}”.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((account) => {
              const isOpen = expanded.has(account.id) || searching
              return (
                <TableRow
                  key={account.id}
                  className={account.isGroup ? 'bg-muted/40' : undefined}
                >
                  <TableCell className="font-mono text-xs">{account.code}</TableCell>
                  <TableCell>
                    <span
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: `${account.depth * 16}px` }}
                    >
                      {account.hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(account.id)}
                          disabled={searching}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${account.name}`}
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                        >
                          <ChevronRight
                            aria-hidden
                            className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                        </button>
                      ) : (
                        <span aria-hidden className="size-5 shrink-0" />
                      )}
                      <span
                        className={account.isGroup ? 'font-semibold' : undefined}
                        title={
                          account.isSystem
                            ? 'System account — posting code refers to it by code, so it cannot be deleted'
                            : undefined
                        }
                      >
                        {account.name}
                      </span>
                      {canManage && account.isGroup && !account.isControl ? (
                        <button
                          type="button"
                          onClick={() => setAddUnder(account.code)}
                          aria-label={`Add an account under ${account.name}`}
                          title={`Add an account under ${account.name}`}
                          className="flex size-5 shrink-0 items-center justify-center rounded border border-dashed text-muted-foreground hover:border-solid hover:bg-accent hover:text-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Plus aria-hidden className="size-3" />
                        </button>
                      ) : null}
                      {account.hasChildren && !isOpen ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground tabular-nums">
                          {descendantCount.get(account.id) ?? 0}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {account.type}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {account.isControl ? (
                        <Badge variant="secondary" title="Posted to only through its subsidiary ledger — a manual journal cannot touch it">
                          control
                        </Badge>
                      ) : null}
                      {account.isContra ? (
                        <Badge variant="outline" title="Carries the opposite normal balance and presents as a deduction">
                          contra
                        </Badge>
                      ) : null}
                      {!account.isActive ? (
                        <Badge variant="outline" title="Refuses new postings">
                          inactive
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {account.isGroup ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={account.balance} />
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
      </div>

      {canManage ? (
        <AddAccountDialog
          parents={parents}
          existingCodes={existingCodes}
          presetParentCode={addUnder || null}
          open={addUnder !== null}
          onClose={() => setAddUnder(null)}
        />
      ) : null}
    </div>
  )
}
