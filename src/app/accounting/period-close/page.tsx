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
import { ActionForm } from '@/features/accounting/action-form'
import { changePeriodStatus } from '@/server/actions/accounting'
import { canClosePeriod, canReopenPeriod } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getPeriodChecklist, listFiscalYears } from '@/server/services/period-service'

export const metadata = { title: 'Period Close' }
export const dynamic = 'force-dynamic'

export default async function PeriodClosePage() {
  const user = await requireUser()
  const years = await listFiscalYears()

  const current = years.find((y) => y.status === 'OPEN') ?? years[0]

  // Period dates are DATE columns, so they arrive at midnight. Comparing them
  // against a timestamp puts the last day of the month out of its own period —
  // at 13:00 on 31 August, `endDate >= now` is false. Normalise to midnight.
  const now = new Date()
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const currentPeriod = current?.periods.find(
    (p) => p.startDate <= today && p.endDate >= today,
  )

  const checklist = currentPeriod ? await getPeriodChecklist(currentPeriod.id) : []
  const allPassed = checklist.every((item) => item.passed)

  return (
    <PageShell
      user={user}
      title="Period Close"
      subtitle={current ? `${current.name} · ${current.periods.length} periods` : 'No fiscal year'}
    >
      {currentPeriod ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Month-end checklist — {currentPeriod.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-3 text-sm">
                  <span
                    className={
                      item.passed
                        ? 'mt-0.5 text-green-600 dark:text-green-400'
                        : 'mt-0.5 text-destructive'
                    }
                    aria-hidden
                  >
                    {item.passed ? '✓' : '✗'}
                  </span>
                  <span>
                    {item.label}
                    <span className="ml-2 text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              Bank reconciliation, accruals, prepaid amortisation and depreciation join this
              list when those modules are built.
            </p>

            {!allPassed ? (
              <p className="text-sm text-destructive">
                Resolve every item before closing the period.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {years.map((year) => (
        <Card key={year.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {year.name}
              <Badge variant={year.status === 'OPEN' ? 'secondary' : 'outline'}>
                {year.status.toLowerCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="w-56">Dates</TableHead>
                  <TableHead className="w-24 text-right">Vouchers</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-72">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {year.periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {period.seq}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{period.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {period.startDate.toISOString().slice(0, 10)} to{' '}
                      {period.endDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {period._count.entries}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          period.status === 'OPEN'
                            ? 'secondary'
                            : period.status === 'SOFT_CLOSED'
                              ? 'outline'
                              : 'outline'
                        }
                      >
                        {period.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {year.status === 'CLOSED' ? (
                        <span className="text-xs text-muted-foreground">Year closed</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {period.status === 'OPEN' && canClosePeriod(user.role) ? (
                            <>
                              <ActionForm
                                action={changePeriodStatus}
                                submitLabel="Soft close"
                                variant="outline"
                                className="inline"
                              >
                                <input type="hidden" name="periodId" value={period.id} />
                                <input type="hidden" name="status" value="SOFT_CLOSED" />
                              </ActionForm>
                              <ActionForm
                                action={changePeriodStatus}
                                submitLabel="Close"
                                variant="outline"
                                confirm={`Close ${period.name}? Nothing can be posted into it afterwards.`}
                                className="inline"
                              >
                                <input type="hidden" name="periodId" value={period.id} />
                                <input type="hidden" name="status" value="CLOSED" />
                              </ActionForm>
                            </>
                          ) : null}

                          {period.status === 'SOFT_CLOSED' && canClosePeriod(user.role) ? (
                            <ActionForm
                              action={changePeriodStatus}
                              submitLabel="Close"
                              variant="outline"
                              confirm={`Close ${period.name}? Nothing can be posted into it afterwards.`}
                              className="inline"
                            >
                              <input type="hidden" name="periodId" value={period.id} />
                              <input type="hidden" name="status" value="CLOSED" />
                            </ActionForm>
                          ) : null}

                          {period.status !== 'OPEN' && canReopenPeriod(user.role) ? (
                            <ActionForm
                              action={changePeriodStatus}
                              submitLabel="Reopen"
                              variant="outline"
                              confirm={`Reopen ${period.name}? This is audit-logged.`}
                              className="inline"
                            >
                              <input type="hidden" name="periodId" value={period.id} />
                              <input type="hidden" name="status" value="OPEN" />
                            </ActionForm>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </PageShell>
  )
}
