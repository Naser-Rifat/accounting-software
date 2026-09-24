import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth/session'

/**
 * The account pages have no module sidebar and must stay reachable while a
 * password change is pending — so this shell checks only that someone is
 * signed in, never the password flag (that would redirect to itself).
 */
export default async function AccountLayout({ children }: LayoutProps<'/account'>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <div className="flex min-h-screen flex-col">{children}</div>
}
