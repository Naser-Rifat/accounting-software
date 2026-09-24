/**
 * Commission calculation — docs/modules/04-university-commission.md §Calculation.
 *
 *   base     = FIRST_YEAR_TUITION ? tuition : TOTAL_TUITION ? tuition × years : 1
 *   total    = PERCENT ? base × rate / 100 : rate
 *   expected = total × line.percentOfTotal / 100        (one per schedule line)
 *
 * Pure, and in BigInt: cents × ten-thousandths × months overflows a double,
 * and this is the figure every claim, receipt and internal commission hangs
 * off. Rule 4 of the spec — Σ expected == total — is made exact by letting the
 * last instalment absorb the rounding remainder.
 *
 * `BigInt(n)` rather than `0n` literals: the TypeScript target predates them.
 */

export type CommissionCalcInput = {
  appliesTo: 'FIRST_YEAR_TUITION' | 'TOTAL_TUITION' | 'PER_STUDENT'
  rateType: 'PERCENT' | 'FIXED'
  /** "15" or "15.5" (percent) — or a money amount for FIXED. Up to 4 dp. */
  rate: string
  /** "46000.00", up to 2 dp. */
  tuitionFee: string
  durationMonths: number
  lines: { seq: number; label: string; percentOfTotal: string; id?: string }[]
}

export type CommissionCalcResult = {
  baseAmount: string
  totalAmount: string
  lines: { seq: number; label: string; expectedAmount: string; scheduleLineId?: string }[]
}

const ZERO = BigInt(0)
const TWO = BigInt(2)
const TEN = BigInt(10)
const TWELVE = BigInt(12)
const HUNDRED = BigInt(100)
const TEN_THOUSANDTHS = BigInt(1_000_000) // 100.0000 %

/** "46000.5" with dp=2 → 4600050n. Throws on malformed input. */
export function parseScaled(value: string, dp: number): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`Not a non-negative decimal: "${value}"`)
  const [whole, frac = ''] = v.split('.')
  if (frac.length > dp) throw new Error(`"${value}" has more than ${dp} decimal places`)
  return BigInt(whole) * TEN ** BigInt(dp) + BigInt((frac + '0'.repeat(dp)).slice(0, dp))
}

/** 4600050n with dp=2 → "46000.50". */
export function formatScaled(value: bigint, dp: number): string {
  const sign = value < ZERO ? '-' : ''
  const abs = value < ZERO ? -value : value
  const s = abs.toString().padStart(dp + 1, '0')
  return `${sign}${s.slice(0, -dp)}.${s.slice(-dp)}`
}

/** Integer division rounded half-up. */
function divRound(n: bigint, d: bigint): bigint {
  return (n + d / TWO) / d
}

export function calculateCommission(input: CommissionCalcInput): CommissionCalcResult {
  const tuition = parseScaled(input.tuitionFee, 2)
  const rate4 = parseScaled(input.rate, 4)

  const base =
    input.appliesTo === 'FIRST_YEAR_TUITION'
      ? tuition
      : input.appliesTo === 'TOTAL_TUITION'
        ? divRound(tuition * BigInt(input.durationMonths), TWELVE)
        : HUNDRED // PER_STUDENT: the "base" is one student, 1.00

  const total =
    input.rateType === 'PERCENT'
      ? divRound(base * rate4, TEN_THOUSANDTHS) // base × rate / 100, rate in 1e-4
      : divRound(rate4, HUNDRED) // a fixed amount in 1e-4 → cents

  const lines = [...input.lines].sort((a, b) => a.seq - b.seq)
  const amounts: bigint[] = []
  let allocated = ZERO
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1
    const share = isLast
      ? total - allocated
      : divRound(total * parseScaled(line.percentOfTotal, 4), TEN_THOUSANDTHS)
    amounts.push(share)
    allocated += share
  })

  return {
    baseAmount: formatScaled(base, 2),
    totalAmount: formatScaled(total, 2),
    lines: lines.map((line, i) => ({
      seq: line.seq,
      label: line.label,
      expectedAmount: formatScaled(amounts[i] ?? ZERO, 2),
      scheduleLineId: line.id,
    })),
  }
}
