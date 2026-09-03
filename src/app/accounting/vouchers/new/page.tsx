import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent } from '@/components/ui/card'
import { JournalVoucherForm } from '@/features/accounting/journal-voucher-form'
import { canPostManualJournal } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { getPostableAccounts } from '@/server/services/accounts-service'

export const metadata = { title: 'New Journal Voucher' }
export const dynamic = 'force-dynamic'

export default async function NewVoucherPage() {
  const user = await requireUser()

  // Hiding the button is a courtesy; this is the control.
  if (!canPostManualJournal(user.role)) redirect('/accounting/vouchers')

  const accounts = await getPostableAccounts()

  return (
    <PageShell
      user={user}
      title="New journal voucher"
      subtitle="Manual entry — goes to review, then a second person posts it"
    >
      <Card>
        <CardContent className="pt-6">
          <JournalVoucherForm
            accounts={accounts.map((a) => ({
              code: a.code,
              name: a.name,
              type: a.type,
              isControl: a.isControl,
            }))}
            today={new Date().toISOString().slice(0, 10)}
          />
        </CardContent>
      </Card>
    </PageShell>
  )
}
