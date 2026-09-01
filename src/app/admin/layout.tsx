import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/layout/sidebar'
import { ACCOUNTING_NAV } from '@/config/nav'
import { getCurrentUser } from '@/server/auth/session'

/**
 * Accounting setup screens live under /admin and share the module sidebar, so
 * an accountant configuring tax or numbering never leaves the module.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={ACCOUNTING_NAV} moduleName="Accounting" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
