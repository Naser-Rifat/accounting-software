/**
 * Seed: chart of accounts and configuration only — no demo transactions.
 *
 * Idempotent. Every write upserts by natural key, so re-running is safe and is
 * the intended way to pick up new accounts or settings.
 *
 * Run: npx tsx prisma/seed/index.ts
 */

import { existsSync } from 'node:fs'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../src/generated/prisma/client'
import {
  DOCUMENT_SERIES_DEFAULTS,
  SETTING_DEFAULTS,
  SUPPORTED_CURRENCIES,
} from '../../src/config/app'
import { hashPassword } from '../../src/server/auth/password'
import { ACCOUNT_SEED } from './accounts'
import { EXPENSE_CATEGORY_SEED } from './expense-categories'

if (existsSync('.env')) process.loadEnvFile('.env')

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set.')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/** Fiscal year to create — docs/11-decisions.md C2, confirmed FY2026-27. */
const FISCAL_YEAR = {
  name: 'FY2026-27',
  code: '2627',
  startYear: 2026,
  startMonth: 7, // July
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

async function seedCurrencies() {
  for (const currency of SUPPORTED_CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      create: { ...currency, isBase: currency.code === 'BDT' },
      update: { name: currency.name, symbol: currency.symbol, decimals: currency.decimals },
    })
  }
  console.log(`  currencies      ${SUPPORTED_CURRENCIES.length}`)
}

async function seedAccounts() {
  // Two passes: every account first, then parents — a child may appear before
  // its parent in the list, and self-referencing FKs cannot be set otherwise.
  for (const account of ACCOUNT_SEED) {
    await prisma.account.upsert({
      where: { code: account.code },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        isGroup: account.group ?? false,
        isControl: account.control ?? false,
        isContra: account.contra ?? false,
        isSystem: account.system ?? false,
      },
      update: {
        name: account.name,
        type: account.type,
        isGroup: account.group ?? false,
        isControl: account.control ?? false,
        isContra: account.contra ?? false,
        isSystem: account.system ?? false,
      },
    })
  }

  for (const account of ACCOUNT_SEED) {
    if (!account.parent) continue
    const parent = await prisma.account.findUnique({ where: { code: account.parent } })
    if (!parent) throw new Error(`Parent account ${account.parent} missing for ${account.code}`)
    await prisma.account.update({
      where: { code: account.code },
      data: { parentId: parent.id },
    })
  }

  console.log(`  accounts        ${ACCOUNT_SEED.length}`)
}

async function seedTaxCodes() {
  const effectiveFrom = new Date(Date.UTC(FISCAL_YEAR.startYear, FISCAL_YEAR.startMonth - 1, 1))

  const codes = [
    {
      code: 'VAT-STD',
      name: 'Standard VAT on service fees',
      kind: 'OUTPUT_VAT' as const,
      rate: '15.0000',
      glAccountCode: '2310',
    },
    {
      code: 'VAT-IN',
      name: 'Input VAT on purchases',
      kind: 'INPUT_VAT' as const,
      rate: '15.0000',
      glAccountCode: '1320',
    },
    {
      code: 'WHT-COM',
      name: 'Withholding deducted by universities',
      kind: 'WITHHOLDING_RECEIVABLE' as const,
      rate: '0.0000',
      glAccountCode: '1310',
    },
    {
      code: 'WHT-AGT',
      name: 'Withholding deducted from agents and vendors',
      kind: 'WITHHOLDING_PAYABLE' as const,
      rate: '0.0000',
      glAccountCode: '2320',
    },
  ]

  for (const tax of codes) {
    await prisma.taxCode.upsert({
      where: { code_effectiveFrom: { code: tax.code, effectiveFrom } },
      create: { ...tax, effectiveFrom },
      update: { name: tax.name, glAccountCode: tax.glAccountCode },
    })
  }
  console.log(`  tax codes       ${codes.length}`)
}

async function seedSeries() {
  for (const series of DOCUMENT_SERIES_DEFAULTS) {
    await prisma.documentSeries.upsert({
      where: { key: series.key },
      create: {
        key: series.key,
        name: series.name,
        scope: series.scope,
        prefix: series.prefix,
        padding: 5,
        resetPolicy: 'YEARLY',
      },
      update: { name: series.name },
    })
  }
  console.log(`  number series   ${DOCUMENT_SERIES_DEFAULTS.length}`)
}

