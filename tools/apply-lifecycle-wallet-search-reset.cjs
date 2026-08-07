const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const pkgRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const write = (rel, text) => {
  const target = path.join(repo, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
  console.log(`Updated ${rel}`);
};
const copy = (fromRel, toRel = fromRel) => {
  const src = path.join(pkgRoot, fromRel);
  const dst = path.join(repo, toRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`Added ${toRel}`);
};
const replaceOnce = (text, from, to, label) => {
  if (text.includes(to)) return text; // idempotent
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
};
const replaceRegexOnce = (text, re, to, label) => {
  if (typeof to === 'string' && text.includes(to)) return text;
  const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one regex match, found ${matches.length}`);
  return text.replace(re, to);
};

copy('src/lib/trackerLifecycle.js');

// 1) History search: keep the TextInput mounted by using a stable component type.
{
  const rel = 'src/screens/HistoryScreen.js';
  let t = read(rel);
  const anchor = "const txTime = (item = {}) => item.ts || (item.dateISO ? new Date(`${item.dateISO}T12:00:00`).getTime() : 0);\n";
  const component = `${anchor}\nconst HistoryListHeader = ({\n  th, rowDir, align, writingDirection, lang, L, T, search, setSearch,\n  selection, filteredCount, activeFilters, openFilters,\n}) => (\n  <>\n    <MultiSelectBar\n      th={th}\n      lang={lang}\n      active={selection.selecting}\n      count={selection.selectedCount}\n      total={filteredCount}\n      allSelected={selection.allSelected}\n      onStart={selection.start}\n      onToggleAll={selection.toggleAll}\n      onDelete={selection.onDelete}\n      onCancel={selection.cancel}\n    />\n    <View style={[s.searchBox, { backgroundColor: th.input, borderColor: search ? th.primary : th.border, flexDirection: rowDir }]}>\n      <Ionicons name=\"search\" size={16} color={th.sub} />\n      <TextInput\n        value={search}\n        onChangeText={setSearch}\n        placeholder={L.searchPlaceholder}\n        placeholderTextColor={th.sub}\n        style={{ flex: 1, color: th.text, fontSize: 14, paddingVertical: 10, marginHorizontal: 8, textAlign: align, writingDirection }}\n      />\n      {!!search && (\n        <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>\n          <Ionicons name=\"backspace-outline\" size={16} color={th.sub} />\n        </TouchableOpacity>\n      )}\n    </View>\n\n    <TouchableOpacity\n      onPress={openFilters}\n      style={[s.filterBtn, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}\n    >\n      <Ionicons name=\"options-outline\" size={17} color={th.sub} />\n      <View style={{ flex: 1 }}>\n        <Text style={{ color: th.text, ...weight('900'), fontSize: 13, textAlign: align, writingDirection }}>\n          {L.filterTitle}{activeFilters ? \` · \${activeFilters}\` : ''}\n        </Text>\n        <Text style={{ color: th.sub, fontSize: 11, lineHeight: 17, textAlign: align, writingDirection }}>\n          {filteredCount} {T.entries}\n        </Text>\n      </View>\n      <Ionicons name={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />\n    </TouchableOpacity>\n  </>\n);\n`;
  if (!t.includes('const HistoryListHeader =')) {
    t = replaceOnce(t, anchor, component, 'History header component insertion');
  }
  const oldHeaderRe = /\n  const renderHeader = \(\) => \(\n    <>[\s\S]*?\n    <\/>(?:\n  \);)/;
  if (oldHeaderRe.test(t)) t = t.replace(oldHeaderRe, '');
  t = replaceOnce(
    t,
    "        ListHeaderComponent={renderHeader}\n",
    `        ListHeaderComponent={(\n          <HistoryListHeader\n            th={th}\n            rowDir={rowDir}\n            align={align}\n            writingDirection={writingDirection}\n            lang={cfg.lang}\n            L={L}\n            T={T}\n            search={search}\n            setSearch={setSearch}\n            selection={{ ...selection, onDelete: confirmDeleteSelected }}\n            filteredCount={filtered.length}\n            activeFilters={activeFilters}\n            openFilters={openFilters}\n          />\n        )}\n`,
    'History stable header usage',
  );
  write(rel, t);
}

// 2) Default wallet: ordinary entries always start from cfg.defaultWalletId.
{
  const rel = 'src/components/AddTransModal.js';
  let t = read(rel);
  const from = `      const initialCommitment = initialCommitmentId\n        ? availableCommitments.find(item => item.id === initialCommitmentId)\n        : null;\n      const defaultCommitment = initialCommitment || availableCommitments[0] || null;\n      setType(cleanInitialMode);\n      setSelDebt(initialDebtId || availableDebts[0]?.id || null);\n      setSelGoal(initialGoalId || availableGoals[0]?.id || null);\n      setSelCommitment(defaultCommitment?.id || null);\n      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());\n      setCategoryTouched(false);\n      setWalletId(defaultCommitment?.walletId || defaultWalletId);\n`;
  const to = `      const initialCommitment = initialCommitmentId\n        ? availableCommitments.find(item => item.id === initialCommitmentId)\n        : null;\n      const launchingCommitment = cleanInitialMode === 'commitment' || !!initialCommitmentId;\n      const defaultCommitment = initialCommitment || (launchingCommitment ? availableCommitments[0] : null);\n      setType(cleanInitialMode);\n      setSelDebt(initialDebtId || availableDebts[0]?.id || null);\n      setSelGoal(initialGoalId || availableGoals[0]?.id || null);\n      setSelCommitment(defaultCommitment?.id || null);\n      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());\n      setCategoryTouched(false);\n      setWalletId(launchingCommitment ? (defaultCommitment?.walletId || defaultWalletId) : defaultWalletId);\n`;
  t = replaceOnce(t, from, to, 'AddTransModal default wallet');
  write(rel, t);
}

// 3) Tracker lifecycle: 7-day grace, ended section, safe archival of completed trackers.
{
  const rel = 'src/screens/TrackersLabScreen.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';\n",
    "import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';\nimport { isSafelyArchivableTracker, isTrackerPastGracePeriod, latestMovementDate } from '../lib/trackerLifecycle';\n",
    'Tracker lifecycle import',
  );
  t = replaceOnce(t, "    monthly: ar ? 'التزامات' : 'Commitments',\n", "    monthly: ar ? 'التزامات' : 'Commitments',\n    ended: ar ? 'المنتهية' : 'Ended',\n    archiveTracker: ar ? 'إزالة من المتابعات' : 'Remove from trackers',\n    archiveTrackerBody: ar ? 'ستختفي المتابعة مع بقاء الحركات المالية في السجل والتقارير.' : 'The tracker will be hidden while its financial history stays in reports and history.',\n", 'Tracker copy ended');
  t = replaceOnce(
    t,
    `    debts, goals, commitments, cfg,\n    editDebt, deleteDebt, editDebtPayment, deleteDebtPayment,\n    editGoal, deleteGoal, editGoalSaving, deleteGoalSaving, releaseGoalSavings,\n    deferCommitment, clearCommitmentDeferral, editCommitment, deleteCommitment,\n    deleteTrackersMany, deleteTrackerPaymentsMany,\n`,
    `    trans, debts, goals, commitments, cfg,\n    editDebt, deleteDebt, editDebtPayment, deleteDebtPayment,\n    editGoal, deleteGoal, editGoalSaving, deleteGoalSaving, releaseGoalSavings,\n    deferCommitment, clearCommitmentDeferral, editCommitment, deleteCommitment,\n    archiveTracker, archiveTrackersMany, deleteTrackersMany, deleteTrackerPaymentsMany,\n`,
    'Tracker store destructuring',
  );
  t = replaceOnce(t, "  const scopedDebts = filterByActiveScope(debts, cfg);\n  const scopedGoals = filterByActiveScope(goals, cfg);\n  const scopedCommitments = filterByActiveScope(commitments, cfg).filter(item => {\n", "  const scopedDebts = filterByActiveScope(debts, cfg).filter(item => !item.archivedAt);\n  const scopedGoals = filterByActiveScope(goals, cfg).filter(item => !item.archivedAt);\n  const scopedCommitments = filterByActiveScope(commitments, cfg).filter(item => !item.archivedAt).filter(item => {\n", 'Tracker archived filtering');

  t = replaceOnce(
    t,
    "      const plan = planFor(receivable ? 'receivable' : 'debt', item.id);\n      return {\n",
    "      const plan = planFor(receivable ? 'receivable' : 'debt', item.id);\n      const status = remaining <= 0 ? 'done' : 'active';\n      const completedAt = status === 'done' ? latestMovementDate(item.payments, item.createdAt) : null;\n      const ended = status === 'done' && isTrackerPastGracePeriod(completedAt);\n      return {\n",
    'Debt tracker lifecycle meta',
  );
  t = replaceOnce(t, "        status: remaining <= 0 ? 'done' : 'active',\n        date: item.createdAt,\n", "        status,\n        completedAt,\n        ended,\n        date: item.createdAt,\n", 'Debt lifecycle fields');

  t = replaceOnce(
    t,
    "      const total = Number(item.target || 0);\n      const doneValue = Number(item.cur || 0);\n      const remaining = Math.max(0, total - doneValue);\n      const plan = planFor('goal', item.id);\n      return {\n",
    "      const total = Number(item.target || 0);\n      const terminal = ['settled', 'released'].includes(item.status);\n      const rawDoneValue = terminal ? Number(item.settledAmount || item.cur || 0) : Number(item.cur || 0);\n      const doneValue = Math.min(total, rawDoneValue);\n      const remaining = terminal ? 0 : Math.max(0, total - doneValue);\n      const plan = planFor('goal', item.id);\n      const status = terminal || remaining <= 0 ? 'done' : 'active';\n      const completedAt = terminal ? (item.settledAt || latestMovementDate(item.savings, item.createdAt)) : null;\n      const ended = terminal && isTrackerPastGracePeriod(completedAt);\n      return {\n",
    'Goal tracker lifecycle meta',
  );
  t = replaceOnce(t, "        status: item.status === 'settled' || remaining <= 0 ? 'done' : 'active',\n        date: item.createdAt,\n", "        status,\n        completedAt,\n        ended,\n        date: item.createdAt,\n", 'Goal lifecycle fields');

  t = replaceOnce(
    t,
    "        const paidThisCycle = item.lastPaidMonth === monthKey(dueISO);\n        const amount = Number(item.amt || 0);\n        return {\n",
    "        const paidThisCycle = item.lastPaidMonth === monthKey(dueISO);\n        const amount = Number(item.amt || 0);\n        const oneTimeDone = item.repeatMonthly === false && !!item.lastPaidMonth;\n        const paymentRows = trans.filter(tx => tx.isCommitmentPayment && tx.commitmentId === item.id);\n        const completedAt = oneTimeDone ? latestMovementDate(paymentRows, item.firstDueISO || null) : null;\n        const ended = oneTimeDone && isTrackerPastGracePeriod(completedAt);\n        const status = oneTimeDone ? 'done' : item.active === false ? 'paused' : paidThisCycle ? 'paidMonth' : 'active';\n        return {\n",
    'Commitment lifecycle meta',
  );
  t = replaceOnce(
    t,
    "          doneValue: paidThisCycle ? amount : 0,\n          remaining: amount,\n          progress: paidThisCycle ? 100 : 0,\n",
    "          doneValue: oneTimeDone || paidThisCycle ? amount : 0,\n          remaining: oneTimeDone ? 0 : amount,\n          progress: oneTimeDone || paidThisCycle ? 100 : 0,\n",
    'One-time commitment completed amounts',
  );
  t = replaceOnce(t, "          status: item.active === false ? 'paused' : paidThisCycle ? 'paidMonth' : 'active',\n          date: dueISO,\n", "          status,\n          completedAt,\n          ended,\n          date: dueISO,\n", 'Commitment lifecycle fields');
  t = replaceOnce(
    t,
    "  }, [debts, goals, commitments, cfg.activeScope, cfg.profileType, th, modules.debtsReceivable, modules.debtsOwed, modules.goals, modules.commitments]);\n",
    "  }, [trans, debts, goals, commitments, cfg.activeScope, cfg.profileType, th, modules.debtsReceivable, modules.debtsOwed, modules.goals, modules.commitments]);\n",
    'Tracker lifecycle transaction dependency',
  );

  const oldFilters = `  const filters = [\n    { key: 'all', label: T.all, count: trackers.length },\n    modules.debtsOwed ? { key: 'owed', label: T.owed, count: trackers.filter(item => item.kind === 'owed').length } : null,\n    modules.debtsReceivable ? { key: 'receivable', label: T.receivable, count: trackers.filter(item => item.kind === 'receivable').length } : null,\n    modules.goals ? { key: 'saving', label: T.saving, count: trackers.filter(item => item.kind === 'saving').length } : null,\n    modules.commitments ? { key: 'monthly', label: T.monthly, count: trackers.filter(item => item.kind === 'monthly').length } : null,\n  ].filter(Boolean);\n`;
  const newFilters = `  const currentTrackers = trackers.filter(item => !item.ended);\n  const endedTrackers = trackers.filter(item => item.ended);\n  const filters = [\n    { key: 'all', label: T.all, count: currentTrackers.length },\n    modules.debtsOwed ? { key: 'owed', label: T.owed, count: currentTrackers.filter(item => item.kind === 'owed').length } : null,\n    modules.debtsReceivable ? { key: 'receivable', label: T.receivable, count: currentTrackers.filter(item => item.kind === 'receivable').length } : null,\n    modules.goals ? { key: 'saving', label: T.saving, count: currentTrackers.filter(item => item.kind === 'saving').length } : null,\n    modules.commitments ? { key: 'monthly', label: T.monthly, count: currentTrackers.filter(item => item.kind === 'monthly').length } : null,\n    endedTrackers.length ? { key: 'ended', label: T.ended, count: endedTrackers.length } : null,\n  ].filter(Boolean);\n`;
  t = replaceOnce(t, oldFilters, newFilters, 'Tracker ended filter');
  t = replaceOnce(
    t,
    "  }, [filter, modules.debtsOwed, modules.debtsReceivable, modules.goals, modules.commitments]);\n",
    "  }, [filter, endedTrackers.length, modules.debtsOwed, modules.debtsReceivable, modules.goals, modules.commitments]);\n",
    'Ended filter resets after last archived item',
  );
  t = replaceOnce(t, "  const visibleBase = filter === 'all' ? trackers : trackers.filter(item => item.kind === filter);\n", "  const visibleBase = filter === 'ended'\n    ? endedTrackers\n    : filter === 'all'\n      ? currentTrackers\n      : currentTrackers.filter(item => item.kind === filter);\n", 'Tracker visible ended');

  t = replaceOnce(
    t,
    "    const amount = Number(commitment.amt || 0);\n\n    if (commitment.active === false) {\n",
    "    const amount = Number(commitment.amt || 0);\n    const oneTimeDone = commitment.repeatMonthly === false && !!commitment.lastPaidMonth;\n\n    if (oneTimeDone) {\n      return { id: commitment.id, amount, dueISO, paidThisCycle: true, active: false, label: T.done, color: th.inc, bg: th.incBg };\n    }\n    if (commitment.active === false) {\n",
    'Linked one-time commitment displays completed, not paused',
  );

  const oldDelete = `  const confirmDeleteTracker = (item) => {\n    const body = item.plan ? \`${'${T.confirmDeleteTracker} ${T.linkedPlanDelete}'}\` : T.confirmDeleteTracker;\n    Alert.alert(T.confirmDelete, body, [\n      { text: T.cancel, style: 'cancel' },\n      {\n        text: T.deleteTracker,\n        style: 'destructive',\n        onPress: async () => {\n          if (item.kind === 'saving') await deleteGoal?.(item.sourceId);\n          else if (item.kind === 'monthly') await deleteCommitment?.(item.sourceId);\n          else await deleteDebt?.(item.sourceId);\n          if (openId === item.id) setOpenId(null);\n        },\n      },\n    ]);\n  };\n`;
  const newDelete = `  const confirmDeleteTracker = (item) => {\n    const reservedGoalNeedsRelease = item.kind === 'saving'\n      && item.source?.status === 'active'\n      && item.remaining <= 0;\n    if (reservedGoalNeedsRelease) {\n      confirmReleaseGoal(item);\n      return;\n    }\n    const archivable = isSafelyArchivableTracker(item);\n    const body = archivable\n      ? T.archiveTrackerBody\n      : (item.plan ? \`${'${T.confirmDeleteTracker} ${T.linkedPlanDelete}'}\` : T.confirmDeleteTracker);\n    Alert.alert(T.confirmDelete, body, [\n      { text: T.cancel, style: 'cancel' },\n      {\n        text: archivable ? T.archiveTracker : T.deleteTracker,\n        style: archivable ? 'default' : 'destructive',\n        onPress: async () => {\n          if (archivable) await archiveTracker?.(item.kind, item.sourceId);\n          else if (item.kind === 'saving') await deleteGoal?.(item.sourceId);\n          else if (item.kind === 'monthly') await deleteCommitment?.(item.sourceId);\n          else await deleteDebt?.(item.sourceId);\n          if (openId === item.id) setOpenId(null);\n        },\n      },\n    ]);\n  };\n`;
  t = replaceOnce(t, oldDelete, newDelete, 'Tracker safe delete/archive');

  const oldMany = `  const confirmDeleteSelectedTrackers = () => {\n    if (!selection.selectedCount) return;\n    const chosen = trackers.filter(item => selection.selected.has(item.id));\n    const hasLinkedPlan = chosen.some(item => item.plan);\n    const body = isAr\n      ? \`سيتم حذف \${chosen.length} عناصر وكل الدفعات والحركات المرتبطة بها.\`\n      : \`Delete \${chosen.length} items and all linked payments and transactions?\`;\n    Alert.alert(T.confirmDelete, hasLinkedPlan ? \`${'${body} ${T.linkedPlanDelete}'}\` : body, [\n      { text: T.cancel, style: 'cancel' },\n      {\n        text: T.deleteTracker,\n        style: 'destructive',\n        onPress: async () => {\n          await deleteTrackersMany(chosen.map(item => ({ kind: item.kind, sourceId: item.sourceId })));\n          setOpenId(null);\n          selection.cancel();\n        },\n      },\n    ]);\n  };\n`;
  const newMany = `  const confirmDeleteSelectedTrackers = () => {\n    if (!selection.selectedCount) return;\n    const chosen = trackers.filter(item => selection.selected.has(item.id));\n    const reservedGoals = chosen.filter(item => (\n      item.kind === 'saving'\n      && item.source?.status === 'active'\n      && item.remaining <= 0\n    ));\n    if (reservedGoals.length) {\n      Alert.alert(\n        T.releaseGoal,\n        isAr\n          ? 'يوجد هدف توفير مكتمل ما زال مبلغه محجوزاً. أتح المبلغ أولاً ثم أعد محاولة إزالة المتابعة.'\n          : 'A completed saving goal still has reserved funds. Make the funds available first, then remove the tracker.',\n      );\n      return;\n    }\n    const archivable = chosen.filter(isSafelyArchivableTracker);\n    const destructive = chosen.filter(item => !isSafelyArchivableTracker(item));\n    const hasLinkedPlan = destructive.some(item => item.plan);\n    const archivePart = archivable.length\n      ? (isAr\n          ? \` وإزالة \${archivable.length} متابعة منتهية مع إبقاء تاريخها المالي\`\n          : \` and hide \${archivable.length} finished tracker(s) while keeping financial history\`)\n      : '';\n    const body = destructive.length\n      ? (isAr\n          ? \`سيتم حذف \${destructive.length} متابعة نشطة وحركاتها\${archivePart}.\`\n          : \`Delete \${destructive.length} active tracker(s) with linked movements\${archivePart}.\`)\n      : (isAr\n          ? \`ستتم إزالة \${archivable.length} متابعة منتهية مع إبقاء جميع الحركات المالية في السجل والتقارير.\`\n          : \`Hide \${archivable.length} finished tracker(s) while keeping all financial history.\`);\n    Alert.alert(T.confirmDelete, hasLinkedPlan ? \`${'${body} ${T.linkedPlanDelete}'}\` : body, [\n      { text: T.cancel, style: 'cancel' },\n      {\n        text: destructive.length ? T.deleteTracker : T.archiveTracker,\n        style: destructive.length ? 'destructive' : 'default',\n        onPress: async () => {\n          if (archivable.length) {\n            await archiveTrackersMany?.(archivable.map(item => ({ kind: item.kind, sourceId: item.sourceId })));\n          }\n          if (destructive.length) {\n            await deleteTrackersMany(destructive.map(item => ({ kind: item.kind, sourceId: item.sourceId })));\n          }\n          setOpenId(null);\n          selection.cancel();\n        },\n      },\n    ]);\n  };\n`;
  t = replaceOnce(t, oldMany, newMany, 'Tracker multi archive');
  write(rel, t);
}

// 4) Releasing a completed saving goal keeps its history but stops reserving wallet funds.
{
  const rel = 'src/store/slices/trackersSlice.js';
  let t = read(rel);
  const from = `    set(s => ({\n      goals: s.goals.map(item => (\n        item.id === goalId\n          ? { ...item, savings: [], cur: 0, status: 'released', settledAt: entryDate, settledAmount: releasedAmount }\n          : item\n      )),\n      commitments: s.commitments.map(item => (\n        item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item\n      )),\n      trans: s.trans.filter(item => !(item.isGoalSaving && item.goalId === goalId)),\n    }));\n`;
  const to = `    set(s => ({\n      goals: s.goals.map(item => (\n        item.id === goalId\n          ? { ...item, savings: [], cur: 0, active: false, status: 'released', settledAt: entryDate, settledAmount: releasedAmount }\n          : item\n      )),\n      commitments: s.commitments.map(item => (\n        item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item\n      )),\n      trans: s.trans.map(item => (\n        item.isGoalSaving && item.goalId === goalId\n          ? { ...item, allocationReleased: true, allocationReleasedAt: entryDate }\n          : item\n      )),\n    }));\n`;
  t = replaceOnce(t, from, to, 'Preserve goal saving history on release');
  write(rel, t);
}

{
  const rel = 'src/lib/wallets.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "    if (!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation') return;\n",
    "    if ((!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation') || tx?.allocationReleased) return;\n",
    'Released goal allocations no longer reserve wallet funds',
  );
  write(rel, t);
}

