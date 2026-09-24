import { Sidebar } from '@/components/layout/sidebar'
import { COMMISSION_NAV } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/** University Commission module shell — the core of the system. */
export default async function CommissionLayout({ children }: LayoutProps<'/commission'>) {
  await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={COMMISSION_NAV} moduleName="Commission" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
