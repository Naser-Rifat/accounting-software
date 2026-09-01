# 16. Settings

Configuration an accountant or owner can change without a developer. Phase 1
covers four sections: **Company**, **Tax**, **Numbering**, **Fiscal Year**.
The framework below is general, so later sections (approvals, commission policy,
credit control, notifications) drop in without redesign.

## Framework

```
Setting        { key, section, value, dataType, isLocked, lockReason,
                 updatedBy, updatedAt }
SettingHistory { key, value, effectiveFrom, effectiveTo?, changedBy, changedAt,
                 note }
```

`dataType`: STRING, TEXT, INT, DECIMAL, PERCENT, BOOLEAN, DATE, ENUM, JSON, FILE_URL.
The admin screen renders each field from its `dataType`, so adding a setting is a
seed row, not a UI change.

### Rule 1 — rates are effective-dated, never overwritten

Anything that affects an already-posted document is resolved **by document date**,
not by current value. If VAT moves 15% → 10% next July and the value is
overwritten, every reprint of an older invoice silently shows the wrong tax.

`SettingHistory` carries the dated values; `Setting.value` is a cache of the row
current today. Resolution:

```
settingAsOf(key, date) -> the SettingHistory row where
    effectiveFrom <= date AND (effectiveTo IS NULL OR effectiveTo > date)
```

Tax rates use the same idea in a stronger form — see `TaxCode` below, which is
effective-dated as a first-class model.

### Rule 2 — some settings lock permanently once used

| Setting | Locks when | Why |
|---|---|---|
| `company.baseCurrency` | first voucher posted | Every prior amount was converted at this currency |
| `company.timezone` | first voucher posted | Period boundaries would shift; a 30 June 11pm entry could move fiscal year |
| `fiscalYear.startMonthDay` | first fiscal year created | Periods and voucher series are already built from it |
| Currency `decimals` | first voucher in that currency | Historic rounding would no longer reproduce |

Locked settings render greyed with "locked — 1,284 vouchers posted", never as a
field that fails on save. `isLocked` is computed and cached, never hand-set.

### Rule 3 — every change is an audit event

Who, when, old value, new value, and an optional note. "Why did VAT stop being
charged in March?" must be answerable. `SettingHistory` doubles as this record.

### Rule 4 — validation on save, per key

A setting is rejected, not warned about, when invalid: an account code must exist
and be a postable non-control account of the right type; a percent must be
0–100; a timezone must be a valid IANA name.

## Section: Company

Printed on every invoice, claim and statement, so treat it as document data.

| Key | Type | Default | Notes |
|---|---|---|---|
| `company.legalName` | STRING | — | Required before any document prints |
| `company.tradingName` | STRING | — | Falls back to legal name |
| `company.address` | TEXT | — | Multi-line, printed as-is |
| `company.city` / `company.district` / `company.postcode` | STRING | — | |
| `company.country` | ENUM | BD | |
| `company.phone` / `company.email` / `company.website` | STRING | — | |
| `company.logoUrl` | FILE_URL | — | Header of printed documents |
| `company.registrationNo` | STRING | — | Trade licence number |
| `company.taxId` | STRING | — | BIN / TIN |
| `company.baseCurrency` | ENUM | BDT | **Locks** after first posting |
| `company.timezone` | STRING | Asia/Dhaka | **Locks** after first posting. All period and aging maths uses this, never server time |
| `company.locale` | ENUM | en-BD | `en-BD` or `bn-BD` |
| `company.numberGrouping` | ENUM | SOUTH_ASIAN | `SOUTH_ASIAN` renders 15,00,000.00; `INTERNATIONAL` renders 1,500,000.00 |
| `company.dateFormat` | ENUM | DD-MMM-YYYY | |

## Section: Tax

Simple switches live in `Setting`; **rates live in `TaxCode`**, which is
effective-dated so historic documents keep the rate they were issued under.

| Key | Type | Default | Notes |
|---|---|---|---|
| `tax.vatEnabled` | BOOLEAN | true | Off hides all tax fields and lines |
| `tax.vatRegistrationNo` | STRING | — | Printed on tax invoices |
| `tax.taxableFeeTypes` | JSON | all service fees | Which fee types carry output VAT |
| `tax.filingPeriod` | ENUM | MONTHLY | Drives the VAT summary report period |
| `tax.withholdingDefaultRate` | PERCENT | 0 | Fallback when no country or university rate is set |
| `tax.pricesIncludeTax` | BOOLEAN | false | Whether entered fee amounts are gross or net |

