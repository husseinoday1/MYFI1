# MYFI — Release Gate Status

التاريخ: 2026-08-15  
Baseline Git: `b438a9e2413a946b7791a7dd76cab36345a57ba5`  
Baseline branch: `codex/financial-core-cutover`  
App: `1.0.0` / Expo `~54.0.36` / React Native `0.81.5` / expo-sqlite `~16.0.10`

هذه الوثيقة هي سجل evidence دائم. لا تعني كلمة `passed` إلا نجاح الدليل المذكور في نفس السطر.

| Claim ID | Description | Evidence | Status | Test type | Environment | Device | App version | DB schema | Dataset | Result | Failure reason | Decision | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P00-GOV-001 | عقود Phase 0 موجودة ومترابطة | `tests/phase00-governance.test.cjs` | passed | static contract | Node | n/a | 1.0.0 | V7 target | source tree | كل مستندات Phase 0 موجودة | — | Phase 0 documentation gate قابل للإغلاق بعد review | 2026-08-15 |
| P01-AND-001 | Android source manifest يمنع OS backup | `android/app/src/main/AndroidManifest.xml` + `tests/android-native-baseline.test.cjs` | passed | static contract | source | n/a | 1.0.0 | V7 | source tree | `allowBackup=false` | merged release manifest غير مفحوص بعد | يبقى artifact verification مطلوباً | 2026-08-15 |
| P01-AND-002 | Native orientation لا يفرض Portrait ضد إعداد التطبيق | app.json + native manifest + orientation module | passed | static contract | source | n/a | 1.0.0 | V7 | source tree | لا يوجد manifest portrait lock | real device behavior pending | يتحقق في جلسة R01 على الجهاز | 2026-08-15 |
| P01-SQL-001 | V7 native harness يغطي SQLite operational proof | `src/dev/financialLedgerV7DeviceHarness.js` | already-built | native harness | Android required | pending | 1.0.0 | V7 | disposable namespace | harness معزول عن بيانات المستخدم | لم ينفذ على الجهاز ضمن R01 بعد | blocked حتى device evidence | 2026-08-15 |
| P01-SQL-002 | WAL/FK/busy timeout/quick_check/migration journal تُفحص على الجهاز | device harness | needs-audit | native runtime | Android required | pending | 1.0.0 | V7 | disposable namespace | checks implemented | لا يوجد device log بعد | تنفيذ مرة واحدة في نهاية R01 | 2026-08-15 |
| P01-SIGN-001 | Production signing ليس debug signing | `android/app/build.gradle` | blocked | source audit | Android Gradle | n/a | 1.0.0 | n/a | source tree | release ما زال يشير إلى debug signing | production credential path غير مثبت | لا ادعاء Release Ready؛ يؤجل gate النهائي | 2026-08-15 |
| P02-MIG-001 | يوجد migration journal reusable | `src/lib/financialLedgerSchemaMigrations.js` | passed | static + SQLite runtime | Node SQLite | n/a | 1.0.0 | V7 | in-memory DB | journal/checksum/status/version contract موجود | native interruption pending | صالح كأساس V8/V9 | 2026-08-15 |
| P02-MIG-002 | migration failure يمنع financial write path | `ensureFinancialLedgerV7()` قبل commit + migration runner | passed | static contract | source | n/a | 1.0.0 | V7 | source tree | ensure throws قبل transaction المالية | device kill test pending | verify end-of-R01 | 2026-08-15 |
| P02-MIG-003 | baseline V7 migration لا تغيّر existing financial values | idempotent DDL + guarded column adoption | confirmed | design/code audit | source | n/a | 1.0.0 | V7 | existing V7 DB | لا UPDATE على transaction/posting amounts | real-device old DB upgrade pending | existing financial data impact = NONE | 2026-08-15 |

## R01 device exit gate

Phase 1 لا تصبح `passed` بالكامل إلا بعد: install/cold start/DB init، income/expense/transfer/fee/edit/void، reopen/balance verification، idempotency، rollback probe، WAL/FK/busy timeout/quick_check، migration journal، وعدم المساس ببيانات المستخدم لأن الـharness يستخدم namespace مؤقتاً.

