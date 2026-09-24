import { Sidebar } from '@/components/layout/sidebar'
import { UNIVERSITIES_NAV } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/** Universities module shell. Auth guarded here, so no page beneath can forget. */
export default async function UniversitiesLayout({ children }: LayoutProps<'/universities'>) {
  await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={UNIVERSITIES_NAV} moduleName="Universities" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
