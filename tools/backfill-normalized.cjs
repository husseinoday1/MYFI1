#!/usr/bin/env node

/*
 * Backfill the legacy MYFI JSON snapshot into the normalized staging schema.
 * Dry-run is the default. Applying requires --apply and a staging service key.
 */

const fs = require('node:fs');
const path = require('node:path');

const TABLES = [
  'categories',
  'wallets',
  'debts',
  'goals',
  'commitments',
  'transactions',
  'debt_payments',
  'goal_savings',
  'tags',
  'transaction_tags',
];

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const positive = value => Math.abs(number(value));

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

const dateOnly = (value, fallback = new Date()) => {
  if (validDate(value)) return String(value);
  const parsed = value instanceof Date ? value : new Date(value || fallback);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
};

const isoFromTimestamp = value => {
  const parsed = number(value, NaN);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const scopeFor = (value, fallback = 'personal') => (
  value === 'business' || value === 'personal' ? value : fallback
);

const safeLegacyId = (value, fallback) => {
  const candidate = String(value ?? '').trim();
  return candidate || fallback;
};

const safeName = (value, fallback) => {
  const candidate = String(value ?? '').trim();
  return candidate || fallback;
};

const slug = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'tag';

const chunks = (items, size = 500) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const getTagValues = tx => {
  const values = [];
  if (typeof tx?.transactionTag === 'string') values.push(tx.transactionTag);
  if (typeof tx?.tag === 'string') values.push(tx.tag);
  const lists = [tx?.tags, tx?.transactionTags].filter(Array.isArray);
  lists.forEach(list => list.forEach(item => {
    if (typeof item === 'string') values.push(item);
    else if (item?.id) values.push(item.id);
    else if (item?.name) values.push(item.name);
  }));
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
};

const inferFlowType = tx => {
  if (tx?.flowType) return tx.flowType;
  if (tx?.kind === 'transfer') return 'transfer';
  if (tx?.isGoalSaving) return 'goal_allocation';
  if (tx?.isCommitmentPayment) return 'commitment_payment';
  if (tx?.isDebtPayment) return number(tx.amt) >= 0 ? 'receivable_collection' : 'debt_payment';
  return number(tx?.amt) >= 0 ? 'income' : 'expense';
};

const normalizeSource = raw => {
  const envelope = raw?.payload && raw.payload.data ? raw.payload : raw;
  const source = envelope?.data && !Array.isArray(envelope.data) ? envelope.data : envelope || {};
  const cfg = envelope?.cfg || source.cfg || {};
  const warnings = [];
  const fallbackScope = cfg.profileType === 'business' ? 'business' : 'personal';
  const wallets = Array.isArray(source.wallets) && source.wallets.length
    ? source.wallets
    : [{ id: 'legacy_default_wallet', name: 'Default wallet', nameEn: 'Default wallet', type: 'cash', openingBalance: 0, scope: fallbackScope }];
  if (!Array.isArray(source.wallets) || source.wallets.length === 0) warnings.push('No wallets were present; a derived default wallet was added.');
  return {
    cfg,
    warnings,
    data: {
      cats: Array.isArray(source.cats) ? source.cats : [],
      wallets,
      trans: Array.isArray(source.trans) ? source.trans : [],
      debts: Array.isArray(source.debts) ? source.debts : [],
      goals: Array.isArray(source.goals) ? source.goals : [],
      commitments: Array.isArray(source.commitments) ? source.commitments : [],
    },
    fallbackScope,
  };
};

const buildSourceReport = normalized => {
  const { data, cfg } = normalized;
  const wallets = data.wallets.map((wallet, index) => ({
    id: safeLegacyId(wallet.id, `wallet_${index}`),
    opening: number(wallet.openingBalance),
  }));
  const walletMap = new Map(wallets.map(wallet => [wallet.id, wallet]));
  const defaultWalletId = String(cfg.defaultWalletId || wallets[0]?.id || 'legacy_default_wallet');
  const balances = new Map(wallets.map(wallet => [wallet.id, wallet.opening]));
  let income = 0;
  let expense = 0;
  let displayNet = 0;
  let transfers = 0;
  let allocations = 0;
  data.trans.forEach(tx => {
    const amount = number(tx.amt);
    const flow = inferFlowType(tx);
    if (tx.kind === 'transfer') {
      const transfer = positive(tx.transferAmount);
      transfers += transfer;
      if (balances.has(tx.fromWalletId)) balances.set(tx.fromWalletId, balances.get(tx.fromWalletId) - transfer);
      if (balances.has(tx.toWalletId)) balances.set(tx.toWalletId, balances.get(tx.toWalletId) + transfer);
      return;
    }
    const walletId = walletMap.has(tx.walletId) ? tx.walletId : defaultWalletId;
    if (balances.has(walletId)) balances.set(walletId, balances.get(walletId) + amount);
    if (flow === 'income') income += positive(amount);
    if (flow === 'expense' || flow === 'commitment_payment' || flow === 'debt_payment') expense += positive(amount);
    if (tx.isGoalSaving || flow === 'goal_allocation') {
      const allocation = positive(tx.allocationAmount ?? tx.amt);
      allocations += allocation;
      displayNet -= allocation;
    } else {
      displayNet += amount;
    }
  });
  const debtPayments = data.debts.reduce((total, debt) => total + (Array.isArray(debt.payments) ? debt.payments.length : 0), 0);
  const goalSavings = data.goals.reduce((total, goal) => total + (Array.isArray(goal.savings) ? goal.savings.length : 0), 0);
  const tagValues = new Set(data.trans.flatMap(tx => getTagValues(tx).map(value => `tag:${slug(value)}`)));
  const taggedRelations = data.trans.reduce((total, tx) => total + new Set(getTagValues(tx).map(slug)).size, 0);
  return {
    source: 'legacy_json',
    counts: {
      categories: data.cats.length,
      wallets: data.wallets.length || 1,
      debts: data.debts.length,
      goals: data.goals.length,
      commitments: data.commitments.length,
      transactions: data.trans.length,
      debtPayments,
      goalSavings,
      tags: tagValues.size,
      transactionTags: taggedRelations,
    },
    totals: {
      transactionAmount: income - expense,
      income,
      expense,
      displayNet,
      transfers,
      allocations,
      walletBalances: Object.fromEntries([...balances.entries()].map(([id, value]) => [id, number(value)])),
      debtTotal: data.debts.reduce((sum, debt) => sum + positive(debt.total), 0),
      debtPaid: data.debts.reduce((sum, debt) => sum + positive(debt.archivedPaid) + (Array.isArray(debt.payments) ? debt.payments.reduce((n, payment) => n + positive(payment.amt), 0) : 0), 0),
      goalTarget: data.goals.reduce((sum, goal) => sum + positive(goal.target), 0),
      goalSaved: data.goals.reduce((sum, goal) => sum + positive(goal.archivedSaved) + (Array.isArray(goal.savings) ? goal.savings.reduce((n, saving) => n + positive(saving.amt), 0) : 0), 0),
      commitmentAmount: data.commitments.reduce((sum, item) => sum + positive(item.amt), 0),
    },
  };
};

const buildPlannedRowsReport = (normalized, built) => {
  const source = buildSourceReport(normalized);
  return {
    source: 'normalized_planned_rows',
    counts: {
      categories: built.rows.categories.length,
      wallets: built.rows.wallets.length,
      debts: built.rows.debts.length,
      goals: built.rows.goals.length,
      commitments: built.rows.commitments.length,
      transactions: built.rows.transactions.length,
      debtPayments: built.rows.debt_payments.length,
      goalSavings: built.rows.goal_savings.length,
      tags: built.rows.tags.length,
      transactionTags: normalized.data.trans.reduce((total, tx) => total + new Set(getTagValues(tx).map(slug)).size, 0),
    },
    totals: source.totals,
  };
};

const buildRows = normalized => {
  const { data, cfg, fallbackScope } = normalized;
  const warnings = [...normalized.warnings];
  const currency = String(cfg.currency || 'IQD');
  const maps = Object.fromEntries(['categories', 'wallets', 'debts', 'goals', 'commitments', 'transactions', 'tags'].map(key => [key, new Map()]));
  const legacyWallets = data.wallets.map((wallet, index) => ({ ...wallet, legacyId: safeLegacyId(wallet.id, `wallet_${index}`) }));
  const legacyCats = data.cats.map((cat, index) => ({ ...cat, legacyId: safeLegacyId(cat.id, `category_${index}`) }));
  const legacyDebts = data.debts.map((debt, index) => ({ ...debt, legacyId: safeLegacyId(debt.id, `debt_${index}`) }));
  const legacyGoals = data.goals.map((goal, index) => ({ ...goal, legacyId: safeLegacyId(goal.id, `goal_${index}`) }));
  const legacyCommitments = data.commitments.map((item, index) => ({ ...item, legacyId: safeLegacyId(item.id, `commitment_${index}`) }));
  const legacyTransactions = data.trans.map((tx, index) => ({ ...tx, legacyId: safeLegacyId(tx.id, `transaction_${index}`) }));
  const walletScopes = new Map(legacyWallets.map(wallet => [wallet.legacyId, scopeFor(wallet.scope, fallbackScope)]));
  const legacyTags = [...new Map(data.trans.flatMap(getTagValues).map(value => [`tag:${slug(value)}`, value])).entries()]
    .map(([legacyId, value]) => ({ value, legacyId }));
  const rows = {};
  rows.categories = legacyCats.map((cat, index) => ({
    legacy_id: cat.legacyId,
    name: safeName(cat.label ?? cat.name, `Category ${index + 1}`),
    name_en: cat.labelEn || cat.nameEn || null,
    icon: cat.icon || 'pricetag-outline',
    color: cat.color || '#5B8DEF',
    category_type: 'both',
    sort_order: number(cat.sortOrder, index),
  }));
  rows.wallets = legacyWallets.map((wallet, index) => ({
    legacy_id: wallet.legacyId,
    name: safeName(wallet.name, `Wallet ${index + 1}`),
    name_en: wallet.nameEn || null,
    wallet_type: ['cash', 'bank', 'savings', 'business', 'other'].includes(wallet.type) ? wallet.type : 'other',
    currency_code: wallet.currency || currency,
    opening_balance: number(wallet.openingBalance),
    scope: scopeFor(wallet.scope, fallbackScope),
    sort_order: number(wallet.sortOrder, index),
  }));
  rows.debts = legacyDebts.map(debt => ({
    legacy_id: debt.legacyId,
    name: safeName(debt.name, debt.direction === 'receivable' ? 'Receivable' : 'Debt'),
    direction: debt.direction === 'receivable' ? 'receivable' : 'owed',
    total_amount: positive(debt.total),
    archived_paid: positive(debt.archivedPaid),
    currency_code: currency,
    status: positive(debt.total) <= positive(debt.paid) ? 'settled' : 'active',
    scope: scopeFor(debt.scope, fallbackScope),
    created_on: validDate(debt.createdAt) ? debt.createdAt : null,
  }));
  rows.goals = legacyGoals.map(goal => ({
    legacy_id: goal.legacyId,
    name: safeName(goal.name, 'Saving goal'),
    target_amount: positive(goal.target),
    archived_saved: positive(goal.archivedSaved),
    currency_code: currency,
    status: positive(goal.target) <= positive(goal.cur) ? 'completed' : 'active',
    scope: scopeFor(goal.scope, fallbackScope),
    created_on: validDate(goal.createdAt) ? goal.createdAt : null,
  }));
  rows.tags = legacyTags.map((tag, index) => ({
    legacy_id: tag.legacyId,
    name: safeName(tag.value, `Tag ${index + 1}`),
    sort_order: index,
  }));

  // The first four maps are populated after their rows are inserted.
  rows.commitments = legacyCommitments.map(item => ({
    legacy_id: item.legacyId,
    name: safeName(item.name, 'Commitment'),
    amount: positive(item.amt),
    currency_code: currency,
    due_day: Math.min(31, Math.max(1, Math.round(number(item.day, 1)))),
    first_due_on: validDate(item.firstDueISO) ? item.firstDueISO : null,
    repeat_monthly: item.repeatMonthly !== false,
    active: item.active !== false,
    scope: scopeFor(item.scope, fallbackScope),
    linked_type: ['none', 'debt', 'receivable', 'goal'].includes(item.linkedType) ? item.linkedType : 'none',
    last_paid_month: item.lastPaidMonth || null,
  }));

  const transactionByPaymentId = new Map();
  rows.transactions = legacyTransactions.map(tx => {
    const flowType = inferFlowType(tx);
    const date = dateOnly(tx.dateISO, tx.ts ? new Date(tx.ts) : new Date());
    const fromScope = scopeFor(tx.fromScope, walletScopes.get(String(tx.fromWalletId)) || fallbackScope);
    const toScope = scopeFor(tx.toScope, walletScopes.get(String(tx.toWalletId)) || fallbackScope);
    if (!validDate(tx.dateISO)) warnings.push(`Transaction ${tx.legacyId} had an invalid date; ${date} was used.`);
    const row = {
      legacy_id: tx.legacyId,
      title: safeName(tx.title, 'Transaction'),
      note: tx.note || null,
      amount: number(tx.amt),
      allocation_amount: tx.isGoalSaving || flowType === 'goal_allocation' ? positive(tx.allocationAmount ?? tx.amt) : null,
      transfer_amount: tx.kind === 'transfer' ? positive(tx.transferAmount) : null,
      currency_code: currency,
      date_on: date,
      occurred_at: isoFromTimestamp(tx.ts),
      kind: tx.kind === 'transfer' ? 'transfer' : 'entry',
      flow_type: flowType,
      scope: tx.kind === 'transfer' ? fromScope : scopeFor(tx.scope, fallbackScope),
      from_scope: tx.kind === 'transfer' ? fromScope : null,
      to_scope: tx.kind === 'transfer' ? toScope : null,
      recurring_group_id: tx.recurringGroupId || null,
      commitment_month: tx.commitmentMonth || null,
      metadata: {
        legacy: {
          transactionTag: tx.transactionTag || null,
          recurring: !!tx.recurring,
          paymentId: tx.paymentId || null,
          savingId: tx.savingId || null,
          isDebtPayment: !!tx.isDebtPayment,
          isGoalSaving: !!tx.isGoalSaving,
          isCommitmentPayment: !!tx.isCommitmentPayment,
        },
      },
    };
    if (tx.paymentId) transactionByPaymentId.set(String(tx.paymentId), tx.legacyId);
    if (tx.savingId) transactionByPaymentId.set(String(tx.savingId), tx.legacyId);
    return row;
  });
  rows.debt_payments = legacyDebts.flatMap(debt => (Array.isArray(debt.payments) ? debt.payments : []).map((payment, index) => ({
    debtLegacyId: debt.legacyId,
    legacy_id: safeLegacyId(payment.id, `${debt.legacyId}:payment:${index}`),
    amount: positive(payment.amt),
    paid_on: dateOnly(payment.date),
    transactionLegacyId: transactionByPaymentId.get(String(payment.id || '')) || null,
  })));
  rows.goal_savings = legacyGoals.flatMap(goal => (Array.isArray(goal.savings) ? goal.savings : []).map((saving, index) => ({
    goalLegacyId: goal.legacyId,
    legacy_id: safeLegacyId(saving.id, `${goal.legacyId}:saving:${index}`),
    amount: positive(saving.amt),
    saved_on: dateOnly(saving.date || saving.dateISO),
    transactionLegacyId: transactionByPaymentId.get(String(saving.id || '')) || null,
  })));

  return { rows, maps, warnings };
};

const diffNumber = (left, right) => Math.round((number(left) - number(right)) * 10000) / 10000;

const compareReports = (source, target) => {
  const differences = [];
  const countNames = ['categories', 'wallets', 'debts', 'goals', 'commitments', 'transactions', 'debtPayments', 'goalSavings', 'tags', 'transactionTags'];
  countNames.forEach(name => {
    if (number(source.counts[name]) !== number(target.counts[name])) differences.push({ field: `counts.${name}`, source: source.counts[name], target: target.counts[name] });
  });
  const totalNames = ['transactionAmount', 'income', 'expense', 'displayNet', 'transfers', 'allocations', 'debtTotal', 'debtPaid', 'goalTarget', 'goalSaved', 'commitmentAmount'];
  totalNames.forEach(name => {
    const delta = diffNumber(source.totals[name], target.totals[name]);
    if (delta !== 0) differences.push({ field: `totals.${name}`, source: source.totals[name], target: target.totals[name], delta });
  });
  const sourceWallets = source.totals.walletBalances || {};
  const targetWallets = target.totals.walletBalances || {};
  [...new Set([...Object.keys(sourceWallets), ...Object.keys(targetWallets)])].forEach(walletId => {
    const delta = diffNumber(sourceWallets[walletId], targetWallets[walletId]);
    if (delta !== 0) differences.push({ field: `totals.walletBalances.${walletId}`, source: sourceWallets[walletId] || 0, target: targetWallets[walletId] || 0, delta });
  });
  return { passed: differences.length === 0, differences };
};

const summarizeComparison = (source, target, comparison) => ({
  passed: comparison.passed,
  transactionCount: {
    source: number(source.counts.transactions),
    target: number(target.counts.transactions),
    delta: diffNumber(source.counts.transactions, target.counts.transactions),
  },
  walletBalances: [...new Set([
    ...Object.keys(source.totals.walletBalances || {}),
    ...Object.keys(target.totals.walletBalances || {}),
  ])].map(walletId => ({
    walletId,
    source: number(source.totals.walletBalances?.[walletId]),
    target: number(target.totals.walletBalances?.[walletId]),
    delta: diffNumber(source.totals.walletBalances?.[walletId], target.totals.walletBalances?.[walletId]),
  })),
  differences: comparison.differences,
});

const parseArgs = argv => {
  const args = { apply: false, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') args.apply = true;
    else if (token === '--input') args.input = argv[++index];
    else if (token === '--user-id') args.userId = argv[++index];
    else if (token === '--workspace-id') args.workspaceId = argv[++index];
    else if (token === '--url') args.url = argv[++index];
    else if (token === '--service-key') args.serviceKey = argv[++index];
    else if (token === '--report') args.report = argv[++index];
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
};

const usage = () => `MYFI normalized backfill

Dry-run:
  node tools/backfill-normalized.cjs --input ./snapshot.json --user-id <auth-user-uuid>

Apply to staging:
  node tools/backfill-normalized.cjs --input ./snapshot.json --user-id <auth-user-uuid> --apply

Environment for --apply:
  SUPABASE_TEST_URL
  SUPABASE_TEST_SERVICE_ROLE_KEY

Optional:
  --workspace-id <uuid>  Reuse an existing staging workspace
  --url <url>            Override SUPABASE_TEST_URL
  --service-key <key>    Override SUPABASE_TEST_SERVICE_ROLE_KEY
  --report <path>        Write the JSON reconciliation report
`;

const readJson = file => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));