{
  const rel = 'src/utils/calc.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "  const filtered = debts.filter(d => (\n    direction === 'receivable'\n      ? d.direction === 'receivable'\n      : d.direction !== 'receivable'\n  ));\n",
    "  const filtered = debts.filter(d => !d.archivedAt && (\n    direction === 'receivable'\n      ? d.direction === 'receivable'\n      : d.direction !== 'receivable'\n  ));\n",
    'Archived debts excluded from current summary',
  );
  t = replaceOnce(
    t,
    "export const goalSummary = (goals = []) => {\n  const target = sum(goals, g => g.target);\n  const saved = sum(goals, g => g.cur);\n  const remaining = sum(goals, g => Math.max(0, toNumber(g.target) - toNumber(g.cur)));\n",
    "export const goalSummary = (goals = []) => {\n  const activeGoals = goals.filter(g => !g.archivedAt && !['released', 'settled'].includes(g.status));\n  const target = sum(activeGoals, g => g.target);\n  const saved = sum(activeGoals, g => g.cur);\n  const remaining = sum(activeGoals, g => Math.max(0, toNumber(g.target) - toNumber(g.cur)));\n",
    'Terminal goals excluded from current summary',
  );
  t = replaceOnce(t, "    count: goals.filter(g => Math.max(0, toNumber(g.target) - toNumber(g.cur)) > 0).length,\n", "    count: activeGoals.filter(g => Math.max(0, toNumber(g.target) - toNumber(g.cur)) > 0).length,\n", 'Goal count active only');
  write(rel, t);
}

