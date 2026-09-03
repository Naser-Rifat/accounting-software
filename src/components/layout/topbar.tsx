import { Breadcrumbs } from '@/components/layout/breadcrumbs'
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
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div>
        <Breadcrumbs />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-primary-foreground"
          >
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="text-right">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {user.role.toLowerCase()}
            </p>
          </div>
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
