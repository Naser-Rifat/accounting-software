import { PageShell } from '@/components/layout/page-shell'
import { ReportTable, ViewTabs } from '@/features/reports/report-table'
import { requireUser } from '@/server/auth/session'
import { applicationStatusReport, enrollmentReport, visaSuccessReport } from '@/server/services/operational-reports-service'

export const metadata = { title: 'Student Reports' }
export const dynamic = 'force-dynamic'

const VIEWS = [
  { key: 'status', label: 'Application status' },
  { key: 'enrollment', label: 'Enrollment' },
  { key: 'visa', label: 'Visa success' },
]

export default async function StudentReportsPage({ searchParams }: PageProps<'/reports/students'>) {
  const user = await requireUser()
  const params = await searchParams
  const view = VIEWS.some((v) => v.key === params.view) ? (params.view as string) : 'status'

  return (
    <PageShell user={user} title="Student Reports" subtitle="Operational views of the pipeline — not financial figures">
      <ViewTabs base="/reports/students" views={VIEWS} current={view} />

      {view === 'status' ? (
        <ReportTable
          title="Application status"
          description="Every application with how long it has sat in its current status."
          columns={[
            { key: 'code', label: 'Application', mono: true },
            { key: 'student', label: 'Student' },
            { key: 'university', label: 'University' },
            { key: 'program', label: 'Program' },
            { key: 'intake', label: 'Intake' },
            { key: 'counselor', label: 'Counselor' },
            { key: 'status', label: 'Status' },
            { key: 'visaStatus', label: 'Visa' },
            { key: 'since', label: 'Since' },
            { key: 'daysInStatus', label: 'Days', align: 'right' },
          ]}
          rows={await applicationStatusReport()}
          exportHref="/api/exports/students-status"
        />
      ) : null}

      {view === 'enrollment' ? (
        <ReportTable
          title="Enrollment"
          description="Enrolled applications and tuition volume by intake and university."
          columns={[
            { key: 'intake', label: 'Intake' },
            { key: 'university', label: 'University' },
            { key: 'enrolled', label: 'Enrolled', align: 'right' },
            { key: 'tuitionVolume', label: 'Tuition volume (per year)', align: 'right' },
          ]}
          rows={await enrollmentReport()}
          exportHref="/api/exports/students-enrollment"
        />
      ) : null}

      {view === 'visa' ? (
        <>
          {await visaSuccessReport().then((r) =>
            [
              { title: 'Visa success by counselor', rows: r.byCounselor, key: 'visa-counselor' },
              { title: 'Visa success by university', rows: r.byUniversity, key: 'visa-university' },
            ].map((t) => (
              <ReportTable
                key={t.key}
                title={t.title}
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'applied', label: 'Applied', align: 'right' },
                  { key: 'approved', label: 'Approved', align: 'right' },
                  { key: 'refused', label: 'Refused', align: 'right' },
                  { key: 'successRate', label: 'Success', align: 'right' },
                ]}
                rows={t.rows}
                exportHref={`/api/exports/students-${t.key}`}
              />
            )),
          )}
        </>
      ) : null}
    </PageShell>
  )
}
