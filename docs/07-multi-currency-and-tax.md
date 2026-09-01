# Multi-Currency & Tax

## Currencies

| Term | Meaning |
|---|---|
| Base (functional) currency | The currency the books are kept and reported in. One per company, set once, never changed after the first posting. Default **BDT**. |
| Transaction currency | The currency the document is actually denominated in — usually the university's currency (USD, GBP, AUD, CAD, EUR). |

Every money-bearing row stores all four: `amount`, `currency`, `fxRate`, `baseAmount`,
where `baseAmount = amount * fxRate`. The GL is posted in base currency only.

```
Model  Currency   { code, name, symbol, decimals, isBase, isActive }
Model  ExchangeRate { fromCurrency, toCurrency, rateDate, rate, source }
```

Rate lookup is always "the rate effective on the document date" — the latest
`ExchangeRate` row on or before `entryDate`. Rates are never overwritten
retroactively; a correction is a new row for that date.

## Realised vs unrealised FX

**Realised** — arises on settlement. A commission accrued at 110 BDT/USD and
received at 115 BDT/USD produces a realised gain on the difference.

```
Accrued:  1130 Dr 165,000 (1,500 USD @ 110)   4010 Cr 165,000
Received: 1020 Dr 172,500 (1,500 USD @ 115)
          1120 Cr 165,000
          7100 Cr   7,500   <- realised FX gain
```

**Unrealised** — arises at period end on open foreign-currency balances that are
still outstanding. Revalue AR/AP at the closing rate, post the difference to 7110,
and **reverse the revaluation on the first day of the next period** so the
underlying balance is not permanently restated.

Rules:
1. Realised FX (7100) and unrealised FX (7110) never share an account.
2. Revaluation runs only on monetary items — receivables, payables, bank balances
   in foreign currency. Never on income already recognised.
3. The FX rate used on every posting is stored on the voucher and is auditable.

## Tax

Three tax mechanisms, all data-driven through a `TaxCode` table — never hardcoded.
Rates are client-configurable in the admin UI: the VAT rate comes from settings,
and withholding rates are set per country and per university.

```
Model TaxCode { code, name, kind, rate, glAccountCode, isActive }
kind: OUTPUT_VAT | INPUT_VAT | WITHHOLDING_RECEIVABLE | WITHHOLDING_PAYABLE
```

### 1. VAT / GST on student services

If the agency's services are VAT-registered, an invoice line carries a tax code.

```
Invoice 10,000 + 15% VAT:
  1110 AR – Students      Dr 11,500
  4020 Service Fee Income Cr 10,000
  2310 VAT Payable        Cr  1,500
```

### 2. Withholding suffered on commission receipts (AIT)

Universities or remitting banks may deduct tax at source. The gross receivable is
settled in full; the deducted portion becomes a tax asset claimable against income tax.

```
Commission 1,500 USD, 10% deducted:
  1020 Bank                       Dr 1,350
  1310 Withholding Tax Receivable Dr   150
  1120 AR – Universities          Cr 1,500
```

Never reduce commission income by the withheld amount — it is tax paid, not lost revenue.

### 3. Withholding deducted from vendors and agents (TDS)

When the agency pays a sub-agent or vendor and must deduct tax on the government's behalf:

```
Agent commission 10,000, 10% deducted:
  2020 AP – Counselors & Agents Dr 10,000
  1020 Bank                     Cr  9,000
  2320 Withholding Tax Payable  Cr  1,000
```

2320 is a liability until remitted to the authority.

## Reports required

| Report | Contents |
|---|---|
| VAT summary | Output VAT (2310) less input VAT (1320) for the period |
| Withholding suffered | 1310 movements by university, with certificate references |
| Withholding deducted | 2320 movements by payee, for statutory filing |
| FX gain/loss | 7100 and 7110 separately, by currency |
| Currency exposure | Open foreign-currency AR/AP by currency at the closing rate |

## Confirmed

Universities **do** deduct tax at source, so mechanism 2 is active and every
commission receipt screen must capture the withheld amount. Remaining unknowns
(default rates per country) are tracked in [11-decisions.md](11-decisions.md).