// 4b) Archived/terminal trackers stay out of current dashboard entities while transaction history remains intact.
{
  const rel = 'src/lib/modules.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "    debts: filterByActiveScope(debts, cfg).filter(item => (\n      item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed\n    )),\n",
    "    debts: filterByActiveScope(debts, cfg).filter(item => !item.archivedAt).filter(item => (\n      item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed\n    )),\n",
    'Archived debts excluded from current feature entities',
  );
  t = replaceOnce(
    t,
    "    goals: modules.goals ? filterByActiveScope(goals, cfg) : [],\n",
    "    goals: modules.goals ? filterByActiveScope(goals, cfg).filter(item => !item.archivedAt && !['released', 'settled'].includes(item.status)) : [],\n",
    'Terminal goals excluded from current feature entities',
  );
  t = replaceOnce(
    t,
    "      ? filterByActiveScope(commitments, cfg).filter(item => {\n",
    "      ? filterByActiveScope(commitments, cfg).filter(item => !item.archivedAt).filter(item => {\n",
    'Archived commitments excluded from current feature entities',
  );
  write(rel, t);
}

// 5) Store actions for hiding completed trackers while preserving transactions.
{
  const rel = 'src/store/slices/managementSlice.js';
  let t = read(rel);
  const anchor = "  deleteTrackersMany: async (items = []) => {\n";
  const insertion = `  archiveTracker: async (kind, sourceId) => {\n    if (!sourceId) return false;\n    const archivedAt = today();\n    set(s => {\n      const debtKinds = kind === 'owed' || kind === 'receivable';\n      return {\n        debts: debtKinds\n          ? s.debts.map(item => item.id === sourceId ? { ...item, archivedAt } : item)\n          : s.debts,\n        goals: kind === 'saving'\n          ? s.goals.map(item => item.id === sourceId ? { ...item, archivedAt, active: false } : item)\n          : s.goals,\n        commitments: s.commitments.map(item => {\n          if (kind === 'monthly' && item.id === sourceId) return { ...item, archivedAt, active: false };\n          if (debtKinds && (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === sourceId) {\n            return { ...item, archivedAt, active: false };\n          }\n          if (kind === 'saving' && item.linkedType === 'goal' && item.linkedId === sourceId) {\n            return { ...item, archivedAt, active: false };\n          }\n          return item;\n        }),\n      };\n    });\n    await get().saveLocal();\n    await get().syncCloud();\n    return true;\n  },\n\n  archiveTrackersMany: async (items = []) => {\n    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);\n    if (!rows.length) return false;\n    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));\n    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));\n    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));\n    const archivedAt = today();\n    set(s => ({\n      debts: s.debts.map(item => debtIds.has(item.id) ? { ...item, archivedAt } : item),\n      goals: s.goals.map(item => goalIds.has(item.id) ? { ...item, archivedAt, active: false } : item),\n      commitments: s.commitments.map(item => {\n        const selected = commitmentIds.has(item.id);\n        const debtLinked = (item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId);\n        const goalLinked = item.linkedType === 'goal' && goalIds.has(item.linkedId);\n        return selected || debtLinked || goalLinked ? { ...item, archivedAt, active: false } : item;\n      }),\n    }));\n    await get().saveLocal();\n    await get().syncCloud();\n    return true;\n  },\n\n${anchor}`;
  if (!t.includes('archiveTrackersMany: async')) t = replaceOnce(t, anchor, insertion, 'Management archive actions');
  write(rel, t);
}

