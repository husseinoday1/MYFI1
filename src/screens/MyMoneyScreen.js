import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import {
  getDefaultWalletId,
  getWalletAvailableBalances,
  getWalletBaseAvailableTotal,
} from '../lib/wallets';
import { getBudgetRows, getBudgetSummary } from '../lib/budgets';
import { ScreenScroll, PageIntro, SectionTitle, Touchable, rowDirection } from '../components/AppPrimitives';
import { GatewayCard } from '../components/GatewayCard';

// Gateway 3/4 accent tones aren't covered by any semantic financial token
// (those are reserved for income/expense/transfer/warning/danger). These are
// the already-APPROVED muted category-palette targets from
// docs/design/04_MYFI_DESIGN_TOKEN_CATALOG.md (#7 "muted purple", #3 "muted
// terracotta") — reused here as-is rather than inventing new colors. No
// confirmed dark-theme variant exists yet for these two (the catalog's
// contrast pass is explicitly deferred); flagged as a known gap.
const BUDGET_TONE = '#8D7CB8';
const REPORTS_TONE = '#C99860';

// My Money hub — a thin router. Per docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md
// "My Money": four numbered gateway cards, nothing else at this level. Each
// card's live value is computed from data already surfaced elsewhere (Home's
// wallet balances, the existing budgets lib, History/Reports screens) — this
// screen adds no new financial calculation, only display.
export default function MyMoneyScreen({
  onOpenWallets,
  onOpenHistory,
  onOpenBudget,
  onOpenReports,
  onTransfer,
  onAddTransaction,
}) {
  const { th, lang, cfg, isAr } = useTheme();
  const { trans, wallets, cats } = useStore();

  const walletsValue = useMemo(() => {
    const scoped = filterByActiveScope(wallets, cfg);
    const source = scoped.length ? scoped : wallets;
    const defaultId = getDefaultWalletId(source, cfg.currency, cfg.defaultWalletId);
    const rows = getWalletAvailableBalances(source, trans, cfg.currency, defaultId);
    const total = getWalletBaseAvailableTotal(rows, cfg.currency);
    return `${formatMoneyNumber(total, cfg.currency, cfg.lang)} ${cfg.currency}`;
  }, [wallets, trans, cfg.activeScope, cfg.profileType, cfg.currency, cfg.defaultWalletId, cfg.lang]);

  const walletsCount = useMemo(() => {
    const scoped = filterByActiveScope(wallets, cfg);
    return (scoped.length ? scoped : wallets).length;
  }, [wallets, cfg.activeScope, cfg.profileType]);

  const historyCount = useMemo(() => filterByActiveScope(trans, cfg).length, [trans, cfg.activeScope, cfg.profileType]);

  const budgetSummary = useMemo(() => {
    const now = new Date();
    const scoped = filterByActiveScope(trans, cfg);
    const rows = getBudgetRows(scoped, cats, cfg.categoryBudgetsByMonth || {}, now, cfg.categoryBudgets || {});
    return getBudgetSummary(rows);
  }, [trans, cats, cfg.categoryBudgetsByMonth, cfg.categoryBudgets, cfg.activeScope, cfg.profileType]);

  const money = (v) => `${formatMoneyNumber(v, cfg.currency, cfg.lang)} ${cfg.currency}`;

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="wallet-outline"
        title={isAr ? 'أموالي' : 'My Money'}
        subtitle={isAr ? 'نظرة سريعة على وضعك المالي' : 'A quick look at your financial status'}
      />

      <SectionTitle th={th} lang={lang}>{isAr ? 'البوابات' : 'Gateways'}</SectionTitle>
      <View style={{ gap: 10 }}>
        <GatewayCard
          th={th}
          lang={lang}
          index={1}
          tone={th.transfer}
          icon="wallet-outline"
          title={isAr ? 'المحافظ والحسابات' : 'Wallets & Accounts'}
          value={walletsValue}
          meta={isAr ? 'إجمالي الأرصدة' : 'Total balance'}
          linkLabel={isAr ? 'عرض المحافظ' : 'View wallets'}
          onPress={onOpenWallets}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={2}
          tone={th.primary}
          icon="swap-horizontal-outline"
          title={isAr ? 'الحركات والسجل' : 'Transactions & History'}
          value={isAr ? `${historyCount} حركة هذا الشهر` : `${historyCount} transactions`}
          linkLabel={isAr ? 'عرض السجل' : 'View history'}
          onPress={onOpenHistory}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={3}
          tone={BUDGET_TONE}
          icon="pie-chart-outline"
          title={isAr ? 'الخطة والميزانية' : 'Plan & Budget'}
          value={budgetSummary.limit > 0 ? money(budgetSummary.remaining) : (isAr ? 'لا توجد ميزانية بعد' : 'No budget set yet')}
          meta={budgetSummary.limit > 0
            ? (isAr ? `الميزانية ${money(budgetSummary.limit)} · المصروف ${money(budgetSummary.spent)}` : `Budget ${money(budgetSummary.limit)} · Spent ${money(budgetSummary.spent)}`)
            : null}
          linkLabel={isAr ? 'فتح الخطة والميزانية' : 'Open Plan & Budget'}
          onPress={onOpenBudget}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={4}
          tone={REPORTS_TONE}
          icon="bar-chart-outline"
          title={isAr ? 'التقارير والتحليلات' : 'Reports & Analytics'}
          meta={isAr ? 'افهم أموالك عبر الوقت' : 'Understand your money over time'}
          linkLabel={isAr ? 'عرض التقارير' : 'View reports'}
          onPress={onOpenReports}
        />
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'اختصارات سريعة' : 'Quick shortcuts'}</SectionTitle>
      <View style={{ flexDirection: rowDirection(lang), gap: 8 }}>
        <QuickShortcut th={th} icon="swap-horizontal-outline" tone={th.transfer} label={isAr ? 'تحويل' : 'Transfer'} onPress={onTransfer} />
        <QuickShortcut th={th} icon="add-circle-outline" tone={th.primary} label={isAr ? 'إضافة حركة' : 'Add transaction'} onPress={onAddTransaction} />
        <QuickShortcut th={th} icon="calendar-outline" tone={BUDGET_TONE} label={isAr ? 'ميزانية جديدة' : 'New budget'} onPress={onOpenBudget} />
        <QuickShortcut th={th} icon="stats-chart-outline" tone={REPORTS_TONE} label={isAr ? 'تقرير سريع' : 'Quick report'} onPress={onOpenReports} />
      </View>
    </ScreenScroll>
  );
}

function QuickShortcut({ th, icon, tone, label, onPress }) {
  return (
    <Touchable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: th.cardHigh,
      }}
    >
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={{ color: th.text, fontSize: 10, fontWeight: '900', textAlign: 'center' }} numberOfLines={1}>{label}</Text>
    </Touchable>
  );
}
