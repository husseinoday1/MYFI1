import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { getWalletLabel, normalizeWallets } from '../lib/wallets';
import { getTransactionDisplayAmount } from '../lib/modules';
import { getTransactionTagMeta } from '../lib/transactionTags';
import { isRTL, rowDirFor, textAlignFor } from '../lib/layout';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';
import { getSemanticTypeLabel, getTransactionSemanticKind, TRANSACTION_SEMANTIC_KIND } from '../lib/transactionSemantics';

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? '\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062d\u0631\u0643\u0629' : 'Transaction details',
    date: ar ? '\u0627\u0644\u062a\u0627\u0631\u064a\u062e' : 'Date',
    amount: ar ? '\u0627\u0644\u0645\u0628\u0644\u063a' : 'Amount',
    sent: ar ? 'المبلغ المرسل' : 'Sent amount',
    received: ar ? 'المبلغ المستلم' : 'Received amount',
    directRate: ar ? 'سعر التحويل المثبت' : 'Frozen transfer rate',
    fee: ar ? 'رسوم التحويل' : 'Transfer fee',
    historicalBase: ar ? 'القيمة التاريخية للتقارير' : 'Historical reporting value',
    historicalRate: ar ? 'سعر التقارير التاريخي' : 'Historical reporting rate',
    trackerAmount: ar ? 'قيمة المتابعة الأصلية' : 'Original tracker amount',
    trackerRate: ar ? 'سعر المتابعة التاريخي' : 'Tracker historical rate',
    category: ar ? '\u0627\u0644\u062a\u0635\u0646\u064a\u0641' : 'Category',
    wallet: ar ? '\u0627\u0644\u0645\u062d\u0641\u0638\u0629' : 'Wallet',
    from: ar ? '\u0645\u0646' : 'From',
    to: ar ? '\u0625\u0644\u0649' : 'To',
    note: ar ? '\u0645\u0644\u0627\u062d\u0638\u0629' : 'Note',
    type: ar ? '\u0627\u0644\u0646\u0648\u0639' : 'Type',
    transfer: ar ? '\u062a\u062d\u0648\u064a\u0644 \u0628\u064a\u0646 \u0627\u0644\u0645\u062d\u0627\u0641\u0638' : 'Wallet transfer',
    income: ar ? '\u062f\u062e\u0644' : 'Income',
    expense: ar ? '\u0645\u0635\u0631\u0648\u0641' : 'Expense',
    saving: ar ? '\u062a\u0648\u0641\u064a\u0631 \u0644\u0647\u062f\u0641' : 'Goal saving',
    debtEntity: ar ? 'الدين المرتبط' : 'Linked debt',
    goalEntity: ar ? 'الهدف المرتبط' : 'Linked goal',
    commitmentEntity: ar ? 'الالتزام المرتبط' : 'Linked commitment',
    linked: ar ? '\u0645\u0631\u062a\u0628\u0637 \u0628\u0645\u062a\u0627\u0628\u0639\u0629' : 'Linked to a tracker',
    recurring: ar ? '\u0645\u062a\u0643\u0631\u0631\u0629' : 'Recurring',
    recordedAs: ar ? '\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0625\u062f\u062e\u0627\u0644' : 'Recorded as',
    edit: ar ? 'تعديل' : 'Edit',
    duplicate: ar ? 'تكرار' : 'Duplicate',
    delete: ar ? 'حذف' : 'Delete',
    close: ar ? '\u0625\u063a\u0644\u0627\u0642' : 'Close',
  };
};