async function seedSettings() {
  const effectiveFrom = new Date(Date.UTC(FISCAL_YEAR.startYear, FISCAL_YEAR.startMonth - 1, 1))

  for (const setting of SETTING_DEFAULTS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: {
        key: setting.key,
        section: setting.section,
        value: setting.value,
        dataType: setting.dataType,
      },
      // Never overwrite a value the client has already configured.
      update: { section: setting.section, dataType: setting.dataType },
    })

    await prisma.settingHistory.upsert({
      where: { key_effectiveFrom: { key: setting.key, effectiveFrom } },
      create: {
        key: setting.key,
        value: setting.value,
        effectiveFrom,
        changedBy: 'seed',
        note: 'Initial value',
      },
      update: {},
    })
  }
  console.log(`  settings        ${SETTING_DEFAULTS.length}`)
}

async function seedFiscalYear() {
  const { name, code, startYear, startMonth } = FISCAL_YEAR
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 0))

  const year = await prisma.fiscalYear.upsert({
    where: { code },
    create: { name, code, startDate, endDate },
    update: { name, startDate, endDate },
  })

  for (let i = 0; i < 12; i++) {
    const monthIndex = (startMonth - 1 + i) % 12
    const yearOffset = Math.floor((startMonth - 1 + i) / 12)
    const periodStart = new Date(Date.UTC(startYear + yearOffset, monthIndex, 1))
    const periodEnd = new Date(Date.UTC(startYear + yearOffset, monthIndex + 1, 0))

    await prisma.accountingPeriod.upsert({
      where: { fiscalYearId_seq: { fiscalYearId: year.id, seq: i + 1 } },
      create: {
        fiscalYearId: year.id,
        name: `${MONTHS[monthIndex]} ${startYear + yearOffset}`,
        seq: i + 1,
        startDate: periodStart,
        endDate: periodEnd,
      },
      update: {},
    })
  }

  console.log(`  fiscal year     ${name} (${code}) with 12 periods`)
}

/**
 * Expense categories map a kind of spend to its GL account, so an accountant can
 * re-map without a developer. 5xxx is cost of revenue, 6xxx overhead.
 */
async function seedExpenseCategories() {
  for (const category of EXPENSE_CATEGORY_SEED) {
    await prisma.expenseCategory.upsert({
      where: { code: category.code },
      create: category,
      update: { name: category.name, glAccountCode: category.glAccountCode },
    })
  }
  console.log(`  expense cats    ${EXPENSE_CATEGORY_SEED.length}`)
}

/**
 * Asset categories decide which accounts an asset posts to, so the mapping is
 * data rather than code. Cost in 15xx, accumulated in 1590, charge in 6130.
 */
async function seedAssetCategories() {
  const categories = [
    {
      code: 'OFFICE-EQ',
      name: 'Office Equipment',
      assetAccountCode: '1510',
      defaultUsefulLifeMonths: 60,
    },
    {
      code: 'FURNITURE',
      name: 'Furniture & Fixtures',
      assetAccountCode: '1520',
      defaultUsefulLifeMonths: 120,
    },
    {
      code: 'COMPUTER',
      name: 'Computers & Software',
      assetAccountCode: '1530',
      defaultUsefulLifeMonths: 36,
    },
  ]

  for (const category of categories) {
    await prisma.assetCategory.upsert({
      where: { code: category.code },
      create: {
        ...category,
        accumulatedAccountCode: '1590',
        expenseAccountCode: '6130',
        defaultMethod: 'STRAIGHT_LINE',
      },
      update: { name: category.name },
    })
  }

  console.log(`  asset categories ${categories.length}`)
}

/**
 * A single ADMIN so the app can be signed into. Flagged mustChangePassword,
 * and the password is only ever set when the account is first created — a
 * re-run never resets a password the client has changed.
 */
async function seedAdminUser() {
  const username = 'admin'
  const existing = await prisma.user.findUnique({ where: { username } })

  if (existing) {
    console.log(`  admin user      ${username} (already exists, unchanged)`)
    return
  }

  await prisma.user.create({
    data: {
      username,
      name: 'System Administrator',
      passwordHash: await hashPassword(DEFAULT_ADMIN_PASSWORD),
      role: 'ADMIN',
      mustChangePassword: true,
    },
  })

  console.log(`  admin user      ${username} / ${DEFAULT_ADMIN_PASSWORD}  <-- CHANGE THIS`)
}

