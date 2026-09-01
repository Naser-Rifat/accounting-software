# 10. Financial Dashboard

Route `/`. One screen answering: how much is coming in, how much is stuck, are we profitable.

## Tiles

| Tile | Source |
|---|---|
| Total Students | count(Student) excluding DROPPED |
| Active Applications | Applications not in a terminal status |
| Enrolled Students | Applications at ENROLLED or beyond |
| Total Student Revenue | 4020–4080 income accounts, period |
| **Expected University Commission** | sum(Commission.netAmount) where status in EXPECTED, ELIGIBLE — *pipeline, not revenue* |
| **Unbilled Commission** | 1130 Accrued Commission Income balance |
| **Pending University Commission** | 1120 AR – Universities balance |
| **Received University Commission** | Receipts allocated to claims, period |
| Total Expenses | 5xxx + 6xxx accounts, period |
| Gross Margin | Revenue (4xxx) − Direct Costs (5xxx) |
| Net Profit | 3900 Current Year Earnings movement for the period |
| Outstanding Student Payments | 1110 AR – Students balance |
| Cash & Bank Balance | 1010 + 1020 balances, **excluding** client money |
| Tuition Held (client money) | 2130 balance — a liability, shown apart from operating cash |

Note which tiles come from the **ledger** rather than from source tables. Anything
recognised as revenue, expense, receivable, or cash reads from `JournalLine`, so
the dashboard and the financial statements can never disagree. Only pipeline
figures (expected commission, application counts) read from operational tables.

## Charts

| Chart | Shape |
|---|---|
| Monthly Revenue | 12-month bar: commission income (4010) vs student fee income (4020–4080) |
| Commission funnel | Expected → Approved → Billed → Received, current values |
| Monthly Commission | 12-month line: approved vs billed vs received |
| University-wise Revenue | Horizontal bar, top 10 universities by commission income |
| Application funnel | Lead → Counseling → Applied → Offer → Enrolled → Visa → Arrived |
| Commission aging | Stacked bar by bucket, from open claims |
| Cash position | Bank and cash balances by account |

## Warnings panel

Standard packages surface book health on the home screen. Show a warning when:

- Suspense account (9000) balance is non-zero
- A control account does not match its subsidiary ledger
- Trial balance does not foot
- The prior period is still open past its close date
- A bank account has gone unreconciled for over 30 days
- Commission claims are over 90 days overdue

## Rules

1. EXPECTED commission never appears in a revenue tile. It is labelled as pipeline.
2. All figures in base currency, at each transaction's stored rate.
3. Global period selector (this month / quarter / fiscal year / custom) applies to
   every period-scoped tile and chart; balance-type tiles are always as-of-date.
   A branch selector filters every figure by cost center, defaulting to all branches.
4. Compute via aggregate SQL, never by loading rows into JS.