## R01 automated evidence — 2026-08-15

- `npm run test:gate:static`: **31 PASS / 0 FAIL / 11 SKIPPED** (الـskips هي legacy/cloud/android/device gates المصنفة صراحة).
- `tests/financial-ledger-migration-runtime.test.cjs`: **PASS** — apply/replay/checksum/failure/recovery.
- `tests/financial-ledger-migration-infrastructure.test.cjs`: **PASS** — journal DDL + V7 idempotent adoption + existing `amount_minor` unchanged.
- `tests/financial-core-phase23-release-gate.cjs`: **PASS**.
- Full runtime gate في بيئة إعداد الحزمة لم يُعلن PASS لأن snapshot لا يحتوي `node_modules` والـoffline npm cache غير كامل. يجب تشغيله على محطة التطوير ضمن `TEST_RELEASE.ps1`.


## R01 real-device findings — 2026-08-15

EAS Preview APK was installed on a real Android device without clearing app data.

Observed PASS:
- app opened without crash/blank screen;
- existing wallets, history and balances remained present;
- income, expense and transfer changed balances as expected;
- edit/void behavior preserved balances in the tested cases;
- force-close/reopen preserved data;
- offline expense survived reopen;
- reconnect did not create a duplicate transaction;
- rotation behavior matched the selected MYFI setting.

Observed BLOCKERS / regressions carried into R02:
- a freshly committed transaction could update balances but intermittently disappear from History / become non-editable because an incomplete SQLite page replaced the UI fallback;
- goal saving / saving-backed commitment rows displayed zero native amount because `walletAmount=0` was rendered instead of `allocationWalletAmount`;
- guest merge relabelled imported guest-wallet currency to the current workspace currency;
- informational merge/conflict alerts could overlap and remove the user's decision window;
- automatic cloud sync had no bounded scheduled retry after a failed scheduled attempt.

Decision:
R01 is retained as an evidence checkpoint but Phase 1 is not declared fully passed. The above findings are release blockers for R02.

## R02 — Phase 3 Financial Safety + Phase 4 Invariant Foundation

| Claim ID | Description | Evidence | Status | Test type | Environment | Device | App version | DB schema | Dataset | Result | Failure reason | Decision | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R02-P03-BASE-001 | Base currency cannot change after financial history/opening value exists | `src/store/useStore.js` + `tests/financial-safety-r02.test.cjs` | passed | static contract | Node/source | n/a | 1.0.0 | V7 | source tree | central Store guard blocks currency relabel | device UX pending | verify once on R02 APK | 2026-08-15 |
| R02-P03-GUEST-001 | Guest→Account import preserves wallet currency | `src/store/slices/useSyncSlice.js` | passed | static contract | Node/source | n/a | 1.0.0 | V7 | source tree | original wallet currency preserved | full device merge pending | no financial reinterpretation allowed | 2026-08-15 |
| R02-P04-HIST-001 | Incomplete SQLite query cannot hide an already-visible transaction | `ledgerPageCoversFallback()` + History regression test | passed | static/runtime-pure helper | Node | n/a | 1.0.0 | V7 | synthetic IDs | incomplete page rejected | real-device confirmation pending | fallback remains visible until parity | 2026-08-15 |
| R02-P04-GOAL-001 | Goal saving history uses allocation wallet amount | `HistoryScreen.js` | passed | static contract | Node/source | n/a | 1.0.0 | V7 | source tree | saving amount no longer rendered as zero | device UI pending | verify with direct saving + commitment→goal payment | 2026-08-15 |
| R02-P04-SYNC-001 | Scheduled sync retries transient failure with bounded backoff | `useSyncSlice.js` | passed | static contract | Node/source | n/a | 1.0.0 | V7 | source tree | 0.7s/3s/10s/30s bounded schedule | network/device test pending | no infinite hot loop | 2026-08-15 |
| R02-P04-INV-001 | SQLite invariant proof derives balances from authoritative postings | `proveFinancialLedgerInvariantsV7()` | passed | source + native harness contract | Node/source | pending | 1.0.0 | V7 | disposable harness namespace | checks quick_check/FK/postings/transfers/revisions/FX/opening + SUM(postings) | native execution pending | required in R02 device gate | 2026-08-15 |

