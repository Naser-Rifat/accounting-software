import { redirect } from 'next/navigation'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LoginForm } from '@/features/auth/login-form'
import { getCurrentUser } from '@/server/auth/session'

export const metadata = {
  title: 'Sign in - Accounting System',
}

export default async function LoginPage() {
  // Already signed in — no reason to show the form again.
  if (await getCurrentUser()) redirect('/modules')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Apex DMIT
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Accounting System</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your user ID and password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Seeded account: <span className="font-mono">admin</span> /{' '}
          <span className="font-mono">admin123</span> — change this before real use.
        </p>
      </div>
    </main>
  )
}
