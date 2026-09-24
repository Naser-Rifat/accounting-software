import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { canViewAuditLog } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { auditFacets, listAuditLogs } from '@/server/services/audit-service'

export const metadata = { title: 'Audit Logs' }
export const dynamic = 'force-dynamic'

const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

/** The keys whose value differs between the two snapshots. */
function changedKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
}

const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

export default async function AuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const user = await requireUser()
  if (!canViewAuditLog(user.role)) redirect('/admin/branches')

  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string).trim() : '')
  const from = pick('from') ? new Date(`${pick('from')}T00:00:00.000Z`) : undefined
  const to = pick('to') ? new Date(`${pick('to')}T00:00:00.000Z`) : undefined
  if (to) to.setUTCDate(to.getUTCDate() + 1)

  const [rows, facets] = await Promise.all([
    listAuditLogs({ username: pick('user') || undefined, entity: pick('entity') || undefined, action: pick('action') || undefined, from, to }),
    auditFacets(),
  ])

  return (
    <PageShell user={user} title="Audit Logs" subtitle={`${rows.length} event(s) shown, newest first`}>
      <form className="flex flex-wrap items-center gap-2">
        <Input name="user" defaultValue={pick('user')} placeholder="User" className="w-40" />
        <select name="entity" defaultValue={pick('entity')} className={FILTER_SELECT}>
          <option value="">All entities</option>
          {facets.entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={pick('action')} className={FILTER_SELECT}>
          <option value="">All actions</option>
          {facets.actions.map((a) => (
            <option key={a} value={a}>
              {a.toLowerCase().replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <Input name="from" type="date" defaultValue={pick('from')} className="w-40" aria-label="From" />
        <Input name="to" type="date" defaultValue={pick('to')} className="w-40" aria-label="To" />
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded for these filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">When</TableHead>
                  <TableHead className="w-28">User</TableHead>
                  <TableHead className="w-44">Action</TableHead>
                  <TableHead className="w-48">Entity</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead className="w-28">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const keys = changedKeys(r.before, r.after)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs tabular-nums">{r.createdAt.slice(0, 19).replace('T', ' ')}</TableCell>
                      <TableCell className="font-mono text-xs">{r.username}</TableCell>
                      <TableCell className="text-xs">{r.action.toLowerCase().replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs whitespace-normal">
                        {r.entity}
                        <span className="block font-mono text-muted-foreground break-all">{r.entityId}</span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-normal">
                        {keys.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {keys.map((k) => (
                              <li key={k} className="break-all">
                                <span className="font-mono">{k}</span>:{' '}
                                {r.before && k in r.before ? (
                                  <>
                                    <span className="text-muted-foreground line-through">{show(r.before[k])}</span> →{' '}
                                  </>
                                ) : null}
                                <span>{show(r.after?.[k])}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.ip ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Append-only: the database refuses updates and deletes. Written for user, settings and
            approval changes, sign-ins and application status changes; voucher postings carry their
            own maker/checker fields and will join this log when the posting engine is wired to it.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