// 6) Legitimate deletion of the final item must be allowed to persist an empty vault snapshot.
{
  const rel = 'src/store/slices/transactionsSlice.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    `  capLinkedAmount,\n  debtPaidTotal,\n  goalSavedTotal,\n  syncCommitmentPaidMonth,\n  uid,\n`,
    `  capLinkedAmount,\n  debtPaidTotal,\n  financialDataCount,\n  goalSavedTotal,\n  syncCommitmentPaidMonth,\n  uid,\n`,
    'Transaction financialDataCount import',
  );
  const deleteSave = "    await get().saveLocal();\n    await get().syncCloud();\n  },\n\n  deleteTransMany:";
  const deleteSaveTo = "    await get().saveLocal({ force: financialDataCount(get()) === 0 });\n    await get().syncCloud();\n  },\n\n  deleteTransMany:";
  t = replaceOnce(t, deleteSave, deleteSaveTo, 'Persist empty vault after last single transaction deletion');
  const manySave = "    await get().saveLocal();\n    await get().syncCloud();\n    return true;\n  },\n});";
  const manySaveTo = "    await get().saveLocal({ force: financialDataCount(get()) === 0 });\n    await get().syncCloud();\n    return true;\n  },\n});";
  t = replaceOnce(t, manySave, manySaveTo, 'Persist empty vault after last multi transaction deletion');
  write(rel, t);
}

