import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import { ChartOfAccountsTree } from '@/features/accounting/chart-of-accounts-tree'
import { canManageChartOfAccounts } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getChartOfAccounts } from '@/server/services/accounts-service'

export const metadata = { title: 'Chart of Accounts' }
export const dynamic = 'force-dynamic'

export default async function ChartOfAccountsPage() {
  const user = await requireUser()
  const accounts = await getChartOfAccounts()

  const postable = accounts.filter((a) => !a.isGroup).length

  // Only group headings may take children, so they are the only valid parents.
  const parents = accounts
    .filter((a) => a.isGroup && !a.isControl)
    .map((a) => ({ code: a.code, name: a.name, type: a.type, depth: a.depth }))

  return (
    <PageShell
      user={user}
      title="Chart of Accounts"
      subtitle={`${accounts.length} accounts, ${postable} postable`}
    >
      <Card>
        <CardContent className="pt-6">
          <ChartOfAccountsTree
            accounts={accounts}
            parents={parents}
            canManage={canManageChartOfAccounts(user.role)}
          />

          <p className="mt-4 text-xs text-muted-foreground">
            Balances are debit-positive: a credit balance shows negative, and a heading
            shows a dash because its figure is the total of its children. Flags mark only
            the accounts that behave unexpectedly — control accounts post through their
            subsidiary ledger, contra accounts present as deductions, inactive ones refuse
            postings.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