const DEFAULT_ADMIN_PASSWORD = 'admin123'


/**
 * Opening exchange rates, one per foreign currency, dated the first day of the
 * fiscal year.
 *
 * Without at least one rate on or before a voucher's date, `getRate` throws
 * MISSING_EXCHANGE_RATE and every foreign-currency posting fails — so a system
 * with six currencies and no rates can only transact in Taka.
 *
 * THE RATES BELOW ARE INDICATIVE PLACEHOLDERS, NOT MARKET DATA. They exist so
 * the system is usable on day one. Replace them with real rates in
 * Admin -> Currencies & Rates before booking anything you care about: a wrong
 * rate silently misstates every foreign balance it touches.
 */
async function seedExchangeRates() {
  const rateDate = new Date(
    Date.UTC(FISCAL_YEAR.startYear, FISCAL_YEAR.startMonth - 1, 1),
  )

  const indicative: Record<string, string> = {
    USD: '120.00000000',
    GBP: '152.00000000',
    AUD: '79.00000000',
    CAD: '88.00000000',
    EUR: '130.00000000',
  }

  let count = 0
  for (const [code, rate] of Object.entries(indicative)) {
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_rateDate: {
          fromCurrency: code,
          toCurrency: 'BDT',
          rateDate,
        },
      },
      // Never overwrite: by the second run these may be real rates someone
      // entered, and a seed must not quietly replace them with placeholders.
      create: { fromCurrency: code, toCurrency: 'BDT', rateDate, rate, source: 'SEED' },
      update: {},
    })
    count++
  }

  console.log(`  exchange rates  ${count} indicative opening rates — REPLACE with real rates`)
}

/**
 * Cost centers — the analysis dimension a posting can be tagged with, so one set
 * of books yields per-branch profit and loss.
 *
 * These are examples. Rename or deactivate them to match the real organisation;
 * nothing in the posting rules depends on these particular codes.
 */
async function seedCostCenters() {
  const costCenters = [
    { code: 'HO', name: 'Head Office', type: 'BRANCH' as const },
    { code: 'DHK', name: 'Dhaka Branch', type: 'BRANCH' as const },
    { code: 'CTG', name: 'Chattogram Branch', type: 'BRANCH' as const },
  ]

  for (const costCenter of costCenters) {
    await prisma.costCenter.upsert({
      where: { code: costCenter.code },
      create: costCenter,
      update: { name: costCenter.name, type: costCenter.type },
    })
  }

  console.log(`  cost centers    ${costCenters.length} (examples — rename to suit)`)
}

/**
 * Bank and cash accounts, so Banking and the Cash & Bank Book have something to
 * work with.
 *
 * Both map to 1020, because 1020 is seeded as a posting account rather than a
 * heading. That means the Cash & Bank Book shows one combined 1020 row instead
 * of one row per bank, and client money is not separated in the GL — see the
 * note in docs about giving each bank its own sub-account under a 1020 heading.
 */
async function seedBankAccounts() {
  const accounts = [
    {
      name: 'Operating Account',
      bankName: 'City Bank',
      currency: 'BDT',
      glAccountCode: '1020',
      isClientAccount: false,
    },
    {
      // docs/modules/13-tuition-remittance.md: tuition collected for a
      // university is client money and must never fund operations.
      name: 'Client Money Account (tuition held)',
      bankName: 'City Bank',
      currency: 'BDT',
      glAccountCode: '1020',
      isClientAccount: true,
    },
  ]

  for (const account of accounts) {
    const existing = await prisma.bankAccount.findFirst({ where: { name: account.name } })
    if (existing) continue
    await prisma.bankAccount.create({ data: account })
  }

  console.log(`  bank accounts   ${accounts.length}`)
}

async function main() {
  console.log('Seeding accounting configuration...')
  await seedCurrencies()
  await seedAccounts()
  await seedTaxCodes()
  await seedSeries()
  await seedSettings()
  await seedFiscalYear()
  await seedExchangeRates()
  await seedCostCenters()
  await seedBankAccounts()
  await seedAssetCategories()
  await seedExpenseCategories()
  await seedAdminUser()
  console.log('Done.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