// 7) Vault backups: make backup naming/rotation/clear consistent.
{
  const rel = 'src/lib/secureVault.js';
  let t = read(rel);
  t = replaceOnce(t, "const BACKUP_SUFFIXES = [':previous:1', ':previous:2', ':previous:3'];\n", "const BACKUP_SUFFIXES = [':previous:1', ':previous:2', ':previous:3'];\nconst LEGACY_PREVIOUS_SUFFIX = ':previous';\n", 'Vault legacy suffix');
  t = replaceOnce(
    t,
    `  for (let index = 1; index <= 3; index += 1) {\n    const result = await readBackup(\`${'${key}${PREVIOUS_SUFFIX}:${index}'}\`, index);\n    if (result) return result;\n  }\n\n  return { snapshot: null, recovered: false, hasRaw: false };\n`,
    `  for (let index = 1; index <= 3; index += 1) {\n    const result = await readBackup(\`${'${key}${PREVIOUS_SUFFIX}:${index}'}\`, index);\n    if (result) return result;\n  }\n  const legacyPrevious = await readBackup(\`${'${key}${LEGACY_PREVIOUS_SUFFIX}'}\`, 0);\n  if (legacyPrevious) return legacyPrevious;\n\n  return { snapshot: null, recovered: false, hasRaw: false };\n`,
    'Vault read legacy previous',
  );
  t = replaceOnce(
    t,
    "  const current = await storage.getItem(key);\n  if (current && isSnapshotEmpty(snapshot)) {\n",
    "  const current = await storage.getItem(key);\n  const emptySnapshot = isSnapshotEmpty(snapshot);\n  if (current && emptySnapshot) {\n",
    'Vault empty snapshot flag',
  );
  t = replaceOnce(
    t,
    `  const envelope = JSON.stringify(encryptString(JSON.stringify(snapshot), masterKey, key));\n  if (current) await storage.setItem(\`${'${key}${PREVIOUS_SUFFIX}'}\`, current);\n  await storage.setItem(key, envelope);\n  return true;\n`,
    `  const envelope = JSON.stringify(encryptString(JSON.stringify(snapshot), masterKey, key));\n  if (current && !(options.force && emptySnapshot)) {\n    for (let index = 3; index >= 2; index -= 1) {\n      const previous = await storage.getItem(\`${'${key}${PREVIOUS_SUFFIX}:${index - 1}'}\`);\n      if (previous) await storage.setItem(\`${'${key}${PREVIOUS_SUFFIX}:${index}'}\`, previous);\n      else await storage.removeItem(\`${'${key}${PREVIOUS_SUFFIX}:${index}'}\`);\n    }\n    await storage.setItem(\`${'${key}${PREVIOUS_SUFFIX}:1'}\`, current);\n  }\n  if (options.force && emptySnapshot) {\n    await Promise.all(BACKUP_SUFFIXES.map(suffix => storage.removeItem(\`${'${key}${suffix}'}\`)));\n  }\n  await storage.removeItem(\`${'${key}${LEGACY_PREVIOUS_SUFFIX}'}\`);\n  await storage.setItem(key, envelope);\n  return true;\n`,
    'Vault backup rotation',
  );
  t = replaceOnce(
    t,
    "  const backupKeys = BACKUP_SUFFIXES.map(suffix => `${key}${suffix}`);\n",
    "  const backupKeys = [...BACKUP_SUFFIXES.map(suffix => `${key}${suffix}`), `${key}${LEGACY_PREVIOUS_SUFFIX}`];\n",
    'Vault clear all backups',
  );
  write(rel, t);
}

