import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { AppButton, PageIntro, ScreenScroll, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import WalletBalanceCard from '../components/WalletBalanceCard';
import { RADIUS, SPACE, weight } from '../lib/tokens';

// Home only chooses the default source. This page owns wallet management so
// the same money source is never presented as two competing dashboards.
export default function WalletsAccountsScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const { trans, wallets, setCfg, addWallet, editWallet, deleteWallet } = useStore();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => setDraft({ id: null, name: '', currency: cfg.currency });
  const openEdit = wallet => setDraft({ id: wallet.id, name: wallet.name || '', currency: wallet.currency || cfg.currency });
  const closeEditor = () => !saving && setDraft(null);
  const save = async () => {
    const name = String(draft?.name || '').trim();
    if (!name) {
      Alert.alert(isAr ? 'اكتب اسم المحفظة' : 'Add a wallet name');
      return;
    }
    setSaving(true);
    const result = draft.id
      ? await editWallet(draft.id, { name, nameEn: name, currency: draft.currency })
      : await addWallet({ name, nameEn: name, currency: draft.currency });
    setSaving(false);
    if (!result) {
      Alert.alert(
        isAr ? 'تعذر حفظ المحفظة' : 'Could not save wallet',
        isAr ? 'لا يمكن تغيير عملة محفظة لها حركات. أنشئ محفظة جديدة للعملة الأخرى.' : 'A wallet with transactions cannot change currency. Create a new wallet for the other currency.',
      );
      return;
    }
    if (!draft.id && result?.id) await setCfg({ defaultWalletId: result.id });
    setDraft(null);
  };
  const requestDelete = () => {
    if (!draft?.id) return;
    Alert.alert(
      isAr ? 'حذف المحفظة؟' : 'Delete wallet?',
      isAr ? 'لا يمكن حذف آخر محفظة أو محفظة مرتبطة بحركات سابقة.' : 'The last wallet or a wallet with transaction history cannot be deleted.',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete', style: 'destructive', onPress: async () => {
            const removed = await deleteWallet(draft.id);
            if (!removed) {
              Alert.alert(isAr ? 'تعذر الحذف' : 'Could not delete', isAr ? 'احتفظ التطبيق بالمحفظة لحماية السجل المالي.' : 'The wallet was kept to protect financial history.');
              return;
            }
            setDraft(null);
          },
        },
      ],
    );
  };

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="wallet-outline"
        title={isAr ? 'المحافظ والحسابات' : 'Wallets & Accounts'}
        subtitle={isAr ? 'أنشئ مصادر أموالك ونظّمها واختر الافتراضية' : 'Create and organize your money sources, then choose the default'}
      />
      <AppButton th={th} lang={lang} icon="add" label={isAr ? 'إضافة محفظة' : 'Add wallet'} onPress={openCreate} />
      <Text style={[s.hint, { color: th.sub, textAlign: textAlign(lang) }]}>
        {isAr ? 'اضغط بطاقة المحفظة لتعيينها افتراضية، وأيقونة القلم للتعديل أو الحذف.' : 'Tap a wallet to make it default; use the pencil to edit or delete it.'}
      </Text>
      <WalletBalanceCard
        wallets={wallets}
        transactions={trans}
        cfg={cfg}
        showWallets
        onSelectWallet={(walletId) => setCfg({ defaultWalletId: walletId })}
        onEditWallet={openEdit}
        title={isAr ? 'كل المحافظ' : 'All wallets'}
      />
      <WalletEditor
        draft={draft}
        saving={saving}
        th={th}
        lang={lang}
        isAr={isAr}
        baseCurrency={cfg.currency}
        onChange={setDraft}
        onClose={closeEditor}
        onSave={save}
        onDelete={requestDelete}
      />
    </ScreenScroll>
  );
}

function WalletEditor({ draft, saving, th, lang, isAr, baseCurrency, onChange, onClose, onSave, onDelete }) {
  if (!draft) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: th.bg, borderColor: th.border }]}>
          <View style={[s.sheetHead, { flexDirection: rowDirection(lang) }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: textAlign(lang) }]}>{draft.id ? (isAr ? 'تعديل المحفظة' : 'Edit wallet') : (isAr ? 'محفظة جديدة' : 'New wallet')}</Text>
            <Touchable onPress={onClose} accessibilityLabel={isAr ? 'إغلاق' : 'Close'} style={[s.dismiss, { backgroundColor: th.card }]}><Ionicons name="chevron-down" size={19} color={th.text} /></Touchable>
          </View>
          <Text style={[s.label, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'اسم المحفظة' : 'Wallet name'}</Text>
          <TextInput
            value={draft.name}
            onChangeText={name => onChange({ ...draft, name })}
            placeholder={isAr ? 'مثال: نقدي أو بطاقة الراتب' : 'e.g. Cash or salary card'}
            placeholderTextColor={th.faint}
            autoFocus
            style={[s.input, { backgroundColor: th.card, borderColor: th.border, color: th.text, textAlign: textAlign(lang) }]}
          />
          <View style={[s.currencyNote, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
            <Ionicons name="cash-outline" size={16} color={th.primary} />
            <Text style={[s.currencyText, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? `عملة هذه المحفظة: ${draft.currency || baseCurrency}` : `This wallet's currency: ${draft.currency || baseCurrency}`}</Text>
          </View>
          <Text style={[s.note, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'للحفاظ على دقة الأرصدة، تُنشأ المحافظ الجديدة بعملة البرنامج. دعم محافظ متعددة العملات سيُضاف مع تسعير تحويل موثّق.' : 'To keep balances accurate, new wallets use the app currency. Multi-currency wallets will arrive with verified exchange-rate handling.'}</Text>
          <AppButton th={th} lang={lang} label={saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving…') : (isAr ? 'حفظ المحفظة' : 'Save wallet')} icon="checkmark" onPress={onSave} disabled={saving} style={{ marginTop: SPACE.lg }} />
          {draft.id ? <Touchable onPress={onDelete} style={s.deleteButton}><Text style={{ color: th.exp, ...weight('900'), fontSize: 12 }}>{isAr ? 'حذف المحفظة' : 'Delete wallet'}</Text></Touchable> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 10, marginBottom: 12 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACE.lg, gap: 8 },
  sheetHead: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  sheetTitle: { fontSize: 18, lineHeight: 25, ...weight('900'), flex: 1 },
  dismiss: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, ...weight('900'), marginTop: 4 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 13, fontSize: 14, ...weight('800') },
  currencyNote: { minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', gap: 8, marginTop: 4 },
  currencyText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 16, ...weight('800') },
  note: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 4 },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
