import { describe, expect, it } from 'vitest'

import { isEffectiveDated, validateSettingValue } from '@/lib/validation/settings'

/** docs/modules/16-settings.md rule 4: a bad value is rejected, never warned about. */

describe('validateSettingValue by data type', () => {
  it('INT and *Days', () => {
    expect(validateSettingValue('fiscalYear.autoSoftCloseDays', 'INT', '5')).toBeNull()
    expect(validateSettingValue('fiscalYear.autoSoftCloseDays', 'INT', '5.5')).toMatch(/whole number/)
    expect(validateSettingValue('fiscalYear.autoSoftCloseDays', 'INT', '-1')).toMatch(/negative/)
  })

  it('DECIMAL and PERCENT', () => {
    expect(validateSettingValue('expense.approvalThreshold', 'DECIMAL', '50000')).toBeNull()
    expect(validateSettingValue('expense.approvalThreshold', 'DECIMAL', 'abc')).not.toBeNull()
    expect(validateSettingValue('tax.withholdingDefaultRate', 'PERCENT', '12.5')).toBeNull()
    expect(validateSettingValue('tax.withholdingDefaultRate', 'PERCENT', '101')).toMatch(/between 0 and 100/)
    expect(validateSettingValue('tax.withholdingDefaultRate', 'PERCENT', '-1')).not.toBeNull()
  })

  it('BOOLEAN, DATE, FILE_URL', () => {
    expect(validateSettingValue('tax.vatEnabled', 'BOOLEAN', 'true')).toBeNull()
    expect(validateSettingValue('tax.vatEnabled', 'BOOLEAN', 'yes')).not.toBeNull()
    expect(validateSettingValue('x', 'DATE', '2026-07-01')).toBeNull()
    expect(validateSettingValue('x', 'DATE', '01/07/2026')).not.toBeNull()
    expect(validateSettingValue('company.logoUrl', 'FILE_URL', '')).toBeNull()
    expect(validateSettingValue('company.logoUrl', 'FILE_URL', 'ftp://x')).not.toBeNull()
  })

  it('ENUM uses the configured choices', () => {
    expect(validateSettingValue('company.locale', 'ENUM', 'bn-BD')).toBeNull()
    expect(validateSettingValue('company.locale', 'ENUM', 'fr-FR')).toMatch(/Choose one of/)
    expect(validateSettingValue('company.baseCurrency', 'ENUM', 'USD')).toBeNull()
    expect(validateSettingValue('unknown.key', 'ENUM', 'X')).toMatch(/No choices/)
  })

  it('JSON, and the fee-type list in particular', () => {
    expect(validateSettingValue('x', 'JSON', '{"a":1}')).toBeNull()
    expect(validateSettingValue('x', 'JSON', '{a:1}')).toMatch(/valid JSON/)
    expect(validateSettingValue('tax.taxableFeeTypes', 'JSON', '["SERVICE","COUNSELING"]')).toBeNull()
    expect(validateSettingValue('tax.taxableFeeTypes', 'JSON', '{"SERVICE":true}')).toMatch(/array/)
  })
})

describe('key-specific rules', () => {
  it('timezone must be an IANA name', () => {
    expect(validateSettingValue('company.timezone', 'STRING', 'Asia/Dhaka')).toBeNull()
    expect(validateSettingValue('company.timezone', 'STRING', 'Dhaka Time')).toMatch(/IANA/)
  })

  it('email and website shapes', () => {
    expect(validateSettingValue('company.email', 'STRING', 'accounts@agency.example')).toBeNull()
    expect(validateSettingValue('company.email', 'STRING', 'not-an-email')).not.toBeNull()
    expect(validateSettingValue('company.website', 'STRING', 'https://agency.example')).toBeNull()
    expect(validateSettingValue('company.website', 'STRING', 'agency.example')).not.toBeNull()
  })

  it('fiscal year start and patterns', () => {
    expect(validateSettingValue('fiscalYear.startMonthDay', 'STRING', '07-01')).toBeNull()
    expect(validateSettingValue('fiscalYear.startMonthDay', 'STRING', '02-30')).toMatch(/do not exist/)
    expect(validateSettingValue('fiscalYear.startMonthDay', 'STRING', '7-1')).toMatch(/MM-DD/)
    expect(validateSettingValue('fiscalYear.namingPattern', 'STRING', 'FY{startYYYY}-{endYY}')).toBeNull()
    expect(validateSettingValue('fiscalYear.codePattern', 'STRING', 'FY')).toMatch(/year token/)
  })

  it('numbering separator', () => {
    expect(validateSettingValue('numbering.separator', 'STRING', '-')).toBeNull()
    expect(validateSettingValue('numbering.separator', 'STRING', '')).toBeNull()
    expect(validateSettingValue('numbering.separator', 'STRING', '--')).not.toBeNull()
    expect(validateSettingValue('numbering.separator', 'STRING', 'x')).not.toBeNull()
  })

  it('only rate-like keys are scheduled ahead', () => {
    expect(isEffectiveDated('PERCENT')).toBe(true)
    expect(isEffectiveDated('DECIMAL')).toBe(true)
    expect(isEffectiveDated('STRING')).toBe(false)
  })
})
