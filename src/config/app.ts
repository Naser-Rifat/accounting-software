/**
 * Build-time application constants and the seed values for the Setting table.
 *
 * Anything an accountant or owner might change belongs in `Setting` and the admin
 * UI, never as a constant in code. The rows below are only the *initial* values —
 * once seeded, the database is the source of truth.
 *
 * See docs/modules/16-settings.md.
 */

export const APP = {
  name: 'Accounting System',
  description: 'Study-abroad agency accounting and commission management',
} as const

export type SettingSection =
  | 'COMPANY'
  | 'TAX'
  | 'NUMBERING'
  | 'FISCAL_YEAR'
  | 'ACCOUNTING'
  | 'COMMISSION'
  | 'APPROVALS'
  | 'NOTIFICATIONS'
  | 'DOCUMENTS'

export type SettingDataType =
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

export type SettingSeed = {
  key: string
  section: SettingSection
  dataType: SettingDataType
  value: string
  /** Locks permanently once the named condition is met — docs/modules/16-settings.md rule 2. */
  locksOn?: 'FIRST_POSTING' | 'FIRST_FISCAL_YEAR'
}

export const SETTING_DEFAULTS: SettingSeed[] = [
  // --- Company -------------------------------------------------------------
  { key: 'company.legalName', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.tradingName', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.address', section: 'COMPANY', dataType: 'TEXT', value: '' },
  { key: 'company.city', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.district', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.postcode', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.country', section: 'COMPANY', dataType: 'ENUM', value: 'BD' },
  { key: 'company.phone', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.email', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.website', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.logoUrl', section: 'COMPANY', dataType: 'FILE_URL', value: '' },
  { key: 'company.registrationNo', section: 'COMPANY', dataType: 'STRING', value: '' },
  { key: 'company.taxId', section: 'COMPANY', dataType: 'STRING', value: '' },
  {
    key: 'company.baseCurrency',
    section: 'COMPANY',
    dataType: 'ENUM',
    value: 'BDT',
    locksOn: 'FIRST_POSTING',
  },
  {
    key: 'company.timezone',
    section: 'COMPANY',
    dataType: 'STRING',
    value: 'Asia/Dhaka',
    locksOn: 'FIRST_POSTING',
  },
  { key: 'company.locale', section: 'COMPANY', dataType: 'ENUM', value: 'en-BD' },
  {
    key: 'company.numberGrouping',
    section: 'COMPANY',
    dataType: 'ENUM',
    value: 'SOUTH_ASIAN',
  },
  { key: 'company.dateFormat', section: 'COMPANY', dataType: 'ENUM', value: 'DD-MMM-YYYY' },

  // --- Tax -----------------------------------------------------------------
  // Rates themselves live in TaxCode, which is effective-dated. These are switches.
  { key: 'tax.vatEnabled', section: 'TAX', dataType: 'BOOLEAN', value: 'true' },
  { key: 'tax.vatRegistrationNo', section: 'TAX', dataType: 'STRING', value: '' },
  {
    key: 'tax.taxableFeeTypes',
    section: 'TAX',
    dataType: 'JSON',
    value: '["SERVICE","COUNSELING","DOCUMENTATION"]',
  },
  { key: 'tax.filingPeriod', section: 'TAX', dataType: 'ENUM', value: 'MONTHLY' },
  { key: 'tax.withholdingDefaultRate', section: 'TAX', dataType: 'PERCENT', value: '0' },
  { key: 'tax.pricesIncludeTax', section: 'TAX', dataType: 'BOOLEAN', value: 'false' },

  // --- Numbering -----------------------------------------------------------
  // Per-series prefix/padding/reset live in DocumentSeries. These are global.
  { key: 'numbering.separator', section: 'NUMBERING', dataType: 'STRING', value: '-' },
  { key: 'numbering.includeFiscalYear', section: 'NUMBERING', dataType: 'BOOLEAN', value: 'true' },
  {
    key: 'numbering.allowManualOverride',
    section: 'NUMBERING',
    dataType: 'BOOLEAN',
    value: 'false',
  },

  // --- Fiscal year ---------------------------------------------------------
  {
    key: 'fiscalYear.startMonthDay',
    section: 'FISCAL_YEAR',
    dataType: 'STRING',
    value: '07-01',
    locksOn: 'FIRST_FISCAL_YEAR',
  },
  {
    key: 'fiscalYear.namingPattern',
    section: 'FISCAL_YEAR',
    dataType: 'STRING',
    value: 'FY{startYYYY}-{endYY}',
  },
  {
    key: 'fiscalYear.codePattern',
    section: 'FISCAL_YEAR',
    dataType: 'STRING',
    value: '{startYY}{endYY}',
  },
  { key: 'fiscalYear.periodLength', section: 'FISCAL_YEAR', dataType: 'ENUM', value: 'MONTHLY' },
  { key: 'fiscalYear.autoCreatePeriods', section: 'FISCAL_YEAR', dataType: 'BOOLEAN', value: 'true' },
  { key: 'fiscalYear.autoSoftCloseDays', section: 'FISCAL_YEAR', dataType: 'INT', value: '5' },
  { key: 'fiscalYear.allowBackdatedDays', section: 'FISCAL_YEAR', dataType: 'INT', value: '30' },
  {
    key: 'fiscalYear.allowPriorYearPosting',
    section: 'FISCAL_YEAR',
    dataType: 'BOOLEAN',
    value: 'false',
  },

  // --- Policy (sections built later, seeded now so behaviour is defined) ----
  { key: 'expense.approvalThreshold', section: 'APPROVALS', dataType: 'DECIMAL', value: '50000' },
  { key: 'internal_commission.base', section: 'COMMISSION', dataType: 'ENUM', value: 'NET' },
  {
    key: 'internal_commission.payout_trigger',
    section: 'COMMISSION',
    dataType: 'ENUM',
    value: 'APPROVED',
  },
  { key: 'tuition.heldAgeWarningDays', section: 'DOCUMENTS', dataType: 'INT', value: '30' },
]

/** Numbering series seeded on first run — prefix and padding are editable after. */
export const DOCUMENT_SERIES_DEFAULTS = [
  { key: 'SI', name: 'Sales Invoice', scope: 'VOUCHER', prefix: 'SI' },
  { key: 'CN', name: 'Credit Note', scope: 'VOUCHER', prefix: 'CN' },
  { key: 'PB', name: 'Purchase Bill', scope: 'VOUCHER', prefix: 'PB' },
  { key: 'DN', name: 'Debit Note', scope: 'VOUCHER', prefix: 'DN' },
  { key: 'RV', name: 'Receipt Voucher', scope: 'VOUCHER', prefix: 'RV' },
  { key: 'PV', name: 'Payment Voucher', scope: 'VOUCHER', prefix: 'PV' },
  { key: 'CV', name: 'Contra Voucher', scope: 'VOUCHER', prefix: 'CV' },
  { key: 'JV', name: 'Journal Voucher', scope: 'VOUCHER', prefix: 'JV' },
  { key: 'OB', name: 'Opening Balance', scope: 'VOUCHER', prefix: 'OB' },
  { key: 'CL', name: 'Closing Voucher', scope: 'VOUCHER', prefix: 'CL' },
  { key: 'STU', name: 'Student', scope: 'DOCUMENT', prefix: 'STU' },
  { key: 'APP', name: 'Application', scope: 'DOCUMENT', prefix: 'APP' },
  { key: 'CLM', name: 'Commission Claim', scope: 'DOCUMENT', prefix: 'CLM' },
  { key: 'INV', name: 'Student Invoice', scope: 'DOCUMENT', prefix: 'INV' },
  { key: 'EXP', name: 'Expense Bill', scope: 'DOCUMENT', prefix: 'EXP' },
  { key: 'FA', name: 'Fixed Asset', scope: 'DOCUMENT', prefix: 'FA' },
] as const

/** Currencies the agency transacts in. The base currency is a setting, not a constant. */
export const SUPPORTED_CURRENCIES = [
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: 'Tk', decimals: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
] as const

export const DEFAULT_PAGE_SIZE = 25

/**
 * Choices for ENUM settings, keyed by setting key — docs/modules/16-settings.md.
 * The admin screen renders a select from these and the service refuses any
 * other value. Lives next to SETTING_DEFAULTS so a setting is defined in one place.
 */
export const SETTING_OPTIONS: Record<string, readonly string[]> = {
  'company.country': ['BD', 'AU', 'CA', 'DE', 'GB', 'IE', 'MY', 'NZ', 'US'],
  'company.baseCurrency': SUPPORTED_CURRENCIES.map((c) => c.code),
  'company.locale': ['en-BD', 'bn-BD'],
  'company.numberGrouping': ['SOUTH_ASIAN', 'INTERNATIONAL'],
  'company.dateFormat': ['DD-MMM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
  'tax.filingPeriod': ['MONTHLY', 'QUARTERLY'],
  'fiscalYear.periodLength': ['MONTHLY', 'QUARTERLY'],
  'internal_commission.base': ['NET', 'GROSS'],
  'internal_commission.payout_trigger': ['APPROVED', 'RECEIVED'],
}

/** Human labels for the settings sections, in the order the hub shows them. */
export const SETTING_SECTIONS: { section: SettingSection; label: string; blurb: string; href: string }[] = [
  { section: 'COMPANY', label: 'Company', blurb: 'Identity printed on every document, locale, base currency', href: '/admin/settings/company' },
  { section: 'TAX', label: 'Tax', blurb: 'VAT switches and the default withholding rate; rates live in tax codes', href: '/admin/settings/tax' },
  { section: 'NUMBERING', label: 'Numbering', blurb: 'Document and voucher series', href: '/admin/settings/numbering' },
  { section: 'FISCAL_YEAR', label: 'Fiscal year', blurb: 'Year start, patterns and period policy', href: '/admin/fiscal-years' },
  { section: 'APPROVALS', label: 'Approvals', blurb: 'Thresholds that route a document to an approver', href: '/admin/settings/approvals' },
  { section: 'COMMISSION', label: 'Commission', blurb: 'Internal commission base and payout trigger', href: '/admin/settings/commission' },
  { section: 'DOCUMENTS', label: 'Documents', blurb: 'Warnings on held client money', href: '/admin/settings/documents' },
]
