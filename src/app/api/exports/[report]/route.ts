import { NextResponse } from 'next/server'

import { toCsv, type CsvRow } from '@/lib/csv'
import { getCurrentUser } from '@/server/auth/session'
import { getReceivablesSummary } from '@/server/services/claim-service'
import { listCommissions } from '@/server/services/commission-service'
import { listInternalCommissions } from '@/server/services/internal-commission-service'
import {
  applicationStatusReport,
  branchProfitAndLoss,
  commissionPipeline,
  commissionProfitability,
  enrollmentReport,
  pendingCommission,
  receivedCommission,
  studentReceivablesAging,
  universityCommissionReport,
  universityFunnelReport,
  visaSuccessReport,
} from '@/server/services/operational-reports-service'
import { getControlReconciliation } from '@/server/services/reports-service'

/**
 * CSV export for the Reports module. Same services as the screens, so an
 * export can never disagree with what was on screen. Financial-statement
 * exports live at /api/reports/[report].
 */

/** Rows of plain objects → header + values, in key order. */
function table<T extends Record<string, unknown>>(rows: T[], keys: (keyof T & string)[]): CsvRow[] {
  return [keys, ...rows.map((r) => keys.map((k) => (r[k] === null || r[k] === undefined ? '' : String(r[k]))))]
}

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { report } = await params
  const url = new URL(request.url)
  const today = new Date()
  const fromStr = url.searchParams.get('from') ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const toStr = url.searchParams.get('to') ?? today.toISOString().slice(0, 10)
  const from = new Date(`${fromStr}T00:00:00.000Z`)
  const to = new Date(`${toStr}T00:00:00.000Z`)

  let rows: CsvRow[]
  switch (report) {
    case 'commission-pipeline':
      rows = table(await commissionPipeline(), ['university', 'intake', 'count', 'currency', 'expected', 'eligible', 'total'])
      break
    case 'commission-register':
      rows = table(await listCommissions(), ['applicationCode', 'student', 'university', 'intake', 'counselor', 'instalmentLabel', 'agreement', 'baseAmount', 'rateType', 'rate', 'expectedAmount', 'netAmount', 'currency', 'status', 'eligibleOn', 'approvedOn', 'claimNo', 'receivedOn'])
      break
    case 'commission-pending':
      rows = table(await pendingCommission(), ['applicationCode', 'student', 'university', 'instalment', 'status', 'approvedOn', 'ageDays', 'claimNo', 'dueOn', 'netAmount', 'currency', 'baseAmount'])
      break
    case 'commission-received':
      rows = table(await receivedCommission(from, to), ['receiptNo', 'receivedOn', 'university', 'claims', 'gross', 'withheld', 'net', 'currency', 'baseAmount'])
      break
    case 'withholding-suffered':
      rows = table((await receivedCommission(from, to)).filter((r) => Number(r.withheld) > 0), ['receivedOn', 'university', 'receiptNo', 'claims', 'gross', 'withheld', 'currency'])
      break
    case 'commission-counselor':
    case 'commission-agent':
      rows = table((await listInternalCommissions({ payeeType: report === 'commission-agent' ? 'AGENT' : 'COUNSELOR' })).payees, ['payee', 'code', 'currency', 'earned', 'pending', 'approved', 'paid', 'payableBase'])
      break
    case 'commission-profitability':
      rows = table(await commissionProfitability(), ['applicationCode', 'student', 'university', 'counselor', 'income', 'internalCost', 'margin', 'marginPct'])
      break
    case 'students-status':
      rows = table(await applicationStatusReport(), ['code', 'student', 'university', 'program', 'intake', 'counselor', 'status', 'visaStatus', 'since', 'daysInStatus'])
      break
    case 'students-enrollment':
    case 'universities-enrollment':
      rows = table(await enrollmentReport(), ['intake', 'university', 'enrolled', 'tuitionVolume'])
      break
    case 'students-visa-counselor':
    case 'students-visa-university': {
      const r = await visaSuccessReport()
      rows = table(report.endsWith('counselor') ? r.byCounselor : r.byUniversity, ['name', 'applied', 'approved', 'refused', 'successRate'])
      break
    }
    case 'universities-students':
      rows = table(await universityFunnelReport(), ['university', 'applications', 'offers', 'enrolled', 'conversion'])
      break
    case 'universities-commission':
      rows = table(await universityCommissionReport(), ['university', 'currency', 'expected', 'approved', 'billed', 'received', 'outstanding'])
      break
    case 'control-reconciliation':
      rows = table((await getControlReconciliation()).map((r) => ({ ...r, reconciled: r.reconciled ? 'yes' : 'NO' })), ['code', 'name', 'controlBalance', 'partyBalance', 'difference', 'reconciled'])
      break
    case 'aging-universities':
      rows = table((await getReceivablesSummary()).map((u) => ({ university: u.university, outstanding: u.outstanding, ...u.aging, oldestOverdue: u.oldestOverdue })), ['university', 'outstanding', 'current', '1-30', '31-60', '61-90', '90+', 'oldestOverdue'])
      break
    case 'aging-students':
      rows = table((await studentReceivablesAging()).map((s) => ({ student: s.student, total: s.total, ledger: s.ledger, ...s.aging })), ['student', 'total', 'ledger', 'current', '1-30', '31-60', '61-90', '90+'])
      break
    case 'branch-pl': {
      const r = await branchProfitAndLoss(from, to)
      rows = [[`Branch P&L`, `${r.from} to ${r.to}`], [], ...table([...r.branches, r.consolidated], ['code', 'name', 'income', 'directCosts', 'opex', 'other', 'net'])]
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown report' }, { status: 404 })
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${report}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