const requireSupabase = () => {
  try {
    return require('@supabase/supabase-js').createClient;
  } catch (error) {
    throw new Error(`Supabase client is unavailable: ${error.message}`);
  }
};

const fetchAll = async (client, table, select = '*', filters = {}) => {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client.from(table).select(select).range(offset, offset + 999);
    Object.entries(filters).forEach(([key, value]) => { query = query.eq(key, value); });
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
};

const fetchByIds = async (client, table, column, ids) => {
  const rows = [];
  for (const batch of chunks(ids)) {
    if (!batch.length) continue;
    const { data, error } = await client.from(table).select('*').in(column, batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
};

const upsertRows = async (client, table, rows, onConflict) => {
  const result = [];
  for (const batch of chunks(rows)) {
    if (!batch.length) continue;
    const { data, error } = await client.from(table).upsert(batch, { onConflict }).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...(data || []));
  }
  return result;
};

const ensureWorkspace = async (client, args, normalized) => {
  const userId = args.userId;
  if (args.workspaceId) {
    const { data, error } = await client.from('workspaces').select('*').eq('id', args.workspaceId).maybeSingle();
    if (error) throw new Error(`workspaces: ${error.message}`);
    if (data) return data;
  }
  const kind = normalized.cfg.profileType === 'business' ? 'business' : 'personal';
  const existing = await fetchAll(client, 'workspaces', '*', { owner_id: userId, kind });
  if (existing[0]) return existing[0];
  const { data, error } = await client.from('workspaces').insert({
    ...(args.workspaceId ? { id: args.workspaceId } : {}),
    owner_id: userId,
    name: safeName(normalized.cfg.name, 'MYFI'),
    kind,
    base_currency: normalized.cfg.currency || 'IQD',
    app_settings: normalized.cfg,
  }).select().single();
  if (error) throw new Error(`workspaces: ${error.message}`);
  return data;
};

const applyBackfill = async (client, args, normalized) => {
  const workspace = await ensureWorkspace(client, args, normalized);
  const workspaceId = workspace.id;
  const { cfg } = normalized;
  const { error: profileError } = await client.from('profiles').upsert({
    id: args.userId,
    display_name: cfg.name || null,
    country_code: cfg.country || null,
    default_currency: cfg.currency || 'IQD',
    language: cfg.lang === 'en' ? 'en' : 'ar',
  });
  if (profileError) throw new Error(`profiles: ${profileError.message}`);
  const { error: memberError } = await client.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: args.userId, role: 'owner' });
  if (memberError) throw new Error(`workspace_members: ${memberError.message}`);

  const built = buildRows(normalized);
  const withWorkspace = rows => rows.map(row => ({ ...row, workspace_id: workspaceId }));
  const inserted = {};
  for (const table of ['categories', 'wallets', 'debts', 'goals', 'tags']) {
    inserted[table] = await upsertRows(client, table, withWorkspace(built.rows[table]), 'workspace_id,legacy_id');
    inserted[table].forEach(row => built.maps[table].set(String(row.legacy_id), row.id));
  }
  const defaultWalletId = built.maps.wallets.get(String(cfg.defaultWalletId || '')) || inserted.wallets[0]?.id || null;
  const { error: workspaceError } = await client.from('workspaces').update({
    base_currency: cfg.currency || 'IQD',
    default_wallet_id: defaultWalletId,
    app_settings: cfg,
  }).eq('id', workspaceId);
  if (workspaceError) throw new Error(`workspaces: ${workspaceError.message}`);

  const commitmentRows = withWorkspace(built.rows.commitments).map(row => {
    const source = normalized.data.commitments.find(item => safeLegacyId(item.id, '') === row.legacy_id) || {};
    const linkedId = source.linkedType === 'goal'
      ? built.maps.goals.get(String(source.linkedId || '')) || null
      : ['debt', 'receivable'].includes(source.linkedType)
        ? built.maps.debts.get(String(source.linkedId || '')) || null
        : null;
    if (row.linked_type !== 'none' && !linkedId) {
      built.warnings.push(`Commitment ${row.legacy_id} referenced a missing tracker; the normalized link was cleared.`);
    }
    return {
      ...row,
      category_id: built.maps.categories.get(String(source.cat || '')) || null,
      wallet_id: built.maps.wallets.get(String(source.walletId || '')) || defaultWalletId,
      linked_type: linkedId ? row.linked_type : 'none',
      linked_id: linkedId,
    };
  });
  inserted.commitments = await upsertRows(client, 'commitments', commitmentRows, 'workspace_id,legacy_id');
  inserted.commitments.forEach(row => built.maps.commitments.set(String(row.legacy_id), row.id));

  const transactionRows = withWorkspace(built.rows.transactions).map(row => {
    const source = normalized.data.trans.find(item => safeLegacyId(item.id, '') === row.legacy_id) || {};
    return {
      ...row,
      wallet_id: source.kind === 'transfer'
        ? null
        : built.maps.wallets.get(String(source.walletId || '')) || defaultWalletId,
      from_wallet_id: built.maps.wallets.get(String(source.fromWalletId || '')) || null,
      to_wallet_id: built.maps.wallets.get(String(source.toWalletId || '')) || null,
      category_id: built.maps.categories.get(String(source.cat || '')) || null,
      debt_id: built.maps.debts.get(String(source.debtId || '')) || null,
      goal_id: built.maps.goals.get(String(source.goalId || '')) || null,
      commitment_id: built.maps.commitments.get(String(source.commitmentId || '')) || null,
    };
  });
  inserted.transactions = await upsertRows(client, 'transactions', transactionRows, 'workspace_id,legacy_id');
  inserted.transactions.forEach(row => built.maps.transactions.set(String(row.legacy_id), row.id));

  const transactionBySourcePayment = new Map();
  normalized.data.trans.forEach(source => {
    const target = built.maps.transactions.get(String(safeLegacyId(source.id, '')));
    if (target && source.paymentId) transactionBySourcePayment.set(String(source.paymentId), target);
    if (target && source.savingId) transactionBySourcePayment.set(String(source.savingId), target);
  });
  const debtPaymentRows = built.rows.debt_payments.map(row => ({
    workspace_id: workspaceId,
    legacy_id: row.legacy_id,
    debt_id: built.maps.debts.get(String(row.debtLegacyId)),
    amount: row.amount,
    paid_on: row.paid_on,
    transaction_id: transactionBySourcePayment.get(String(row.legacy_id)) || null,
  })).filter(row => row.debt_id);
  inserted.debt_payments = await upsertRows(client, 'debt_payments', debtPaymentRows, 'debt_id,legacy_id');

  const goalSavingRows = built.rows.goal_savings.map(row => ({
    legacy_id: row.legacy_id,
    goal_id: built.maps.goals.get(String(row.goalLegacyId)),
    amount: row.amount,
    saved_on: row.saved_on,
    transaction_id: transactionBySourcePayment.get(String(row.legacy_id)) || null,
  })).filter(row => row.goal_id);
  inserted.goal_savings = [];
  for (const batch of chunks(goalSavingRows)) {
    if (!batch.length) continue;
    const { data, error } = await client.from('goal_savings').upsert(batch, { onConflict: 'goal_id,legacy_id' }).select();
    if (error) throw new Error(`goal_savings: ${error.message}`);
    inserted.goal_savings.push(...(data || []));
  }

  const tagMap = new Map(inserted.tags.map(row => [String(row.legacy_id), row.id]));
  const transactionTags = [];
  normalized.data.trans.forEach(source => {
    const transactionId = built.maps.transactions.get(String(safeLegacyId(source.id, '')));
    if (!transactionId) return;
    getTagValues(source).forEach(value => {
      const tagId = tagMap.get(`tag:${slug(value)}`);
      if (tagId) transactionTags.push({ transaction_id: transactionId, tag_id: tagId });
    });
  });
  inserted.transaction_tags = await upsertRows(client, 'transaction_tags', transactionTags, 'transaction_id,tag_id');
  return { workspace, built, inserted };
};

