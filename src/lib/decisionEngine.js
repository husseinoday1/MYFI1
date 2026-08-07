import { buildFinancialSnapshot, getUpcomingRecurring, today } from '../utils/calc';
import { getUpcomingCommitments } from './commitments';
import { buildLeakInsights } from './localIntelligence';
import { getDefaultWalletId, getWalletAvailableBalances } from './wallets';
import { filterByActiveScope, filterFeatureEntities, getModules } from './modules';
import { getBudgetRows } from './budgets';

const money = (value) => Math.abs(Math.round(Number(value) || 0)).toLocaleString();

const dueText = (daysUntil, ar) => {
  if (daysUntil < 0) return ar ? `متأخر ${Math.abs(daysUntil)} يوم` : `${Math.abs(daysUntil)} days overdue`;
  if (daysUntil === 0) return ar ? 'مستحق اليوم' : 'due today';
  return ar ? `بعد ${daysUntil} يوم` : `in ${daysUntil} days`;
};

const categoryLabel = (cat, ar) =>
  (ar ? cat?.label : cat?.labelEn) || cat?.label || cat?.labelEn || (ar ? 'تصنيف' : 'category');

const currentWalletBalance = ({ trans, wallets, cfg, snapshot }) => {
  return getWalletAvailableBalances(wallets, trans, cfg.currency, getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId))
    .reduce((sum, wallet) => sum + Number(wallet.availableBalance || 0), 0);
};

const shouldNotifyLeak = (insight) => {
  const leak = insight.topLeak;
  if (!leak || !leak.previousSpent) return false;
  const relativeJump = Number(leak.delta || 0) / Math.max(1, Number(leak.previousSpent || 0));
  const shareOfMonth = Number(leak.delta || 0) / Math.max(1, Number(insight.totalSpent || 0));
  return relativeJump >= 0.4 && shareOfMonth >= 0.12;
};

