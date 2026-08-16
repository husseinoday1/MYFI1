// MYFI_R04_U2_DOMAIN_CONTRACT_V1
// Pre-Phase-6 contract freeze. This module defines financial meaning only.
// It does not activate SQLite-first writes or perform operational cutover.

export const FINANCIAL_DOMAIN_CONTRACT_VERSION = 'R04-U2-2';

export const FINANCIAL_DOMAIN_CONTRACT = Object.freeze({
  scopes: Object.freeze({
    allowed: Object.freeze(['personal', 'business']),
    allIsReadAggregationOnly: true,
    transactionScopeRequired: true,
    accountScopeRequired: true,
    crossScopeTransfer: 'explicit_from_scope_and_to_scope_only',
  }),

  debt: Object.freeze({
    dueDateMeaning: 'obligation_metadata_not_transaction_date',
    principalAffectsPnl: false,
    receivablePrincipalAffectsPnl: false,
    interestPolicy: 'explicit_component_required_before_support',
    feePolicy: 'explicit_component_required_before_support',
    currentReleaseComponents: Object.freeze(['principal']),
  }),

  trackerDeletion: Object.freeze({
    policy: 'metadata_only_preserve_financial_history',
    financialTransactionsAreImmutableHistory: true,
  }),

  historicalReporting: Object.freeze({
    basis: 'frozen_transaction_base_amount_and_historical_fx',
    currentWalletValuationMayRewriteHistory: false,
    asOfBoundary: 'date_iso_inclusive',
  }),

  commitmentMatching: Object.freeze({
    policy: 'explicit_link_id_only',
    titleOrNameHeuristicsAllowed: false,
  }),

  budgets: Object.freeze({
    denomination: 'ledger_base_currency',
    historicalSpendBasis: 'transaction_base_amount',
    walletNativeAmountMayBeSummedIntoBudget: false,
  }),

  currencyLayers: Object.freeze({
    entityCurrency: 'economic_obligation_or_purchase_currency',
    walletCurrency: 'cash_account_currency',
    baseCurrency: 'ledger_reporting_currency',
    layersMustRemainDistinct: true,
    foreignHistoricalFxRequiresFrozenPositiveRate: true,
    missingHistoricalFxPolicy: 'UNRESOLVED_FX',
    fallbackRateOneForForeignHistoryAllowed: false,
  }),

  transferFees: Object.freeze({
    currentReleaseCurrency: 'source_wallet_currency',
    thirdCurrencyFeePolicy: 'explicitly_unsupported_until_modeled',
    feeAffectsPnlExactlyOnce: true,
  }),

  valuation: Object.freeze({
    purpose: 'current_wallet_estimate_only',
    historicalReportingMayUseCurrentValuation: false,
    freshnessMustBeLabeled: true,
  }),

  reversals: Object.freeze({
    policy: 'explicit_reference_required',
    silent_sign_flipIsReversal: false,
    currentRelease: 'not_supported_as_distinct_flow_until_command_model_exists',
  }),

  categories: Object.freeze({
    transactionCategoryIdIsHistoricalSnapshot: true,
    archiveOrDeleteMayRemapHistoricalTransactions: false,
  }),

  featureToggles: Object.freeze({
    purpose: 'ui_and_entry_visibility_only',
    mayHideFinancialTruthFromTotalsOrHistory: false,
  }),

  backupRestore: Object.freeze({
    unknownWalletReference: 'blocking_review',
    silentDefaultWalletRepairAllowed: false,
  }),

  accountLifecycle: Object.freeze({
    cloudSessionDefinesLocalLedgerExistence: false,
    logoutDeletesOrSwitchesLedger: false,
    sameAccountReloginReusesMountedLedger: true,
    accountSwitchRequiresIsolation: true,
  }),
});

// Explicitly tracked implementation gaps after P04U2-002.
// FX fallback and feature-toggle financial-truth enforcement are now closed.
export const R04_U2_OPEN_ENFORCEMENT_GAPS = Object.freeze([
  'debt_interest_fee_components_not_enforced',
  'explicit_refund_reversal_command_not_implemented',
]);

export const isFinancialScope = value => (
  value === 'personal' || value === 'business'
);

export const requiresFrozenHistoricalFx = ({
  nativeCurrency,
  baseCurrency,
} = {}) => (
  String(nativeCurrency || '').toUpperCase()
  !== String(baseCurrency || '').toUpperCase()
);
