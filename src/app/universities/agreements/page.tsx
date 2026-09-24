import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { describeTerms } from '@/lib/commission/schedule'
import { AgreementForm } from '@/features/universities/agreement-form'
import { triggerLabel } from '@/features/universities/schedule-lines-table'
import { submitCreateAgreement } from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listAgreements } from '@/server/services/agreement-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'Commission Agreements' }
export const dynamic = 'force-dynamic'

export default async function AgreementsPage({ searchParams }: PageProps<'/universities/agreements'>) {
  const user = await requireUser()
  const params = await searchParams
  const includeInactive = params.inactive === '1'

  const [agreements, universities] = await Promise.all([
    listAgreements({ includeInactive }),
    listUniversityOptions(),
  ])
  const canManage = canManageUniversities(user.role)
  const inForce = agreements.filter((a) => a.inForce).length

  return (
    <PageShell user={user} title="Commission Agreements" subtitle={`${agreements.length} agreement(s) · ${inForce} in force today`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All agreements
            <Link
              href={includeInactive ? '/universities/agreements' : '/universities/agreements?inactive=1'}
              className="ml-3 text-xs font-normal text-muted-foreground hover:underline"
            >
              {includeInactive ? 'hide inactive' : 'show inactive'}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No agreements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>University</TableHead>
                  <TableHead>Agreement</TableHead>
                  <TableHead className="w-32">Effective</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="w-32">Eligible on</TableHead>
                  <TableHead className="w-24 text-right">Instalments</TableHead>
                  <TableHead className="w-20 text-right">Net days</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agreements.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm whitespace-normal">
                      <Link href={`/universities/${a.universityId}`} className="hover:underline">
                        {a.universityName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-normal">
                      {a.title}
                      {a.reference ? (
                        <span className="block font-mono text-xs text-muted-foreground">{a.reference}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums whitespace-normal">
                      {a.effectiveFrom} →<br />
                      {a.effectiveTo ?? 'open-ended'}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">{describeTerms(a)}</TableCell>
                    <TableCell className="text-xs">{triggerLabel(a.eligibilityTrigger)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.lines.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.paymentTermsDays}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {a.inForce ? <Badge>in force</Badge> : null}
                        <Badge variant={a.isActive ? 'secondary' : 'outline'}>
                          {a.isActive ? 'active' : 'inactive'}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            A commission is always priced from the agreement in force on the application&apos;s
            enrollment date, and stores that agreement&apos;s id — later contracts never restate it.
          </p>
        </CardContent>
      </Card>

      {canManage && universities.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New agreement</CardTitle>
          </CardHeader>
          <CardContent>
            <AgreementForm action={submitCreateAgreement} universities={universities} />
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
