import { SETTING_OPTIONS } from '@/config/app'

/**
 * Per-key validation of a setting value — docs/modules/16-settings.md rule 4:
 * a bad value is rejected, never warned about. Pure, so the form and the
 * service share it.
 */

export type SettingDataTypeName =
  | 'STRING'
  | 'TEXT'
  | 'INT'
  | 'DECIMAL'
  | 'PERCENT'
  | 'BOOLEAN'
  | 'DATE'
  | 'ENUM'
  | 'JSON'
  | 'FILE_URL'

const TIMEZONES = new Set<string>(
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [],
)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const URL_RE = /^https?:\/\/\S+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Why `value` cannot be stored under `key`, or null if it can. */
export function validateSettingValue(
  key: string,
  dataType: SettingDataTypeName | string,
  value: string,
  options: readonly string[] | undefined = SETTING_OPTIONS[key],
): string | null {
  const v = value.trim()

  switch (dataType) {
    case 'INT':
      if (!/^-?\d+$/.test(v)) return 'Enter a whole number.'
      if (/Days$/.test(key) && Number(v) < 0) return 'Days cannot be negative.'
      break
    case 'DECIMAL':
      if (!/^-?\d+(\.\d{1,4})?$/.test(v)) return 'Enter a number with up to 4 decimals.'
      if (Number(v) < 0) return 'Enter a non-negative amount.'
      break
    case 'PERCENT':
      if (!/^\d{1,3}(\.\d{1,4})?$/.test(v) || Number(v) > 100) return 'Enter a percentage between 0 and 100.'
      break
    case 'BOOLEAN':
      if (v !== 'true' && v !== 'false') return 'Choose true or false.'
      break
    case 'DATE':
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return 'Enter a date as YYYY-MM-DD.'
      break
    case 'ENUM':
      if (!options || options.length === 0) return `No choices are configured for ${key}.`
      if (!options.includes(v)) return `Choose one of: ${options.join(', ')}.`
      break
    case 'JSON': {
      let parsed: unknown
      try {
        parsed = JSON.parse(v)
      } catch {
        return 'Enter valid JSON.'
      }
      if (key === 'tax.taxableFeeTypes') {
        if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
          return 'Enter a JSON array of fee type names, e.g. ["SERVICE","COUNSELING"].'
        }
      }
      break
    }
    case 'FILE_URL':
      if (v && !URL_RE.test(v)) return 'Enter a full URL starting with http.'
      break
    case 'STRING':
    case 'TEXT':
      if (v.length > 2000) return 'Keep it under 2000 characters.'
      break
    default:
      return `Unknown data type ${dataType}.`
  }

  // Key-specific shape rules the data type alone cannot express.
  switch (key) {
    case 'company.timezone':
      if (!TIMEZONES.has(v)) return 'Enter an IANA timezone such as Asia/Dhaka.'
      break
    case 'company.email':
      if (v && !EMAIL_RE.test(v)) return 'Enter a valid email address.'
      break
    case 'company.website':
      if (v && !URL_RE.test(v)) return 'Enter a full URL starting with http.'
      break
    case 'fiscalYear.startMonthDay': {
      const m = /^(\d{2})-(\d{2})$/.exec(v)
      if (!m) return 'Enter the start as MM-DD, e.g. 07-01.'
      const month = Number(m[1])
      const day = Number(m[2])
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
      if (!daysInMonth || day < 1 || day > daysInMonth) return 'That month and day do not exist.'
      break
    }
    case 'fiscalYear.namingPattern':
    case 'fiscalYear.codePattern':
      if (!/\{(start|end)YY(YY)?\}/.test(v)) return 'The pattern needs a year token such as {startYY} or {endYY}.'
      break
    case 'numbering.separator':
      if (v.length > 1 || /[a-z0-9]/i.test(v)) return 'The separator is at most one non-alphanumeric character.'
      break
    default:
      break
  }

  return null
}

/** Whether a key's value is resolved by document date and so may be scheduled ahead. */
export function isEffectiveDated(dataType: string): boolean {
  return dataType === 'PERCENT' || dataType === 'DECIMAL'
}
