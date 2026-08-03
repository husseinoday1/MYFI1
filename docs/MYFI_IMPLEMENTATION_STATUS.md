# MYFI — Implementation status

## Product structure

- Home: total balance, month income/expense/net, upcoming commitments, quick actions, recent transactions, and one prioritized financial signal.
- Transactions: income, expenses, transfers, search, type/category/date filters, edit, delete, duplicate, receipt capture, and voice capture.
- Planning: category budgets, saving goals, owed/receivable debts, recurring commitments, due dates, deferral, and linked payments.
- Reports: monthly summary, month comparison, spending distribution, cash flow, forecast, unusual spending detection, budgets, and financial coach.
- Settings: account and optional sync, currencies, wallets, categories, appearance, language, alerts, module visibility, JSON backup/restore, CSV/PDF export, and security.

## Data integrity

- The transaction ledger is the source of wallet balances and reports.
- Transfers move value between wallets without counting as income or expense.
- Debt, goal, and commitment payments create linked ledger entries.
- Editing or deleting a linked entry updates its source entity.
- Local data is saved before optional cloud synchronization.
- Every save writes a recovery snapshot before replacing the primary snapshot.
- Cloud restore compares local, cloud, and last-sync timestamps so a newer local version is not silently overwritten.

## Quality gates

- Financial-core assertions cover wallet transfers, total balance invariance, category budgets, monthly coach totals, and budget suggestions.
- Android Metro export is the required compilation check.
- Arabic/English and light/dark modes are supported by the shared layout, typography, theme, and component systems.
- EAS profiles are defined for an internal APK and a production AAB.

## Intentionally out of scope

The product blueprint explicitly excludes bank connections, live exchange rates, investments, social networking, advertising, and full inventory/tax invoicing. These are not release blockers.
