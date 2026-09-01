# 2. University Management

The partner institutions that pay commission. Commercial terms live here.

## Data

| Group | Fields |
|---|---|
| Profile | name, country, city, website, logo, status |
| Money routing | collectsTuitionViaAgency, withholdingRate |
| Representative | contacts[]: name, role, email, phone (one marked primary) |
| Bank | bankName, accountName, accountNo, swift, iban, currency |
| Documents | contract/MOU files via shared `Document` table |

## Programs

Each university has many `Program` rows: name, level (FOUNDATION, DIPLOMA,
BACHELOR, MASTER, PHD), durationMonths, tuitionFee, currency, intakes[].
`tuitionFee` here is the default; the actual fee is copied onto the Application
so later program price changes never alter historical commission.

## Commission agreement

The commercial contract. One university may have several over time.

| Field | Notes |
|---|---|
| effectiveFrom / effectiveTo | Date range; agreements must not overlap for one university |
| rateType | PERCENT or FIXED |
| rate | 15.0 = 15% of tuition, or a fixed amount per student |
| appliesTo | FIRST_YEAR_TUITION, TOTAL_TUITION, or PER_STUDENT |
| eligibilityTrigger | ENROLLMENT, CENSUS_DATE, or ARRIVAL — when commission becomes ELIGIBLE |
| scheduleType | ONE_TIME, PER_YEAR, PER_SEMESTER, or CUSTOM |
| paymentTermsDays | Net days from claim to due date; drives aging |
| currency | Currency the university pays in |
| contractUrl | Signed agreement |

### Payment schedule

Commission structure **varies by university**, so the agreement carries a schedule
of instalments rather than a single payment assumption:

```
CommissionScheduleLine { seq, label, percentOfTotal, triggerEvent, offsetDays }
```

| scheduleType | Generates |
|---|---|
| ONE_TIME | One line at 100% |
| PER_YEAR | One line per year of the program, split evenly unless overridden |
| PER_SEMESTER | One line per semester |
| CUSTOM | Hand-entered lines, e.g. 60% on enrollment + 40% after census date |

`percentOfTotal` must sum to 100. `triggerEvent` (ENROLLMENT, CENSUS_DATE,
ARRIVAL, RE_ENROLLMENT, FIXED_DATE) plus `offsetDays` determines when each
instalment becomes ELIGIBLE. One application therefore produces one Commission row
**per schedule line**.

## Money routing

Two fields decide how money moves for this university:

- `collectsTuitionViaAgency` — if true, students pay tuition/deposit to the agency
  and the agency remits it. That money is client money, not revenue; see
  [13-tuition-remittance.md](13-tuition-remittance.md). If false, students pay the
  university directly and nothing touches the agency's ledger.
- `withholdingRate` — tax the university or its remitting bank deducts at source
  from commission. Defaults from the country, overridable per university. The
  deducted amount is a claimable receivable, not lost revenue.

## Rules

1. A commission is always calculated from the agreement in force on the
   application's enrollment date, and that agreement id is stored on the
   Commission row. Later contract changes never restate existing commissions.
2. No overlapping active agreements for one university — validate on save.
3. Deactivating a university keeps its history intact.
4. Changing `collectsTuitionViaAgency` never affects applications already in
   flight — the route is snapshotted on the application.

## Screens

`/universities` list (name, country, programs, active agreement rate, students,
outstanding commission) · `/universities/[id]` tabs: Overview, Programs,
Agreements, Applications, Commission, Documents · `/universities/programs` ·
`/universities/agreements`
