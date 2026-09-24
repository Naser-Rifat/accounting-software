import { Button } from '@/components/ui/button'
import { MODULES } from '@/config/modules'
import { ModuleCard } from '@/features/modules/module-card'
import { logout } from '@/server/actions/auth'
import { requireSignedIn } from '@/server/auth/session'

export const metadata = {
  title: 'Modules - Accounting System',
}

export default async function ModulesPage() {
  const user = await requireSignedIn()

  const available = MODULES.filter((m) => m.status === 'AVAILABLE')
  const planned = MODULES.filter((m) => m.status === 'PLANNED')

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Grapcode
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Modules</h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.name}. Choose a module to continue.
          </p>
        </div>

        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Available
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((module) => (
            <li key={module.key}>
              <ModuleCard module={module} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Planned
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planned.map((module) => (
            <li key={module.key}>
              <ModuleCard module={module} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
