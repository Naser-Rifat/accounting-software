import { Sidebar } from '@/components/layout/sidebar'
import { STUDENTS_NAV } from '@/config/nav'
import { requireSignedIn } from '@/server/auth/session'

/** Documents live in the Students module shell. */
export default async function DocumentsLayout({ children }: LayoutProps<'/documents'>) {
  await requireSignedIn()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar groups={STUDENTS_NAV} moduleName="Students" />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