export default function TransactionDetailsModal({ visible, transaction, cats = [], wallets = [], debts = [], goals = [], commitments = [], cfg = {}, onClose, canEdit = false, canDuplicate = false, onEdit, onDuplicate, onDelete }) {
  const th = TH[cfg.theme] || TH.dark;
  const C = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const baseCurrency = String(cfg.currency || 'IQD').toUpperCase();
  const isAr = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const walletMap = useMemo(() => new Map(
    normalizeWallets(wallets, cfg.currency).map(wallet => [wallet.id, wallet]),
  ), [wallets, cfg.currency]);

  if (!transaction) return null;
  const category = cats.find(item => item.id === transaction.cat) || cats.find(item => item.id === 'other') || {};
  const amount = getTransactionDisplayAmount(transaction);
  const transfer = transaction.kind === 'transfer';
  const goalSaving = !!transaction.isGoalSaving;
  const semanticKind = getTransactionSemanticKind(transaction);
  const openingBalance = semanticKind === TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE;
  const balanceAdjustment = semanticKind === TRANSACTION_SEMANTIC_KIND.BALANCE_ADJUSTMENT;
  const amountColor = balanceAdjustment ? th.warn : openingBalance || transfer || goalSaving ? th.primary : amount >= 0 ? th.inc : th.exp;
  const typeLabel = getSemanticTypeLabel(semanticKind, cfg.lang);
  const recordedAs = getTransactionTagMeta(transaction);
  const linked = transaction.isDebtPayment || transaction.isGoalSaving || transaction.isCommitmentPayment;
  const linkedDebt = transaction.debtId ? debts.find(item => item.id === transaction.debtId) : null;
  const linkedGoal = transaction.goalId ? goals.find(item => item.id === transaction.goalId) : null;
  const linkedCommitment = transaction.commitmentId ? commitments.find(item => item.id === transaction.commitmentId) : null;
  const debtName = linkedDebt?.name || (transaction.entityTypeSnapshot === 'debt' || transaction.entityTypeSnapshot === 'receivable' ? transaction.entityNameSnapshot : null);
  const goalName = linkedGoal?.name || (transaction.entityTypeSnapshot === 'goal' ? transaction.entityNameSnapshot : null);
  const commitmentName = linkedCommitment?.name || transaction.commitmentNameSnapshot || (transaction.entityTypeSnapshot === 'commitment' ? transaction.entityNameSnapshot : null);
  const entryWallet = walletMap.get(transaction.walletId);
  const fromWallet = walletMap.get(transaction.fromWalletId);
  const toWallet = walletMap.get(transaction.toWalletId);
  const nativeCurrency = String(transaction.walletCurrency || transaction.currencyCode || entryWallet?.currency || baseCurrency).toUpperCase();
  const fromCurrency = String(transaction.fromCurrency || fromWallet?.currency || baseCurrency).toUpperCase();
  const toCurrency = String(transaction.toCurrency || toWallet?.currency || baseCurrency).toUpperCase();
  const sourceAmount = Math.abs(Number(transaction.transferFromAmount ?? transaction.transferAmount ?? 0));
  const targetAmount = Math.abs(Number(transaction.transferToAmount ?? transaction.transferAmount ?? 0));
  const directRate = Number(transaction.transferRate ?? transaction.exchangeRate ?? (sourceAmount > 0 ? targetAmount / sourceAmount : 0));
  const feeAmount = Math.abs(Number(transaction.feeAmount || 0));
  const nativeAmount = Object.prototype.hasOwnProperty.call(transaction || {}, 'walletAmount')
    ? Number(transaction.walletAmount || 0)
    : Number(amount || 0);
  const baseAmount = Object.prototype.hasOwnProperty.call(transaction || {}, 'baseAmount')
    ? Number(transaction.baseAmount || 0)
    : Number(amount || 0);
  const amountText = `${amount >= 0 ? '+' : '-'}${formatMoneyNumber(Math.abs(nativeAmount), nativeCurrency, cfg.lang)} ${getSymbol(nativeCurrency)}`;
  const transferSourceText = `${formatMoneyNumber(sourceAmount, fromCurrency, cfg.lang)} ${getSymbol(fromCurrency)}`;
  const transferTargetText = `${formatMoneyNumber(targetAmount, toCurrency, cfg.lang)} ${getSymbol(toCurrency)}`;
  const transferRateText = sourceAmount > 0 && targetAmount > 0 && directRate > 0
    ? `1 ${fromCurrency} = ${directRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${toCurrency}`
    : '-';
  const feeText = feeAmount > 0 ? `${formatMoneyNumber(feeAmount, fromCurrency, cfg.lang)} ${getSymbol(fromCurrency)}` : '-';
  const historicalBaseText = nativeCurrency !== baseCurrency
    ? `${formatMoneyNumber(Math.abs(baseAmount), baseCurrency, cfg.lang)} ${getSymbol(baseCurrency)}`
    : null;
  const historicalRateText = nativeCurrency !== baseCurrency && Number(transaction.exchangeRate) > 0
    ? `1 ${nativeCurrency} = ${Number(transaction.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${baseCurrency}`
    : null;
  const entityCurrency = String(transaction.entityCurrencyCode || baseCurrency).toUpperCase();
  const entityAmount = Math.abs(Number(transaction.entityAmount ?? transaction.allocationAmount ?? 0));
  const entityAmountText = linked && entityAmount > 0
    ? `${formatMoneyNumber(entityAmount, entityCurrency, cfg.lang)} ${getSymbol(entityCurrency)}`
    : null;
  const entityRateText = entityCurrency !== baseCurrency && Number(transaction.entityBaseRate) > 0
    ? `1 ${entityCurrency} = ${Number(transaction.entityBaseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${baseCurrency}`
    : null;
  const detailRows = [
    { label: C.type, value: typeLabel },
    { label: C.date, value: transaction.dateISO || '-' },
    !transfer && !openingBalance && !balanceAdjustment ? { label: C.category, value: cfg.lang === 'ar' ? category.label : category.labelEn || category.label } : null,
    transfer ? { label: C.from, value: getWalletLabel(fromWallet, cfg.lang) } : null,
    transfer ? { label: C.to, value: getWalletLabel(toWallet, cfg.lang) } : null,
    transfer ? { label: C.sent, value: transferSourceText } : null,
    transfer ? { label: C.received, value: transferTargetText } : null,
    transfer && fromCurrency !== toCurrency ? { label: C.directRate, value: transferRateText } : null,
    transfer && feeAmount > 0 ? { label: C.fee, value: feeText } : null,
    transfer && fromCurrency !== baseCurrency && Number(transaction.fromBaseRate) > 0 ? { label: C.historicalRate, value: `1 ${fromCurrency} = ${Number(transaction.fromBaseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${baseCurrency}` } : null,
    transfer && toCurrency !== baseCurrency && Number(transaction.toBaseRate) > 0 ? { label: C.historicalRate + ` · ${toCurrency}`, value: `1 ${toCurrency} = ${Number(transaction.toBaseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${baseCurrency}` } : null,
    !transfer && transaction.walletId ? { label: C.wallet, value: getWalletLabel(entryWallet, cfg.lang) } : null,
    !transfer && entityAmountText ? { label: C.trackerAmount, value: entityAmountText } : null,
    !transfer && entityRateText ? { label: C.trackerRate, value: entityRateText } : null,
    !transfer && historicalBaseText ? { label: C.historicalBase, value: historicalBaseText } : null,
    !transfer && historicalRateText ? { label: C.historicalRate, value: historicalRateText } : null,
    debtName ? { label: C.debtEntity, value: debtName } : null,
    goalName ? { label: C.goalEntity, value: goalName } : null,
    commitmentName ? { label: C.commitmentEntity, value: commitmentName } : null,
    recordedAs.id !== 'none' ? { label: C.recordedAs, value: cfg.lang === 'ar' ? recordedAs.label : recordedAs.labelEn } : null,
  ].filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />
          <View style={[s.header, { flexDirection: rowDir }]}>
            <View style={[s.icon, { backgroundColor: `${amountColor}1F` }]}>
              <Ionicons name={openingBalance ? 'flag-outline' : balanceAdjustment ? 'git-compare-outline' : transfer ? 'swap-horizontal-outline' : 'receipt-outline'} size={19} color={amountColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: th.text, textAlign: align }]} numberOfLines={2}>
                {transfer ? C.transfer : transaction.title}
              </Text>
              <Text style={{ color: th.sub, fontSize: 12, marginTop: 2, textAlign: align }}>{C.title}</Text>
            </View>
          </View>
          <View style={[s.amountCard, { backgroundColor: `${amountColor}14`, borderColor: `${amountColor}33` }]}>
            <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), textAlign: 'center' }}>{C.amount}</Text>
            {transfer ? (
              <View style={{ marginTop: 5, gap: 5 }}>
                <Text style={[s.transferAmountValue, { color: amountColor, textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                  {transferSourceText} → {transferTargetText}
                </Text>
                {fromCurrency !== toCurrency ? (
                  <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), textAlign: 'center' }}>{transferRateText}</Text>
                ) : null}
              </View>
            ) : (
              <View style={[s.amountLine, { flexDirection: rowDir }]}>
                <Text
                  style={[s.amountValue, { color: amountColor }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.58}
                >
                  {amountText}
                </Text>
              </View>
            )}
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[s.detailCard, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
              {detailRows.map((row, index) => (
                <View key={row.label} style={[s.detailRow, { flexDirection: rowDir, borderTopColor: index ? th.border : 'transparent' }]}>
                  <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), textAlign: align }}>{row.label}</Text>
                  <Text style={{ color: row.color || th.text, fontSize: 13, ...weight('900'), textAlign: align, flex: 1 }} numberOfLines={2}>{row.value || '-'}</Text>
                </View>
              ))}
            </View>
            {(linked || transaction.recurring) ? (
              <View style={[s.statusLine, { flexDirection: rowDir }]}>
                {linked ? <View style={[s.status, { backgroundColor: th.primSoft }]}><Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{C.linked}</Text></View> : null}
                {transaction.recurring ? <View style={[s.status, { backgroundColor: th.warnBg }]}><Text style={{ color: th.warn, fontSize: 11, ...weight('900') }}>{C.recurring}</Text></View> : null}
              </View>
            ) : null}
            {transaction.note ? (
              <View style={[s.noteCard, { backgroundColor: th.input, borderColor: th.border }]}>
                <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), textAlign: align, marginBottom: 6 }}>{C.note}</Text>
                <Text style={{ color: th.text, fontSize: 14, lineHeight: 22, textAlign: align }}>{transaction.note}</Text>
              </View>
            ) : null}
          </ScrollView>
          {(canEdit || canDuplicate || onDelete) ? (
            <View style={[s.actionRow, { flexDirection: rowDir }]}>
              {canEdit && onEdit ? (
                <TouchableOpacity
                  onPress={onEdit}
                  style={[s.actionBtn, { backgroundColor: th.primSoft, borderColor: th.primSoft }]}
                >
                  <Ionicons name="create-outline" size={16} color={th.primary} />
                  <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{C.edit}</Text>
                </TouchableOpacity>
              ) : null}
              {canDuplicate && onDuplicate ? (
                <TouchableOpacity
                  onPress={onDuplicate}
                  style={[s.actionBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                >
                  <Ionicons name="copy-outline" size={16} color={th.text} />
                  <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{C.duplicate}</Text>
                </TouchableOpacity>
              ) : null}
              {onDelete ? (
                <TouchableOpacity
                  onPress={onDelete}
                  style={[s.actionBtn, { backgroundColor: th.expBg, borderColor: th.expBg }]}
                >
                  <Ionicons name="trash-outline" size={16} color={th.exp} />
                  <Text style={{ color: th.exp, fontSize: 12, ...weight('900') }}>{C.delete}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
            <Text style={{ color: th.text, ...weight('900') }}>{C.close}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', borderWidth: 1, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, ...SHADOW.card },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { alignItems: 'center', gap: 10, marginBottom: 14 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, lineHeight: 24, ...weight('900') },
  amountCard: { borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  amountLine: { alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 3 },
  amountValue: { flexShrink: 1, fontSize: 24, lineHeight: 31, ...weight('900'), textAlign: 'center', fontVariant: ['tabular-nums'] },
  transferAmountValue: { fontSize: 19, lineHeight: 27, ...weight('900'), fontVariant: ['tabular-nums'] },
  detailCard: { borderWidth: 1, borderRadius: RADIUS.lg, overflow: 'hidden' },
  detailRow: { alignItems: 'flex-start', gap: 14, paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1 },
  statusLine: { gap: 7, flexWrap: 'wrap', marginTop: 10 },
  status: { borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 5 },
  noteCard: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 13, marginTop: 10 },
  actionRow: { gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  closeBtn: { borderWidth: 1, borderRadius: RADIUS.md, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
