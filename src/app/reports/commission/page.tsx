import { PageShell } from '@/components/layout/page-shell'
import { Input } from '@/components/ui/input'
import { ReportTable, ViewTabs } from '@/features/reports/report-table'
import { requireUser } from '@/server/auth/session'
import { listCommissions } from '@/server/services/commission-service'
import { listInternalCommissions } from '@/server/services/internal-commission-service'
import { commissionPipeline, commissionProfitability, pendingCommission, receivedCommission } from '@/server/services/operational-reports-service'

export const metadata = { title: 'Commission Reports' }
export const dynamic = 'force-dynamic'

const VIEWS = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'register', label: 'Register' },
  { key: 'pending', label: 'Pending' },
  { key: 'received', label: 'Received' },
  { key: 'payees', label: 'Counselor / agent' },
  { key: 'profitability', label: 'Profitability' },
]

export default async function CommissionReportsPage({ searchParams }: PageProps<'/reports/commission'>) {
  const user = await requireUser()
  const params = await searchParams
  const view = VIEWS.some((v) => v.key === params.view) ? (params.view as string) : 'pipeline'
  const today = new Date()
  const fromStr = typeof params.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)).toISOString().slice(0, 10)
  const toStr = typeof params.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today.toISOString().slice(0, 10)
  const exportHref = (r: string) => `/api/exports/${r}?from=${fromStr}&to=${toStr}`

  return (
    <PageShell user={user} title="Commission Reports" subtitle="Pipeline is a forecast; billed and received figures come from the ledger">
      <ViewTabs base="/reports/commission" views={VIEWS} current={view} />

      {view === 'pipeline' ? (
        <ReportTable
          title="Commission pipeline"
          description="Expected and eligible instalments by university and intake — not revenue until approved."
          columns={[
            { key: 'university', label: 'University' },
            { key: 'intake', label: 'Intake' },
            { key: 'count', label: 'Instalments', align: 'right' },
            { key: 'currency', label: 'Ccy' },
            { key: 'expected', label: 'Expected', align: 'right' },
            { key: 'eligible', label: 'Eligible', align: 'right' },
            { key: 'total', label: 'Total', align: 'right' },
          ]}
          rows={await commissionPipeline()}
          exportHref={exportHref('commission-pipeline')}
        />
      ) : null}

      {view === 'register' ? (
        <ReportTable
          title="Commission register"
          description="Every instalment with its base, rate, expected, net and status."
          columns={[
            { key: 'applicationCode', label: 'Application', mono: true },
            { key: 'student', label: 'Student' },
            { key: 'university', label: 'University' },
            { key: 'instalmentLabel', label: 'Instalment' },
            { key: 'baseAmount', label: 'Base', align: 'right' },
            { key: 'rate', label: 'Rate', align: 'right' },
            { key: 'expectedAmount', label: 'Expected', align: 'right' },
            { key: 'netAmount', label: 'Net', align: 'right' },
            { key: 'currency', label: 'Ccy' },
            { key: 'status', label: 'Status' },
          ]}
          rows={await listCommissions()}
          exportHref={exportHref('commission-register')}
        />
      ) : null}

      {view === 'pending' ? (
        <ReportTable
          title="Pending commission"
          description="Approved or billed but not yet received, aged from the approval date."
          kind="financial"
          columns={[
            { key: 'applicationCode', label: 'Application', mono: true },
            { key: 'student', label: 'Student' },
            { key: 'university', label: 'University' },
            { key: 'instalment', label: 'Instalment' },
            { key: 'status', label: 'Status' },
            { key: 'approvedOn', label: 'Approved' },
            { key: 'ageDays', label: 'Age (days)', align: 'right' },
            { key: 'claimNo', label: 'Claim', mono: true },
            { key: 'dueOn', label: 'Due' },
            { key: 'netAmount', label: 'Net', align: 'right' },
            { key: 'currency', label: 'Ccy' },
            { key: 'baseAmount', label: 'Base', align: 'right' },
          ]}
          rows={await pendingCommission()}
          exportHref={exportHref('commission-pending')}
        />
      ) : null}

      {view === 'received' ? (
        <>
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value="received" />
            <Input name="from" type="date" defaultValue={fromStr} className="w-40" />
            <Input name="to" type="date" defaultValue={toStr} className="w-40" />
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              Apply
            </button>
          </form>
          <ReportTable
            title={`Received commission ${fromStr} to ${toStr}`}
            description="University receipts: gross settled, tax withheld at source, net cash, base amount."
            kind="financial"
            columns={[
              { key: 'receiptNo', label: 'Receipt', mono: true },
              { key: 'receivedOn', label: 'Date' },
              { key: 'university', label: 'University' },
              { key: 'claims', label: 'Claims', mono: true },
              { key: 'gross', label: 'Gross', align: 'right' },
              { key: 'withheld', label: 'Withheld', align: 'right' },
              { key: 'net', label: 'Net cash', align: 'right' },
              { key: 'currency', label: 'Ccy' },
              { key: 'baseAmount', label: 'Base', align: 'right' },
            ]}
            rows={await receivedCommission(new Date(`${fromStr}T00:00:00Z`), new Date(`${toStr}T00:00:00Z`))}
            exportHref={exportHref('commission-received')}
          />
        </>
      ) : null}

      {view === 'payees' ? (
        <>
          {(
            await Promise.all([listInternalCommissions({ payeeType: 'COUNSELOR' }), listInternalCommissions({ payeeType: 'AGENT' })])
          ).map((r, i) => (
            <ReportTable
              key={i}
              title={i === 0 ? 'Counselor commission' : 'Agent commission'}
              description="Earned, pending, approved and paid per payee; payable is the 2020 balance from the ledger."
              kind="financial"
              columns={[
                { key: 'payee', label: 'Payee' },
                { key: 'code', label: 'Party', mono: true },
                { key: 'currency', label: 'Ccy' },
                { key: 'earned', label: 'Earned', align: 'right' },
                { key: 'pending', label: 'Pending', align: 'right' },
                { key: 'approved', label: 'Approved', align: 'right' },
                { key: 'paid', label: 'Paid', align: 'right' },
                { key: 'payableBase', label: 'Payable (base)', align: 'right' },
              ]}
              rows={r.payees}
              exportHref={exportHref(i === 0 ? 'commission-counselor' : 'commission-agent')}
            />
          ))}
        </>
      ) : null}

      {view === 'profitability' ? (
        <ReportTable
          title="Commission profitability"
          description="Per application: recognised commission less counselor and agent commission, in base currency."
          kind="financial"
          columns={[
            { key: 'applicationCode', label: 'Application', mono: true },
            { key: 'student', label: 'Student' },
            { key: 'university', label: 'University' },
            { key: 'counselor', label: 'Counselor' },
            { key: 'income', label: 'Commission income', align: 'right' },
            { key: 'internalCost', label: 'Internal commission', align: 'right' },
            { key: 'margin', label: 'Margin', align: 'right' },
            { key: 'marginPct', label: 'Margin %', align: 'right' },
          ]}
          rows={await commissionProfitability()}
          exportHref={exportHref('commission-profitability')}
          footer="Directly attributed application costs join this report when expense bills are linked to applications."
        />
      ) : null}
    </PageShell>
  )
}
