import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * A generic report: header, optional export link, columns and rows. Every
 * report in the module renders through this, so they all look and export
 * the same way — docs/modules/11 "date-range filter, on-screen table, CSV".
 */

export type Column<T> = {
  key: keyof T & string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
}

export function ReportTable<T extends Record<string, unknown>>({
  title,
  description,
  columns,
  rows,
  exportHref,
  footer,
  kind = 'operational',
}: {
  title: string
  description?: string
  columns: Column<T>[]
  rows: T[]
  exportHref?: string
  footer?: React.ReactNode
  /** Financial rows come from the ledger; operational ones from the pipeline tables. */
  kind?: 'financial' | 'operational'
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {title}
              <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide ${kind === 'financial' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {kind === 'financial' ? 'from the ledger' : 'operational'}
              </span>
            </CardTitle>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {exportHref ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={exportHref} />}>
              Export CSV
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing to report for these parameters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={`text-sm whitespace-normal ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.mono ? 'font-mono text-xs' : ''}`}>
                      {String(r[c.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {footer ? <div className="mt-3 text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  )
}

export function ViewTabs({ base, views, current }: { base: string; views: { key: string; label: string }[]; current: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {views.map((v) => (
        <Link key={v.key} href={`${base}?view=${v.key}`} className={`rounded-md border px-3 py-1.5 text-sm ${v.key === current ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          {v.label}
        </Link>
      ))}
    </div>
  )
}
