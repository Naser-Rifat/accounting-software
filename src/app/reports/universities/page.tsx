import { PageShell } from '@/components/layout/page-shell'
import { ReportTable, ViewTabs } from '@/features/reports/report-table'
import { requireUser } from '@/server/auth/session'
import { enrollmentReport, universityCommissionReport, universityFunnelReport } from '@/server/services/operational-reports-service'

export const metadata = { title: 'University Reports' }
export const dynamic = 'force-dynamic'

const VIEWS = [
  { key: 'students', label: 'Students & conversion' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'commission', label: 'Commission' },
]

export default async function UniversityReportsPage({ searchParams }: PageProps<'/reports/universities'>) {
  const user = await requireUser()
  const params = await searchParams
  const view = VIEWS.some((v) => v.key === params.view) ? (params.view as string) : 'students'

  return (
    <PageShell user={user} title="University Reports" subtitle="Per partner: funnel, enrollment and commission position">
      <ViewTabs base="/reports/universities" views={VIEWS} current={view} />

      {view === 'students' ? (
        <ReportTable
          title="University-wise students"
          description="Applications, offers, enrolled and conversion per university."
          columns={[
            { key: 'university', label: 'University' },
            { key: 'applications', label: 'Applications', align: 'right' },
            { key: 'offers', label: 'Offers', align: 'right' },
            { key: 'enrolled', label: 'Enrolled', align: 'right' },
            { key: 'conversion', label: 'Conversion', align: 'right' },
          ]}
          rows={await universityFunnelReport()}
          exportHref="/api/exports/universities-students"
        />
      ) : null}

      {view === 'enrollment' ? (
        <ReportTable
          title="University-wise enrollment"
          columns={[
            { key: 'university', label: 'University' },
            { key: 'intake', label: 'Intake' },
            { key: 'enrolled', label: 'Enrolled', align: 'right' },
            { key: 'tuitionVolume', label: 'Tuition volume (per year)', align: 'right' },
          ]}
          rows={(await enrollmentReport()).sort((a, b) => a.university.localeCompare(b.university))}
          exportHref="/api/exports/universities-enrollment"
        />
      ) : null}

      {view === 'commission' ? (
        <ReportTable
          title="University-wise commission"
          description="Expected is the pipeline in the university's currency; approved, billed, received and outstanding are base-currency ledger figures."
          kind="financial"
          columns={[
            { key: 'university', label: 'University' },
            { key: 'currency', label: 'Pays in' },
            { key: 'expected', label: 'Expected (pipeline)', align: 'right' },
            { key: 'approved', label: 'Approved', align: 'right' },
            { key: 'billed', label: 'Billed', align: 'right' },
            { key: 'received', label: 'Received', align: 'right' },
            { key: 'outstanding', label: 'Outstanding (1120)', align: 'right' },
          ]}
          rows={await universityCommissionReport()}
          exportHref="/api/exports/universities-commission"
        />
      ) : null}
    </PageShell>
  )
}