Architectural conflict retained for a dedicated controlled correction:
current V7 shadow-migration implementation can mark `source_mode='sqlite'` earlier than the Frozen Master Plan's Phase 8 cutover gate. R02 does not reverse that pointer blindly because the installed device may already contain V7-only writes. No destructive source-mode rollback is performed in this release.

## R02 real-device acceptance — 2026-08-15

EAS Preview APK was tested on a real Android device while signed in, including switching between two accounts.

Confirmed on device:
- income, expense, same/cross-wallet transfer, goal saving, commitment payment, edit/delete/reopen remained financially consistent;
- History showed newly written rows and saving/commitment amounts correctly;
- automatic sync resumed after reconnect without manual sync;
- base currency stayed fixed after financial history while foreign wallets remained usable;
- no crash, duplicate transaction, lost balance, or unexpected currency relabel was reported.

UX observations carried forward without blocking R02 financial acceptance:
- multi-currency transfer flow was fragmented and unclear;
- the user was not proactively taught the base-currency / foreign-wallet contract;
- account/security navigation, login keyboard avoidance, and date/year picker polish remain later UX work.

Decision: R02 financial safety acceptance = PASSED. Multi-currency correctness/UX remains an explicit Phase 4 gate and is addressed in R03 before Phase 5.

## R03 — Phase 4 Multi-Currency Completion

| Claim ID | Description | Evidence | Status | Test type | Environment | Device | App version | DB schema | Dataset | Result | Failure reason | Decision | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R03-P04-FX-001 | Foreign income/expense/tracker payments require a user-confirmed historical rate; current wallet valuation is suggestion-only | `AddTransModal.js` + `tests/multicurrency-r03.test.cjs` | passed | static + pure contract | Node/source | pending | 1.0.0 | V7 | source tree | silent rate autofill removed; explicit confirmation required | device UX pending | verify on R03 APK | 2026-08-15 |
| R03-P04-XFER-001 | Cross-currency transfer freezes source amount, destination amount, direct rate, fee, and historical reporting snapshot | `financialCoreV2.js` + `transactionsSlice.js` + `tests/multicurrency-r03.test.cjs` | passed | pure runtime + static contract | Node | pending | 1.0.0 | V7 | USD/IQD + USD/EUR fixtures | base↔foreign derived from actual legs; foreign↔foreign requires explicit base bridge rates | full workstation gate + device pending | no guessing allowed | 2026-08-15 |
| R03-P04-LEGACY-001 | Legacy foreign↔foreign transfer without historical base bridge is not silently revalued | `hydrateLegacyCurrencyFields()` + R03 test | passed | pure runtime | Node | n/a | 1.0.0 | V7/legacy compatibility | synthetic legacy transfer | marked `UNRESOLVED_FX`; current wallet valuation and rate=1 are not substituted | migration inventory still required before Phase 5 | unresolved legacy FX blocks promotion until resolved | 2026-08-15 |
| R03-P04-HIST-001 | History/details expose both transfer legs, frozen direct FX, and fee | `HistoryScreen.js` + `TransactionDetailsModal.js` | passed | static contract | Node/source | pending | 1.0.0 | V7 | source tree | transfer no longer displayed as a single base-currency amount | device visual acceptance pending | verify once on R03 APK | 2026-08-15 |
| R03-P04-EDU-001 | Onboarding/settings/wallet creation explain base currency vs foreign wallets | `OnboardingScreen.js` + settings screens | passed | static contract | Node/source | pending | 1.0.0 | n/a | source tree | user education present before/at multi-currency use | device visual acceptance pending | no hidden currency rule | 2026-08-15 |

## R03 combined release — Phase 4 completion + Phase 5 migration readiness

