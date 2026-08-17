# MYFI Multi-Currency Financial Policy & Reporting Engine Addendum

**Status:** ACTIVE — approved 2026-08-17  
**Authority type:** Canonical financial-policy addendum  
**Amends:** Multi-currency interpretation of the frozen MYFI master plan without rewriting the frozen plan  
**Implementation impact of this documentation package:** NONE

## 1. Core Policy

MYFI MUST preserve the original currency truth of every financial event while using one Base/Home Currency for aggregated reporting.

A multi-currency transaction has two distinct financial truths:

1. **Historical transaction truth** — original/native amount, currency, and frozen historical conversion.
2. **Current valuation truth** — what a currently held foreign-currency balance is worth now.

These truths MUST NOT overwrite each other.

## 2. Required Financial Rules

1. **Native amount is preserved.** Every transaction keeps its original amount and currency.
2. **Historical FX is frozen per transaction.** Later current-rate changes MUST NOT rewrite it.
3. **Aggregated income and expense use historical Base Currency value.** Period income, expense, cashflow net, budgets, category totals, and historical reporting use each transaction's frozen historical Base Currency amount.
4. **Current wallet valuation is separate.** Current foreign-wallet value uses the current valuation rate and MUST NOT change historical income, expense, or net.
5. **Transfers are not income or expense.** Transfer principal has zero income/expense/net impact. Explicit transfer fees are expenses. FX conversion impact is separate.
6. **FX impact is a separate metric.** Currency valuation/conversion effects MUST remain distinguishable from operating cashflow.
7. **Budgets use historical transaction value.** Today's FX rate MUST NOT change a past budget result.
8. **Debts and goals retain their native currency.** A Base/Display equivalent may be shown separately.
9. **Central currency-rate registry is the future current-rate source.** Saving a transaction freezes the reviewed historical snapshot. MYFI MUST NOT invent a missing historical FX rate.
10. **Base/Home Currency is protected.** Once multi-currency financial history exists, Base/Home Currency MUST NOT be changed as an ordinary setting; a future change requires explicit migration with backup, preview, verification, and recovery.
11. **Display Currency is presentation only.** It may change how totals are shown without changing stored historical truth or Base Currency accounting.
12. **Recurring entries receive a rate per occurrence.** Each generated occurrence gets its own reviewed historical rate when saved.
13. **Historical wealth charts require historical FX context.** Past wealth MUST NOT be recalculated using today's FX rate.

## 3. Canonical Calculation Rules

```text
Historical Income  = SUM(frozen historical base value of income transactions)
Historical Expense = SUM(abs(frozen historical base value of expense transactions))
Cashflow Net       = Historical Income - Historical Expense

Transfer impact on Income/Expense/Net = 0
Transfer fee impact                    = expense only

Current Wallet Value = current native balance × current valuation rate
FX Impact            = separate metric; never silently merged into ordinary cashflow
```

## 4. Non-Negotiable Invariant

> Changing today's USD/IQD rate from 1320 to 1500 may change current foreign-wallet valuation, but MUST NOT change any previously saved historical income, expense, cashflow net, budget consumption, or frozen transaction value.

## 5. Implementation Gate

Before any phase changes multi-currency reporting or valuation behavior, acceptance tests MUST prove:

- currencies are never directly summed without a common reporting basis;
- historical financial totals are stable after current-rate changes;
- transfer principal does not inflate income/expense;
- transaction historical FX remains editable before save and frozen after save;
- missing historical FX is never substituted with an invented or current wallet rate;
- Arabic/English presentation follows each locale's direction and symbols without changing financial semantics.

## 6. Data Safety

This addendum by itself changes no financial data, SQLite schema, migrations, SecureStore data, or existing-user history.
