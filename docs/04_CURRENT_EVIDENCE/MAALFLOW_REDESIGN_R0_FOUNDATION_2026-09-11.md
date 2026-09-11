# MaalFlow redesign — R0 foundation (2026-09-11)

Source of truth: the owner-approved design board `MaalFlow-Design-Board/`
(`status.js` all `ok`, 2026-09-11) and its handoff package. This step implements
section 0 of the handoff (glossary rules: navigation shell) plus the shared
visual foundation every later screen needs. Tier: UI-only, no financial logic,
no schema, no sync — light rigor per the tiered-rigor rule.

Branch: `impl/maalflow-redesign-2026-09-11`, cut from `64534b6` in a separate
worktree (`C:\Users\husse\MaalFlow-Redesign`) because the shared checkout holds
another session's uncommitted Phase 15 timing work that this step must not touch.

## Build order decided for the whole redesign

After R0, screens follow the owner's handoff order (planning → home → add
transaction → long-press → follow-ups → more-screens → transactions →
categories → tools → wallets → states → onboarding; debt-v3 folded into
follow-ups). The foundation had to come first because every screen consumes the
palette, the text primitive, the icons and the four-tab shell. Planning's three
money-affecting decisions (period starts on payday, carry-over, unified plan
storage) get a financial-impact review before any code, as the board requires.

## What changed

| Area | Change |
|---|---|
| Colors | `src/ui/palette.js` holds the board values verbatim (colors.html + mf.css `.screen.dark`). `src/lib/theme.js` keeps every legacy `th.*` key but resolves each from the palette, so un-rebuilt screens already show the approved colors. Brand `#0A5C4C` and income `#2E7D32` are now separate roles (they were one literal). |
| Font | IBM Plex Sans Arabic 400/500/600/700 bundled (`assets/fonts`, OFL text included). `src/ui/typography.js` registers each weight as its own family and maps (font id, weight) → nearest bundled face. The six tools.html fonts are listed by their Google Fonts names; only Plex is registered and selectable until the others are wired in the tools.html step (Cairo's file is already in assets). Global font-size multiplier is clamped 0.9–1.4. |
| Text | `src/ui/Txt.js`: one primitive applying font face, weight, size multiplier and palette role colors; never truncates. |
| Icons | `src/ui/Icon.js` draws Tabler outline icons with react-native-svg from a generated 125-icon subset (`tools/generate-ui-icons.cjs`, list in `tools/ui-icons.txt`). |
| Context | `src/ui/UIContext.js` provides theme/lang/font/scale once at the root. |
| Shell | `src/ui/shell/navigation.js` (pure): roots Home · Follow-ups · Transactions · Planning, a screen stack, system back (sub-screen → opener, non-Home root → Home, Home → OS), legacy key aliases, start-tab normalization. `TabBar`, `Fab`, `HomeTopBar`, `AppDrawer` render it. App.js now keeps a stack instead of `tab` + `lastHubTab`, and handles Android back for the first time (before, back left the app from every screen except Archive). |
| Config | `normalizeCfg` start-tab migration moved to the new roots; the test asserts it agrees with the shell for every known value. |

## Interim state (deliberate, removed as each screen is rebuilt)

- Tab content: Follow-ups → `FollowUpsHubScreen`, Transactions → `HistoryScreen`,
  Planning → `MyMoneyScreen` (its gateways are the planning destinations).
  `MoreScreen` is no longer mounted; its destinations are in the drawer.
- Home is still the legacy screen; its top row is replaced by `HomeTopBar` and it
  renders the drawer (new `drawer` prop). Both live inside Home on purpose: the
  bell keeps Home's own notification center (smart-capture review count and
  Review action) and the drawer header opens the account center, which holds
  manual sync and the only vault-unreadable recovery UI (see review fixes).
- The share icon is not drawn yet: the share center does not exist, and the
  glossary forbids icons without a decided function.
- Drawer omits Follow-up types, Recently deleted and Subscription until those
  screens exist, for the same reason. The drawer header opens the account center
  until Account info (more-screens ١٧) is built.
