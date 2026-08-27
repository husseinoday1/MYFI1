import { buildFinancialLedgerCommand, FINANCIAL_LEDGER_SCHEMA_VERSION } from './financialLedgerV7Model';
import {
  canonicalFinancialEntityPayload,
  discardFinancialWorkspaceStageV7,
  financialLedgerV7Supported,
  getFinancialWorkspaceStateV7,
  promoteFinancialWorkspaceStageV7,
  proveFinancialLedgerInvariantsV7,
  readFinancialProjectionV7,
  setFinancialWorkspaceStateV7,
  stageFinancialWorkspaceV7,
} from './financialLedgerV7Repository';
import {
  buildCurrencyFields,
  hydrateLegacyCurrencyFields,
  moneyFromMinor,
  moneyToMinor,
  normalizeCurrencyCode,
} from './financialCoreV2';
import { currencyFractionDigits } from './money';
import { getDefaultWalletId, getWalletAvailableBalances, normalizeWallets } from './wallets';

const sortObject = value => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = sortObject(value[key]);
    return result;
  }, {});
};

export const stableFinancialJson = value => JSON.stringify(sortObject(value));

export const financialProjectionChecksum = value => {
  const input = stableFinancialJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${input.length}`;
};

const nativeMovement = (transaction, walletId) => {
  if (transaction?.kind === 'transfer') {
    if (transaction.fromWalletId === walletId) {
      return -Math.abs(Number(transaction.transferFromAmount ?? transaction.transferAmount ?? 0))
        - Math.abs(Number(transaction.feeAmount || 0));
    }
    if (transaction.toWalletId === walletId) {
      return Math.abs(Number(transaction.transferToAmount ?? transaction.transferAmount ?? 0));
    }
    return 0;
  }
  if (transaction?.walletId !== walletId) return 0;
  return Number(transaction.walletAmount ?? transaction.amt ?? 0) || 0;
};

const archiveRows = archives => (Array.isArray(archives) ? archives : []).flatMap(archive => {
  const year = Number(archive?.year || archive?.summary?.year);
  const archivedAt = archive?.summary?.archivedAt || new Date(`${year || 1970}-12-31T23:59:59.000Z`).toISOString();
  return (Array.isArray(archive?.data?.trans) ? archive.data.trans : []).map(transaction => ({
    ...transaction,
    archiveYear: Number.isInteger(year) ? year : Number(String(transaction?.dateISO || '').slice(0, 4)) || null,
    archivedAt,
  }));
});

const collectWallets = (workspace, archives, baseCurrency) => {
  const merged = new Map();
  for (const wallet of normalizeWallets(workspace?.wallets, baseCurrency)) merged.set(String(wallet.id), wallet);
  for (const archive of Array.isArray(archives) ? archives : []) {
    for (const wallet of normalizeWallets(archive?.data?.wallets || [], baseCurrency)) {
      if (!merged.has(String(wallet.id))) merged.set(String(wallet.id), { ...wallet, status: 'archived' });
    }
  }
  return [...merged.values()];
};

const normalizeMigratedTransaction = ({ transaction, wallets, baseCurrency, defaultWalletId }) => {
  const raw = transaction?.kind === 'transfer'
    ? transaction
    : { ...transaction, walletId: transaction?.walletId || defaultWalletId };
  const hydrated = hydrateLegacyCurrencyFields(raw, wallets, baseCurrency);
  const dateISO = String(hydrated?.dateISO || '').slice(0, 10);
  if (!hydrated?.id || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    throw new Error(`financial_v7_shadow_invalid_transaction:${String(hydrated?.id || 'missing-id')}`);
  }
  return {
    ...hydrated,
    dateISO,
    rateDate: hydrated.rateDate || dateISO,
    rateSource: hydrated.rateSource || 'migration_preserved',
    idempotencyKey: hydrated.idempotencyKey || `migration:${hydrated.id}`,
    storageEngineVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
  };
};

const entityRowsFor = ({ namespace, workspace, wallets, now, archives }) => {
  const rows = [];
  const add = (entityType, items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.id) continue;
      rows.push({
        namespace, entityType, id: String(item.id), revision: Math.max(1, Number(item.revision || 1)),
        deletedAt: item.deletedAt || null, payload: item,
        createdAt: String(item.createdAt || now), updatedAt: String(item.updatedAt || now),
      });
    }
  };
  add('wallet', wallets);
  add('debt', workspace?.debts);
  add('goal', workspace?.goals);
  add('commitment', workspace?.commitments);
  const recurringRules = new Map();
  for (const transaction of Array.isArray(workspace?.trans) ? workspace.trans : []) {
    if (!transaction?.recurring || !transaction?.id) continue;
    const ruleId = String(transaction.recurringGroupId || transaction.id);
    recurringRules.set(ruleId, {
      id: ruleId,
      type: transaction.flowType || (Number(transaction.amt || 0) >= 0 ? 'income' : 'expense'),
      amount: Math.abs(Number(transaction.walletAmount ?? transaction.amt ?? 0)),
      currencyCode: transaction.walletCurrency || transaction.currencyCode || workspace?.cfg?.currency || 'IQD',
      walletId: transaction.walletId || null,
      categoryId: transaction.cat || 'other',
      scope: transaction.scope || 'personal',
      schedule: { frequency: 'monthly', interval: 1 },
      timezonePolicy: 'local_date',
      startDate: transaction.dateISO || null,
      endDate: null,
      status: 'active',
      sourceTransactionId: transaction.id,
      revision: Math.max(1, Number(transaction.revision || 1)),
    });
  }
  add('recurring_rule', [...recurringRules.values()]);
  add('category', workspace?.cats);
  add('budget', Object.entries(workspace?.cfg?.categoryBudgets || {}).map(([categoryId, amount]) => ({ id: `current:${categoryId}`, month: 'current', categoryId, amount })));
  add('budget', Object.entries(workspace?.cfg?.categoryBudgetsByMonth || {}).flatMap(([month, map]) => (
    Object.entries(map || {}).map(([categoryId, amount]) => ({ id: `${month}:${categoryId}`, month, categoryId, amount }))
  )));
  rows.push({
    namespace, entityType: 'workspace', id: 'workspace', revision: 1, deletedAt: null,
    payload: {
      cfg: workspace?.cfg || {}, notif: workspace?.notif || {},
      archiveSummaries: workspace?.cfg?.archiveSummaries || [],
      coldArchives: (Array.isArray(archives) ? archives : []).map(item => ({
        year: item.year, scope: item.scope, checksum: item.checksum || '', summary: item.summary || {},
      })),
      coldArchiveMigration: {
        status: 'verified_in_v7',
        retainedAsFallback: true,
        migratedTransactions: (Array.isArray(archives) ? archives : []).reduce(
          (sum, item) => sum + (Array.isArray(item?.data?.trans) ? item.data.trans.length : 0), 0,
        ),
      },
    },
    createdAt: now, updatedAt: now,
  });
  return rows;
};

const projectionDocument = ({ commands, entities }) => {
  const accounts = new Map();
  const exchangeRates = new Map();
  for (const command of commands) {
    for (const item of command.accounts || []) accounts.set(item.id, {
      id: item.id, accountType: item.accountType, scope: item.scope,
      currencyCode: item.currencyCode, status: item.status,
    });
    for (const item of command.exchangeRates || []) exchangeRates.set(item.id, {
      id: item.id, baseCurrencyCode: item.baseCurrencyCode, quoteCurrencyCode: item.quoteCurrencyCode,
      numerator: item.numerator, denominator: item.denominator, rateDate: item.rateDate, source: item.source,
    });
  }
  return {
  schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
  transactions: commands.map(command => ({
    id: command.header.id,
    payload: command.originalTransaction,
    archiveYear: command.header.archiveYear,
    archivedAt: command.header.archivedAt,
    deletedAt: command.header.deletedAt,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  postings: commands.flatMap(command => command.postings.map(item => ({
    id: item.id, transactionId: item.transactionId, accountId: item.accountId,
    bucket: item.bucket, role: item.role, amountMinor: item.amountMinor,
    currencyCode: item.currencyCode, exchangeRateId: item.exchangeRateId,
  }))).sort((left, right) => left.id.localeCompare(right.id)),
  links: commands.flatMap(command => command.links.map(item => ({
    id: item.id, transactionId: item.transactionId, linkType: item.linkType,
    linkId: item.linkId, relation: item.relation, appliedAmountMinor: item.appliedAmountMinor,
    currencyCode: item.currencyCode,
  }))).sort((left, right) => left.id.localeCompare(right.id)),
  accounts: [...accounts.values()].sort((left, right) => left.id.localeCompare(right.id)),
  exchangeRates: [...exchangeRates.values()].sort((left, right) => left.id.localeCompare(right.id)),
  // The staged read-back returns what upsertEntity persisted, which is the
  // canonical payload. Hash the same form here or parity can never match.
  entities: entities.map(entity => ({
    entityType: entity.entityType, id: entity.id, revision: entity.revision,
    deletedAt: entity.deletedAt,
    payload: canonicalFinancialEntityPayload(entity.entityType, entity.payload),
  })).sort((left, right) => `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`)),
  };
};

const rawProjectionDocument = projection => ({
  schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
  transactions: (projection?.transactions || []).map(item => ({
    id: item.id, payload: item.payload, archiveYear: item.archiveYear, archivedAt: item.archivedAt, deletedAt: item.deletedAt,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  postings: (projection?.postings || []).map(item => ({
    id: item.id, transactionId: item.transactionId, accountId: item.accountId,
    bucket: item.bucket, role: item.role, amountMinor: item.amountMinor,
    currencyCode: item.currencyCode, exchangeRateId: item.exchangeRateId,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  links: (projection?.links || []).map(item => ({
    id: item.id, transactionId: item.transactionId, linkType: item.linkType,
    linkId: item.linkId, relation: item.relation, appliedAmountMinor: item.appliedAmountMinor,
    currencyCode: item.currencyCode,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  accounts: (projection?.accounts || []).map(item => ({
    id: item.id, accountType: item.accountType, scope: item.scope,
    currencyCode: item.currencyCode, status: item.status,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  exchangeRates: (projection?.exchangeRates || []).map(item => ({
    id: item.id, baseCurrencyCode: item.baseCurrencyCode, quoteCurrencyCode: item.quoteCurrencyCode,
    numerator: item.numerator, denominator: item.denominator, rateDate: item.rateDate, source: item.source,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  entities: (projection?.entities || []).map(item => ({
    entityType: item.entityType, id: item.id, revision: item.revision, deletedAt: item.deletedAt, payload: item.payload,
  })).sort((left, right) => `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`)),
});

const monthlyTotalsFromTransactions = (transactions, baseCurrency) => {
  const monthlyTotals = {};
  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    if (transaction?.syntheticMigrationOpening || transaction?.syntheticMigrationRelease) continue;
    const month = String(transaction?.dateISO || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const row = monthlyTotals[month] || { incomeMinor: 0, expenseMinor: 0, feeMinor: 0 };
    if (transaction.kind === 'transfer') {
      row.feeMinor += Math.abs(Number(transaction.feeBaseAmountMinor ?? moneyToMinor(transaction.feeBaseAmount || 0, baseCurrency)));
    } else {
      const amount = Number(transaction.baseAmountMinor ?? moneyToMinor(transaction.baseAmount ?? transaction.amt ?? 0, baseCurrency));
      if (amount > 0) row.incomeMinor += amount;
      if (amount < 0) row.expenseMinor += Math.abs(amount);
    }
    monthlyTotals[month] = row;
  }
  return monthlyTotals;
};

const metricsFromSource = ({ workspace, activeTransactions, archivedTransactions, wallets, commands, entities, baseCurrency }) => {
  const currentWallets = normalizeWallets(workspace?.wallets, baseCurrency);
  const available = getWalletAvailableBalances(
    currentWallets, activeTransactions, baseCurrency,
    getDefaultWalletId(currentWallets, baseCurrency, workspace?.cfg?.defaultWalletId),
  );
  const walletBalances = Object.fromEntries(available.map(wallet => [wallet.id, {
    currency: wallet.currency,
    physicalMinor: moneyToMinor(wallet.balance, wallet.currency),
    reservedMinor: moneyToMinor(wallet.reservedBalance, wallet.currency),
    availableMinor: moneyToMinor(wallet.availableBalance, wallet.currency),
  }]));
  const currencyBalances = {};
  for (const item of Object.values(walletBalances)) {
    const row = currencyBalances[item.currency] || { physicalMinor: 0, reservedMinor: 0, availableMinor: 0 };
    row.physicalMinor += item.physicalMinor;
    row.reservedMinor += item.reservedMinor;
    row.availableMinor += item.availableMinor;
    currencyBalances[item.currency] = row;
  }
  const monthlyTotals = monthlyTotalsFromTransactions([...archivedTransactions, ...activeTransactions], baseCurrency);
  return {
    activeTransactions: activeTransactions.length,
    archivedTransactions: archivedTransactions.length,
    syntheticTransactions: commands.length - activeTransactions.length - archivedTransactions.length,
    totalLedgerTransactions: commands.length,
    postings: commands.reduce((sum, command) => sum + command.postings.length, 0),
    links: commands.reduce((sum, command) => sum + command.links.length, 0),
    entities: entities.length,
    wallets: wallets.length,
    walletBalances,
    currencyBalances,
    monthlyTotals,
  };
};

const metricsFromTarget = ({ projection, sourceMetrics, baseCurrency }) => {
  const accountTotals = {};
  for (const posting of projection?.postings || []) {
    const row = accountTotals[posting.accountId] || { physicalMinor: 0, reservedMinor: 0 };
    row[posting.bucket === 'reserved' ? 'reservedMinor' : 'physicalMinor'] += Number(posting.amountMinor || 0);
    accountTotals[posting.accountId] = row;
  }
  const walletBalances = {};
  for (const [walletId, expected] of Object.entries(sourceMetrics.walletBalances)) {
    const totals = accountTotals[walletId] || { physicalMinor: 0, reservedMinor: 0 };
    walletBalances[walletId] = {
      currency: expected.currency,
      physicalMinor: totals.physicalMinor,
      reservedMinor: totals.reservedMinor,
      availableMinor: totals.physicalMinor - totals.reservedMinor,
    };
  }
  const currencyBalances = {};
  for (const item of Object.values(walletBalances)) {
    const row = currencyBalances[item.currency] || { physicalMinor: 0, reservedMinor: 0, availableMinor: 0 };
    row.physicalMinor += item.physicalMinor;
    row.reservedMinor += item.reservedMinor;
    row.availableMinor += item.availableMinor;
    currencyBalances[item.currency] = row;
  }
  return {
    activeTransactions: (projection?.transactions || []).filter(item => !item.archivedAt && !item.payload?.hiddenFromHistory).length,
    archivedTransactions: (projection?.transactions || []).filter(item => !!item.archivedAt && !item.payload?.hiddenFromHistory).length,
    syntheticTransactions: (projection?.transactions || []).filter(item => !!item.payload?.hiddenFromHistory).length,
    totalLedgerTransactions: projection?.transactions?.length || 0,
    postings: projection?.postings?.length || 0,
    links: projection?.links?.length || 0,
    entities: projection?.entities?.length || 0,
    wallets: sourceMetrics.wallets,
    walletBalances,
    currencyBalances,
    monthlyTotals: monthlyTotalsFromTransactions(
      (projection?.transactions || []).map(item => item.payload).filter(Boolean),
      normalizeCurrencyCode(baseCurrency, 'IQD'),
    ),
  };
};

const compareMetric = (differences, field, source, target) => {
  if (stableFinancialJson(source) !== stableFinancialJson(target)) differences.push({ field, source, target });
};

export const buildFinancialShadowProjectionV7 = ({
  namespace = 'guest', workspace = {}, coldArchives = [], now = new Date().toISOString(),
} = {}) => {
  const baseCurrency = normalizeCurrencyCode(workspace?.cfg?.currency, 'IQD');
  const wallets = collectWallets(workspace, coldArchives, baseCurrency);
  const defaultWalletId = getDefaultWalletId(wallets, baseCurrency, workspace?.cfg?.defaultWalletId);
  const activeTransactions = (Array.isArray(workspace?.trans) ? workspace.trans : []).map(transaction => (
    normalizeMigratedTransaction({ transaction, wallets, baseCurrency, defaultWalletId })
  ));
  const archivedTransactions = archiveRows(coldArchives).map(transaction => (
    normalizeMigratedTransaction({ transaction, wallets, baseCurrency, defaultWalletId })
  ));
  const seen = new Map();
  for (const transaction of [...archivedTransactions, ...activeTransactions]) {
    const prior = seen.get(transaction.id);
    if (prior && stableFinancialJson(prior) !== stableFinancialJson(transaction)) {
      throw new Error(`financial_v7_shadow_transaction_id_collision:${transaction.id}`);
    }
    seen.set(transaction.id, transaction);
  }
  const dedupedArchived = archivedTransactions.filter(transaction => !activeTransactions.some(item => item.id === transaction.id));
  const unresolvedFx = [...dedupedArchived, ...activeTransactions].filter(transaction => transaction?.fxStatus === 'UNRESOLVED_FX');
  if (unresolvedFx.length) {
    throw new Error(`financial_v7_shadow_unresolved_fx:${unresolvedFx.slice(0, 20).map(item => item.id).join(',')}`);
  }

  const coldMovement = new Map(wallets.map(wallet => [wallet.id, 0]));
  for (const transaction of dedupedArchived) {
    for (const wallet of wallets) coldMovement.set(wallet.id, coldMovement.get(wallet.id) + nativeMovement(transaction, wallet.id));
  }
  const syntheticTransactions = [];
  for (const wallet of normalizeWallets(workspace?.wallets, baseCurrency)) {
    const residual = Number(wallet.openingBalance || 0) - Number(coldMovement.get(wallet.id) || 0);
    const residualMinor = moneyToMinor(residual, wallet.currency);
    if (!residualMinor) continue;
    const fields = buildCurrencyFields({
      amount: moneyFromMinor(residualMinor, wallet.currency), walletId: wallet.id, wallets,
      baseCurrency, exchangeRate: wallet.currency === baseCurrency ? 1 : wallet.valuationRate,
    });
    syntheticTransactions.push({
      id: `v7-migration-opening:${wallet.id}`,
      title: 'V7 migration opening balance', amt: fields.baseAmount, ...fields,
      walletId: wallet.id, cat: 'other', dateISO: '1970-01-01', occurredAt: '1970-01-01T00:00:00.000Z',
      scope: wallet.scope || 'personal', flowType: 'opening_balance', transactionTag: 'opening_balance',
      isOpeningBalance: true, hiddenFromHistory: true, syntheticMigrationOpening: true,
      rateDate: '1970-01-01', rateSource: 'migration_residual',
      idempotencyKey: `migration-opening:${wallet.id}`,
    });
  }
  for (const transaction of [...dedupedArchived, ...activeTransactions]) {
    if (!(transaction.isGoalSaving || transaction.flowType === 'goal_allocation')) continue;
    // P11-B / D2: being archived must never by itself release a reserved
    // allocation (§73) — only a real, user-driven release does. Before this
    // fix, every archived goal-allocation carried into V7 got a synthetic
    // release regardless of `allocationReleased`, mirroring the same violation
    // removed from archiveFinancialTransactionsV7. An archived-but-unreleased
    // allocation now stays reserved through migration, matching the legacy
    // layer, where the archived contribution keeps counting via archivedSaved
    // instead of being released.
    if (!transaction.allocationReleased) continue;
    const amount = Math.abs(Number(transaction.allocationWalletAmount ?? transaction.allocationAmount ?? 0));
    if (!amount) continue;
    syntheticTransactions.push({
      id: `v7-migration-release:${transaction.id}`,
      title: 'V7 migration reserved-balance carry', amt: 0, walletAmount: 0, baseAmount: 0,
      allocationAmount: Math.abs(Number(transaction.allocationAmount || 0)),
      allocationWalletAmount: amount,
      walletId: transaction.walletId || defaultWalletId,
      walletCurrency: transaction.walletCurrency || transaction.currencyCode,
      currencyCode: transaction.walletCurrency || transaction.currencyCode,
      baseCurrencyCode: baseCurrency,
      exchangeRate: transaction.exchangeRate || 1,
      cat: 'other', dateISO: transaction.dateISO,
      scope: transaction.scope || 'personal', flowType: 'goal_release', isGoalRelease: true,
      goalId: transaction.goalId || null, hiddenFromHistory: true, syntheticMigrationRelease: true,
      archiveYear: transaction.archiveYear || null, archivedAt: transaction.archivedAt || null,
      rateDate: transaction.rateDate || transaction.dateISO, rateSource: transaction.rateSource || 'migration_reserved_carry',
      idempotencyKey: `migration-release:${transaction.id}`,
    });
  }

  const allTransactions = [...dedupedArchived, ...activeTransactions, ...syntheticTransactions];
  const commands = allTransactions.map(transaction => buildFinancialLedgerCommand({
    namespace, transaction, wallets, baseCurrency, now,
  }));
  const entities = entityRowsFor({
    namespace, workspace, wallets: normalizeWallets(workspace?.wallets, baseCurrency), now, archives: coldArchives,
  });
  const document = projectionDocument({ commands, entities });
  const checksum = financialProjectionChecksum(document);
  const metrics = metricsFromSource({
    workspace, activeTransactions, archivedTransactions: dedupedArchived,
    wallets, commands, entities, baseCurrency,
  });
  return {
    namespace, baseCurrency, wallets, commands, entities, document, checksum, metrics,
    workspacePayload: entities.find(item => item.entityType === 'workspace')?.payload || {},
  };
};

export const runFinancialShadowMigrationV7 = async ({
  namespace = 'guest', workspace = {}, coldArchives = [], database = null, forceReplace = false,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const currentState = await getFinancialWorkspaceStateV7({ namespace, database });
  if (currentState?.source_mode === 'sqlite' && !forceReplace) {
    return { supported: true, ok: true, alreadyCutover: true, checksum: currentState.shadow_checksum, sourceMode: 'sqlite' };
  }
  const sourceUnresolvedFx = [
    ...(Array.isArray(workspace?.trans) ? workspace.trans : []),
    ...archiveRows(coldArchives),
  ].filter(transaction => transaction?.fxStatus === 'UNRESOLVED_FX');
  if (sourceUnresolvedFx.length) {
    return {
      supported: true,
      ok: false,
      reason: 'UNRESOLVED_FX',
      differences: sourceUnresolvedFx.slice(0, 20).map(item => ({ field: 'fx', id: item.id })),
    };
  }
  const stageNamespace = `${namespace}::shadow-stage::v7`;
  const projection = buildFinancialShadowProjectionV7({ namespace: stageNamespace, workspace, coldArchives });
  const expectedIds = new Set(projection.commands.map(command => command.header.id));
  const existing = await readFinancialProjectionV7({ namespace, database });
  const unmirrored = forceReplace ? [] : (existing?.transactions || []).filter(item => (
    !item.deletedAt && !item.payload?.hiddenFromHistory && !expectedIds.has(item.id)
  ));
  if (unmirrored.length) {
    return {
      supported: true, ok: false, reason: 'unmirrored_sqlite_transactions',
      differences: unmirrored.slice(0, 20).map(item => ({ field: 'transaction', id: item.id })),
    };
  }

  await stageFinancialWorkspaceV7({
    stageNamespace, commands: projection.commands, entities: projection.entities,
    workspacePayload: projection.workspacePayload, database,
  });
  try {
    const staged = await readFinancialProjectionV7({ namespace: stageNamespace, database });
    const targetDocument = rawProjectionDocument(staged);
    const targetChecksum = financialProjectionChecksum(targetDocument);
    const targetMetrics = metricsFromTarget({ projection: staged, sourceMetrics: projection.metrics, baseCurrency: projection.baseCurrency });
    const differences = [];
    compareMetric(differences, 'checksum', projection.checksum, targetChecksum);
    for (const field of [
      'activeTransactions', 'archivedTransactions', 'syntheticTransactions', 'totalLedgerTransactions',
      'postings', 'entities', 'walletBalances', 'currencyBalances', 'monthlyTotals',
      'links',
    ]) compareMetric(differences, field, projection.metrics[field], targetMetrics[field]);
    if (differences.length) {
      await discardFinancialWorkspaceStageV7({ stageNamespace, database });
      return {
        supported: true, ok: false, reason: 'shadow_parity_failed',
        sourceChecksum: projection.checksum, targetChecksum, differences,
        sourceCounts: projection.metrics, targetCounts: targetMetrics,
      };
    }
    // Phase 5 is readiness proof only. A successful shadow comparison must not
    // make SQLite operationally authoritative; that cutover belongs to a later
    // gated phase. Keep only the verified checksum/state and discard staging.
    await discardFinancialWorkspaceStageV7({ stageNamespace, database });
    const verifiedAt = new Date().toISOString();
    await setFinancialWorkspaceStateV7({
      namespace,
      sourceMode: 'shadow',
      checksum: projection.checksum,
      verifiedAt,
      payload: {
        ...projection.workspacePayload,
        migrationReadiness: {
          status: 'ready',
          verifiedAt,
          sourceChecksum: projection.checksum,
          targetChecksum,
          sourceCounts: projection.metrics,
          targetCounts: targetMetrics,
        },
      },
      database,
    });
    return {
      supported: true,
      ok: true,
      migrationReady: true,
      sourceMode: 'shadow',
      checksum: projection.checksum,
      sourceChecksum: projection.checksum,
      targetChecksum,
      sourceCounts: projection.metrics,
      targetCounts: targetMetrics,
      differences: [],
      verifiedAt,
      cutover: false,
    };
  } catch (error) {
    await discardFinancialWorkspaceStageV7({ stageNamespace, database }).catch(() => {});
    throw error;
  }
};


export const runFinancialOperationalCutoverV7 = async ({
  namespace = 'guest', workspace = {}, coldArchives = [], database = null,
  forceReplace = false, resetPendingOutbox = false,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) {
    return { supported: false, ok: false, reason: 'sqlite_unavailable', cutover: false };
  }
  const currentState = await getFinancialWorkspaceStateV7({ namespace, database });
  if (currentState?.source_mode === 'sqlite' && !forceReplace) {
    const health = await proveFinancialLedgerInvariantsV7({ namespace, database });
    return {
      supported: true,
      ok: !!health?.ok,
      alreadyCutover: true,
      cutover: true,
      sourceMode: 'sqlite',
      checksum: currentState.shadow_checksum || null,
      health,
      reason: health?.ok ? null : 'financial_v7_health_blocking',
    };
  }

  const readiness = forceReplace
    ? { supported: true, ok: true, migrationReady: true, sourceMode: currentState?.source_mode || 'shadow', forceReplace: true }
    : await runFinancialShadowMigrationV7({
        namespace, workspace, coldArchives, database, forceReplace: false,
      });
  if (!readiness?.ok || readiness?.migrationReady !== true) {
    return { ...readiness, cutover: false, reason: readiness?.reason || 'migration_not_ready' };
  }

  const stageNamespace = `${namespace}::shadow-stage::v7-cutover`;
  const projection = buildFinancialShadowProjectionV7({
    namespace: stageNamespace, workspace, coldArchives,
  });
  await stageFinancialWorkspaceV7({
    stageNamespace,
    commands: projection.commands,
    entities: projection.entities,
    workspacePayload: projection.workspacePayload,
    database,
  });

  try {
    const staged = await readFinancialProjectionV7({ namespace: stageNamespace, database });
    const targetDocument = rawProjectionDocument(staged);
    const targetChecksum = financialProjectionChecksum(targetDocument);
    const targetMetrics = metricsFromTarget({
      projection: staged,
      sourceMetrics: projection.metrics,
      baseCurrency: projection.baseCurrency,
    });
    const differences = [];
    compareMetric(differences, 'checksum', projection.checksum, targetChecksum);
    for (const field of [
      'activeTransactions', 'archivedTransactions', 'syntheticTransactions', 'totalLedgerTransactions',
      'postings', 'entities', 'walletBalances', 'currencyBalances', 'monthlyTotals', 'links',
    ]) compareMetric(differences, field, projection.metrics[field], targetMetrics[field]);
    if (differences.length) {
      await discardFinancialWorkspaceStageV7({ stageNamespace, database });
      return {
        supported: true, ok: false, cutover: false, reason: 'final_cutover_parity_failed',
        sourceChecksum: projection.checksum, targetChecksum, differences,
        sourceCounts: projection.metrics, targetCounts: targetMetrics,
      };
    }

    const health = await proveFinancialLedgerInvariantsV7({ namespace: stageNamespace, database });
    if (!health?.ok) {
      await discardFinancialWorkspaceStageV7({ stageNamespace, database });
      return {
        supported: true, ok: false, cutover: false, reason: 'financial_v7_health_blocking',
        health,
      };
    }

    const promoted = await promoteFinancialWorkspaceStageV7({
      namespace,
      stageNamespace,
      checksum: projection.checksum,
      sourceCounts: projection.metrics,
      targetCounts: targetMetrics,
      differences: [],
      workspacePayload: {
        ...projection.workspacePayload,
        operationalCutover: {
          status: 'active',
          promotedAt: new Date().toISOString(),
          sourceChecksum: projection.checksum,
          targetChecksum,
        },
      },
      resetPendingOutbox: !!resetPendingOutbox,
      database,
    });
    return {
      ...promoted,
      cutover: promoted?.ok === true,
      sourceMode: promoted?.ok ? 'sqlite' : 'shadow',
      health,
      sourceChecksum: projection.checksum,
      targetChecksum,
      sourceCounts: projection.metrics,
      targetCounts: targetMetrics,
      differences: [],
    };
  } catch (error) {
    await discardFinancialWorkspaceStageV7({ stageNamespace, database }).catch(() => {});
    throw error;
  }
};
