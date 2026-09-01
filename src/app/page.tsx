import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/server/auth/session'

/** Entry point: straight to the module launcher, or to sign-in. */
export default async function Home() {
  const user = await getCurrentUser()
  redirect(user ? '/modules' : '/login')
}
