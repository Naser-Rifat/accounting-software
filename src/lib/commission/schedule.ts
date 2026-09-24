/**
 * Commission instalment schedules — docs/modules/02-universities.md §Payment schedule.
 *
 * Pure: no Prisma, no Decimal. The agreement form previews the schedule in the
 * browser and the service persists it, and both must produce the same lines.
 *
 * Percentages are handled as integer ten-thousandths (100% = 1_000_000) so that
 * "does it sum to 100" is an exact integer comparison, never a float one.
 */

export type ScheduleType = 'ONE_TIME' | 'PER_YEAR' | 'PER_SEMESTER' | 'CUSTOM'
export type EligibilityTrigger = 'ENROLLMENT' | 'CENSUS_DATE' | 'ARRIVAL'
export type TriggerEvent = EligibilityTrigger | 'RE_ENROLLMENT' | 'FIXED_DATE'

export type ScheduleLine = {
  seq: number
  label: string
  /** Percent of the total commission, as a decimal string with up to 4 dp. */
  percentOfTotal: string
  triggerEvent: TriggerEvent
  offsetDays: number
}

export const SCHEDULE_TYPES: { code: ScheduleType; label: string }[] = [
  { code: 'ONE_TIME', label: 'One time' },
  { code: 'PER_YEAR', label: 'Per year' },
  { code: 'PER_SEMESTER', label: 'Per semester' },
  { code: 'CUSTOM', label: 'Custom' },
]

export const TRIGGER_EVENTS: { code: TriggerEvent; label: string }[] = [
  { code: 'ENROLLMENT', label: 'Enrollment' },
  { code: 'CENSUS_DATE', label: 'Census date' },
  { code: 'ARRIVAL', label: 'Arrival' },
  { code: 'RE_ENROLLMENT', label: 'Re-enrollment' },
  { code: 'FIXED_DATE', label: 'Fixed date' },
]

const SCALE = 10_000
const HUNDRED = 100 * SCALE
const PERCENT_RE = /^\d{1,3}(\.\d{1,4})?$/

/** "33.3334" → 333334. Returns null for anything that is not a valid percent. */
export function toTenThousandths(percent: string): number | null {
  const v = percent.trim()
  if (!PERCENT_RE.test(v)) return null
  const [whole, frac = ''] = v.split('.')
  return Number(whole) * SCALE + Number(frac.padEnd(4, '0'))
}

function fromTenThousandths(n: number): string {
  const whole = Math.floor(n / SCALE)
  const frac = String(n % SCALE).padStart(4, '0')
  return `${whole}.${frac}`
}

/**
 * Split 100% evenly over `count` lines. The remainder lands on the last line so
 * the parts always sum to exactly 100: three lines are 33.3333 / 33.3333 / 33.3334.
 */
export function evenSplit(count: number): string[] {
  if (!Number.isInteger(count) || count < 1) return []
  const each = Math.floor(HUNDRED / count)
  const parts = Array.from({ length: count }, () => each)
  parts[count - 1] += HUNDRED - each * count
  return parts.map(fromTenThousandths)
}

export type GenerateScheduleInput = {
  scheduleType: ScheduleType
  eligibilityTrigger: EligibilityTrigger
  /** PER_YEAR / PER_SEMESTER: how many instalments. */
  instalmentCount?: number
  /** CUSTOM: the hand-entered lines. */
  lines?: Omit<ScheduleLine, 'seq'>[]
}

/**
 * The lines an agreement's schedule type implies.
 *
 * ONE_TIME is a single 100% line on the eligibility trigger. PER_YEAR and
 * PER_SEMESTER split evenly: the first instalment fires on the eligibility
 * trigger, the rest on re-enrollment. CUSTOM lines pass through, re-sequenced.
 */
export function generateScheduleLines(input: GenerateScheduleInput): ScheduleLine[] {
  const { scheduleType, eligibilityTrigger } = input

  if (scheduleType === 'ONE_TIME') {
    return [
      {
        seq: 1,
        label: 'Full commission',
        percentOfTotal: '100.0000',
        triggerEvent: eligibilityTrigger,
        offsetDays: 0,
      },
    ]
  }

  if (scheduleType === 'CUSTOM') {
    return (input.lines ?? []).map((line, i) => ({ ...line, seq: i + 1 }))
  }

  const count = input.instalmentCount ?? 0
  const word = scheduleType === 'PER_YEAR' ? 'Year' : 'Semester'
  return evenSplit(count).map((percentOfTotal, i) => ({
    seq: i + 1,
    label: `${word} ${i + 1}`,
    percentOfTotal,
    triggerEvent: i === 0 ? eligibilityTrigger : 'RE_ENROLLMENT',
    offsetDays: 0,
  }))
}

/** Sum of the lines in ten-thousandths, or null if any line is malformed. */
export function sumTenThousandths(lines: Pick<ScheduleLine, 'percentOfTotal'>[]): number | null {
  let total = 0
  for (const line of lines) {
    const n = toTenThousandths(line.percentOfTotal)
    if (n === null) return null
    total += n
  }
  return total
}

/**
 * Why a schedule cannot be saved, or null if it can. docs/01 invariant 9:
 * `percentOfTotal` must sum to 100 per agreement.
 */
export function validateScheduleLines(lines: ScheduleLine[]): string | null {
  if (lines.length === 0) return 'The schedule needs at least one instalment.'

  for (const line of lines) {
    if (!line.label.trim()) return `Instalment ${line.seq} needs a label.`
    const n = toTenThousandths(line.percentOfTotal)
    if (n === null) return `Instalment ${line.seq}: enter a percentage with up to 4 decimals.`
    if (n <= 0) return `Instalment ${line.seq} must be more than 0%.`
    if (!Number.isInteger(line.offsetDays) || line.offsetDays < 0) {
      return `Instalment ${line.seq}: offset days cannot be negative.`
    }
  }

  const total = sumTenThousandths(lines)
  if (total !== HUNDRED) {
    return `Instalments must add up to 100%, not ${fromTenThousandths(total ?? 0)}%.`
  }
  return null
}

/** "15% of total tuition · per year" — one line for tables and cards. */
export function describeTerms(a: {
  rateType: 'PERCENT' | 'FIXED'
  rate: string
  appliesTo: 'FIRST_YEAR_TUITION' | 'TOTAL_TUITION' | 'PER_STUDENT'
  currency: string
  scheduleType: ScheduleType
}): string {
  const rate = Number(a.rate)
  // `rate` arrives as "15" or "12.5" — a Number drops the stored trailing zeros.
  const amount =
    a.rateType === 'PERCENT'
      ? `${rate}%`
      : `${a.currency} ${rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const base = {
    FIRST_YEAR_TUITION: 'of first-year tuition',
    TOTAL_TUITION: 'of total tuition',
    PER_STUDENT: 'per student',
  }[a.appliesTo]
  const schedule = SCHEDULE_TYPES.find((s) => s.code === a.scheduleType)?.label.toLowerCase()
  return `${amount} ${base} · ${schedule}`
}
