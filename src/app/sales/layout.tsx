import { Sidebar } from '@/components/layout/sidebar'
import { SALES_NAV } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/** Sales & Receipts module shell — money in from students and universities. */
export default async function SalesLayout({ children }: LayoutProps<'/sales'>) {
  await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={SALES_NAV} moduleName="Sales" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
