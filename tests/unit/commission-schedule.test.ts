import { describe, expect, it } from 'vitest'

import {
  evenSplit,
  generateScheduleLines,
  sumTenThousandths,
  toTenThousandths,
  validateScheduleLines,
} from '@/lib/commission/schedule'

/**
 * docs/01-domain-model.md invariant 9: schedule lines sum to exactly 100.
 * These are the amounts one application's commission is split into, so an
 * off-by-0.0001 here is money that is never claimed or claimed twice.
 */

describe('evenSplit', () => {
  it('puts the rounding remainder on the last line so the parts sum to exactly 100', () => {
    expect(evenSplit(3)).toEqual(['33.3333', '33.3333', '33.3334'])
    expect(sumTenThousandths(evenSplit(3).map((p) => ({ percentOfTotal: p })))).toBe(1_000_000)
  })

  it('splits cleanly when it can', () => {
    expect(evenSplit(1)).toEqual(['100.0000'])
    expect(evenSplit(4)).toEqual(['25.0000', '25.0000', '25.0000', '25.0000'])
  })

  it('always sums to 100 whatever the count', () => {
    for (let n = 1; n <= 12; n++) {
      expect(sumTenThousandths(evenSplit(n).map((p) => ({ percentOfTotal: p })))).toBe(1_000_000)
    }
  })
})

describe('toTenThousandths', () => {
  it('parses up to four decimals exactly', () => {
    expect(toTenThousandths('100')).toBe(1_000_000)
    expect(toTenThousandths('33.3334')).toBe(333_334)
    expect(toTenThousandths('0.5')).toBe(5_000)
  })

  it('rejects five decimals, negatives and junk', () => {
    expect(toTenThousandths('33.33333')).toBeNull()
    expect(toTenThousandths('-5')).toBeNull()
    expect(toTenThousandths('abc')).toBeNull()
  })
})

describe('generateScheduleLines', () => {
  it('ONE_TIME is a single 100% line on the eligibility trigger', () => {
    const lines = generateScheduleLines({ scheduleType: 'ONE_TIME', eligibilityTrigger: 'ARRIVAL' })
    expect(lines).toEqual([
      { seq: 1, label: 'Full commission', percentOfTotal: '100.0000', triggerEvent: 'ARRIVAL', offsetDays: 0 },
    ])
  })

  it('PER_YEAR fires the first instalment on eligibility and the rest on re-enrollment', () => {
    const lines = generateScheduleLines({
      scheduleType: 'PER_YEAR',
      eligibilityTrigger: 'ENROLLMENT',
      instalmentCount: 3,
    })
    expect(lines.map((l) => l.label)).toEqual(['Year 1', 'Year 2', 'Year 3'])
    expect(lines.map((l) => l.triggerEvent)).toEqual(['ENROLLMENT', 'RE_ENROLLMENT', 'RE_ENROLLMENT'])
    expect(validateScheduleLines(lines)).toBeNull()
  })

  it('PER_SEMESTER labels by semester', () => {
    const lines = generateScheduleLines({
      scheduleType: 'PER_SEMESTER',
      eligibilityTrigger: 'CENSUS_DATE',
      instalmentCount: 4,
    })
    expect(lines).toHaveLength(4)
    expect(lines[0]?.label).toBe('Semester 1')
    expect(lines.every((l) => l.percentOfTotal === '25.0000')).toBe(true)
  })

  it('CUSTOM passes lines through, re-sequenced', () => {
    const lines = generateScheduleLines({
      scheduleType: 'CUSTOM',
      eligibilityTrigger: 'ENROLLMENT',
      lines: [
        { label: 'On enrollment', percentOfTotal: '60', triggerEvent: 'ENROLLMENT', offsetDays: 0 },
        { label: 'After census', percentOfTotal: '40', triggerEvent: 'CENSUS_DATE', offsetDays: 14 },
      ],
    })
    expect(lines.map((l) => l.seq)).toEqual([1, 2])
    expect(validateScheduleLines(lines)).toBeNull()
  })
})

describe('validateScheduleLines', () => {
  const line = (percentOfTotal: string, seq = 1) => ({
    seq,
    label: `Line ${seq}`,
    percentOfTotal,
    triggerEvent: 'ENROLLMENT' as const,
    offsetDays: 0,
  })

  it('rejects an empty schedule', () => {
    expect(validateScheduleLines([])).toMatch(/at least one/)
  })

  it('rejects a total that is not 100', () => {
    expect(validateScheduleLines([line('60', 1), line('50', 2)])).toMatch(/100%, not 110/)
    expect(validateScheduleLines([line('99.9999')])).toMatch(/100%/)
  })

  it('rejects a zero line, a missing label and too many decimals', () => {
    expect(validateScheduleLines([line('0', 1), line('100', 2)])).toMatch(/more than 0/)
    expect(validateScheduleLines([{ ...line('100'), label: ' ' }])).toMatch(/label/)
    expect(validateScheduleLines([line('100.00000')])).toMatch(/4 decimals/)
  })

  it('rejects negative offset days', () => {
    expect(validateScheduleLines([{ ...line('100'), offsetDays: -1 }])).toMatch(/negative/)
  })
})
