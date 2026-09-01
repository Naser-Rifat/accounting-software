import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OpeningBalanceForm } from '@/features/accounting/opening-balance-form'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getPostableAccounts } from '@/server/services/accounts-service'

export const metadata = { title: 'Opening Balances' }
export const dynamic = 'force-dynamic'

export default async function OpeningBalancesPage() {
  const user = await requireUser()
  const accounts = await getPostableAccounts()

  return (
    <PageShell
      user={user}
      title="Opening Balances"
      subtitle="Go-live migration from the previous books"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Enter each account&apos;s balance as at the go-live date. Anything left over is
            posted to <span className="font-mono text-xs">9100 Opening Balance Equity</span>,
            which acts as the suspense for migration.
          </p>
          <p>
            When 9100 nets to zero against capital and retained earnings, the migration is
            complete. A residual balance means it is not — do not go live until it clears.
          </p>
          <p>
            Control accounts are excluded here: student, university and vendor balances must
            be entered as individual open invoices, claims and bills so the subsidiary
            ledgers reconcile. Those arrive with their own modules.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enter balances</CardTitle>
        </CardHeader>
        <CardContent>
          {canPostManualJournal(user.role) ? (
            <OpeningBalanceForm
              accounts={accounts
                .filter((a) => !a.isControl)
                .map((a) => ({ code: a.code, name: a.name }))}
              defaultDate="2026-07-01"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Your role cannot post opening balances.
            </p>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
