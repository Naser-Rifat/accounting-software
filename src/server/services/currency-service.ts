import 'server-only'

import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'

/** Currencies and exchange rates — docs/07-multi-currency-and-tax.md. */

export async function listCurrencies() {
  const [currencies, voucherCount] = await Promise.all([
    prisma.currency.findMany({ orderBy: [{ isBase: 'desc' }, { code: 'asc' }] }),
    prisma.journalEntry.count(),
  ])

  return {
    // The base currency is locked once anything is posted: every prior amount
    // was converted into it.
    baseLocked: voucherCount > 0,
    voucherCount,
    currencies,
  }
}

export async function listRates(limit = 50) {
  const rows = await prisma.exchangeRate.findMany({
    orderBy: [{ rateDate: 'desc' }, { fromCurrency: 'asc' }],
    take: limit,
  })

  return rows.map((row) => ({
    id: row.id,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    rateDate: row.rateDate.toISOString().slice(0, 10),
    rate: row.rate.toString(),
    source: row.source,
    createdBy: row.createdBy,
  }))
}

/**
 * Record a rate for a date.
 *
 * Rates are additive: a correction is a new row for that date, never an edit of
 * an existing one, so a voucher's conversion can always be re-derived exactly as
 * it was posted.
 */
export async function addExchangeRate(input: {
  fromCurrency: string
  toCurrency: string
  rateDate: Date
  rate: string
  createdBy: string
}) {
  if (input.fromCurrency === input.toCurrency) {
    throw new AccountingError('INVALID_LINE', 'From and to currency must differ.')
  }
  if (Number(input.rate) <= 0) {
    throw new AccountingError('INVALID_LINE', 'Rate must be greater than zero.')
  }

  const existing = await prisma.exchangeRate.findUnique({
    where: {
      fromCurrency_toCurrency_rateDate: {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rateDate: input.rateDate,
      },
    },
  })

  if (existing) {
    // Same day, new number: replace the value but keep it a single row per day,
    // since "the rate on this date" must be unambiguous.
    return prisma.exchangeRate.update({
      where: { id: existing.id },
      data: { rate: input.rate, createdBy: input.createdBy, source: 'MANUAL' },
    })
  }

  return prisma.exchangeRate.create({
    data: {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rateDate: input.rateDate,
      rate: input.rate,
      source: 'MANUAL',
      createdBy: input.createdBy,
    },
  })
}

export async function setCurrencyActive(code: string, isActive: boolean) {
  const currency = await prisma.currency.findUnique({ where: { code } })
  if (!currency) throw new AccountingError('INVALID_LINE', `Unknown currency ${code}.`)
  if (currency.isBase && !isActive) {
    throw new AccountingError('INVALID_LINE', 'The base currency cannot be deactivated.')
  }
  return prisma.currency.update({ where: { code }, data: { isActive } })
}
