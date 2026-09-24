import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SETTING_SECTIONS } from '@/config/app'
import type { SettingSection } from '@/generated/prisma/enums'
import { SettingChangesTable, SettingsSection } from '@/features/admin/settings-section'
import { submitSetting } from '@/server/actions/settings'
import { canManageSettings } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listRecentSettingChanges, listSettings } from '@/server/services/settings-service'

export const dynamic = 'force-dynamic'

/** URL segment → section. Numbering has its own page; fiscal year lives with the years. */
const SLUGS: Record<string, SettingSection> = {
  company: 'COMPANY',
  tax: 'TAX',
  approvals: 'APPROVALS',
  commission: 'COMMISSION',
  documents: 'DOCUMENTS',
}

export default async function SettingsSectionPage({ params }: PageProps<'/admin/settings/[section]'>) {
  const user = await requireUser()
  const { section: slug } = await params
  if (slug === 'fiscal-year') redirect('/admin/fiscal-years')

  const section = SLUGS[slug]
  if (!section) notFound()
  const meta = SETTING_SECTIONS.find((s) => s.section === section)

  const [settings, changes] = await Promise.all([listSettings(section), listRecentSettingChanges(20, section)])
  const canEdit = canManageSettings(user.role)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <PageShell user={user} title={`${meta?.label ?? slug} settings`} subtitle={meta?.blurb}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {settings.length} setting(s)
            {!canEdit ? <span className="ml-2 text-xs font-normal text-muted-foreground">read-only for your role</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsSection settings={settings} canEdit={canEdit} action={submitSetting} today={today} />
          {section === 'TAX' ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Rates are not settings: they live in{' '}
              <Link href="/admin/tax-codes" className="underline">
                tax codes
              </Link>
              , effective-dated so every document keeps the rate that applied on its own date.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change history</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingChangesTable changes={changes} />
        </CardContent>
      </Card>
    </PageShell>
  )
}