- The + button keeps its classic-entry-mode gate, because legacy Home in quick
  mode still draws its own add buttons. It is now Home-only; the per-tab tracker
  FAB was removed (glossary: + means new transaction only).
- Legacy sub-screens keep the shell's "Back" row until they get the sub-screen
  bar (arrow + title).

## Rejected alternatives

- **Tabler webfont / `@tabler/icons-react-native`**: ships ~5000 glyphs or a
  second copy of the node data; react-native-svg is already a dependency.
- **Mapping board icons to Ionicons**: loses the approved stroke style.
- **Registering Plex via the expo-font config plugin (native XML families)**:
  needs a native rebuild and does not work in Expo Go/dev; per-weight runtime
  families work everywhere.
- **Keeping `fontWeight` in `font()`**: Android synthesizes bold over a bold face
  and iOS falls back to the system font for single-face custom families.
- **Each `<Txt>` subscribing to the store**: Phase 15 traced JS-thread stalls to
  broad store subscriptions; a context read adds no listeners.
- **Drawing drawer items for unbuilt screens and routing them to near
  equivalents**: would mislead; items arrive with their screens.

## Pre-push /code-review fixes (same day)

The first review of 38199c6 found four issues; all fixed before any push:

1. Replacing Home's top row had cut the only path to the account center, whose
   `vault_unreadable` block (Retry read / Start fresh) exists nowhere else. The
   drawer header now opens that center. Verified on web, where storage is
   unreadable and the recovery actions render.
2. The bell had moved to App's notification center, dropping the pending
   smart-capture review count and Review button. The bar now uses Home's own
   center and badge (unread + pending reviews).
3. Reports/Basira → filtered transactions used to replace the stack with the
   Transactions root, so back skipped the report. It is now a
   `transactionsContext` sub-screen with its own keyed HistoryScreen, so filters
   never leak into the unfiltered root. Tested.
4. Cairo was registered and loaded before the splash lifts although nothing
   selects it; it is unregistered until the font picker exists.

## Observations recorded, not changed here

1. React 19's JSX runtime ignores `defaultProps` on function components, so
   `applyGlobalFont()` is very likely a no-op: legacy `<Text>` without an explicit
   family renders in the system font. Rebuilt screens use `<Txt>` and are not
   affected.
2. The board defines no dark Pro color; dark `pro` keeps the light value and
   `proTint` falls back to the embedded surface until one is drawn. Dark `scrim`
   keeps the app's existing overlay value.
3. `I18nManager.allowRTL(true)` together with explicit `row-reverse` for Arabic
   could double-mirror on a device whose system locale is RTL. Not reproduced;
   the existing convention is kept.
4. Web preview with fresh storage logs `[STORE] loadLocal … reading 'trans'`.
   No store code changed in this step.
5. Pre-existing gate failure, unchanged by this step:
   `p20_v2_conflict_recovery_resume` ("shared conflict-recovery rehydration
   helper is missing").

## Verification

- `tests/run-redesign-foundation.cjs` (new, in the gate): navigation stack and
  back rules exercised repeatedly (back pressed four times in sequence, Home
  exit twice), legacy aliases, start-tab agreement with `normalizeCfg`, font
  face resolution for weights 100–900 against the registered families, all six
  font options, font-scale clamping, every legacy theme key defined in both
  modes, approved semantic hex values.
- Mutation tests: (a) back from a non-Home root made to exit the app; (b) the
  duplicate-push guard removed. Both failed the test; file restored byte-identical.
- Updated static contracts that encoded the retired navigation/palette
  (`ui-contract`, `settings-navigation-v47`, `real-state-consolidated-v5`,
  `r04-blocking-ux-acceptance`) to the approved rules.
- `npm run test:gate`: baseline 194 passed / 1 failed / 11 skipped; after this
  step 195 / 1 / 11 (the one failure is item 5 above).
- Web preview (Expo web, react-native-web): tab bar, drawer, sub-screen push and
  back row, Planning root, English and Arabic. Arabic mirrors correctly (tabs
  start at the right, avatar right, drawer from the right). The computed tab
  label family is `MF-IBMPlexSansArabic-600` with all four Plex faces loaded.
  Device verification is still required: native back handling cannot be checked
  on web.
