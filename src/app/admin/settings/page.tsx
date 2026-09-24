import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SETTING_SECTIONS } from '@/config/app'
import { SettingChangesTable, settingLabel } from '@/features/admin/settings-section'
import { canManageSettings } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listAllSettings, listRecentSettingChanges } from '@/server/services/settings-service'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsHubPage({ searchParams }: PageProps<'/admin/settings'>) {
  const user = await requireUser()
  if (!canManageSettings(user.role)) redirect('/admin/branches')

  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim().toLowerCase() : ''
  const [settings, recent] = await Promise.all([listAllSettings(), listRecentSettingChanges(10)])

  const matches = q ? settings.filter((s) => s.key.toLowerCase().includes(q) || settingLabel(s.key).toLowerCase().includes(q)) : []
  const bySection = new Map<string, typeof settings>()
  for (const s of settings) bySection.set(s.section, [...(bySection.get(s.section) ?? []), s])

  return (
    <PageShell user={user} title="Settings" subtitle={`${settings.length} keys across ${bySection.size} sections · ${settings.filter((s) => s.isLocked).length} locked`}>
      <form className="flex items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search keys, e.g. currency" className="w-72" />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">
          Search
        </button>
      </form>

      {q ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{matches.length} match(es) for “{q}”</CardTitle>
          </CardHeader>
          <CardContent>
            {matches.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing matches.</p>
            ) : (
              <ul className="divide-y text-sm">
                {matches.map((s) => {
                  const section = SETTING_SECTIONS.find((x) => x.section === s.section)
                  return (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={section?.href ?? '/admin/settings'} className="font-medium hover:underline">
                          {settingLabel(s.key)}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{s.key}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="max-w-xs truncate font-mono text-xs">{s.value || '—'}</span>
                        {s.isLocked ? <Badge variant="secondary">locked</Badge> : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTING_SECTIONS.map((section) => {
          const keys = bySection.get(section.section) ?? []
          const latest = keys.map((k) => k.updatedAt).sort().pop()
          return (
            <Card key={section.section}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={section.href} className="hover:underline">
                    {section.label}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{section.blurb}</p>
                <p className="text-xs text-muted-foreground">
                  {keys.length} key(s) · {keys.filter((k) => k.isLocked).length} locked
                  {latest ? ` · updated ${latest.slice(0, 10)}` : ''}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Changed recently</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingChangesTable changes={recent} />
          <p className="mt-4 text-xs text-muted-foreground">
            Every change is dated and attributed. Values that affect posted documents are resolved by
            document date, so an old invoice keeps the value that applied when it was issued.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
