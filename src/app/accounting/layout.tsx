import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/layout/sidebar'
import { ACCOUNTING_NAV } from '@/config/nav'
import { getCurrentUser } from '@/server/auth/session'

/**
 * Accounting module shell. The auth check lives here so every route beneath it
 * is protected by construction — a new page cannot forget to guard itself.
 */
export default async function AccountingLayout({
  children,
}: LayoutProps<'/accounting'>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={ACCOUNTING_NAV} moduleName="Accounting" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
