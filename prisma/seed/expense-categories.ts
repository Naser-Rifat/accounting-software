/**
 * Expense categories — docs/modules/07-expenses.md.
 *
 * The 5000 range is cost of revenue and the 6000 range is overhead. Keeping them
 * apart is what makes gross margin per student computable, so a category must
 * never be mapped across the two by accident.
 *
 * Counselor and agent commission are deliberately absent: those post through the
 * internal-commission module, not as vendor bills.
 */

export type ExpenseCategorySeed = {
  code: string
  name: string
  glAccountCode: string
}

export const EXPENSE_CATEGORY_SEED: ExpenseCategorySeed[] = [
  // Cost of revenue
  { code: 'VISA', name: 'Visa & Immigration Costs', glAccountCode: '5040' },
  { code: 'APPFEE', name: 'University Application Costs', glAccountCode: '5030' },

  // Overhead
  { code: 'SALARY', name: 'Salaries & Wages', glAccountCode: '6010' },
  { code: 'RENT', name: 'Office Rent', glAccountCode: '6020' },
  { code: 'UTILITIES', name: 'Utilities', glAccountCode: '6030' },
  { code: 'MARKETING', name: 'Marketing & Advertising', glAccountCode: '6040' },
  { code: 'EVENTS', name: 'University Events & Fairs', glAccountCode: '6050' },
  { code: 'TRAVEL', name: 'Travel & Conveyance', glAccountCode: '6060' },
  { code: 'SOFTWARE', name: 'Software Subscriptions', glAccountCode: '6070' },
  { code: 'LEGAL', name: 'Professional & Legal Fees', glAccountCode: '6080' },
  { code: 'COMMS', name: 'Communication', glAccountCode: '6090' },
  { code: 'PRINTING', name: 'Printing & Stationery', glAccountCode: '6100' },
  { code: 'REPAIRS', name: 'Repairs & Maintenance', glAccountCode: '6110' },
  { code: 'BANKFEE', name: 'Bank Charges', glAccountCode: '6120' },
  { code: 'MISC', name: 'Miscellaneous', glAccountCode: '6900' },
]
