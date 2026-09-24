import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm } from '@/features/accounting/action-form'
import { ProgramFields, SELECT_CLASS } from '@/features/universities/fields'
import { submitCreateProgram } from '@/server/actions/universities'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listPrograms } from '@/server/services/program-service'
import { listUniversityOptions } from '@/server/services/university-service'

export const metadata = { title: 'Programs' }
export const dynamic = 'force-dynamic'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default async function ProgramsPage({ searchParams }: PageProps<'/universities/programs'>) {
  const user = await requireUser()
  const params = await searchParams
  const includeInactive = params.inactive === '1'

  const [programs, universities] = await Promise.all([
    listPrograms({ includeInactive }),
    listUniversityOptions(),
  ])
  const canManage = canManageUniversities(user.role)

  return (
    <PageShell user={user} title="Programs" subtitle={`${programs.length} program(s) across ${universities.length} active universit${universities.length === 1 ? 'y' : 'ies'}`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All programs
            <Link
              href={includeInactive ? '/universities/programs' : '/universities/programs?inactive=1'}
              className="ml-3 text-xs font-normal text-muted-foreground hover:underline"
            >
              {includeInactive ? 'hide inactive' : 'show inactive'}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No programs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>University</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead className="w-28">Level</TableHead>
                  <TableHead className="w-20 text-right">Months</TableHead>
                  <TableHead className="w-40 text-right">Tuition / year</TableHead>
                  <TableHead className="w-40">Intakes</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  {canManage ? <TableHead className="w-16" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm whitespace-normal">
                      <Link href={`/universities/${p.universityId}`} className="hover:underline">
                        {p.universityName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-normal">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.level.toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.durationMonths}</TableCell>
                    <TableCell className="text-right">
                      <span className="mr-1 text-xs text-muted-foreground">{p.currency}</span>
                      <Amount value={p.tuitionFee} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.intakeMonths.length ? p.intakeMonths.map((m) => MONTHS[m - 1]).join(', ') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? 'secondary' : 'outline'}>
                        {p.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Link href={`/universities/programs/${p.id}/edit`} className="text-xs hover:underline">
                          Edit
                        </Link>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && universities.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a program</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={submitCreateProgram} submitLabel="Add program" pendingLabel="Adding…">
              <div className="space-y-1.5 sm:max-w-md">
                <Label htmlFor="universityId">University</Label>
                <select id="universityId" name="universityId" className={SELECT_CLASS} required>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </div>
              <ProgramFields />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
