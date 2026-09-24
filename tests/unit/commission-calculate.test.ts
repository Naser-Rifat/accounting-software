import { describe, expect, it } from 'vitest'

import { calculateCommission, formatScaled, parseScaled } from '@/lib/commission/calculate'

/**
 * docs/modules/04-university-commission.md §Calculation, and rule 4:
 * Σ instalment.expectedAmount must equal the total commission exactly.
 */

const line = (seq: number, percentOfTotal: string) => ({ seq, label: `Line ${seq}`, percentOfTotal })

describe('parseScaled / formatScaled', () => {
  it('round-trips money and rates without floating point', () => {
    expect(parseScaled('46000.00', 2)).toBe(BigInt(4_600_000))
    expect(parseScaled('46000.5', 2)).toBe(BigInt(4_600_050))
    expect(parseScaled('15', 4)).toBe(BigInt(150_000))
    expect(formatScaled(BigInt(4_600_050), 2)).toBe('46000.50')
    expect(formatScaled(BigInt(5), 2)).toBe('0.05')
  })

  it('rejects too many decimals and negatives', () => {
    expect(() => parseScaled('1.234', 2)).toThrow()
    expect(() => parseScaled('-1', 2)).toThrow()
  })
})

describe('calculateCommission', () => {
  it('PER_STUDENT + FIXED is the fixed amount, base 1.00', () => {
    const r = calculateCommission({
      appliesTo: 'PER_STUDENT',
      rateType: 'FIXED',
      rate: '1500',
      tuitionFee: '9800.00',
      durationMonths: 36,
      lines: [line(1, '100')],
    })
    expect(r.baseAmount).toBe('1.00')
    expect(r.totalAmount).toBe('1500.00')
    expect(r.lines[0]?.expectedAmount).toBe('1500.00')
  })

  it('FIRST_YEAR_TUITION uses one year; TOTAL_TUITION scales by the duration', () => {
    const first = calculateCommission({
      appliesTo: 'FIRST_YEAR_TUITION',
      rateType: 'PERCENT',
      rate: '15',
      tuitionFee: '46000.00',
      durationMonths: 24,
      lines: [line(1, '100')],
    })
    expect(first.totalAmount).toBe('6900.00')

    const total = calculateCommission({
      appliesTo: 'TOTAL_TUITION',
      rateType: 'PERCENT',
      rate: '15',
      tuitionFee: '46000.00',
      durationMonths: 24,
      lines: [line(1, '100')],
    })
    expect(total.baseAmount).toBe('92000.00')
    expect(total.totalAmount).toBe('13800.00')

    const threeYears = calculateCommission({
      appliesTo: 'TOTAL_TUITION',
      rateType: 'PERCENT',
      rate: '15',
      tuitionFee: '45000.00',
      durationMonths: 36,
      lines: [line(1, '100')],
    })
    expect(threeYears.totalAmount).toBe('20250.00')
  })

  it('the last instalment absorbs the rounding remainder so the parts sum exactly', () => {
    const r = calculateCommission({
      appliesTo: 'FIRST_YEAR_TUITION',
      rateType: 'PERCENT',
      rate: '10',
      tuitionFee: '10000.00',
      durationMonths: 12,
      lines: [line(1, '33.3333'), line(2, '33.3333'), line(3, '33.3334')],
    })
    expect(r.totalAmount).toBe('1000.00')
    expect(r.lines.map((l) => l.expectedAmount)).toEqual(['333.33', '333.33', '333.34'])
    const sum = r.lines.reduce((s, l) => s + parseScaled(l.expectedAmount, 2), BigInt(0))
    expect(sum).toBe(parseScaled(r.totalAmount, 2))
  })

  it('splits the seeded Melbourne case: 15% of 46,000 × 2 years over three years', () => {
    const r = calculateCommission({
      appliesTo: 'TOTAL_TUITION',
      rateType: 'PERCENT',
      rate: '15',
      tuitionFee: '46000.00',
      durationMonths: 24,
      lines: [line(1, '33.3333'), line(2, '33.3333'), line(3, '33.3334')],
    })
    expect(r.lines.map((l) => l.expectedAmount)).toEqual(['4600.00', '4600.00', '4600.00'])
  })

  it('CUSTOM 60/40', () => {
    const r = calculateCommission({
      appliesTo: 'FIRST_YEAR_TUITION',
      rateType: 'PERCENT',
      rate: '20',
      tuitionFee: '17500.00',
      durationMonths: 12,
      lines: [line(1, '60'), line(2, '40')],
    })
    expect(r.lines.map((l) => l.expectedAmount)).toEqual(['2100.00', '1400.00'])
  })

  it('keeps every cent on very large tuition', () => {
    const r = calculateCommission({
      appliesTo: 'TOTAL_TUITION',
      rateType: 'PERCENT',
      rate: '100',
      tuitionFee: '999999999.99',
      durationMonths: 12,
      lines: [line(1, '100')],
    })
    expect(r.totalAmount).toBe('999999999.99')
  })

  it('carries the schedule line id onto the result', () => {
    const r = calculateCommission({
      appliesTo: 'PER_STUDENT',
      rateType: 'FIXED',
      rate: '100',
      tuitionFee: '0',
      durationMonths: 12,
      lines: [{ ...line(1, '100'), id: 'line-1' }],
    })
    expect(r.lines[0]?.scheduleLineId).toBe('line-1')
  })
})
