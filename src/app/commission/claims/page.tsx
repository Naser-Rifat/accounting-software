import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
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
import type { ClaimStatus } from '@/generated/prisma/enums'
import { StatusBadge, humanise } from '@/features/commission/forms'
import { canManageCommission } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listClaims } from '@/server/services/claim-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'Commission Claims' }
export const dynamic = 'force-dynamic'

const STATUSES: ClaimStatus[] = ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'WRITTEN_OFF', 'CANCELLED']
const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'

export default async function ClaimsPage({ searchParams }: PageProps<'/commission/claims'>) {
  const user = await requireUser()
  const params = await searchParams
  const pick = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '')
  const status = STATUSES.includes(pick('status') as ClaimStatus) ? (pick('status') as ClaimStatus) : undefined
  const [claims, universities] = await Promise.all([listClaims({ status, universityId: pick('university') || undefined }), listUniversityOptions()])

  return (
    <PageShell user={user} title="Commission Claims" subtitle={`${claims.length} claim(s) · ${claims.filter((c) => c.overdueDays > 0).length} overdue`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
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
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {canManageCommission(user.role) ? (
          <Button size="sm" nativeButton={false} render={<Link href="/commission/claims/new" />}>
            New claim
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claims</CardTitle>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No claims yet. Approve commissions, then bill them to the university.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Claim</TableHead>
                  <TableHead>University</TableHead>
                  <TableHead className="w-28">Claimed</TableHead>
                  <TableHead className="w-28">Due</TableHead>
                  <TableHead className="w-36 text-right">Total</TableHead>
                  <TableHead className="w-32 text-right">Received</TableHead>
                  <TableHead className="w-32 text-right">Balance</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-20 text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/commission/claims/${c.id}`} className="hover:underline">
                        {c.claimNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {c.university} <span className="text-xs text-muted-foreground">· {c.members} instalment(s)</span>
                    </TableCell>
                    <TableCell className="text-xs">{c.claimedOn ?? '—'}</TableCell>
                    <TableCell className="text-xs">{c.dueOn ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{c.currency}</span>
                      <Amount value={c.totalAmount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={c.received} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={c.balance} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${c.overdueDays > 0 ? 'font-medium text-destructive' : ''}`}>{c.overdueDays > 0 ? `${c.overdueDays}d` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            A claim posts when it is sent (Dr 1120 with the university party / Cr 1130), and aging runs from
            its due date. Overdue is derived here, never stored.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
