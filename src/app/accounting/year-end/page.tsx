import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActionForm } from '@/features/accounting/action-form'
import { runYearEndClose } from '@/server/actions/accounting'
import { canReopenPeriod } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listFiscalYears } from '@/server/services/period-service'

export const metadata = { title: 'Year-End Close' }
export const dynamic = 'force-dynamic'

export default async function YearEndPage() {
  const user = await requireUser()
  const years = await listFiscalYears()
  const isAdmin = canReopenPeriod(user.role)

  return (
    <PageShell
      user={user}
      title="Year-End Close"
      subtitle="Close income and expense into retained earnings"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What closing does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Closing posts real <span className="font-mono text-xs">CL</span> vouchers rather
            than computing the result off-ledger, so the year-end entries appear in the
            journal like any other posting and can be inspected or reversed.
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Every income and expense account is zeroed into 3900 Current Year Earnings.</li>
            <li>3900 is transferred to 3200 Retained Earnings.</li>
            <li>Balance sheet accounts carry forward untouched — they are never closed.</li>
            <li>All periods in the year are closed, and the year is marked closed.</li>
          </ol>
          <p>
            Close every period and clear the month-end checklist first. Reopening a closed
            year requires reversing these vouchers.
          </p>
        </CardContent>
      </Card>

      {years.map((year) => {
        const openPeriods = year.periods.filter((p) => p.status !== 'CLOSED').length

        return (
          <Card key={year.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {year.name}
                <Badge variant={year.status === 'OPEN' ? 'secondary' : 'outline'}>
                  {year.status.toLowerCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {year.startDate.toISOString().slice(0, 10)} to{' '}
                {year.endDate.toISOString().slice(0, 10)} ·{' '}
                {openPeriods === 0
                  ? 'all periods closed'
                  : `${openPeriods} period(s) still open`}
              </p>

              {year.status === 'CLOSED' ? (
                <p className="text-sm text-muted-foreground">
                  This year is closed. Its closing vouchers are in the journal.
                </p>
              ) : !isAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Only an administrator can close a fiscal year.
                </p>
              ) : (
                <ActionForm
                  action={runYearEndClose}
                  submitLabel={`Close ${year.name}`}
                  pendingLabel="Closing…"
                  variant="destructive"
                  confirm={`Close ${year.name}? This posts the closing vouchers and locks every period in the year.`}
                >
                  <input type="hidden" name="fiscalYearId" value={year.id} />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        )
      })}
    </PageShell>
  )
}
