# Home: always-visible wallet strip (2026-08-27)

Follow-up to the Home visual pass in `MYFI_VISUAL_UNIFICATION_HOME_2026-08-27.md`
after the user reported Home still didn't match `REF-01-home.jpeg` — correctly.
That earlier pass only fixed the hero card's color; it did not catch this
structural gap.

## What was actually wrong

REF-01 shows the wallet strip (3 cards, horizontally scrollable, pagination
dots, "عرض الكل"/"View all" link) as a **permanently visible section**
directly under the hero card. The running app instead only shows it inside a
**modal popup**, and only after the user explicitly taps "Show details" in
the hero's small wallet-summary row — by default it is not on the page at
all. Confirmed by reading the existing gate:

```js
const showWalletStrip = isHomeSectionVisible('wallets') && modules.wallets
  && walletRows.length > 0 && (!isHomeSectionVisible('hero') || showWalletDetails);
```

`showWalletDetails` defaults to `false`, so with the hero visible (the normal
case), the strip never renders unless toggled — a real, visible structural
difference from the reference, not just a color mismatch.

## What changed

`src/screens/HomeScreen.js` — added a new, separate, always-visible
`renderWalletStrip()` section, inserted right after the hero (matching
REF-01's ordering: hero → wallet strip → month summary). It reads
`walletRows`, already computed above for the hero's own wallet-summary count
— no new balance calculation. Each card shows: wallet name, an icon (star
for the default wallet, plain wallet icon otherwise — the app has no
per-wallet custom icon field, confirmed by grep, so this reuses the existing
default/non-default distinction from `WalletBalanceCard.js` rather than
inventing one), the formatted available balance (respecting the existing
`homeBalancesHidden` privacy toggle — shows `••••••` when balances are
hidden, exactly like the hero amount does), and a currency-name subtitle
(looked up from the existing `CURRENCIES` list, matching REF-01's "دينار
عراقي" line). Pagination dots render only when there is more than one page.
"عرض الكل" / "View all" navigates to the existing Wallets screen via
`onOpenTab('wallets')` — no new navigation wiring needed.

**The existing modal-based "choose default wallet" feature
(`renderWalletPanel`, still triggered from the hero's own wallet-summary
row) was left completely untouched** — it is a different, legitimate feature
(selecting the default wallet), not a duplicate of the new strip, and both
now coexist on the page.

## Financial impact

NONE — reads `walletRows` and `defaultWalletId`, both already computed
elsewhere on this screen for the existing hero total. No new balance
calculation, no new write.

## Live verification (Expo web)

Fresh account defaults to `modules.wallets = false` for a personal profile
(multi-wallet is a business-profile feature, confirmed in `src/lib/modules.js`
— pre-existing, unrelated to this change), so the strip correctly does not
render there — matches the pre-existing gate's own condition, not a bug.
Switched account type to Business in Settings → Financial setup to get
`modules.wallets = true` and confirmed:

```
Wallets
View all
Main wallet
0 USD
US dollar
```

— title, link, wallet name, formatted balance, and currency-name subtitle
all present and in the right order. Browser console showed only the
pre-existing, already-documented `loadLocal TypeError` (confirmed unrelated
in an earlier evidence file via `git stash`) — no new errors.

## Known remaining gap, not fixed here (flagging, not hiding)

The hero's top-right icon is still the existing hide-balance eye toggle;
REF-01 shows a wallet-shortcut icon in that exact slot instead. Left as-is
because the eye toggle is a real, working privacy feature, and swapping it
out is a product call (remove it? relocate it? show both?) rather than a
pure color-match fix. Flagging for an explicit decision rather than silently
picking one.

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** —
  documented baseline.
- `npm run verify:android`: clean.

## Status

Not pushed — held for explicit user push approval per the standing git
safety rule.