```
TaxCode { code, name, kind, country?, rate, glAccountCode,
          effectiveFrom, effectiveTo?, isActive }
```

Resolution order for a withholding rate: **university → country → default setting**.
Resolution for any rate is by document date, never by today's value.

Changing a rate creates a **new** `TaxCode` row with a new `effectiveFrom` and
closes the previous one. Editing a rate in place is not offered anywhere in the UI.

## Section: Numbering

Two models: configuration per series, and a counter per fiscal year.

```
DocumentSeries        { key, name, scope, prefix, padding, resetPolicy, isActive }
DocumentSeriesCounter { seriesKey, fiscalYearId, nextSeq }
```

`scope`: VOUCHER (the ten voucher types) or DOCUMENT (business documents).
`resetPolicy`: YEARLY (restart at 1 each fiscal year) or CONTINUOUS.

| Series | Key | Default prefix | Scope |
|---|---|---|---|
| Sales Invoice | SI | SI | VOUCHER |
| Credit Note | CN | CN | VOUCHER |
| Purchase Bill | PB | PB | VOUCHER |
| Debit Note | DN | DN | VOUCHER |
| Receipt Voucher | RV | RV | VOUCHER |
| Payment Voucher | PV | PV | VOUCHER |
| Contra Voucher | CV | CV | VOUCHER |
| Journal Voucher | JV | JV | VOUCHER |
| Opening Balance | OB | OB | VOUCHER |
| Closing | CL | CL | VOUCHER |
| Student | STU | STU | DOCUMENT |
| Application | APP | APP | DOCUMENT |
| Commission Claim | CLM | CLM | DOCUMENT |
| Student Invoice | INV | INV | DOCUMENT |
| Expense Bill | EXP | EXP | DOCUMENT |

| Key | Type | Default | Notes |
|---|---|---|---|
| `numbering.separator` | STRING | `-` | `SI-2627-00042` |
| `numbering.includeFiscalYear` | BOOLEAN | true | Off gives `SI-00042` |
| `numbering.allowManualOverride` | BOOLEAN | false | Leave false — manual numbers break gaplessness |

Editable per series: prefix, padding, reset policy. **Not** editable: the next
sequence, once the series has issued a number — lowering it would duplicate
document numbers. Changing a prefix takes effect on the next document only;
issued numbers never change.

## Section: Fiscal Year

| Key | Type | Default | Notes |
|---|---|---|---|
| `fiscalYear.startMonthDay` | STRING | 07-01 | **Locks** once a fiscal year exists |
| `fiscalYear.namingPattern` | STRING | `FY{startYYYY}-{endYY}` | → FY2026-27 |
| `fiscalYear.codePattern` | STRING | `{startYY}{endYY}` | → 2627, used in voucher numbers |
| `fiscalYear.periodLength` | ENUM | MONTHLY | MONTHLY or QUARTERLY |
| `fiscalYear.autoCreatePeriods` | BOOLEAN | true | Generate periods when a year is created |
| `fiscalYear.autoSoftCloseDays` | INT | 5 | Days after month end before the period soft-closes |
| `fiscalYear.allowBackdatedDays` | INT | 30 | 0 = today only; ignored for ADMIN |
| `fiscalYear.allowPriorYearPosting` | BOOLEAN | false | ADMIN only when true, always audit-logged |

Changing period length or patterns affects **future** fiscal years only. Existing
years keep the structure they were created with.

## Screens

| Route | Contents |
|---|---|
| `/admin/settings` | Section tabs, search across keys, "changed recently" list |
| `/admin/settings/company` | Company identity, locale, locked fields with their reason |
| `/admin/settings/tax` | Switches, plus the effective-dated tax code table with history |
| `/admin/settings/numbering` | Series table with live preview of the next number |
| `/admin/settings/fiscal-year` | Patterns and policy, plus the list of years and their status |

Every section shows a change-history panel: key, old, new, who, when.

## Files

| Piece | Location |
|---|---|
| Read/resolve (incl. as-of-date) | `src/server/services/settings-service.ts` |
| Typed accessors | `src/server/settings/keys.ts` |
| Validation per key | `src/lib/validation/settings.ts` |
| Admin UI | `src/features/admin/settings/` |
| Seed defaults | `prisma/seed/settings.ts` |

Code reads settings through typed accessors (`getSetting('tax.vatEnabled')`),
never by passing raw strings around, so a renamed key fails at compile time.