// 8) Intentional reset tombstone: never resurrect legacy data; empty local state wins over cloud after explicit reset.
{
  const rel = 'src/store/slices/useSyncSlice.js';
  let t = read(rel);
  const constantsAnchor = "let syncQueue = Promise.resolve();\n\n";
  const constantsInsert = `let syncQueue = Promise.resolve();\n\nconst RESET_MARKER_PREFIX = 'MYFI_INTENTIONAL_RESET_V1';\nconst resetMarkerKey = namespace => \`${'${RESET_MARKER_PREFIX}:${String(namespace || GUEST_NAMESPACE)}'}\`;\nconst readResetMarker = async namespace => parseJson(await AsyncStorage.getItem(resetMarkerKey(namespace)), null);\nconst writeResetMarker = async (namespace, patch = {}) => {\n  const current = await readResetMarker(namespace);\n  const next = {\n    legacyRecoveryDisabled: true,\n    pendingCloudSync: false,\n    resetAt: current?.resetAt || new Date().toISOString(),\n    ...(current || {}),\n    ...patch,\n  };\n  await AsyncStorage.setItem(resetMarkerKey(namespace), JSON.stringify(next));\n  return next;\n};\n\n`;
  if (!t.includes('RESET_MARKER_PREFIX')) t = replaceOnce(t, constantsAnchor, constantsInsert, 'Reset marker helpers');
  t = replaceOnce(
    t,
    "      let { snapshot, recovered } = await readVaultSnapshot(namespace);\n\n      if (allowLegacy && (!snapshot || financialDataCount(snapshot.data || snapshot) === 0)) {\n",
    "      let { snapshot, recovered } = await readVaultSnapshot(namespace);\n      const resetMarker = await readResetMarker(namespace);\n      const allowLegacyRecovery = allowLegacy && !resetMarker?.legacyRecoveryDisabled;\n\n      if (allowLegacyRecovery && (!snapshot || financialDataCount(snapshot.data || snapshot) === 0)) {\n",
    'Suppress legacy recovery after reset',
  );
  t = replaceOnce(
    t,
    "    const next = { ...current, localUpdatedAt: updatedAt, dirty: nextDirty };\n    await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(next), { force });\n",
    "    const next = { ...current, localUpdatedAt: updatedAt, dirty: nextDirty };\n    await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(next), { force });\n    if (force && financialDataCount(current) === 0) {\n      await writeResetMarker(current.workspaceNamespace, { pendingCloudSync: !!current.user });\n    }\n",
    'Forced empty save becomes authoritative',
  );



  const syncCloudRe = /  syncCloud: async \(\) => \{[\s\S]*?\n  \},\n\n  loadCloud:/;
  const syncCloudReplacement = `  syncCloud: async () => {\n    const queued = syncQueue.then(async () => {\n      const initial = get();\n      if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;\n      if (!initial.dirty) return true;\n      set({ syncing: true, lastSyncError: null });\n      try {\n        const deviceId = await getOrCreateDeviceId();\n        let expectedRevision = Number(initial.cloudRevision || 0);\n\n        for (let attempt = 0; attempt < 2; attempt += 1) {\n          const current = get();\n          const { data, error } = await supabase.rpc('sync_user_data_v2', {\n            p_expected_revision: expectedRevision,\n            p_trans: current.trans,\n            p_debts: current.debts,\n            p_goals: current.goals,\n            p_wallets: current.wallets,\n            p_commitments: current.commitments,\n            p_cats: current.cats,\n            p_cfg: current.cfg,\n            p_device_id: deviceId,\n          });\n          if (error) throw error;\n          const result = Array.isArray(data) ? data[0] : data;\n\n          if (result?.accepted) {\n            const syncedAt = result.updated_at || new Date().toISOString();\n            const cloudRevision = Number(result.revision || expectedRevision + 1);\n            set({\n              online: true,\n              dirty: false,\n              cloudRevision,\n              lastSyncedAt: syncedAt,\n              lastSyncError: null,\n              syncConflict: null,\n            });\n            await writeVaultSnapshot(\n              current.workspaceNamespace,\n              snapshotFromState(get(), { dirty: false, cloudRevision, lastSyncedAt: syncedAt }),\n            );\n            if (financialDataCount(get()) === 0) {\n              await writeResetMarker(current.workspaceNamespace, { pendingCloudSync: false });\n            }\n            return true;\n          }\n\n          const { data: cloud, error: fetchError } = await supabase\n            .from('user_data')\n            .select('*')\n            .eq('user_id', current.user.id)\n            .maybeSingle();\n          if (fetchError) throw fetchError;\n          const cloudRevision = Number(cloud?.revision || result?.revision || 0);\n          const resetMarker = await readResetMarker(current.workspaceNamespace);\n\n          if (attempt === 0 && cloud && resetMarker?.pendingCloudSync && financialDataCount(current) === 0) {\n            expectedRevision = cloudRevision;\n            set({\n              online: true,\n              cloudRevision: expectedRevision,\n              dirty: true,\n              syncConflict: null,\n              lastSyncError: null,\n            });\n            await get().saveLocal({ dirty: true, force: true });\n            continue;\n          }\n\n          set({\n            online: true,\n            syncConflict: cloud ? { cloud, cloudRevision } : null,\n            lastSyncError: 'sync_conflict',\n          });\n          return false;\n        }\n        return false;\n      } catch (e) {\n        console.error('[STORE] syncCloud', e);\n        set({ online: false, lastSyncError: String(e?.message || 'sync_failed') });\n        return false;\n      } finally {\n        set({ syncing: false });\n      }\n    });\n    syncQueue = queued.catch(() => false);\n    return queued;\n  },\n\n  loadCloud:`;
  t = replaceRegexOnce(t, syncCloudRe, syncCloudReplacement, 'Reset-aware cloud sync retry');

  const loadCloudAnchor = `      const cloudRevision = Number(data.revision || 0);\n      if (get().dirty && cloudRevision !== Number(get().cloudRevision || 0)) {\n`;
  const loadCloudReplacement = `      const cloudRevision = Number(data.revision || 0);\n      const resetMarker = await readResetMarker(get().workspaceNamespace);\n      if (resetMarker?.pendingCloudSync && financialDataCount(get()) === 0) {\n        set({ cloudRevision, dirty: true, syncConflict: null, lastSyncError: null });\n        await get().saveLocal({ dirty: true, force: true });\n        const pushed = await get().syncCloud();\n        if (pushed) await writeResetMarker(get().workspaceNamespace, { pendingCloudSync: false });\n        return pushed;\n      }\n      if (get().dirty && cloudRevision !== Number(get().cloudRevision || 0)) {\n`;
  t = replaceOnce(t, loadCloudAnchor, loadCloudReplacement, 'Reset wins over cloud');
  write(rel, t);
}

