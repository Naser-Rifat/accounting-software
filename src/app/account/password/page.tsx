import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm } from '@/features/accounting/action-form'
import { submitChangePassword, submitSignOutEverywhere } from '@/server/actions/users'
import { getCurrentUser } from '@/server/auth/session'

export const metadata = { title: 'Change password' }
export const dynamic = 'force-dynamic'

export default async function PasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <PageShell user={user} title="Change password" subtitle={user.mustChangePassword ? 'Required before you continue' : 'Your account'}>
      <div className="mx-auto w-full max-w-lg space-y-4">
        {user.mustChangePassword ? (
          <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            Your password was set by an administrator. Choose your own before using the system — every
            other session on this account will be signed out.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/modules" className="underline">
              ← Back to modules
            </Link>
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New password</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={submitChangePassword} submitLabel="Change password" pendingLabel="Changing…">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password (at least 10 characters)</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Repeat the new password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        {!user.mustChangePassword ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Other devices</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Sign this account out everywhere else. This browser stays signed in.</p>
              <form action={submitSignOutEverywhere}>
                <Button type="submit" size="sm" variant="outline">
                  Sign out everywhere
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageShell>
  )
}
