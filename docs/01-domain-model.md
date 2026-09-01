# Domain Model

Entity list with key fields and relations. Source of truth for `prisma/schema.prisma`.
`->` = belongs to (FK). `*` = has many.

## Master data

| Entity | Key fields | Relations |
|---|---|---|
| Student | code, name, dob, passportNo, passportExpiry, email, phone, address, status | -> Counselor, -> Agent?, -> Party, *Application, *AcademicRecord, *Document, *StudentInvoice |
| AcademicRecord | level, institution, result, year | -> Student |
| University | name, country, city, website, status | -> Party, *Program, *CommissionAgreement, *Application, *UniversityContact |
| UniversityContact | name, role, email, phone, isPrimary | -> University |
| Program | name, level, durationMonths, tuitionFee, currency | -> University |
| Intake | name ("Sep 2026"), month, year | *Application |
| Counselor | name, email, phone, commissionRate | -> Party, *Student, *InternalCommission |
| Agent | name, company, email, commissionRate | -> Party, *Student, *InternalCommission |
| Vendor | name, contact, taxId | -> Party, *ExpenseBill |
| Branch | code, name, address, isActive | -> CostCenter, *User, *Counselor, *Student |

### Party — the subledger key

Every entity the agency owes money to or is owed money by is also a `Party`.
This is what makes control accounts reconcile (see 03-accounting-standards.md).

```
Party { code, name, type, controlAccountCode, currency, isActive }
type: STUDENT | UNIVERSITY | COUNSELOR | AGENT | VENDOR | OTHER
```

`JournalLine.partyId` is **required** on any line hitting a control account and
forbidden elsewhere. Party ledger = all journal lines for one party.

## Pipeline

| Entity | Key fields | Relations |
|---|---|---|
| Application | code, appliedOn, status, applicationFee, tuitionFee, currency, offerLetterUrl, depositAmount, depositPaidOn, enrollmentStatus, visaStatus | -> Student, -> University, -> Program, -> Intake, -> Counselor, *Document, *Commission |
| Document | type, fileUrl, uploadedAt, verified | -> Student? / -> Application? / -> University? |

## Commission (core)

| Entity | Key fields | Relations |
|---|---|---|
| CommissionAgreement | effectiveFrom, effectiveTo, rateType, rate, appliesTo, eligibilityTrigger, paymentTermsDays, currency, scheduleType, contractUrl | -> University, *CommissionScheduleLine, *Commission |
| CommissionScheduleLine | seq, label ("Year 1"), percentOfTotal, triggerEvent, offsetDays | -> CommissionAgreement |
| Commission | instalmentSeq, instalmentLabel, baseAmount, rateType, rate, expectedAmount, netAmount, currency, fxRate, baseCurrencyAmount, status, eligibleOn, approvedOn, receivedOn | -> Application, -> CommissionAgreement, -> CommissionScheduleLine?, -> CommissionClaim?, *CommissionAdjustment |
| CommissionAdjustment | reason, amount (+/-), createdBy, createdAt | -> Commission |
| CommissionClaim | claimNo, claimedOn, dueOn, totalAmount, currency, status | -> University, *Commission, *ReceiptAllocation |

## Sales side (money in)

| Entity | Key fields | Relations |
|---|---|---|
| StudentInvoice | invoiceNo, issuedOn, dueOn, subtotal, discount, taxAmount, total, status | -> Student, -> Application?, *StudentInvoiceLine, *ReceiptAllocation |
| StudentInvoiceLine | feeType, description, amount, taxCodeId? | -> StudentInvoice |
| Receipt | receiptNo, receivedOn, amount, currency, fxRate, baseAmount, method, reference, withheldTax | -> Party, -> BankAccount, *ReceiptAllocation |
| ReceiptAllocation | amount | -> Receipt, -> StudentInvoice? / -> CommissionClaim? |
| CreditNote | noteNo, issuedOn, amount, reason, status | -> Party, -> StudentInvoice? / -> Commission? |

`feeType`: APPLICATION, SERVICE, VISA_PROCESSING, COUNSELING, DOCUMENTATION, OTHER

One `Receipt` model serves both students and universities — the `partyId` says which.
Allocation rows let one receipt settle several invoices or claims, which is what
standard packages do and what partial settlement requires.

## Purchase side (money out)

| Entity | Key fields | Relations |
|---|---|---|
| ExpenseCategory | name, glAccountCode | *ExpenseBill |
| ExpenseBill | billNo, incurredOn, dueOn, amount, currency, fxRate, baseAmount, taxAmount, vendorRef, description, status | -> Party (vendor), -> ExpenseCategory, -> Application?, -> CostCenter?, *PaymentAllocation |
| InternalCommission | rateType, rate, baseAmount, earnedAmount, currency, status, approvedOn, paidOn | -> Application, -> Party (counselor/agent), -> Commission |
| Payment | paymentNo, paidOn, amount, currency, fxRate, baseAmount, method, reference, withheldTax | -> Party, -> BankAccount, *PaymentAllocation |
| PaymentAllocation | amount | -> Payment, -> ExpenseBill? / -> InternalCommission? |
| DebitNote | noteNo, issuedOn, amount, reason, status | -> Party, -> ExpenseBill? |
| Refund | refundedOn, amount, reason, approvedBy | -> Student, -> CreditNote |

## Pass-through tuition (module 13)

Only for universities where `collectsTuitionViaAgency = true`. Client money, never revenue.

