# Chart of Accounts

Standard 4-digit coded, group-based CoA. Seeded on first migration.
Accounts marked **S** are *system accounts*: posting code references them by code,
so they cannot be deleted or re-coded. Accounts marked **C** are *control accounts*
— postable only from their subsidiary ledger, never from a manual journal.

## Structure

| Range | Group |
|---|---|
| 1000–1999 | Assets |
| 2000–2999 | Liabilities |
| 3000–3999 | Equity |
| 4000–4999 | Revenue |
| 5000–5999 | Direct Costs (cost of revenue) |
| 6000–6999 | Operating Expenses |
| 7000–7999 | Other Income & Expense |
| 8000–8999 | Tax |
| 9000–9999 | Suspense & Closing |

## 1000 Assets

| Code | Account | Flags |
|---|---|---|
| 1000 | **Current Assets** *(group)* | |
| 1010 | Cash in Hand | S |
| 1020 | Bank Accounts *(parent of one sub-account per bank account)* | S |
| 1100 | **Receivables** *(group)* | |
| 1110 | Accounts Receivable – Students | S C |
| 1120 | Accounts Receivable – Universities | S C |
| 1130 | Accrued Commission Income (unbilled) | S |
| 1200 | **Other Current Assets** *(group)* | |
| 1210 | Advances to Staff & Agents | |
| 1220 | Prepaid Expenses | |
| 1230 | Security Deposits | |
| 1300 | **Tax Assets** *(group)* | |
| 1310 | Withholding Tax Receivable (AIT deducted at source) | S |
| 1320 | Input VAT Receivable | S |
| 1500 | **Fixed Assets** *(group)* | |
| 1510 | Office Equipment | |
| 1520 | Furniture & Fixtures | |
| 1530 | Computers & Software | |
| 1590 | Accumulated Depreciation | contra |

## 2000 Liabilities

| Code | Account | Flags |
|---|---|---|
| 2000 | **Current Liabilities** *(group)* | |
| 2010 | Accounts Payable – Vendors | S C |
| 2020 | Accounts Payable – Counselors & Agents | S C |
| 2030 | Accrued Expenses | S |
| 2040 | Salaries Payable | |
| 2100 | **Advances Received** *(group)* | |
| 2110 | Student Advances (unearned fees) | S |
| 2120 | Commission Received in Advance | S |
| 2130 | Tuition Held for Remittance (client money) | S C |
| 2300 | **Tax Liabilities** *(group)* | |
| 2310 | VAT Payable | S |
| 2320 | Withholding Tax Payable (deducted from vendors/agents) | S |
| 2330 | Income Tax Payable | S |
| 2500 | Loans Payable | |

## 3000 Equity

| Code | Account | Flags |
|---|---|---|
| 3100 | Owner's Capital | S |
| 3150 | Owner's Drawings | contra |
| 3200 | Retained Earnings | S |
| 3900 | Current Year Earnings | S |

## 4000 Revenue

| Code | Account | Flags |
|---|---|---|
| 4010 | University Commission Income | S |
| 4020 | Student Service Fee Income | S |
| 4030 | Visa Processing Fee Income | |
| 4040 | Counseling Fee Income | |
| 4050 | Documentation Fee Income | |
| 4080 | Other Operating Income | |
| 4090 | Refunds, Discounts & Allowances | S contra |

## 5000 Direct Costs

| Code | Account | Flags |
|---|---|---|
| 5010 | Counselor Commission Expense | S |
| 5020 | Sub-agent Commission Expense | S |
| 5030 | University Application Costs | |
| 5040 | Visa & Immigration Costs | |

## 6000 Operating Expenses

| Code | Account |
|---|---|
| 6010 | Salaries & Wages |
| 6020 | Office Rent |
| 6030 | Utilities |
| 6040 | Marketing & Advertising |
| 6050 | University Events & Fairs |
| 6060 | Travel & Conveyance |
| 6070 | Software Subscriptions |
| 6080 | Professional & Legal Fees |
| 6090 | Communication |
| 6100 | Printing & Stationery |
| 6110 | Repairs & Maintenance |
| 6120 | Bank Charges |
| 6130 | Depreciation Expense |
| 6900 | Miscellaneous Expense |

## 7000 Other Income & Expense

| Code | Account | Flags |
|---|---|---|
| 7010 | Interest Income | |
| 7100 | Realised Foreign Exchange Gain/Loss | S |
| 7110 | Unrealised Foreign Exchange Gain/Loss | S |
| 7200 | Bad Debt Expense | S |
| 7900 | Rounding Difference | S |

## 8000 Tax

| Code | Account |
|---|---|
| 8010 | Income Tax Expense |

## 9000 Suspense

| Code | Account | Flags |
|---|---|---|
| 9000 | Suspense Account | S |
| 9100 | Opening Balance Equity | S |

Suspense (9000) holds unidentified receipts until allocated. A non-zero balance
must appear as a warning on the dashboard — it is a to-do list, not a resting place.

## Model rules

- `Account { code, name, type, parentId, isGroup, isControl, isContra, isSystem, isActive, currency? }`
- Only leaf accounts (`isGroup = false`) accept postings.
- An account with any journal line may be deactivated, never deleted.
- Users may add sub-accounts under any group; system accounts keep their codes.
- Each `BankAccount` auto-creates a sub-account under 1020.
