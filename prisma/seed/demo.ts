/**
 * Demo transactions for testing — opt-in, on top of the base seed.
 *
 *   npm run db:seed         configuration, universities, students (idempotent)
 *   npm run db:seed:demo    this file: money moving through every module
 *
 * Every posting goes through the services, i.e. through postEntry(), so the
 * ledger the demo leaves behind obeys the same rules as live data. The services
 * import `server-only`, which throws outside a React Server Components build;
 * the npm script runs tsx with `--conditions=react-server`, under which that
 * package resolves to its empty stub (the same idea as the alias in
 * vitest.config.ts). The imports are dynamic so `.env` is loaded before the
 * Prisma client reads DATABASE_URL.
 *
 * Idempotent: each block is keyed on something it creates (a vendor code, an
 * invoice for a student, an instalment still EXPECTED) and skipped when that
 * already exists. Nothing is ever deleted — `prisma migrate reset` for a clean
 * slate. Rule 6: numbers spent by a partial run are never reused.
 */

import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

const ADMIN = 'admin'
/** Every demo login. Real deployments create users in Admin -> Users & Roles. */
const DEMO_PASSWORD = 'Welcome@2026'
const CAPITAL_NARRATION = "Owner's capital introduced — opening bank and cash"
const LAPTOPS = 'Counselor laptops (Dell Latitude 5450 ×3)'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const plusDays = (s: string, n: number) => new Date(day(s).getTime() + n * 86_400_000)