| Entity | Key fields | Relations |
|---|---|---|
| TuitionCollection | collectionNo, receivedOn, amount, currency, fxRate, baseAmount, purpose, method, reference, status | -> Student, -> Application, -> Party, -> BankAccount |
| TuitionRemittance | remittanceNo, remittedOn, amount, currency, fxRate, baseAmount, bankCharges, swiftReference, status | -> University, -> Party, -> BankAccount, *RemittanceAllocation |
| RemittanceAllocation | amount | -> TuitionRemittance, -> TuitionCollection |

## Accounting core

| Entity | Key fields | Relations |
|---|---|---|
| Account | code, name, type, parentId, isGroup, isControl, isContra, isSystem, isActive | self-tree, *JournalLine |
| JournalEntry | voucherType, voucherNo, entryDate, narration, currency, fxRate, sourceType, sourceId, status, reversesEntryId?, createdBy | -> AccountingPeriod, *JournalLine |
| JournalLine | debit, credit, lineNarration | -> JournalEntry, -> Account, -> Party?, -> CostCenter? |
| FiscalYear | name, code, startDate, endDate, status | *AccountingPeriod |
| AccountingPeriod | name, startDate, endDate, status | -> FiscalYear, *JournalEntry |
| CostCenter | code, name, type, isActive | *JournalLine |
| BankAccount | name, accountNo, bankName, currency, openingBalance, glAccountCode | *Receipt, *Payment, *BankReconciliation |
| BankReconciliation | statementDate, statementBalance, reconciledOn, status | -> BankAccount, *BankReconciliationLine |
| BankReconciliationLine | matched, statementRef | -> BankReconciliation, -> JournalLine |
| Currency | code, name, symbol, decimals, isBase, isActive | — |
| ExchangeRate | fromCurrency, toCurrency, rateDate, rate, source | — |
| TaxCode | code, name, kind, country?, rate, glAccountCode, effectiveFrom, effectiveTo?, isActive | *StudentInvoiceLine, *ExpenseBill |
| DocumentSeries | key, name, scope, prefix, padding, resetPolicy, isActive | *DocumentSeriesCounter |
| DocumentSeriesCounter | nextSeq | -> DocumentSeries, -> FiscalYear |

`TaxCode` is **effective-dated**: a rate change creates a new row and closes the
previous one, so a reprinted invoice shows the rate that applied on its own date.
Withholding resolution order: university → country → `tax.withholdingDefaultRate`.

`voucherType`: SI, CN, PB, DN, RV, PV, CV, JV, OB, CL — see 05-voucher-types.md
`sourceType`: COMMISSION, COMMISSION_CLAIM, RECEIPT, STUDENT_INVOICE, CREDIT_NOTE,
EXPENSE_BILL, PAYMENT, DEBIT_NOTE, INTERNAL_COMMISSION, DEPRECIATION, FX_REVAL,
PERIOD_CLOSE, OPENING, MANUAL
`CostCenter.type`: BRANCH, COUNSELOR, INTAKE, CAMPAIGN

The agency runs multiple branches on one set of books, so every `JournalLine`
carries a `costCenterId` resolving to the transaction's branch. Branch is
**mandatory** on postings; the other dimension types are optional analysis.

## Admin

| Entity | Key fields |
|---|---|
| User | name, email, role, active, counselorId?, agentId? |
| ApprovalRequest | entityType, entityId, requestedBy, approvedBy, status, note, decidedOn |
| AuditLog | userId, action, entity, entityId, before, after, ip, createdAt |
| Setting | key, section, value, dataType, isLocked, lockReason, updatedBy |
| SettingHistory | key, value, effectiveFrom, effectiveTo?, changedBy, changedAt, note |
| NotificationRule | key, event, enabled, offsetDays[], recipientRole, escalationRole?, channel, template |
| Notification | userId, type, title, body, entityType, entityId, severity, readAt, createdAt, idempotencyKey |
| NotificationOutbox | notificationId, channel, status, attempts, sentAt, error, providerRef |
| NotificationPref | userId, type, channel, enabled |

Notification tables ship in the first migration — see [modules/15](modules/15-notifications.md).
`Notification.idempotencyKey` is uniquely indexed so a re-run scan cannot double-notify.
Global search ([modules/14](modules/14-global-search.md)) adds **no tables** in phase 1 —
only `pg_trgm` and B-tree indexes on the searched columns.

Role: ADMIN, ACCOUNTANT, COUNSELOR, AGENT, VIEWER. (Auth deferred — see 11-decisions.md.)

## Invariants to enforce in the schema

1. `JournalEntry` totals: `sum(debit) == sum(credit)` — checked in `postEntry()` and
   backed by a deferred DB constraint.
2. `JournalLine`: exactly one of `debit`/`credit` is non-zero.
3. `JournalLine.partyId` NOT NULL when the account is a control account.
4. `(voucherType, voucherNo)` unique.
5. `Account.code` unique; `isGroup` accounts have no journal lines.
6. `CommissionAgreement` date ranges must not overlap per university.
7. Allocation totals never exceed the parent receipt/payment amount or the target
   document's outstanding balance.
8. `JournalLine.costCenterId` NOT NULL for the branch dimension on every posting.
9. `CommissionScheduleLine.percentOfTotal` must sum to 100 per agreement.
10. Sum of HELD `TuitionCollection` balances must equal the 2130 control balance.
