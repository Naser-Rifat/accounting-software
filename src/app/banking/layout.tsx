import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/layout/sidebar'
import { ACCOUNTING_NAV } from '@/config/nav'
import { getCurrentUser } from '@/server/auth/session'

/** Banking sits inside the Accounting module and shares its sidebar. */
export default async function BankingLayout({ children }: LayoutProps<'/banking'>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={ACCOUNTING_NAV} moduleName="Accounting" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