Release baseline: `dbe0213fbe75cd81742115f7edacbeec63fd1ed5` on `phase-04-multicurrency-r03`.

Real-device reproduction that reopened the Phase 4 gate:
- a clean Guest workspace was switched to IRR before financial history;
- debts/goals/commitments were created and paid;
- the UI could show IRR while payment semantics still used the old IQD wallet/base assumption;
- after signing into an IQD account and merging Guest data, tracker numeric values could be reinterpreted under IQD.

This is treated as a financial semantic blocker, not a cosmetic symbol issue. Country remains a preference and does not alter base currency after financial history.

| Claim ID | Description | Evidence | Status | Test type | Environment | Device | App version | DB schema | Dataset | Result | Failure reason | Decision | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R03-P04-ENTITY-001 | Debt/goal/commitment own immutable original `currencyCode` | entity normalizers + tracker/management slices + `tests/entity-currency-r03.test.cjs` | passed | static + pure runtime | Node/source | pending | 1.0.0 | V7 | IRR/IQD/USD fixtures | entity amount remains in original currency; reporting value is separate | device acceptance pending | required before Phase 4 exit | 2026-08-15 |
| R03-P04-PAY-001 | Tracker payment converts entity currency → historical base → payment-wallet currency without reinterpretation | `buildEntityCurrencyFields()` + payment/edit paths | passed | pure runtime + static | Node/source | pending | 1.0.0 | V7 | IRR debt paid from IQD; third-currency wallet rejection | missing required historical rate blocks instead of guessing | device acceptance pending | no rate=1/current valuation fallback | 2026-08-15 |
| R03-P04-GUEST-002 | Guest IRR → Account IQD merge preserves wallet/entity/transaction currency meaning | `useSyncSlice.js` + currency-aware dedupe keys | passed | static regression | Node/source | pending | 1.0.0 | V7 | cross-base Guest/account scenario | same technical wallet ID with different currency is remapped, not collapsed; account cfg remains authoritative | device acceptance pending | original amounts/FX are not relabelled | 2026-08-15 |
| R03-P04-EDIT-001 | Editing linked debt/goal payments keeps `amt` as reporting/base value and entity amount separately | `transactionsSlice.js` + entity contract | passed | static regression | Node/source | pending | 1.0.0 | V7 | linked payment edit | no base/entity overwrite | full workstation gate pending | required for edit/void parity | 2026-08-15 |
| R03-P05-SHADOW-001 | Shadow migration proves parity in staging but does not promote operational source | `financialLedgerV7Migration.js` + `tests/shadow-migration-phase5.test.cjs` | passed | static contract | Node/source | n/a | 1.0.0 | V7 | source/stage contract | success records `Migration Ready`, `source_mode=shadow`, `cutover=false`; stage discarded | native/workstation evidence pending | Phase 5 only; Phase 8 cutover remains forbidden | 2026-08-15 |
| R03-P05-FX-001 | `UNRESOLVED_FX` blocks migration readiness | migration gate + Phase 5 contract | passed | static contract | Node/source | n/a | 1.0.0 | V7 | foreign legacy FX | no promotion/readiness when historical FX is unresolved | runtime/full gate pending | source remains unchanged | 2026-08-15 |

R03 combined package-preparation evidence:
- `tests/multicurrency-r03.test.cjs`: **PASS**.
- `tests/entity-currency-r03.test.cjs`: **PASS**.
- `tests/shadow-migration-phase5.test.cjs`: **PASS**.
- full JS/JSX parse: **PASS**.
- static quality gate: **35 PASS / 0 FAIL / 11 SKIPPED**.
- `git diff --check`: **PASS**.
- Full runtime gate and Android export are intentionally executed by the one-click installer on the development workstation using the installed project dependencies.
- One real-device acceptance session is required after the combined automated gate; no intermediate phone test is required.

Financial-data impact of applying this source package: **no existing financial rows are intentionally rewritten by the installer**. No schema DDL/version change is introduced. On app execution, Phase 5 staging is disposable and readiness metadata must not perform operational cutover. Already-existing `source_mode=sqlite` installations are not destructively downgraded.
