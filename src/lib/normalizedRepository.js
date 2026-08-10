const PAGE_SIZE = 500;

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const positive = value => Math.abs(number(value));
const legacyId = row => String(row?.legacy_id || row?.id || '');
const toTimestamp = value => {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mapById = rows => new Map((rows || []).map(row => [row.id, legacyId(row)]));
const sum = (rows, select) => (rows || []).reduce((total, row) => total + number(select(row)), 0);

const fetchPages = async (client, table, configure) => {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from(table).select('*').range(offset, offset + PAGE_SIZE - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const fetchWorkspaceRows = (client, table, workspaceId, removedColumn) => fetchPages(
  client,
  table,
  query => {
    let next = query.eq('workspace_id', workspaceId);
    if (removedColumn) next = next.is(removedColumn, null);
    return next.order('created_at', { ascending: true });
  },
);

const fetchChildren = async (client, table, parentColumn, parentIds) => {
  if (!parentIds.length) return [];
  const rows = [];
  for (let index = 0; index < parentIds.length; index += PAGE_SIZE) {
    const ids = parentIds.slice(index, index + PAGE_SIZE);
    const batch = await fetchPages(client, table, query => query.in(parentColumn, ids).order('created_at', { ascending: true }));
    rows.push(...batch);
  }
  return rows;
};

const groupBy = (rows, key) => {
  const grouped = new Map();
  (rows || []).forEach(row => {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  });
  return grouped;
};

export const normalizedRowsToSnapshot = (rows = {}, fallbackCfg = {}, notif = {}) => {
  const workspace = rows.workspace || {};
  const profile = rows.profile || {};
  const categories = rows.categories || [];
  const wallets = rows.wallets || [];
  const debts = rows.debts || [];
  const goals = rows.goals || [];
  const commitments = rows.commitments || [];
  const transactions = rows.transactions || [];
  const tags = rows.tags || [];
  const categoryIds = mapById(categories);
  const walletIds = mapById(wallets);
  const debtIds = mapById(debts);
  const goalIds = mapById(goals);
  const commitmentIds = mapById(commitments);
  const tagNames = new Map(tags.map(tag => [tag.id, tag.name]));
  const paymentsByDebt = groupBy(rows.debtPayments, 'debt_id');
  const savingsByGoal = groupBy(rows.goalSavings, 'goal_id');
  const tagLinksByTransaction = groupBy(rows.transactionTags, 'transaction_id');
  const storedCfg = workspace.app_settings && typeof workspace.app_settings === 'object'
    ? workspace.app_settings
    : {};

  const appWallets = wallets.map(wallet => ({
    id: legacyId(wallet),
    name: wallet.name,
    nameEn: wallet.name_en || wallet.name,
    type: wallet.wallet_type || 'other',
    currency: wallet.currency_code || workspace.base_currency || fallbackCfg.currency || 'IQD',
    openingBalance: number(wallet.opening_balance),
    scope: wallet.scope || 'personal',
    sortOrder: number(wallet.sort_order),
  }));
  const preferredLegacyWalletId = storedCfg.defaultWalletId || fallbackCfg.defaultWalletId;
  const resolvedDefaultWalletId = walletIds.get(workspace.default_wallet_id)
    || (appWallets.some(wallet => wallet.id === preferredLegacyWalletId) ? preferredLegacyWalletId : null)
    || appWallets[0]?.id
    || null;

  const appDebts = debts.map(debt => {
    const payments = (paymentsByDebt.get(debt.id) || []).map(payment => ({
      id: legacyId(payment),
      amt: positive(payment.amount),
      date: payment.paid_on,
    }));
    const archivedPaid = positive(debt.archived_paid);
    return {
      id: legacyId(debt),
      name: debt.name,
      direction: debt.direction === 'receivable' ? 'receivable' : 'owed',
      total: positive(debt.total_amount),
      archivedPaid,
      payments,
      paid: archivedPaid + sum(payments, payment => payment.amt),
      status: debt.status === 'settled' ? 'settled' : 'active',
      archivedAt: debt.archived_at || null,
      scope: debt.scope || 'personal',
      createdAt: debt.created_on || debt.created_at,
    };
  });

  const appGoals = goals.map(goal => {
    const savings = (savingsByGoal.get(goal.id) || []).map(saving => ({
      id: legacyId(saving),
      amt: positive(saving.amount),
      date: saving.saved_on,
    }));
    const archivedSaved = positive(goal.archived_saved);
    return {
      id: legacyId(goal),
      name: goal.name,
      target: positive(goal.target_amount),
      archivedSaved,
      savings,
      cur: archivedSaved + sum(savings, saving => saving.amt),
      status: goal.status === 'completed' ? 'settled' : 'active',
      archivedAt: goal.archived_at || null,
      archivedFromActive: goal.archived_from_active == null ? undefined : goal.archived_from_active,
      scope: goal.scope || 'personal',
      createdAt: goal.created_on || goal.created_at,
    };
  });

  const appCommitments = commitments.map(item => {
    const linkedMap = item.linked_type === 'goal' ? goalIds : debtIds;
    return {
      id: legacyId(item),
      name: item.name,
      amt: positive(item.amount),
      day: number(item.due_day, 1),
      firstDueISO: item.first_due_on || null,
      repeatMonthly: item.repeat_monthly !== false,
      active: item.active !== false,
      scope: item.scope || 'personal',
      cat: categoryIds.get(item.category_id) || null,
      walletId: walletIds.get(item.wallet_id) || null,
      linkedType: item.linked_type || 'none',
      linkedId: linkedMap.get(item.linked_id) || null,
      lastPaidMonth: item.last_paid_month || null,
      deferredUntilISO: item.deferred_until_on || null,
      deferredCycleMonth: item.deferred_cycle_month || null,
      archivedAt: item.archived_at || null,
      archivedFromActive: item.archived_from_active == null ? undefined : item.archived_from_active,
    };
  });

  const appTransactions = transactions.map(tx => {
    const metadata = tx.metadata?.legacy || {};
    const linkedTags = (tagLinksByTransaction.get(tx.id) || [])
      .map(link => tagNames.get(link.tag_id))
      .filter(Boolean);
    const flowType = tx.kind === 'transfer' ? 'transfer' : (tx.flow_type || (number(tx.amount) >= 0 ? 'income' : 'expense'));
    return {
      id: legacyId(tx),
      title: tx.title,
      note: tx.note || '',
      amt: number(tx.amount),
      allocationAmount: tx.allocation_amount == null ? undefined : positive(tx.allocation_amount),
      transferAmount: tx.transfer_amount == null ? undefined : positive(tx.transfer_amount),
      dateISO: tx.date_on,
      ts: toTimestamp(tx.occurred_at || tx.created_at),
      kind: tx.kind === 'transfer' ? 'transfer' : undefined,
      flowType,
      scope: tx.scope || 'personal',
      fromScope: tx.kind === 'transfer' ? (tx.from_scope || tx.scope || 'personal') : undefined,
      toScope: tx.kind === 'transfer' ? (tx.to_scope || tx.scope || 'personal') : undefined,
      walletId: walletIds.get(tx.wallet_id) || null,
      fromWalletId: walletIds.get(tx.from_wallet_id) || null,
      toWalletId: walletIds.get(tx.to_wallet_id) || null,
      cat: categoryIds.get(tx.category_id) || null,
      debtId: debtIds.get(tx.debt_id) || null,
      goalId: goalIds.get(tx.goal_id) || null,
      commitmentId: commitmentIds.get(tx.commitment_id) || null,
      recurringGroupId: tx.recurring_group_id || null,
      recurring: metadata.recurring === true,
      commitmentMonth: tx.commitment_month || null,
      transactionTag: metadata.transactionTag || linkedTags[0] || 'none',
      tags: linkedTags,
      paymentId: metadata.paymentId || null,
      savingId: metadata.savingId || null,
      isDebtPayment: metadata.isDebtPayment === true || ['debt_payment', 'receivable_collection'].includes(flowType),
      isGoalSaving: metadata.isGoalSaving === true || flowType === 'goal_allocation',
      isCommitmentPayment: metadata.isCommitmentPayment === true || flowType === 'commitment_payment',
    };
  });

  return {
    v: 7,
    data: {
      trans: appTransactions,
      debts: appDebts,
      goals: appGoals,
      wallets: appWallets,
      commitments: appCommitments,
    },
    cats: categories.map(category => ({
      id: legacyId(category),
      label: category.name,
      labelEn: category.name_en || category.name,
      icon: category.icon,
      color: category.color,
      sortOrder: number(category.sort_order),
    })),
    cfg: {
      ...fallbackCfg,
      ...storedCfg,
      name: profile.display_name || storedCfg.name || fallbackCfg.name,
      displayName: profile.display_name || storedCfg.displayName || fallbackCfg.displayName,
      username: profile.username || storedCfg.username || fallbackCfg.username,
      phone: profile.phone || storedCfg.phone || fallbackCfg.phone,
      country: profile.country_code || storedCfg.country || fallbackCfg.country,
      lang: profile.language || storedCfg.lang || fallbackCfg.lang,
      currency: workspace.base_currency || profile.default_currency || storedCfg.currency || fallbackCfg.currency || 'IQD',
      profileType: storedCfg.profileType || (workspace.kind === 'business' ? 'business' : fallbackCfg.profileType),
      defaultWalletId: resolvedDefaultWalletId,
    },
    notif,
    updatedAt: workspace.updated_at || null,
    lastSyncedAt: workspace.updated_at || null,
    cloudRevision: 0,
    dirty: false,
    normalized: { workspaceId: workspace.id, readOnly: true },
  };
};

export const buildSnapshotSignature = (snapshot = {}) => {
  const data = snapshot.data || snapshot;
  const cfg = snapshot.cfg || data.cfg || {};
  const wallets = data.wallets || [];
  const transactions = data.trans || [];
  const balances = new Map(wallets.map(wallet => [wallet.id, number(wallet.openingBalance)]));
  const defaultWalletId = cfg.defaultWalletId || wallets[0]?.id;
  transactions.forEach(tx => {
    if (tx.kind === 'transfer') {
      const amount = positive(tx.transferAmount);
      if (balances.has(tx.fromWalletId)) balances.set(tx.fromWalletId, balances.get(tx.fromWalletId) - amount);
      if (balances.has(tx.toWalletId)) balances.set(tx.toWalletId, balances.get(tx.toWalletId) + amount);
      return;
    }
    const walletId = balances.has(tx.walletId) ? tx.walletId : defaultWalletId;
    if (balances.has(walletId)) balances.set(walletId, balances.get(walletId) + number(tx.amt));
  });
  return {
    counts: {
      categories: (snapshot.cats || data.cats || []).length,
      wallets: wallets.length,
      debts: (data.debts || []).length,
      goals: (data.goals || []).length,
      commitments: (data.commitments || []).length,
      transactions: transactions.length,
      debtPayments: sum(data.debts, debt => (debt.payments || []).length),
      goalSavings: sum(data.goals, goal => (goal.savings || []).length),
    },
    totals: {
      transactionAmount: sum(transactions, tx => tx.amt),
      walletBalances: Object.fromEntries([...balances.entries()]),
      debtTotal: sum(data.debts, debt => positive(debt.total)),
      debtPaid: sum(data.debts, debt => positive(debt.archivedPaid) + sum(debt.payments, payment => positive(payment.amt))),
      goalTarget: sum(data.goals, goal => positive(goal.target)),
      goalSaved: sum(data.goals, goal => positive(goal.archivedSaved) + sum(goal.savings, saving => positive(saving.amt))),
      commitmentAmount: sum(data.commitments, item => positive(item.amt)),
    },
  };
};

export const compareSnapshotSignatures = (source, target) => {
  const differences = [];
  const compare = (field, left, right) => {
    const delta = Math.round((number(left) - number(right)) * 10000) / 10000;
    if (delta !== 0) differences.push({ field, source: number(left), target: number(right), delta });
  };
  Object.keys(source.counts || {}).forEach(key => compare(`counts.${key}`, source.counts[key], target.counts?.[key]));
  Object.keys(source.totals || {}).filter(key => key !== 'walletBalances')
    .forEach(key => compare(`totals.${key}`, source.totals[key], target.totals?.[key]));
  const sourceBalances = source.totals?.walletBalances || {};
  const targetBalances = target.totals?.walletBalances || {};
  [...new Set([...Object.keys(sourceBalances), ...Object.keys(targetBalances)])]
    .forEach(id => compare(`totals.walletBalances.${id}`, sourceBalances[id], targetBalances[id]));
  return { passed: differences.length === 0, differences };
};

export const compareSnapshots = (source, target) => compareSnapshotSignatures(
  buildSnapshotSignature(source),
  buildSnapshotSignature(target),
);

export const loadNormalizedSnapshot = async ({ client, userId, workspaceId, fallbackCfg = {}, notif = {} }) => {
  if (!client || !userId) throw new Error('normalized_read_requires_authenticated_client');
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (profileError) throw new Error(`profiles: ${profileError.message}`);

  let workspaceQuery = client.from('workspaces').select('*').is('archived_at', null);
  if (workspaceId) workspaceQuery = workspaceQuery.eq('id', workspaceId);
  else workspaceQuery = workspaceQuery.order('created_at', { ascending: true }).limit(1);
  const { data: workspace, error: workspaceError } = await workspaceQuery.maybeSingle();
  if (workspaceError) throw new Error(`workspaces: ${workspaceError.message}`);
  if (!workspace) throw new Error('normalized_workspace_not_found');

  const [categories, wallets, debts, goals, commitments, transactions, tags] = await Promise.all([
    fetchWorkspaceRows(client, 'categories', workspace.id, 'archived_at'),
    fetchWorkspaceRows(client, 'wallets', workspace.id, 'archived_at'),
    fetchWorkspaceRows(client, 'debts', workspace.id),
    fetchWorkspaceRows(client, 'goals', workspace.id),
    fetchWorkspaceRows(client, 'commitments', workspace.id),
    fetchWorkspaceRows(client, 'transactions', workspace.id, 'deleted_at'),
    fetchWorkspaceRows(client, 'tags', workspace.id, 'archived_at'),
  ]);
  const [debtPayments, goalSavings, transactionTags] = await Promise.all([
    fetchChildren(client, 'debt_payments', 'debt_id', debts.map(item => item.id)),
    fetchChildren(client, 'goal_savings', 'goal_id', goals.map(item => item.id)),
    fetchChildren(client, 'transaction_tags', 'transaction_id', transactions.map(item => item.id)),
  ]);
  return normalizedRowsToSnapshot({
    profile,
    workspace,
    categories,
    wallets,
    debts,
    goals,
    commitments,
    transactions,
    tags,
    debtPayments,
    goalSavings,
    transactionTags,
  }, fallbackCfg, notif);
};