async function main() {
  const { prisma } = await import('../../src/server/db/client')
  const { ACCOUNTS } = await import('../../src/server/accounting/accounts')
  const purchases = await import('../../src/server/services/purchases-service')
  const vouchers = await import('../../src/server/services/voucher-service')
  const assets = await import('../../src/server/services/asset-service')
  const users = await import('../../src/server/services/user-service')
  const invoices = await import('../../src/server/services/invoice-service')
  const receipts = await import('../../src/server/services/receipt-service')
  const commissions = await import('../../src/server/services/commission-service')
  const claims = await import('../../src/server/services/claim-service')
  const payouts = await import('../../src/server/services/internal-commission-service')
  const { getControlReconciliation } = await import('../../src/server/services/reports-service')

  const admin = await prisma.user.findUnique({ where: { username: ADMIN } })
  const mahmud = await prisma.student.findFirst({ where: { passportNo: 'C55667788' } })
  if (!admin || !mahmud) {
    throw new Error('Run `npm run db:seed` first — the demo builds on the admin user, universities and students it creates.')
  }
  const actor = { id: admin.id, username: admin.username }
  const bank = await prisma.bankAccount.findFirstOrThrow({ where: { isClientAccount: false, isActive: true } })
  const post = { canPostToSoftClosed: true }

  console.log('Seeding demo transactions...')

  // -- Users: one per role, so role-gated screens can be tested ------------
  const farhana = await prisma.counselor.findFirst({ where: { email: 'farhana@agency.example' } })
  const edulink = await prisma.agent.findFirst({ where: { email: 'contact@edulink.example' } })
  let newUsers = 0
  for (const u of [
    { username: 'accountant', name: 'Nazia Karim', email: 'accounts@agency.example', role: 'ACCOUNTANT' as const },
    { username: 'farhana', name: 'Farhana Rahman', email: 'farhana@agency.example', role: 'COUNSELOR' as const, counselorId: farhana?.id },
    { username: 'edulink', name: 'Rafiq Chowdhury', email: 'contact@edulink.example', role: 'AGENT' as const, agentId: edulink?.id },
    { username: 'viewer', name: 'Board Viewer', email: 'board@agency.example', role: 'VIEWER' as const },
  ]) {
    if (await prisma.user.findUnique({ where: { username: u.username } })) continue
    const created = await users.createUser({ ...u, tempPassword: DEMO_PASSWORD, actor })
    // Demo logins skip the forced first-sign-in password change.
    await prisma.user.update({ where: { id: created.id }, data: { mustChangePassword: false } })
    newUsers++
  }
  const accountant = await prisma.user.findUniqueOrThrow({ where: { username: 'accountant' } })
  const accountantActor = { id: accountant.id, username: accountant.username }
  console.log(`  users           4 demo logins (${newUsers} new) · password ${DEMO_PASSWORD}`)

  // -- Capital, a voucher awaiting approval and a parked draft -------------
  if (!(await prisma.journalEntry.findFirst({ where: { narration: CAPITAL_NARRATION } }))) {
    await vouchers.postManualVoucher({
      entryDate: day('2026-07-01'),
      narration: CAPITAL_NARRATION,
      lines: [
        { accountCode: ACCOUNTS.BANK, debit: '2500000' },
        { accountCode: ACCOUNTS.CASH_IN_HAND, debit: '100000' },
        { accountCode: ACCOUNTS.OWNERS_CAPITAL, credit: '2600000' },
      ],
      createdBy: ADMIN,
      ...post,
    })
    // Made by the accountant so the admin can approve it (no self-approval).
    await vouchers.submitManualVoucher({
      entryDate: day('2026-09-18'),
      narration: 'Petty cash: office refreshments and courier charges for the week',
      lines: [
        { accountCode: ACCOUNTS.MISCELLANEOUS, debit: '3450' },
        { accountCode: ACCOUNTS.CASH_IN_HAND, credit: '3450' },
      ],
      createdBy: accountant.username,
      ...post,
    })
    await vouchers.saveManualVoucherDraft({
      entryDate: day('2026-09-22'),
      narration: 'Prepaid: annual CRM subscription, to be released monthly',
      lines: [
        { accountCode: ACCOUNTS.PREPAID_EXPENSES, debit: '96000' },
        { accountCode: ACCOUNTS.BANK, credit: '96000' },
      ],
      createdBy: ADMIN,
      ...post,
    })
    console.log('  vouchers        capital JV posted · 1 pending approval · 1 draft')
  } else {
    console.log('  vouchers        already seeded')
  }

  // -- Purchases: vendors, bills, payments, a debit note -------------------
  if (!(await prisma.party.findUnique({ where: { code: 'GULSHAN-PROP' } }))) {
    const vendor: Record<string, string> = {}
    for (const v of [
      { code: 'GULSHAN-PROP', name: 'Gulshan Properties Ltd' },
      { code: 'LINK3', name: 'Link3 Technologies Ltd' },
      { code: 'RAINBOW-PRINT', name: 'Rainbow Printers' },
    ]) {
      vendor[v.code] = (await purchases.createVendor({ name: v.name, code: v.code, createdBy: ADMIN })).id
    }

    async function bill(b: {
      vendor: string
      category: string
      incurredOn: string
      dueDays: number
      amount: string
      tax?: string
      ref: string
      description: string
      approve?: boolean
    }) {
      const category = await prisma.expenseCategory.findUniqueOrThrow({ where: { code: b.category } })
      const created = await purchases.createBill({
        partyId: vendor[b.vendor]!,
        categoryId: category.id,
        incurredOn: day(b.incurredOn),
        dueOn: plusDays(b.incurredOn, b.dueDays),
        amount: b.amount,
        taxAmount: b.tax ?? '0',
        vendorRef: b.ref,
        description: b.description,
        createdBy: accountant.username,
      })
      if (b.approve !== false) await purchases.approveBill({ billId: created.id, approvedBy: ADMIN, canPostToSoftClosed: true })
      return created
    }

    await bill({ vendor: 'GULSHAN-PROP', category: 'RENT', incurredOn: '2026-08-01', dueDays: 7, amount: '120000', ref: 'GP/RENT/2026-08', description: 'Office rent, August 2026 — Gulshan 2' })
    await bill({ vendor: 'GULSHAN-PROP', category: 'RENT', incurredOn: '2026-09-01', dueDays: 7, amount: '120000', ref: 'GP/RENT/2026-09', description: 'Office rent, September 2026 — Gulshan 2' })
    await bill({ vendor: 'LINK3', category: 'COMMS', incurredOn: '2026-09-05', dueDays: 15, amount: '8500', tax: '1275', ref: 'L3-INV-448120', description: 'Dedicated internet 100 Mbps, September 2026' })
    const printing = await bill({ vendor: 'RAINBOW-PRINT', category: 'PRINTING', incurredOn: '2026-09-12', dueDays: 30, amount: '14200', ref: 'RP-2291', description: 'Prospectus and brochure reprint, 500 copies' })
    await bill({ vendor: 'LINK3', category: 'COMMS', incurredOn: '2026-09-20', dueDays: 15, amount: '2400', ref: 'L3-INV-451077', description: 'Static IP add-on (awaiting approval)', approve: false })

    // August rent paid with 5% tax withheld; the internet bill paid in full.
    await purchases.payVendor({ partyId: vendor['GULSHAN-PROP']!, paidOn: day('2026-08-05'), amount: '120000', withheldTax: '6000', bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', reference: 'TRF-20260805-01', createdBy: accountant.username, canPostToSoftClosed: true })
    await purchases.payVendor({ partyId: vendor['LINK3']!, paidOn: day('2026-09-15'), amount: '9775', withheldTax: '0', bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', reference: 'TRF-20260915-03', createdBy: accountant.username, canPostToSoftClosed: true })
    await purchases.createDebitNote({ billId: printing.id, issuedOn: day('2026-09-14'), amount: '1200', reason: '40 copies delivered water-damaged', createdBy: accountant.username, canPostToSoftClosed: true })
    console.log('  purchases       3 vendors · 5 bills (4 approved) · 2 payments · 1 debit note')
  } else {
    console.log('  purchases       already seeded')
  }

  // -- Fixed assets: one straight-line, one reducing-balance ---------------
  if (!(await prisma.asset.findFirst({ where: { name: LAPTOPS } }))) {
    const computers = await prisma.assetCategory.findFirstOrThrow({ where: { code: 'COMPUTER' } })
    const furniture = await prisma.assetCategory.findFirstOrThrow({ where: { code: 'FURNITURE' } })
    await assets.createAsset({ name: LAPTOPS, description: 'One per Dhaka counselor', categoryId: computers.id, acquiredOn: day('2026-07-10'), cost: '285000', salvageValue: '15000', method: 'STRAIGHT_LINE', usefulLifeMonths: 36, depreciationStartOn: day('2026-08-01'), createdBy: ADMIN })
    await assets.createAsset({ name: 'Reception furniture set', categoryId: furniture.id, acquiredOn: day('2026-07-15'), cost: '86000', salvageValue: '6000', method: 'REDUCING_BALANCE', reducingRate: '20', usefulLifeMonths: 60, depreciationStartOn: day('2026-08-01'), createdBy: ADMIN })
    console.log('  fixed assets    2')
  } else {
    console.log('  fixed assets    already seeded')
  }

  // -- Student fees: issued & part-paid, paid & partly refunded, a draft ---
  const student = (passportNo: string) => prisma.student.findFirstOrThrow({ where: { passportNo } })
  const noInvoices = async (studentId: string) => (await prisma.studentInvoice.count({ where: { studentId } })) === 0
  let invoiced = 0

  const tanvir = await student('B11223344')
  if (await noInvoices(tanvir.id)) {
    const app = await prisma.application.findFirst({ where: { studentId: tanvir.id } })
    const inv = await invoices.createInvoice({
      studentId: tanvir.id,
      applicationId: app?.id,
      dueOn: day('2026-09-30'),
      lines: [
        { feeType: 'SERVICE', description: 'Admission service fee — University of Greenwich', amount: '25000' },
        { feeType: 'VISA_PROCESSING', description: 'UK student visa processing', amount: '8000' },
      ],
      actor,
    })
    await invoices.issueInvoice({ invoiceId: inv.id, issuedOn: day('2026-09-16'), dueOn: day('2026-09-30'), actor, ...post })
    await receipts.recordReceipt({ partyId: tanvir.partyId, receivedOn: day('2026-09-19'), amount: '20000', currency: 'BDT', bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', reference: 'bKash 7HX32A', allocations: [{ invoiceId: inv.id, amount: '20000' }], actor, ...post })
    invoiced++
  }

  const sadia = await student('B99887766')
  if (await noInvoices(sadia.id)) {
    const app = await prisma.application.findFirst({ where: { studentId: sadia.id } })
    const inv = await invoices.createInvoice({
      studentId: sadia.id,
      applicationId: app?.id,
      dueOn: day('2026-08-05'),
      discount: '2000',
      lines: [
        { feeType: 'COUNSELING', description: 'Counseling and admission package — Australia', amount: '30000' },
        { feeType: 'DOCUMENTATION', description: 'SOP review and document attestation', amount: '5000' },
      ],
      actor,
    })
    await invoices.issueInvoice({ invoiceId: inv.id, issuedOn: day('2026-07-20'), dueOn: day('2026-08-05'), actor, ...post })
    await receipts.recordReceipt({ partyId: sadia.partyId, receivedOn: day('2026-07-28'), amount: '33000', currency: 'BDT', bankAccountCode: bank.glAccountCode, method: 'CASH', reference: 'MR-0042', allocations: [{ invoiceId: inv.id, amount: '33000' }], actor, ...post })
    // Attestation was done by the family: fee waived, refunded after approval.
    const note = await invoices.createCreditNote({ invoiceId: inv.id, amount: '5000', reason: 'Attestation handled by the family; documentation fee waived', issuedOn: day('2026-08-10'), actor, ...post })
    const refund = await invoices.requestRefund({ creditNoteId: note.id, reason: 'Return the waived documentation fee', actor: accountantActor })
    await invoices.decideRefund({ refundId: refund.id, approve: true, actor })
    await invoices.payRefund({ refundId: refund.id, paidOn: day('2026-08-12'), bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', reference: 'TRF-20260812-02', actor, ...post })
    invoiced++
  }

  const nusrat = await student('A07654321')
  if (await noInvoices(nusrat.id)) {
    await invoices.createInvoice({
      studentId: nusrat.id,
      lines: [
        { feeType: 'APPLICATION', description: 'APU application fee (pass-through)', amount: '3500' },
        { feeType: 'COUNSELING', description: 'Counseling fee — Malaysia foundation route', amount: '12000' },
      ],
      actor,
    })
    invoiced++
  }
  console.log(`  student fees    3 invoices (${invoiced} new) · 2 receipts · 1 credit note · 1 refund paid`)

  // -- University commission: eligible → approved → claimed → part received,
  //    then the counselor's share approved and paid ------------------------
  const enrolment = await prisma.application.findFirstOrThrow({ where: { studentId: mahmud.id, status: 'ENROLLED' }, include: { university: true } })
  const [first, second] = await prisma.commission.findMany({ where: { applicationId: enrolment.id }, orderBy: { instalmentSeq: 'asc' } })
  if (first?.status === 'EXPECTED' && second) {
    // A different GBP rate on the receipt date than the claim date → realised FX.
    const rateDate = day('2026-09-23')
    await prisma.exchangeRate.upsert({
      where: { fromCurrency_toCurrency_rateDate: { fromCurrency: 'GBP', toCurrency: 'BDT', rateDate } },
      create: { fromCurrency: 'GBP', toCurrency: 'BDT', rateDate, rate: '154.50000000', source: 'MANUAL', createdBy: 'demo' },
      update: {},
    })

    await commissions.markEligible({ commissionIds: [first.id, second.id], eligibleOn: day('2026-09-12'), actor })
    await commissions.approveCommission({ commissionId: first.id, approvedOn: day('2026-09-14'), actor, ...post })
    const claim = await claims.createClaim({ universityId: enrolment.universityId, commissionIds: [first.id], notes: 'September 2026 enrolments — first instalment', actor })
    await claims.sendClaim({ claimId: claim.id, claimedOn: day('2026-09-15'), actor, ...post })
    await receipts.recordReceipt({
      partyId: enrolment.university.partyId,
      receivedOn: rateDate,
      amount: '1500',
      withheldTax: '75',
      currency: 'GBP',
      bankAccountCode: bank.glAccountCode,
      method: 'BANK_TRANSFER',
      reference: 'SWIFT GRE-88213',
      allocations: [{ claimId: claim.id, amount: '1500' }],
      actor,
      ...post,
    })

    // approveCommission accrued the counselor's share; approve and pay it.
    const payout = await prisma.internalCommission.findFirst({ where: { commissionId: first.id } })
    if (payout) {
      await payouts.approveInternalCommission({ id: payout.id, actor, ...post })
      await payouts.payInternalCommission({ id: payout.id, paidOn: day('2026-09-24'), bankAccountCode: bank.glAccountCode, method: 'BANK_TRANSFER', reference: 'TRF-20260924-05', actor, ...post })
    }
    console.log('  commission      instalment 1: claimed, GBP 1,500 received (75 withheld) · instalment 2: eligible · counselor payout paid')
  } else {
    console.log('  commission      already seeded')
  }

  // -- Prove the demo left the books consistent -----------------------------
  const unreconciled = (await getControlReconciliation()).filter((r) => !r.reconciled)
  if (unreconciled.length > 0) {
    throw new Error(`Control accounts out of step with their parties: ${unreconciled.map((r) => `${r.code} (${r.difference})`).join(', ')}`)
  }
  console.log('  reconciliation  every control account equals the sum of its parties')
  console.log('Done.')

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
