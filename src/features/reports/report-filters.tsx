import Link from 'next/link'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Date-range filter, submitted as a plain GET form.
 *
 * No client JavaScript: the URL carries the range, so a report can be
 * bookmarked, shared and reloaded and will show exactly the same figures.
 */
export function DateRangeFilter({
  from,
  to,
  mode = 'RANGE',
  exportHref,
}: {
  from: string
  to: string
  /** AS_OF reports (balance sheet) take a single date. */
  mode?: 'RANGE' | 'AS_OF'
  exportHref?: string
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
      {mode === 'RANGE' ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={to} />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="to">As at</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
      )}

      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent"
      >
        Apply
      </button>

      {exportHref ? (
        <Link
          href={exportHref}
          prefetch={false}
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent"
        >
          Export CSV
        </Link>
      ) : null}
    </form>
  )
}

/** Reads and defaults the date range from search params. */
export function resolveRange(params: Record<string, string | string[] | undefined>) {
  const today = new Date()
  const firstOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))

  const fromStr =
    typeof params.from === 'string' ? params.from : firstOfMonth.toISOString().slice(0, 10)
  const toStr = typeof params.to === 'string' ? params.to : today.toISOString().slice(0, 10)

  return {
    fromStr,
    toStr,
    from: new Date(`${fromStr}T00:00:00.000Z`),
    to: new Date(`${toStr}T00:00:00.000Z`),
  }
}

/** A statement header that survives printing. */
export function StatementHeader({
  company,
  title,
  period,
}: {
  company: string
  title: string
  period: string
}) {
  return (
    <div className="border-b pb-3">
      <p className="text-sm font-medium">{company}</p>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{period}</p>
      <p className="text-xs text-muted-foreground">All figures in BDT</p>
    </div>
  )
}
