import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { prisma } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'

/**
 * Commission, student and university reports — docs/modules/11-reports.md.
 *
 * Two kinds live here and are labelled as such on screen. Financial figures
 * (billed, received, outstanding, branch P&L) are read from JournalLine.
 * Operational figures (pipeline, funnels, visa success) come from the
 * pipeline tables and are never presented as accounting numbers — a forecast
 * is not revenue.
 */

const toDay = (d: Date) => d.toISOString().slice(0, 10)
const money = (n: number) => n.toFixed(2)
const sumBy = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number) => {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r))
  return m
}

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

/** Expected and eligible by university and intake — pipeline only, not revenue. */
export async function commissionPipeline() {
  const rows = await prisma.commission.findMany({
    where: { status: { in: ['EXPECTED', 'ELIGIBLE'] } },
    include: { application: { select: { university: { select: { name: true } }, intake: { select: { name: true, year: true, month: true } } } } },
  })
  const groups = new Map<string, { university: string; intake: string; sort: number; currency: string; expected: number; eligible: number; count: number }>()
  for (const c of rows) {
    const key = `${c.application.university.name}|${c.application.intake.name}|${c.currency}`
    const g = groups.get(key) ?? { university: c.application.university.name, intake: c.application.intake.name, sort: c.application.intake.year * 100 + c.application.intake.month, currency: c.currency, expected: 0, eligible: 0, count: 0 }
    if (c.status === 'EXPECTED') g.expected += Number(c.netAmount)
    else g.eligible += Number(c.netAmount)
    g.count++
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.university.localeCompare(b.university) || a.sort - b.sort)
    .map((g) => ({ ...g, expected: money(g.expected), eligible: money(g.eligible), total: money(g.expected + g.eligible) }))
}

/** Approved or billed but not yet received, with age since approval. */
export async function pendingCommission() {
  const today = Date.now()
  const rows = await prisma.commission.findMany({
    where: { status: { in: ['APPROVED', 'CLAIMED', 'PARTIALLY_RECEIVED'] } },
    orderBy: { approvedOn: 'asc' },
    include: {
      application: { select: { code: true, student: { select: { firstName: true, lastName: true } }, university: { select: { name: true } } } },
      claim: { select: { claimNo: true, dueOn: true } },
    },
  })
  return rows.map((c) => ({
    id: c.id,
    student: `${c.application.student.firstName} ${c.application.student.lastName}`,
    applicationCode: c.application.code,
    university: c.application.university.name,
    instalment: c.instalmentLabel,
    status: c.status,
    approvedOn: c.approvedOn ? toDay(c.approvedOn) : null,
    ageDays: c.approvedOn ? Math.floor((today - c.approvedOn.getTime()) / 86_400_000) : 0,
    claimNo: c.claim?.claimNo ?? null,
    dueOn: c.claim?.dueOn ? toDay(c.claim.dueOn) : null,
    netAmount: c.netAmount.toFixed(2),
    currency: c.currency,
    baseAmount: c.baseCurrencyAmount?.toFixed(2) ?? null,
  }))
}

/** University receipts in a period: gross, withheld, net, base. */
export async function receivedCommission(from: Date, to: Date) {
  const rows = await prisma.receipt.findMany({
    where: { party: { type: 'UNIVERSITY' }, receivedOn: { gte: from, lte: to } },
    orderBy: { receivedOn: 'asc' },
    include: { party: { select: { name: true } }, allocations: { include: { claim: { select: { claimNo: true } } } } },
  })
  return rows.map((r) => ({
    receiptNo: r.receiptNo,
    receivedOn: toDay(r.receivedOn),
    university: r.party.name,
    claims: r.allocations.map((a) => a.claim?.claimNo).filter(Boolean).join(', ') || '—',
    gross: r.amount.toFixed(2),
    withheld: r.withheldTax.toFixed(2),
    net: r.amount.sub(r.withheldTax).toFixed(2),
    currency: r.currency,
    baseAmount: r.baseAmount.toFixed(2),
  }))
}

