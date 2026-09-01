import 'server-only'

import { Prisma } from '@/generated/prisma/client'

import { AccountingError } from './errors'
import type { PrismaTransaction } from '@/server/db/client'

/**
 * Exchange rates and base-currency conversion — docs/07-multi-currency-and-tax.md.
 *
 * The rate that applies is the one effective on the document date, never today's.
 * Rates are additive: a correction is a new row for that date, so a voucher's
 * conversion can always be re-derived exactly as it was posted.
 */

export const ONE = new Prisma.Decimal(1)

/** The rate to convert `from` into `to` as at `date`. Same currency = 1. */
export async function getRate(
  tx: PrismaTransaction,
  from: string,
  to: string,
  date: Date,
): Promise<Prisma.Decimal> {
  if (from === to) return ONE

  const rate = await tx.exchangeRate.findFirst({
    where: {
      fromCurrency: from,
      toCurrency: to,
      rateDate: { lte: date },
    },
    orderBy: { rateDate: 'desc' },
  })

  if (rate) return new Prisma.Decimal(rate.rate)

  // Fall back to the inverse pair before giving up — agencies commonly record
  // only one direction (USD->BDT) and never the reciprocal.
  const inverse = await tx.exchangeRate.findFirst({
    where: {
      fromCurrency: to,
      toCurrency: from,
      rateDate: { lte: date },
    },
    orderBy: { rateDate: 'desc' },
  })

  if (inverse && !new Prisma.Decimal(inverse.rate).isZero()) {
    return ONE.div(new Prisma.Decimal(inverse.rate))
  }

  throw new AccountingError(
    'MISSING_EXCHANGE_RATE',
    `No exchange rate for ${from} to ${to} on or before ${date.toISOString().slice(0, 10)}. Enter one in Settings > Currencies.`,
    { from, to, date },
  )
}

/** The company's base currency. Cached per request by the caller if needed. */
export async function getBaseCurrency(tx: PrismaTransaction): Promise<string> {
  const currency = await tx.currency.findFirst({ where: { isBase: true } })
  return currency?.code ?? 'BDT'
}

/** Convert to base currency and round to 2dp — the only place rounding happens. */
export function toBase(
  amount: Prisma.Decimal,
  fxRate: Prisma.Decimal,
): Prisma.Decimal {
  return amount.mul(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}