const buildTargetReport = async (client, workspaceId) => {
  const [categories, wallets, debts, goals, commitments, transactions, tags] = await Promise.all([
    fetchAll(client, 'categories', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'wallets', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'debts', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'goals', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'commitments', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'transactions', '*', { workspace_id: workspaceId }),
    fetchAll(client, 'tags', '*', { workspace_id: workspaceId }),
  ]);
  const [debtPayments, goalSavings, transactionTags] = await Promise.all([
    fetchByIds(client, 'debt_payments', 'debt_id', debts.map(item => item.id)),
    fetchByIds(client, 'goal_savings', 'goal_id', goals.map(item => item.id)),
    fetchByIds(client, 'transaction_tags', 'transaction_id', transactions.map(item => item.id)),
  ]);
  const balances = new Map(wallets.map(wallet => [wallet.id, number(wallet.opening_balance)]));
  let income = 0;
  let expense = 0;
  let displayNet = 0;
  let transfers = 0;
  let allocations = 0;
  transactions.forEach(tx => {
    if (tx.kind === 'transfer') {
      const amount = positive(tx.transfer_amount);
      transfers += amount;
      if (balances.has(tx.from_wallet_id)) balances.set(tx.from_wallet_id, balances.get(tx.from_wallet_id) - amount);
      if (balances.has(tx.to_wallet_id)) balances.set(tx.to_wallet_id, balances.get(tx.to_wallet_id) + amount);
      return;
    }
    const amount = number(tx.amount);
    if (balances.has(tx.wallet_id)) balances.set(tx.wallet_id, balances.get(tx.wallet_id) + amount);
    if (tx.flow_type === 'income') income += positive(amount);
    if (['expense', 'commitment_payment', 'debt_payment'].includes(tx.flow_type)) expense += positive(amount);
    if (tx.flow_type === 'goal_allocation') {
      allocations += positive(tx.allocation_amount);
      displayNet -= positive(tx.allocation_amount);
    } else displayNet += amount;
  });
  return {
    source: 'normalized_staging',
    counts: {
      categories: categories.length,
      wallets: wallets.length,
      debts: debts.length,
      goals: goals.length,
      commitments: commitments.length,
      transactions: transactions.length,
      debtPayments: debtPayments.length,
      goalSavings: goalSavings.length,
      tags: tags.length,
      transactionTags: transactionTags.length,
    },
    totals: {
      transactionAmount: income - expense,
      income,
      expense,
      displayNet,
      transfers,
      allocations,
      walletBalances: Object.fromEntries([...balances.entries()].map(([id, value]) => {
        const wallet = wallets.find(item => item.id === id);
        return [wallet?.legacy_id || id, number(value)];
      })),
      debtTotal: debts.reduce((sum, debt) => sum + positive(debt.total_amount), 0),
      debtPaid: debts.reduce((sum, debt) => sum + positive(debt.archived_paid), 0) + debtPayments.reduce((sum, payment) => sum + positive(payment.amount), 0),
      goalTarget: goals.reduce((sum, goal) => sum + positive(goal.target_amount), 0),
      goalSaved: goals.reduce((sum, goal) => sum + positive(goal.archived_saved), 0) + goalSavings.reduce((sum, saving) => sum + positive(saving.amount), 0),
      commitmentAmount: commitments.reduce((sum, item) => sum + positive(item.amount), 0),
    },
  };
};