{
  const rel = 'src/store/slices/dataSlice.js';
  let t = read(rel);
  t = replaceOnce(
    t,
    "import { readVaultSnapshot } from '../../lib/secureVault';\n",
    "import { clearVaultSnapshot, GUEST_NAMESPACE, readVaultSnapshot } from '../../lib/secureVault';\n",
    'DataSlice clear vault import',
  );
  t = replaceOnce(
    t,
    "  archivedWalletMovement,\n  normalizeDebtItems,\n",
    "  archivedWalletMovement,\n  financialDataCount,\n  normalizeDebtItems,\n",
    'DataSlice reset verification import',
  );
  const oldResetRe = /  resetAll: async \(\) => \{[\s\S]*?\n\},\n\n  exportBackup:/;
  const newReset = `  resetAll: async () => {\n    const current = get();\n    const namespace = current.workspaceNamespace || 'guest';\n    const wallets = normalizeWallets([], current.cfg.currency);\n    const defaultWalletId = getDefaultWalletId(wallets, current.cfg.currency, null);\n    const resetCfg = {\n      ...current.cfg,\n      demoMode: false,\n      defaultWalletId,\n      archiveSummaries: [],\n      categoryBudgets: {},\n    };\n    set({\n      trans: [],\n      debts: [],\n      goals: [],\n      wallets,\n      commitments: [],\n      cats: DEF_CATS,\n      cfg: resetCfg,\n      syncConflict: null,\n      lastSyncError: null,\n      dirty: true,\n    });\n    try {\n      const legacyKeys = Object.values(LEGACY_STORAGE_KEYS).flat();\n      await AsyncStorage.multiRemove([\n        STORAGE.DATA, STORAGE.CATS, STORAGE.ROLLBACK, STORAGE.DEMO_REAL, STORAGE.DEMO_DATA,\n        ...legacyKeys,\n      ]);\n      const resetAt = new Date().toISOString();\n      const namespacesToClear = [...new Set([namespace, GUEST_NAMESPACE])];\n      for (const targetNamespace of namespacesToClear) {\n        await AsyncStorage.setItem(\`MYFI_INTENTIONAL_RESET_V1:\${targetNamespace}\`, JSON.stringify({\n          legacyRecoveryDisabled: true,\n          pendingCloudSync: targetNamespace === namespace && !!current.user,\n          resetAt,\n        }));\n        await clearVaultSnapshot(targetNamespace);\n      }\n      await get().saveLocal({ force: true, dirty: true });\n    } catch (e) {\n      console.error('[STORE] resetAll storage', e);\n      return false;\n    }\n\n    if (current.user) {\n      try {\n        let synced = await get().syncCloud();\n        if (!synced && get().syncConflict?.cloud) {\n          const revision = Number(get().syncConflict.cloudRevision || 0);\n          set({ cloudRevision: revision, syncConflict: null, dirty: true });\n          await get().saveLocal({ force: true, dirty: true });\n          synced = await get().syncCloud();\n        }\n        if (synced) {\n          await AsyncStorage.setItem(\`MYFI_INTENTIONAL_RESET_V1:\${namespace}\`, JSON.stringify({\n            legacyRecoveryDisabled: true,\n            pendingCloudSync: false,\n            resetAt: new Date().toISOString(),\n          }));\n        }\n      } catch (e) {\n        console.error('[STORE] resetAll sync', e);\n      }\n    }\n\n    const verify = get();\n    const empty = !verify.trans.length && !verify.debts.length && !verify.goals.length && !verify.commitments.length;\n    const namespacesToVerify = [...new Set([namespace, GUEST_NAMESPACE])];\n    let vaultEmpty = true;\n    for (const targetNamespace of namespacesToVerify) {\n      const { snapshot } = await readVaultSnapshot(targetNamespace);\n      if (financialDataCount(snapshot?.data || snapshot) > 0) {\n        vaultEmpty = false;\n        break;\n      }\n    }\n    if (!empty || !vaultEmpty) {\n      console.error('[STORE] resetAll verification failed');\n      return false;\n    }\n    return true;\n  },\n\n  exportBackup:`;
  t = replaceRegexOnce(t, oldResetRe, newReset, 'Robust resetAll');
  write(rel, t);
}

// Add verification test source.
copy('tests/lifecycle-reset-wallet-search.test.cjs');

console.log('\nAll lifecycle/search/default-wallet/reset fixes applied.');
