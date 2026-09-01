import { logout } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import type { SessionUser } from '@/server/auth/session'

export function Topbar({
  user,
  title,
  subtitle,
}: {
  user: SessionUser
  title: string
  subtitle?: string
}) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.role.toLowerCase()}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  )
}