/** Per application: recognised commission less internal commission, in base currency. */
export async function commissionProfitability() {
  const apps = await prisma.application.findMany({
    where: { commissions: { some: { status: { in: ['APPROVED', 'CLAIMED', 'PARTIALLY_RECEIVED', 'RECEIVED'] } } } },
    include: {
      student: { select: { firstName: true, lastName: true } },
      university: { select: { name: true } },
      counselor: { select: { name: true } },
      commissions: { where: { status: { in: ['APPROVED', 'CLAIMED', 'PARTIALLY_RECEIVED', 'RECEIVED'] } }, select: { baseCurrencyAmount: true } },
      internalCommissions: { where: { status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] } }, select: { baseCurrencyAmount: true } },
    },
    orderBy: { code: 'asc' },
  })
  return apps.map((a) => {
    const income = a.commissions.reduce((s, c) => s + Number(c.baseCurrencyAmount ?? 0), 0)
    const cost = a.internalCommissions.reduce((s, i) => s + Number(i.baseCurrencyAmount ?? 0), 0)
    return {
      applicationCode: a.code,
      student: `${a.student.firstName} ${a.student.lastName}`,
      university: a.university.name,
      counselor: a.counselor.name,
      income: money(income),
      internalCost: money(cost),
      margin: money(income - cost),
      marginPct: income > 0 ? `${(((income - cost) / income) * 100).toFixed(1)}%` : '—',
    }
  })
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function applicationStatusReport() {
  const today = Date.now()
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      student: { select: { firstName: true, lastName: true } },
      university: { select: { name: true } },
      program: { select: { name: true } },
      intake: { select: { name: true } },
      counselor: { select: { name: true } },
      history: { orderBy: { changedAt: 'desc' }, take: 1 },
    },
  })
  return apps.map((a) => ({
    code: a.code,
    student: `${a.student.firstName} ${a.student.lastName}`,
    university: a.university.name,
    program: a.program.name,
    intake: a.intake.name,
    counselor: a.counselor.name,
    status: a.status,
    visaStatus: a.visaStatus,
    since: a.history[0] ? toDay(a.history[0].changedAt) : toDay(a.createdAt),
    daysInStatus: Math.floor((today - (a.history[0]?.changedAt ?? a.createdAt).getTime()) / 86_400_000),
  }))
}

/** Enrolled count and tuition volume by intake and university. */
export async function enrollmentReport() {
  const apps = await prisma.application.findMany({
    where: { status: 'ENROLLED' },
    include: { university: { select: { name: true } }, intake: { select: { name: true, year: true, month: true } } },
  })
  const groups = new Map<string, { intake: string; sort: number; university: string; enrolled: number; tuition: Map<string, number> }>()
  for (const a of apps) {
    const key = `${a.intake.name}|${a.university.name}`
    const g = groups.get(key) ?? { intake: a.intake.name, sort: a.intake.year * 100 + a.intake.month, university: a.university.name, enrolled: 0, tuition: new Map() }
    g.enrolled++
    g.tuition.set(a.currency, (g.tuition.get(a.currency) ?? 0) + Number(a.tuitionFee))
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.university.localeCompare(b.university))
    .map((g) => ({ intake: g.intake, university: g.university, enrolled: g.enrolled, tuitionVolume: [...g.tuition].map(([c, n]) => `${c} ${money(n)}`).join(' · ') }))
}

/** Visa outcomes by counselor and by university. */
export async function visaSuccessReport() {
  const apps = await prisma.application.findMany({
    where: { visaStatus: { not: 'NOT_STARTED' } },
    include: { counselor: { select: { name: true } }, university: { select: { name: true } } },
  })
  const build = (key: (a: (typeof apps)[number]) => string) => {
    const m = new Map<string, { name: string; applied: number; approved: number; refused: number }>()
    for (const a of apps) {
      const g = m.get(key(a)) ?? { name: key(a), applied: 0, approved: 0, refused: 0 }
      if (['APPLIED', 'INTERVIEW', 'APPROVED', 'REFUSED'].includes(a.visaStatus)) g.applied++
      if (a.visaStatus === 'APPROVED') g.approved++
      if (a.visaStatus === 'REFUSED') g.refused++
      m.set(key(a), g)
    }
    return [...m.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => ({ ...g, successRate: g.approved + g.refused > 0 ? `${((g.approved / (g.approved + g.refused)) * 100).toFixed(0)}%` : '—' }))
  }
  return { byCounselor: build((a) => a.counselor.name), byUniversity: build((a) => a.university.name) }
}

// ---------------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------------

const OFFER_OR_BEYOND = ['OFFER_RECEIVED', 'DEPOSIT_PAID', 'ENROLLED']

export async function universityFunnelReport() {
  const universities = await prisma.university.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { applications: { select: { status: true } } },
  })
  return universities.map((u) => {
    const applications = u.applications.length
    const offers = u.applications.filter((a) => OFFER_OR_BEYOND.includes(a.status)).length
    const enrolled = u.applications.filter((a) => a.status === 'ENROLLED').length
    return { university: u.name, applications, offers, enrolled, conversion: applications > 0 ? `${((enrolled / applications) * 100).toFixed(0)}%` : '—' }
  })
}

