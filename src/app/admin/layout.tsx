import { Sidebar } from '@/components/layout/sidebar'
import { ADMIN_NAV, navForRole } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/**
 * Administration shell. Users, settings and the audit log live here; the
 * accounting setup screens (currencies, tax codes, fiscal years, numbering)
 * are reachable from both this sidebar and the Accounting one.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const user = await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={navForRole(ADMIN_NAV, user.role)} moduleName="Administration" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