export const buildDecisionItems = ({
  trans = [],
  debts = [],
  goals = [],
  commitments = [],
  wallets = [],
  cats = [],
  cfg = {},
  notif = {},
  symbol = '',
  date = new Date(),
} = {}) => {
  const modules = getModules(cfg);
  trans = filterByActiveScope(trans, cfg);
  wallets = filterByActiveScope(wallets, cfg);
  const featureData = filterFeatureEntities({ debts, goals, commitments, cfg });
  debts = featureData.debts;
  goals = featureData.goals;
  commitments = featureData.commitments;
  const lang = cfg.lang || 'ar';
  const ar = lang === 'ar';
  const snapshot = buildFinancialSnapshot({
    trans, debts, goals, cats, wallets, commitments,
    currency: cfg.currency,
    defaultWalletId: cfg.defaultWalletId,
  }, date);
  const intelligence = buildLeakInsights(trans, cats, date);
  const walletBalance = currentWalletBalance({ trans, wallets, cfg, snapshot });
  const commitmentWindow = Number(notif.commitment?.value ?? 3);
  const commitmentOn = notif.commitment?.on !== false;
  const items = [];

  const push = (item) => {
    const body = String(item.body || '').trim();
    if (!item.id || !item.title || !body) return;
    items.push({
      id: item.id,
      title: item.title,
      body,
      icon: item.icon || 'notifications-outline',
      tone: item.tone || 'info',
      priority: item.priority ?? 50,
      channel: item.channel || 'quiet',
      notify: !!item.notify,
      throttleHours: item.throttleHours || 12,
      fingerprint: item.fingerprint || item.id,
      action: item.action || null,
    });
  };

  if (snapshot.forecast.status === 'danger') {
    push({
      id: 'forecast-danger',
      title: ar ? 'توقع نهاية الشهر سلبي' : 'Negative month-end forecast',
      body: ar
        ? `إذا استمر نفس الصرف، المتوقع نهاية الشهر ${snapshot.forecast.projectedNet < 0 ? '-' : '+'}${money(snapshot.forecast.projectedNet)} ${symbol}.`
        : `At the current pace, month-end may be ${snapshot.forecast.projectedNet < 0 ? '-' : '+'}${money(snapshot.forecast.projectedNet)} ${symbol}.`,
      icon: 'trending-down-outline',
      tone: 'danger',
      priority: 10,
      channel: 'critical',
      notify: true,
      throttleHours: 12,
      action: { type: 'open_tab', tab: 'reports' },
    });
  } else if (false && snapshot.forecast.status === 'warning') {
    push({
      id: 'forecast-warning',
      title: ar ? 'الصرف قريب من الدخل' : 'Spending is close to income',
      body: ar
        ? `مصروف الشهر المتوقع ${money(snapshot.forecast.projected)} ${symbol}.`
        : `Projected monthly spending is ${money(snapshot.forecast.projected)} ${symbol}.`,
      icon: 'analytics-outline',
      tone: 'warning',
      priority: 18,
      channel: 'important',
      notify: false,
      throttleHours: 24,
      action: { type: 'open_tab', tab: 'reports' },
    });
  }

  if (modules.budgets) {
    const budgetRows = getBudgetRows(trans, cats, cfg.categoryBudgets, date);
    const urgentBudget = budgetRows.find(row => row.status === 'over');
    if (urgentBudget) {
      const label = categoryLabel(urgentBudget.cat, ar);
      const over = urgentBudget.status === 'over';
      push({
        id: `budget-${urgentBudget.status}-${urgentBudget.categoryId}`,
        title: over
          ? (ar ? 'تم تجاوز الميزانية' : 'Budget exceeded')
          : (ar ? 'الميزانية قريبة من حدها' : 'Budget is near its limit'),
        body: ar
          ? `${label}: صُرف ${money(urgentBudget.spent)} من ${money(urgentBudget.limit)} ${symbol}.`
          : `${label}: ${money(urgentBudget.spent)} of ${money(urgentBudget.limit)} ${symbol} spent.`,
        icon: 'pie-chart-outline',
        tone: over ? 'danger' : 'warning',
        priority: over ? 11 : 20,
        channel: over ? 'critical' : 'important',
        notify: true,
        throttleHours: over ? 12 : 24,
        action: { type: 'open_tab', tab: 'reports' },
      });
    }
  }

  if (notif.low?.on && walletBalance <= Number(notif.low.value || 0)) {
    push({
      id: 'low-balance',
      title: ar ? 'الرصيد أقل من الحد' : 'Balance is below limit',
      body: ar
        ? `رصيدك الحالي ${money(walletBalance)} ${symbol}، والحد ${money(notif.low.value)} ${symbol}.`
        : `Current balance is ${money(walletBalance)} ${symbol}, limit is ${money(notif.low.value)} ${symbol}.`,
      icon: 'wallet-outline',
      tone: 'danger',
      priority: 12,
      channel: 'critical',
      notify: true,
      throttleHours: 12,
      action: { type: 'open_tab', tab: 'reports' },
    });
  }

  const recurringDue = modules.recurring
    ? getUpcomingRecurring(trans, date).filter(item => item.daysUntil <= 0)
    : [];
  if (recurringDue.length > 0) {
    const first = recurringDue[0];
    push({
      id: `recurring-due-${first.recurringGroupId || first.id}-${first.dueISO}`,
      title: ar ? 'معاملة متكررة تنتظر قرارك' : 'Recurring entry needs a decision',
      body: recurringDue.length === 1
        ? `${first.title}: ${dueText(first.daysUntil, ar)}.`
        : (ar
          ? `${recurringDue.length} معاملات متكررة تنتظر القبول أو التعديل.`
          : `${recurringDue.length} recurring entries are waiting for review.`),
      icon: 'repeat',
      tone: first.daysUntil <= 0 ? 'warning' : 'info',
      priority: 24,
      channel: 'important',
      notify: true,
      throttleHours: 12,
      action: { type: 'open_recurring', draftData: first },
    });
  }

  const upcomingCommitments = modules.commitments ? getUpcomingCommitments(commitments, date) : [];
  const commitmentDue = upcomingCommitments.filter(item => item.daysUntil <= commitmentWindow);
  const deferredCommitments = upcomingCommitments.filter(item => item.deferredUntilISO && item.daysUntil > commitmentWindow);

  if (commitmentOn && commitmentDue.length > 0) {
    const first = commitmentDue[0];
    push({
      id: `commitment-due-${first.id}-${first.dueISO}`,
      title: ar ? 'التزام يحتاج متابعة' : 'Commitment needs attention',
      body: commitmentDue.length === 1
        ? `${first.name}: ${dueText(first.daysUntil, ar)}.`
        : (ar
          ? `${commitmentDue.length} التزامات تحتاج مراجعة أو تسجيل دفع.`
          : `${commitmentDue.length} commitments need review or payment.`),
      icon: 'calendar-outline',
      tone: first.daysUntil <= 0 ? 'warning' : 'info',
      priority: first.daysUntil <= 0 ? 14 : 22,
      channel: first.daysUntil <= 1 ? 'critical' : 'important',
      notify: true,
      throttleHours: first.daysUntil <= 0 ? 8 : 18,
      action: { type: 'open_tracker', trackerKind: 'commitment', trackerId: first.id },
    });
  }

  if (commitmentOn && deferredCommitments.length > 0) {
    const first = deferredCommitments[0];
    push({
      id: `commitment-deferred-${first.id}-${first.deferredUntilISO}`,
      title: ar ? 'التزام مؤجل' : 'Deferred commitment',
      body: ar
        ? `${first.name}: مؤجل إلى ${first.deferredUntilISO}.`
        : `${first.name}: deferred until ${first.deferredUntilISO}.`,
      icon: 'time-outline',
      tone: 'info',
      priority: 36,
      channel: 'quiet',
      notify: false,
      action: { type: 'open_tracker', trackerKind: 'commitment', trackerId: first.id },
    });
  }

  if (modules.debtsOwed && snapshot.debts.remaining > 0) {
    push({
      id: 'debt-reminder',
      title: ar ? 'يوجد دين عليّ غير مسدد' : 'Debt repayment is pending',
      body: ar
        ? `المتبقي ${money(snapshot.debts.remaining)} ${symbol} على ${snapshot.debts.count} متابعة.`
        : `${money(snapshot.debts.remaining)} ${symbol} remaining across ${snapshot.debts.count} trackers.`,
      icon: 'card-outline',
      tone: 'warning',
      priority: 38,
      channel: 'quiet',
      notify: false,
      throttleHours: 24,
      action: { type: 'open_tracker', trackerKind: 'debt' },
    });
  }

  if (notif.daily?.on && !trans.some(t => t.dateISO === today())) {
    push({
      id: 'daily-log',
      title: ar ? 'لم تسجل معاملات اليوم' : 'No entries today',
      body: ar ? 'سجل دخلك أو مصروفك حتى تبقى الأرقام دقيقة.' : 'Add income or expenses to keep numbers accurate.',
      icon: 'create-outline',
      tone: 'info',
      priority: 45,
      channel: 'quiet',
      notify: false,
      action: { type: 'open_add', mode: 'exp' },
    });
  }

  if (intelligence.topSpend) {
    push({
      id: `top-spend-${intelligence.topSpend.id}`,
      title: ar ? 'أكبر باب صرف هذا الشهر' : 'Largest spending area',
      body: `${categoryLabel(intelligence.topSpend, ar)}: ${money(intelligence.topSpend.spent)} ${symbol} - ${intelligence.topSpend.share}% ${ar ? 'من إجمالي الصرف' : 'of spending'}.`,
      icon: 'pie-chart-outline',
      tone: 'info',
      priority: 58,
      channel: 'quiet',
      notify: false,
      action: { type: 'open_tab', tab: 'reports' },
    });
  }

  if (intelligence.topLeak && shouldNotifyLeak(intelligence)) {
    push({
      id: `spend-jump-${intelligence.topLeak.id}`,
      title: ar ? '\u0635\u0631\u0641 \u0623\u0639\u0644\u0649 \u0645\u0646 \u0627\u0644\u0645\u0639\u062a\u0627\u062f' : 'Spending above your usual pattern',
      body: ar
        ? `${categoryLabel(intelligence.topLeak, ar)}: \u0623\u0639\u0644\u0649 \u0645\u0646 \u0645\u062a\u0648\u0633\u0637 \u0633\u062c\u0644\u0643 \u0628\u0640 ${money(intelligence.topLeak.delta)} ${symbol}.`
        : `${categoryLabel(intelligence.topLeak, ar)} is projected ${money(intelligence.topLeak.delta)} ${symbol} above your historical average.`,
      icon: 'warning-outline',
      tone: 'warning',
      priority: 28,
      channel: 'important',
      notify: true,
      throttleHours: 24,
      action: { type: 'open_tab', tab: 'reports' },
    });
  }

  const unusualToday = intelligence.unusualDays.find(item => item.dateISO === today());
  if (unusualToday) {
    push({
      id: `unusual-day-${unusualToday.dateISO}`,
      title: ar ? 'صرف اليوم أعلى من عادتك' : 'Today is above your usual spending',
      body: ar
        ? `صرف اليوم ${money(unusualToday.spent)} ${symbol}، وهو أعلى من معدل أيام الصرف.`
        : `Today spending is ${money(unusualToday.spent)} ${symbol}, above your active-day average.`,
      icon: 'flash-outline',
      tone: 'warning',
      priority: 26,
      channel: 'quiet',
      notify: false,
      throttleHours: 18,
      action: { type: 'open_tab', tab: 'reports' },
    });
  }

  const closeGoal = (modules.goals ? goals : [])
    .filter(g => Number(g.target || 0) > 0)
    .map(g => ({ ...g, percent: Math.round((Number(g.cur || 0) / Number(g.target || 0)) * 100) }))
    .filter(g => g.percent >= 80 && g.percent < 100)
    .sort((a, b) => b.percent - a.percent)[0];

  if (closeGoal) {
    push({
      id: `goal-${closeGoal.id}`,
      title: ar ? 'هدفك قريب يكتمل' : 'Goal is almost complete',
      body: ar
        ? `${closeGoal.name}: ${closeGoal.percent}% مكتمل.`
        : `${closeGoal.name}: ${closeGoal.percent}% complete.`,
      icon: 'flag-outline',
      tone: 'success',
      priority: 55,
      channel: 'quiet',
      notify: false,
      action: { type: 'open_tracker', trackerKind: 'goal', trackerId: closeGoal.id },
    });
  }

  const deduped = new Map();
  items.forEach(item => {
    const prev = deduped.get(item.id);
    if (!prev || item.priority < prev.priority) deduped.set(item.id, item);
  });

  return [...deduped.values()].sort((a, b) => a.priority - b.priority);
};