/** Per university: expected (pipeline), approved, billed, received, outstanding — the last four from the ledger side. */
export async function universityCommissionReport() {
  const universities = await prisma.university.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      applications: { select: { commissions: { select: { status: true, netAmount: true, currency: true, baseCurrencyAmount: true } } } },
      claims: { where: { status: { in: ['SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED'] } }, select: { baseAmount: true, allocations: { select: { baseAmount: true } } } },
    },
  })
  const outstanding = await controlBalances(ACCOUNTS.AR_UNIVERSITIES, universities.map((u) => u.partyId), 'DEBIT')
  return universities.map((u) => {
    const commissions = u.applications.flatMap((a) => a.commissions)
    const expected = sumBy(commissions.filter((c) => c.status === 'EXPECTED' || c.status === 'ELIGIBLE'), (c) => c.currency, (c) => Number(c.netAmount))
    const approved = commissions.filter((c) => ['APPROVED', 'CLAIMED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(c.status)).reduce((s, c) => s + Number(c.baseCurrencyAmount ?? 0), 0)
    const billed = u.claims.reduce((s, c) => s + Number(c.baseAmount ?? 0), 0)
    const received = u.claims.reduce((s, c) => s + c.allocations.reduce((x, a) => x + Number(a.baseAmount), 0), 0)
    return {
      university: u.name,
      currency: u.currency,
      expected: [...expected].map(([c, n]) => `${c} ${money(n)}`).join(' · ') || '—',
      approved: money(approved),
      billed: money(billed),
      received: money(received),
      outstanding: outstanding.get(u.partyId) ?? '0.00',
    }
  })
}

// ---------------------------------------------------------------------------
// Financial: branch P&L and receivables aging (from the ledger)
// ---------------------------------------------------------------------------

/** Income and expense by cost center for a period, plus a consolidated column. */
export async function branchProfitAndLoss(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ code: string | null; name: string | null; type: string; group: string; debit: string; credit: string }[]>`
    SELECT cc."code", cc."name", a."type"::text AS type, LEFT(a."code", 1) AS "group",
           COALESCE(SUM(l."debit"),0)::text AS debit, COALESCE(SUM(l."credit"),0)::text AS credit
      FROM "JournalLine" l
      JOIN "JournalEntry" e ON e."id" = l."entryId"
      JOIN "Account" a ON a."id" = l."accountId"
      LEFT JOIN "CostCenter" cc ON cc."id" = l."costCenterId"
     WHERE e."status" IN ('POSTED','REVERSED')
       AND e."entryDate" >= ${from} AND e."entryDate" <= ${to}
       AND a."type" IN ('INCOME','EXPENSE')
     GROUP BY cc."code", cc."name", a."type", LEFT(a."code", 1)
  `
  type Col = { code: string; name: string; income: number; directCosts: number; opex: number; other: number; net: number }
  const cols = new Map<string, Col>()
  const consolidated: Col = { code: 'ALL', name: 'Consolidated', income: 0, directCosts: 0, opex: 0, other: 0, net: 0 }
  for (const r of rows) {
    const code = r.code ?? '—'
    const col = cols.get(code) ?? { code, name: r.name ?? 'Unassigned', income: 0, directCosts: 0, opex: 0, other: 0, net: 0 }
    const debit = Number(r.debit)
    const credit = Number(r.credit)
    const apply = (c: Col) => {
      if (r.type === 'INCOME') c.income += credit - debit
      else if (r.group === '5') c.directCosts += debit - credit
      else if (r.group === '6') c.opex += debit - credit
      else c.other += debit - credit
    }
    apply(col)
    apply(consolidated)
    cols.set(code, col)
  }
  const finish = (c: Col) => ({ ...c, net: c.income - c.directCosts - c.opex - c.other })
  return {
    from: toDay(from),
    to: toDay(to),
    branches: [...cols.values()].sort((a, b) => a.code.localeCompare(b.code)).map(finish).map((c) => ({ ...c, income: money(c.income), directCosts: money(c.directCosts), opex: money(c.opex), other: money(c.other), net: money(c.net) })),
    consolidated: (() => {
      const c = finish(consolidated)
      return { ...c, income: money(c.income), directCosts: money(c.directCosts), opex: money(c.opex), other: money(c.other), net: money(c.net) }
    })(),
  }
}

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const
type Bucket = (typeof BUCKETS)[number]
const bucketOf = (days: number): Bucket => (days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+')

/** Student invoices (1110) by party, bucketed from due date, in base currency. */
export async function studentReceivablesAging() {
  const today = Date.now()
  const invoices = await prisma.studentInvoice.findMany({
    where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    include: { student: { select: { firstName: true, lastName: true, partyId: true } }, allocations: { select: { amount: true } }, creditNotes: { select: { amount: true } } },
  })
  const byParty = new Map<string, { partyId: string; student: string; total: number; aging: Record<Bucket, number> }>()
  for (const i of invoices) {
    const balance = Number(i.total) - i.allocations.reduce((s, a) => s + Number(a.amount), 0) - i.creditNotes.reduce((s, c) => s + Number(c.amount), 0)
    if (balance <= 0) continue
    const days = i.dueOn ? Math.floor((today - i.dueOn.getTime()) / 86_400_000) : 0
    const row = byParty.get(i.student.partyId) ?? { partyId: i.student.partyId, student: `${i.student.firstName} ${i.student.lastName}`, total: 0, aging: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } }
    row.total += balance
    row.aging[bucketOf(days)] += balance
    byParty.set(i.student.partyId, row)
  }
  const control = await controlBalances(ACCOUNTS.AR_STUDENTS, [...byParty.keys()], 'DEBIT')
  return [...byParty.values()].map((r) => ({
    student: r.student,
    total: money(r.total),
    ledger: control.get(r.partyId) ?? '0.00',
    aging: Object.fromEntries(BUCKETS.map((b) => [b, money(r.aging[b])])) as Record<Bucket, string>,
  }))
}