const writeReport = (file, report) => {
  const target = path.resolve(process.cwd(), file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return target;
};

const run = async argv => {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input || !args.userId) throw new Error('--input and --user-id are required.');
  const normalized = normalizeSource(readJson(args.input));
  const sourceReport = buildSourceReport(normalized);
  const built = buildRows(normalized);
  const plannedReport = buildPlannedRowsReport(normalized, built);
  const plannedComparison = compareReports(sourceReport, plannedReport);
  const report = {
    tool: 'myfi-normalized-backfill',
    mode: args.apply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    input: path.resolve(process.cwd(), args.input),
    userId: args.userId,
    warnings: built.warnings,
    source: sourceReport,
    planned: plannedReport,
  };
  if (!args.apply) {
    report.comparison = plannedComparison;
    report.reconciliation = summarizeComparison(sourceReport, plannedReport, plannedComparison);
    report.plan = { tables: TABLES, writes: 'none', note: 'Dry-run does not contact Supabase; it validates generated normalized rows against the legacy JSON.' };
    if (args.report) writeReport(args.report, report);
    console.log(JSON.stringify(report, null, 2));
    if (!report.comparison.passed) process.exitCode = 2;
    return report;
  }
  const url = args.url || process.env.SUPABASE_TEST_URL;
  const serviceKey = args.serviceKey || process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Apply requires SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY.');
  const createClient = requireSupabase();
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const applied = await applyBackfill(client, args, normalized);
  report.workspaceId = applied.workspace.id;
  report.appliedCounts = Object.fromEntries(Object.entries(applied.inserted).map(([table, rows]) => [table, rows.length]));
  report.warnings = applied.built.warnings;
  report.target = await buildTargetReport(client, applied.workspace.id);
  report.comparison = compareReports(sourceReport, report.target);
  report.reconciliation = summarizeComparison(sourceReport, report.target, report.comparison);
  if (args.report) writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.comparison.passed) process.exitCode = 2;
  return report;
};

if (require.main === module) {
  run(process.argv.slice(2)).catch(error => {
    console.error(`Backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPlannedRowsReport,
  buildSourceReport,
  buildRows,
  compareReports,
  normalizeSource,
  parseArgs,
  run,
};
