import { Sidebar } from '@/components/layout/sidebar'
import { REPORTS_NAV } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/** Reports module shell. */
export default async function ReportsLayout({ children }: LayoutProps<'/reports'>) {
  await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={REPORTS_NAV} moduleName="Reports" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
