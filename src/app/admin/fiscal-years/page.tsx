import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { submitFiscalYear } from '@/server/actions/settings'
import { canReopenPeriod } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listYears } from '@/server/services/fiscal-year-service'
import { listSettings } from '@/server/services/settings-service'

export const metadata = { title: 'Fiscal Years' }
export const dynamic = 'force-dynamic'

export default async function FiscalYearsPage() {
  const user = await requireUser()
  const [years, settings] = await Promise.all([listYears(), listSettings('FISCAL_YEAR')])

  const isAdmin = canReopenPeriod(user.role)
  const byKey = new Map(settings.map((s) => [s.key, s]))
  const start = byKey.get('fiscalYear.startMonthDay')
  const latest = years[0]
  const nextStartYear = latest ? Number(latest.startDate.slice(0, 4)) + 1 : 2026

  return (
    <PageShell
      user={user}
      title="Fiscal Years"
      subtitle={`${years.length} year(s) · start ${start?.value ?? '07-01'}`}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Setting</TableHead>
                <TableHead className="w-56">Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((setting) => (
                <TableRow key={setting.key}>
                  <TableCell className="font-mono text-xs">{setting.key}</TableCell>
                  <TableCell className="text-sm">{setting.value}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {setting.isLocked ? (
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">locked</Badge>
                        {setting.lockReason}
                      </span>
                    ) : (
                      'editable'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <strong className="text-foreground">Why the start date locks.</strong> Periods
            and voucher series are built from it. Changing it once a year exists would put
            existing vouchers outside their own period and break every comparison against
            prior years. Patterns and period length still apply to future years.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Years</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Name</TableHead>
                <TableHead className="w-20">Code</TableHead>
                <TableHead className="w-56">Dates</TableHead>
                <TableHead className="w-24 text-right">Periods</TableHead>
                <TableHead className="w-24 text-right">Open</TableHead>
                <TableHead className="w-24 text-right">Vouchers</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((year) => (
                <TableRow key={year.id}>
                  <TableCell className="text-sm font-medium">{year.name}</TableCell>
                  <TableCell className="font-mono text-xs">{year.code}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {year.startDate} to {year.endDate}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {year.periodCount}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {year.openPeriods}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {year.voucherCount}
                  </TableCell>
                  <TableCell>
                    <Badge variant={year.status === 'OPEN' ? 'secondary' : 'outline'}>
                      {year.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create the next fiscal year</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={submitFiscalYear}
              submitLabel="Create year"
              pendingLabel="Creating…"
            >
              <div className="w-56 space-y-1.5">
                <Label htmlFor="startYear">Start year</Label>
                {/* Keyed on the value: after a year is created the suggested
                    start year changes, and React cannot update the default of
                    an uncontrolled input — it must remount. */}
                <Input
                  key={nextStartYear}
                  id="startYear"
                  name="startYear"
                  inputMode="numeric"
                  defaultValue={nextStartYear}
                  required
                />
              </div>
            </ActionForm>

            <p className="mt-4 text-xs text-muted-foreground">
              Name, code and periods are generated from the configured patterns and start
              date. Overlapping years are refused — a posting must belong to exactly one
              period.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  )
}
