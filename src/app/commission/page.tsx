import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
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
import type { CommissionStatus } from '@/generated/prisma/enums'
import { ActionForm } from '@/features/accounting/action-form'
import { StatusBadge, humanise } from '@/features/commission/forms'
import { submitApproveCommission, submitMarkEligible } from '@/server/actions/commission'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listCommissions, summariseByStatus } from '@/server/services/commission-service'
import { listCounselors, listIntakes } from '@/server/services/team-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'University Commission' }
export const dynamic = 'force-dynamic'

const STATUSES: CommissionStatus[] = ['EXPECTED', 'ELIGIBLE', 'APPROVED', 'CLAIMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'WRITTEN_OFF']
const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function CommissionPage({ searchParams }: PageProps<'/commission'>) {
  const user = await requireUser()
  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const status = STATUSES.includes(pick('status') as CommissionStatus) ? (pick('status') as CommissionStatus) : undefined

  const [rows, universities, intakes, counselors] = await Promise.all([
    listCommissions({ status, universityId: pick('university') || undefined, intakeId: pick('intake') || undefined, counselorId: pick('counselor') || undefined }),
    listUniversityOptions(),
    listIntakes(true),
    listCounselors(true),
  ])
  const tiles = summariseByStatus(await listCommissions())
  const canManage = canManageCommission(user.role)
  const today = new Date().toISOString().slice(0, 10)
  const selectable = rows.filter((r) => r.status === 'EXPECTED' || r.status === 'ELIGIBLE')

  return (
    <PageShell user={user} title="University Commission" subtitle={`${rows.length} instalment(s) shown`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(['EXPECTED', 'ELIGIBLE', 'APPROVED', 'CLAIMED', 'RECEIVED'] as const).map((k) => (
          <Card key={k}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{humanise(k)}</p>
              {tiles[k].length === 0 ? (
                <p className="mt-1 text-xl font-medium text-muted-foreground">—</p>
              ) : (
                tiles[k].map((t) => (
                  <p key={t.currency} className="mt-1 text-lg font-medium tabular-nums">
                    <span className="mr-1 text-xs text-muted-foreground">{t.currency}</span>
                    <Amount value={t.amount} />
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status ?? ''} className={FILTER_SELECT}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </select>
        <select name="university" defaultValue={pick('university')} className={FILTER_SELECT}>
          <option value="">All universities</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="intake" defaultValue={pick('intake')} className={FILTER_SELECT}>
          <option value="">All intakes</option>
          {intakes.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select name="counselor" defaultValue={pick('counselor')} className={FILTER_SELECT}>
          <option value="">All counselors</option>
          {counselors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission instalments</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing here. Commission rows are created when an application reaches enrolled.
            </p>
          ) : (
            <ActionForm action={submitMarkEligible} submitLabel="Mark selected eligible" variant="outline" className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManage ? <TableHead className="w-8" /> : null}
                    <TableHead>Student · application</TableHead>
                    <TableHead>University</TableHead>
                    <TableHead className="w-28">Instalment</TableHead>
                    <TableHead className="w-32 text-right">Base</TableHead>
                    <TableHead className="w-20 text-right">Rate</TableHead>
                    <TableHead className="w-36 text-right">Expected</TableHead>
                    <TableHead className="w-36 text-right">Net</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead className="w-16 text-right">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      {canManage ? (
                        <TableCell>
                          {r.status === 'EXPECTED' || r.status === 'ELIGIBLE' ? <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.applicationCode}`} /> : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-sm whitespace-normal">
                        <Link href={`/commission/${r.id}`} className="font-medium hover:underline">
                          {r.student}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {r.applicationCode} · {r.intake} · {r.counselor}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">{r.university}</TableCell>
                      <TableCell className="text-sm">{r.instalmentLabel}</TableCell>
                      <TableCell className="text-right">
                        <Amount value={r.baseAmount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.rateType === 'PERCENT' ? `${Number(r.rate)}%` : 'fixed'}</TableCell>
                      <TableCell className="text-right">
                        <span className="mr-1 text-xs text-muted-foreground">{r.currency}</span>
                        <Amount value={r.expectedAmount} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={r.netAmount} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                        {r.claimNo ? (
                          <Link href={`/commission/claims/${r.claimId}`} className="ml-1 font-mono text-xs hover:underline">
                            {r.claimNo}
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{r.ageDays}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {canManage && selectable.length > 0 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <label htmlFor="eligibleOn" className="text-xs text-muted-foreground">
                      Eligible on
                    </label>
                    <Input id="eligibleOn" name="eligibleOn" type="date" defaultValue={today} className="w-40" />
                  </div>
                </div>
              ) : null}
            </ActionForm>
          )}
          {canManage && rows.some((r) => r.status === 'ELIGIBLE') ? (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">Approve eligible instalments</p>
              <ActionForm action={submitApproveCommission} submitLabel="Approve selected" pendingLabel="Posting…" className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {rows
                    .filter((r) => r.status === 'ELIGIBLE')
                    .map((r) => (
                      <label key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <input type="checkbox" name="ids" value={r.id} defaultChecked />
                        {r.student} · {r.instalmentLabel} · {r.currency} {r.netAmount}
                      </label>
                    ))}
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label htmlFor="approvedOn" className="text-xs text-muted-foreground">
                      Approved on (recognition date)
                    </label>
                    <Input id="approvedOn" name="approvedOn" type="date" defaultValue={today} className="w-40" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Approval recognises revenue: Dr 1130 Accrued Commission / Cr 4010 Commission Income, at the
                  exchange rate on the approval date. Counselor and agent commission accrue at the same moment.
                </p>
              </ActionForm>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  )
}
