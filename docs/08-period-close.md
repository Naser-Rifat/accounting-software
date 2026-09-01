# Fiscal Periods, Close & Opening Balances

## Structure

```
Model FiscalYear      { name, startDate, endDate, status }        status: OPEN | CLOSED
Model AccountingPeriod{ fiscalYearId, name, startDate, endDate, status }
                                                    status: OPEN | SOFT_CLOSED | CLOSED
```

Twelve monthly periods per fiscal year, generated when the year is created.
Fiscal year start is a setting (`company.fiscalYearStart`), default **July 1**
(Bangladesh FY: 1 Jul – 30 Jun, named `FY2026-27`, code `2627`).

| Period status | Effect |
|---|---|
| OPEN | Anyone with rights may post |
| SOFT_CLOSED | Only ACCOUNTANT/ADMIN may post; each posting is flagged in the audit log |
| CLOSED | No posting at all, by anyone. Reversals must be dated in an open period. |

Every voucher stores `periodId`, resolved from `entryDate` at posting time.
Posting resolves the period first and rejects the voucher if it is CLOSED.

## Month-end checklist

The system provides this as a UI checklist at `/accounting/period-close`, each item
linking to the screen that resolves it:

1. All draft vouchers posted or deleted.
2. Bank reconciliation complete for every bank account.
3. Suspense account (9000) balance is zero.
4. AR control (1110, 1120) equals its subsidiary ledger total.
5. AP control (2010, 2020) equals its subsidiary ledger total.
5a. Tuition held (2130) equals the sum of collections still in HELD status.
6. Accruals posted — unbilled commission, accrued expenses, salaries.
7. Prepaid expenses amortised for the month.
8. Depreciation posted.
9. Foreign-currency balances revalued (7110), with the reversal queued for day 1 of next period.
10. Trial balance balances.
11. Review P&L and Balance Sheet against the prior period for anomalies.

Only when all items pass may the period be closed. The checklist result is stored,
so it is auditable after the fact.

## Year-end close

Run only after the final period is closed.

1. Post any year-end adjustments (JV) while the last period is SOFT_CLOSED.
2. Close income accounts: Dr 4xxx / Cr 3900 Current Year Earnings.
3. Close expense accounts: Dr 3900 / Cr 5xxx, 6xxx.
4. Transfer the net result: Dr/Cr 3900 to 3200 Retained Earnings.
5. Balance Sheet accounts carry forward untouched — they are never closed.
6. Set the fiscal year to CLOSED and open the next year with the carried-forward
   balances as its opening position.
7. Reset voucher number series for the new fiscal year.

Closing is itself a set of `CL` vouchers, visible in the journal like any other
posting. Nothing is hidden or computed off-ledger.

## Opening balances (go-live migration)

When the agency migrates from its previous books:

1. Create the fiscal year and set the go-live date.
2. Enter each account's opening balance as `OB` vouchers, with the contra to
   9100 Opening Balance Equity.
3. Enter subsidiary detail so control accounts reconcile: each open student
   invoice, each unpaid commission claim, each unpaid vendor bill.
4. Enter open foreign-currency items at their original rate, not today's rate.
5. When 9100 nets to zero against capital and retained earnings, migration balances.
   A residual 9100 balance means the migration is incomplete — block go-live until it clears.

## Locking rules

| Action | Allowed when |
|---|---|
| Post a voucher | Period OPEN, or SOFT_CLOSED with ACCOUNTANT/ADMIN rights |
| Reverse a voucher | Reversal date is in an open period, even if the original is closed |
| Reopen a period | ADMIN only, audit-logged, blocked if a later period is CLOSED |
| Reopen a fiscal year | ADMIN only, requires reversing the CL vouchers first |
| Edit a posted voucher | Never |
