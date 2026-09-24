import Link from 'next/link'

import { Amount, PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
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
import { COUNTRIES, countryName } from '@/config/countries'
import { describeTerms } from '@/lib/commission/schedule'
import { canManageUniversities } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listUniversities } from '@/server/services/university-service'

export const metadata = { title: 'Universities' }
export const dynamic = 'force-dynamic'

export default async function UniversitiesPage({ searchParams }: PageProps<'/universities'>) {
  const user = await requireUser()
  const params = await searchParams

  const q = typeof params.q === 'string' ? params.q : ''
  const country = typeof params.country === 'string' ? params.country : ''
  const includeInactive = params.inactive === '1'

  const universities = await listUniversities({ q, country, includeInactive })
  const canManage = canManageUniversities(user.role)

  const totalOutstanding = universities
    .reduce((s, u) => s + Number(u.outstanding), 0)
    .toFixed(2)

  return (
    <PageShell
      user={user}
      title="Universities"
      subtitle={`${universities.length} partner(s) · ${totalOutstanding} commission outstanding`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <Input name="q" defaultValue={q} placeholder="Search by name" className="w-56" />
          <select
            name="country"
            defaultValue={country}
            className="h-9 w-44 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">All countries</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} />
            Show inactive
          </label>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {canManage ? (
          <Button size="sm" nativeButton={false} render={<Link href="/universities/new" />}>
            New university
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partner universities</CardTitle>
        </CardHeader>
        <CardContent>
          {universities.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No universities match.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>University</TableHead>
                  <TableHead className="w-40">Country</TableHead>
                  <TableHead className="w-24 text-right">Programs</TableHead>
                  <TableHead>Agreement in force</TableHead>
                  <TableHead className="w-36 text-right">Outstanding</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {universities.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.code}</TableCell>
                    <TableCell className="text-sm font-medium whitespace-normal">
                      <Link href={`/universities/${u.id}`} className="hover:underline">
                        {u.name}
                      </Link>
                      {u.collectsTuitionViaAgency ? (
                        <Badge variant="outline" className="ml-2 align-middle">
                          tuition via agency
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {countryName(u.country)}
                      {u.city ? <span className="text-muted-foreground"> · {u.city}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.programsCount}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {u.activeAgreement ? (
                        describeTerms(u.activeAgreement)
                      ) : (
                        <span className="text-muted-foreground">none</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={u.outstanding} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'secondary' : 'outline'}>
                        {u.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={5}>Total outstanding</TableCell>
                  <TableCell className="text-right">
                    <Amount value={totalOutstanding} />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Outstanding is read from the ledger — this university&apos;s lines on 1120 Accounts
            Receivable – Universities. It is never stored here, so it cannot drift from the books.
            The total must equal the 1120 control balance.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
