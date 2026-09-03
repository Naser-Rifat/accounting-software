import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/layout/sidebar'
import { PURCHASES_NAV } from '@/config/nav'
import { getCurrentUser } from '@/server/auth/session'

/** Purchases module shell. Auth guarded here, so no page beneath can forget. */
export default async function PurchasesLayout({ children }: LayoutProps<'/purchases'>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={PURCHASES_NAV} moduleName="Purchases" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
