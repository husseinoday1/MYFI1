// Phase 12 — on-device diagnostics for the V2 sync-conflict / restore-recovery
// chain (see src/dev/p12ConflictRecoveryDiagnostics.js). The whole reading side
// is read-only: no SQLite write, no network, no Supabase call.
//
// It carries three actions, each offered only in the single state it repairs,
// in the order the repair has to happen: put the checkpoint back, drop the
// pending changes the failed attempt left behind, then turn sync back on. Each
// is rendered only while its state actually holds, runs only after an explicit
// confirmation, and disappears once it has succeeded. Turning sync on is the
// ordinary activation path with no special casing — the conflict is repaired by
// the same code every user runs. The reading collector stays write-free; the
// actions call the recovery library and the store action directly.
//
// Reachable only from About > version number (five taps) — not a normal
// user-facing entry point.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { AppButton, ScreenScroll, SectionTitle, SurfaceCard, rowDirection, textAlign } from '../components/AppPrimitives';
import { SPACE, weight } from '../lib/tokens';
import { collectP12ConflictRecoveryDiagnostics } from '../dev/p12ConflictRecoveryDiagnostics';
import { conflictRecoveryGatesV1 } from '../dev/p12ConflictRecoveryGates';
import {
  discardLegacyOutboxAfterCheckpointRestoreV1,
  restoreFinancialConflictRecoveryCheckpointV1,
  retireConflictRecoveryIntentAfterActivationV1,
} from '../lib/financialBootstrapRecoveryPromotionV2';

const j = value => (value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));

function Row({ th, lang, label, value, mono = false }) {
  return (
    <View style={{ flexDirection: rowDirection(lang), justifyContent: 'space-between', gap: 10, paddingVertical: 5 }}>
      <Text style={{ color: th.sub, fontSize: 12, ...weight('700'), textAlign: textAlign(lang) }}>{label}</Text>
      <Text
        style={{ color: th.text, fontSize: 12, flexShrink: 1, textAlign: lang === 'ar' ? 'left' : 'right', fontFamily: mono ? 'monospace' : undefined }}
        selectable
      >
        {j(value)}
      </Text>
    </View>
  );
}

function Section({ th, lang, isAr, icon, title, children }) {
  return (
    <SurfaceCard th={th} style={{ marginBottom: 12, gap: 2 }}>
      <View style={{ flexDirection: rowDirection(lang), alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Ionicons name={icon} size={16} color={th.primary} />
        <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: textAlign(lang) }}>{title}</Text>
      </View>
      {children}
    </SurfaceCard>
  );
}

export default function DiagnosticsScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const {
    lastSyncError, online, syncing, restoreSafety,
    financialCloudRecoveryV2, financialSyncV2Activation,
    workspaceNamespace, user, activateFinancialSyncV2,
  } = useStore();

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [actionResults, setActionResults] = useState({});

  const refresh = useCallback(async () => {
    setLoading(true);
    let ledger = null;
    try {
      ledger = await collectP12ConflictRecoveryDiagnostics({ workspaceNamespace, cfg, user });
    } catch (error) {
      ledger = { supported: true, ok: false, reason: `collector_threw:${String(error?.message || error)}` };
    }
    setSnapshot({
      generatedAt: new Date().toISOString(),
      store: { lastSyncError, online, syncing, restoreSafety, financialCloudRecoveryV2, financialSyncV2Activation },
      ledger,
    });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceNamespace, cfg, user, lastSyncError, online, syncing, restoreSafety, financialCloudRecoveryV2, financialSyncV2Activation]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyAll = async () => {
    if (!snapshot) return;
    await Clipboard.setStringAsync(JSON.stringify({ ...snapshot, actions: actionResults }, null, 2));
    Alert.alert('', isAr ? 'تم نسخ كل بيانات التشخيص.' : 'All diagnostic data copied.');
  };

  const ledger = snapshot?.ledger;

  // Which actions this device may be offered, and whether its unsent entries
  // are genuinely lost. Decided in p12ConflictRecoveryGates so the rules can be
  // tested directly — they were wrong twice before a test existed.
  const {
    legacyRows, unsyncedFinancialRows,
    canRestore, canDiscard, canActivate, showUnsyncedFinancialWarning,
  } = conflictRecoveryGatesV1(ledger);

  // Activation is only finished when the ledger activated *and* the intent that
  // holds the sync gate shut was retired. Reporting on activation alone would
  // tell the owner sync is back while every later sync still refuses.
  const succeeded = entry => !!(
    entry?.result?.ok
    || (entry?.result?.activation?.ok && entry?.result?.intentRetired?.ok)
  );

  const finish = (key, result, title, message) => {
    setActionResults(current => ({ ...current, [key]: { finishedAt: new Date().toISOString(), result } }));
    setBusyAction(null);
    Alert.alert(title, message);
  };

  const restartNotice = isAr
    ? 'أغلق التطبيق كليًا الآن ثم افتحه من جديد قبل أي استخدام آخر.'
    : 'Close the app completely now and reopen it before using it again.';
  const failureNotice = result => (isAr
    ? `لم يتغير شيء. السبب: ${result?.reason || 'غير معروف'}`
    : `Nothing changed. Reason: ${result?.reason || 'unknown'}`);

  const runRestore = async () => {
    setBusyAction('restore');
    let result;
    try {
      result = await restoreFinancialConflictRecoveryCheckpointV1({
        namespace: ledger.activeNamespace,
        checkpointId: ledger.intent.checkpointId,
      });
    } catch (error) {
      result = { ok: false, reason: `restore_threw:${String(error?.message || error)}` };
    }
    // The store still holds the projection the failed promotion installed. It is
    // deliberately not reloaded here: a full restart is the one path that cannot
    // write stale in-memory data back over what was just restored.
    finish('restore', result,
      result?.ok ? (isAr ? 'تمت الاستعادة' : 'Restored') : (isAr ? 'لم تتم الاستعادة' : 'Not restored'),
      result?.ok
        ? `${isAr ? 'عادت بياناتك المالية إلى ما كانت عليه قبل محاولة الاستبدال. ' : 'Your financial data is back to what it was before the replacement attempt. '}${restartNotice}`
        : failureNotice(result));
  };

  const runDiscard = async () => {
    setBusyAction('discard');
    let result;
    try {
      result = await discardLegacyOutboxAfterCheckpointRestoreV1({ namespace: ledger.activeNamespace });
    } catch (error) {
      result = { ok: false, reason: `discard_threw:${String(error?.message || error)}` };
    }
    finish('discard', result,
      result?.ok ? (isAr ? 'تم التنظيف' : 'Cleaned up') : (isAr ? 'لم يتم التنظيف' : 'Not cleaned up'),
      result?.ok
        ? (isAr
          ? `أُزيلت ${Number(result.discarded || 0)} من التعديلات المعلّقة التي خلّفتها المحاولة الفاشلة. بياناتك المالية لم تتغيّر.`
          : `Removed ${Number(result.discarded || 0)} pending changes left by the failed attempt. Your financial data is unchanged.`)
        : failureNotice(result));
    if (result?.ok) refresh();
  };

  const runActivate = async () => {
    setBusyAction('activate');
    let result;
    let retired = null;
    try {
      result = await activateFinancialSyncV2();
      // The gate opens only against proof read from the database itself, and
      // only after the activation this attempt actually achieved.
      if (result?.ok) {
        retired = await retireConflictRecoveryIntentAfterActivationV1({ namespace: ledger.activeNamespace });
      }
    } catch (error) {
      result = { ok: false, reason: `activate_threw:${String(error?.message || error)}` };
    }
    const entry = { activation: result, intentRetired: retired };
    finish('activate', entry,
      succeeded({ result: entry }) ? (isAr ? 'تم تفعيل المزامنة' : 'Sync activated') : (isAr ? 'لم يتم التفعيل' : 'Not activated'),
      succeeded({ result: entry })
        ? `${isAr ? 'عادت المزامنة للعمل ونزلت تعديلات السحابة. ' : 'Sync is working again and the cloud changes came down. '}${restartNotice}`
        : result?.ok
          // Activated, but the gate is still shut. Saying "done" here would be
          // a lie the owner only discovers when the next sync refuses.
          ? (isAr
            ? `تم التفعيل لكن حاجز المزامنة لم يُرفع. السبب: ${retired?.reason || 'غير معروف'}`
            : `Activated, but the sync block was not lifted. Reason: ${retired?.reason || 'unknown'}`)
          : failureNotice(result));
  };

  const confirm = (title, message, action, onPress) => Alert.alert(title, message, [
    { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress },
  ]);

  const confirmRestore = () => confirm(
    isAr ? 'استعادة بياناتك المحفوظة' : 'Restore your saved data',
    isAr
      ? 'ستعود بياناتك المالية إلى ما كانت عليه قبل محاولة الاستبدال، وتبقى المزامنة متوقفة بعدها. عند النجاح أغلق التطبيق كليًا ثم افتحه من جديد قبل أي استخدام آخر.'
      : 'Your financial data returns to what it was before the replacement attempt, and sync stays stopped afterwards. When it succeeds, close the app completely and reopen it before using it again.',
    isAr ? 'استعادة' : 'Restore', runRestore);

  const confirmDiscard = () => confirm(
    isAr ? 'إزالة تعديلات الإعدادات المعلّقة' : 'Remove the pending settings changes',
    isAr
      ? `ستُزال ${legacyRows.length} من تعديلات الإعدادات المعلّقة التي خلّفتها المحاولة الفاشلة ولا يمكن للسحابة قبولها. لا حركات ولا أرصدة ضمنها — لو وُجدت لتوقفت العملية. وأي تعديل أقدم من نسختك المحفوظة لن يُمَس.`
      : `This removes ${legacyRows.length} pending settings changes left by the failed attempt that the cloud can never accept. No transactions or balances are among them — if any were, this would stop. Nothing older than your saved copy is touched.`,
    isAr ? 'إزالة' : 'Remove', runDiscard);

  const confirmActivate = () => confirm(
    isAr ? 'إعادة تشغيل المزامنة' : 'Turn sync back on',
    isAr
      ? 'ستُنزَّل تعديلات السحابة التي فات الجهاز استقبالها وتُطبَّق على بياناتك. نسختك المحفوظة تبقى كما هي. عند النجاح أغلق التطبيق كليًا ثم افتحه من جديد.'
      : 'The cloud changes this device missed will be downloaded and applied to your data. Your saved copy stays as it is. When it succeeds, close the app completely and reopen it.',
    isAr ? 'تشغيل' : 'Turn on', runActivate);

  const ACTIONS = [
    {
      key: 'restore',
      show: canRestore,
      icon: 'arrow-undo-outline',
      title: isAr ? 'استعادة بياناتك المحفوظة' : 'Restore your saved data',
      body: isAr
        ? 'محاولة استبدال سابقة اكتملت محليًا ولم تُفعَّل. بياناتك الحقيقية محفوظة كما هي، ويمكن إعادتها إلى مكانها. المزامنة تبقى متوقفة بعد ذلك.'
        : 'An earlier replacement completed locally but was never activated. Your real data is still preserved and can be put back. Sync stays stopped afterwards.',
      label: isAr ? 'استعادة بياناتي' : 'Restore my data',
      busyLabel: isAr ? 'جارٍ الاستعادة…' : 'Restoring…',
      onPress: confirmRestore,
    },
    {
      key: 'discard',
      show: canDiscard,
      icon: 'trash-outline',
      title: isAr ? 'إزالة تعديلات الإعدادات المعلّقة' : 'Remove the pending settings changes',
      body: isAr
        ? `بقيت ${legacyRows.length} من تعديلات الإعدادات من المحاولة الفاشلة، لا يمكن للسحابة قبولها. كلها إعدادات — لا حركات ولا أرصدة.`
        : `${legacyRows.length} settings changes remain from the failed attempt and the cloud can never accept them. All of them are settings — no transactions, no balances.`,
      label: isAr ? 'إزالة المعلّق' : 'Remove them',
      busyLabel: isAr ? 'جارٍ الإزالة…' : 'Removing…',
      onPress: confirmDiscard,
    },
    {
      key: 'activate',
      show: canActivate,
      icon: 'sync-outline',
      title: isAr ? 'إعادة تشغيل المزامنة' : 'Turn sync back on',
      body: isAr
        ? `طابور المزامنة النشط فارغ. تشغيل المزامنة سيُنزّل ما فات الجهاز من السحابة عبر المسار العادي.${showUnsyncedFinancialWarning ? ' الحركات غير المُرسَلة أعلاه تبقى محفوظة كما هي ولن يرفعها التفعيل.' : ''}`
        : `The active sync queue is empty. Turning sync on downloads what this device missed through the ordinary path.${showUnsyncedFinancialWarning ? ' The unsent entries above stay as they are; activation will not upload them.' : ''}`,
      label: isAr ? 'تشغيل المزامنة' : 'Turn sync on',
      busyLabel: isAr ? 'جارٍ التفعيل…' : 'Activating…',
      onPress: confirmActivate,
    },
  ];

  return (
    <ScreenScroll th={th}>
      <View style={{ flexDirection: rowDirection(lang), gap: 8, marginBottom: 14 }}>
        <AppButton th={th} lang={lang} tone="primary" icon="copy-outline" label={isAr ? 'نسخ الكل' : 'Copy all'} onPress={copyAll} disabled={!snapshot} style={{ flex: 1 }} />
        <AppButton th={th} lang={lang} tone="secondary" icon="refresh-outline" label={isAr ? 'تحديث' : 'Refresh'} onPress={refresh} disabled={loading} style={{ flex: 1 }} />
      </View>

      {loading && !snapshot ? (
        <Text style={{ color: th.sub, textAlign: textAlign(lang) }}>{isAr ? 'جارٍ القراءة…' : 'Reading…'}</Text>
      ) : null}

      {showUnsyncedFinancialWarning ? (
        <SurfaceCard th={th} style={{ marginBottom: 12, gap: 8, borderColor: th.warn, borderWidth: 1 }}>
          <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: textAlign(lang) }}>
            {isAr ? 'حركات لم تصل السحابة' : 'Transactions the cloud never received'}
          </Text>
          <Text style={{ color: th.sub, fontSize: 12, textAlign: textAlign(lang) }}>
            {isAr
              ? `${unsyncedFinancialRows.length} حركة أُنشئت على هذا الجهاز ولم تُرسَل، ولم تعد ضمن بياناتك الحالية. تفاصيلها كاملة محفوظة هنا ولن تُحذف — أعد إدخالها يدويًا بعد عودة المزامنة، ثم أرسل «نسخ الكل» للدعم أولًا.`
              : `${unsyncedFinancialRows.length} entries were created on this device, never sent, and are no longer part of your current data. Their full details are kept here and will not be deleted — re-enter them by hand once sync is back, and send "Copy all" to support first.`}
          </Text>
          {unsyncedFinancialRows.map(row => (
            <Text
              key={row.sequence_id}
              style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', textAlign: textAlign(lang) }}
              selectable
            >
              {`#${row.sequence_id} ${row.entity_type}/${row.operation} · ${row.created_at}`}
            </Text>
          ))}
        </SurfaceCard>
      ) : null}

      {ACTIONS.map(action => (action.show && !succeeded(actionResults[action.key]) ? (
        <SurfaceCard key={action.key} th={th} style={{ marginBottom: 12, gap: 8, borderColor: th.warn, borderWidth: 1 }}>
          <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: textAlign(lang) }}>{action.title}</Text>
          <Text style={{ color: th.sub, fontSize: 12, textAlign: textAlign(lang) }}>{action.body}</Text>
          <AppButton
            th={th} lang={lang} tone="danger" icon={action.icon}
            label={busyAction === action.key ? action.busyLabel : action.label}
            onPress={action.onPress} disabled={!!busyAction}
          />
        </SurfaceCard>
      ) : null))}

      {Object.entries(actionResults).map(([key, entry]) => (
        <Section key={key} th={th} lang={lang} isAr={isAr} icon="receipt-outline" title={key}>
          <Row th={th} lang={lang} label="finishedAt" value={entry.finishedAt} />
          <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', marginTop: 4, textAlign: textAlign(lang) }} selectable>
            {j(entry.result)}
          </Text>
          {succeeded(entry) ? (
            <Text style={{ color: th.warn, fontSize: 12, ...weight('700'), marginTop: 6, textAlign: textAlign(lang) }}>
              {isAr
                ? 'أغلق التطبيق كليًا ثم افتحه من جديد قبل أي استخدام آخر.'
                : 'Close the app completely and reopen it before using it again.'}
            </Text>
          ) : null}
        </Section>
      ))}

      {snapshot ? (
        <>
          <SectionTitle th={th} lang={lang}>{isAr ? 'حالة المزامنة' : 'Sync state'}</SectionTitle>
          <Section th={th} lang={lang} isAr={isAr} icon="sync-outline" title={isAr ? 'lastSyncError / online / syncing' : 'lastSyncError / online / syncing'}>
            <Row th={th} lang={lang} label="online" value={online} />
            <Row th={th} lang={lang} label="syncing" value={syncing} />
            <Row th={th} lang={lang} label="lastSyncError" value={lastSyncError} />
          </Section>
          <Section th={th} lang={lang} isAr={isAr} icon="shield-outline" title="restoreSafety">
            <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', textAlign: textAlign(lang) }} selectable>
              {j(restoreSafety)}
            </Text>
          </Section>

          <SectionTitle th={th} lang={lang}>{isAr ? 'استعادة السحابة V2' : 'Cloud recovery V2'}</SectionTitle>
          <Section th={th} lang={lang} isAr={isAr} icon="cloud-outline" title="financialCloudRecoveryV2">
            <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', textAlign: textAlign(lang) }} selectable>
              {j(financialCloudRecoveryV2)}
            </Text>
          </Section>
          <Section th={th} lang={lang} isAr={isAr} icon="key-outline" title="financialSyncV2Activation">
            <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', textAlign: textAlign(lang) }} selectable>
              {j(financialSyncV2Activation)}
            </Text>
          </Section>

          {!ledger?.supported ? (
            <Section th={th} lang={lang} isAr={isAr} icon="warning-outline" title={isAr ? 'قاعدة البيانات المحلية' : 'Local database'}>
              <Row th={th} lang={lang} label="reason" value={ledger?.reason} />
            </Section>
          ) : !ledger?.ok ? (
            <Section th={th} lang={lang} isAr={isAr} icon="warning-outline" title={isAr ? 'قاعدة البيانات المحلية' : 'Local database'}>
              <Row th={th} lang={lang} label="reason" value={ledger?.reason} />
            </Section>
          ) : (
            <>
              <SectionTitle th={th} lang={lang}>{isAr ? 'هوية الدفتر' : 'Ledger identity'}</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="finger-print-outline" title="ledger_sync_identity_v8">
                <Row th={th} lang={lang} label="namespace" value={ledger.activeNamespace} />
                <Row th={th} lang={lang} label="ledger_id" value={ledger.identity?.ledger_id} mono />
                <Row th={th} lang={lang} label="restore_epoch" value={ledger.identity?.restore_epoch} />
              </Section>

              <SectionTitle th={th} lang={lang}>{isAr ? 'نية استرداد التعارض' : 'Conflict recovery intent'}</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="git-merge-outline" title="financial_v2_conflict_recovery_intent_v1">
                <Row th={th} lang={lang} label={isAr ? 'موجود' : 'present'} value={ledger.intentPresent} />
                {ledger.intent ? (
                  <>
                    <Row th={th} lang={lang} label="status" value={ledger.intent.status} />
                    <Row th={th} lang={lang} label="checkpointId" value={ledger.intent.checkpointId} mono />
                    <Row th={th} lang={lang} label="preparedAt" value={ledger.intent.preparedAt} />
                    <Row th={th} lang={lang} label="cloudLedgerId" value={ledger.intent.cloudLedgerId} mono />
                    <Row th={th} lang={lang} label="cloudRestoreEpoch" value={ledger.intent.cloudRestoreEpoch} />
                  </>
                ) : null}
              </Section>

              <SectionTitle th={th} lang={lang}>{isAr ? 'إيصال نقطة الاسترجاع' : 'Checkpoint receipt'}</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="receipt-outline" title="financial_v2_conflict_checkpoint_v1">
                <Row th={th} lang={lang} label={isAr ? 'موجود' : 'present'} value={ledger.checkpointPresent} />
                {ledger.checkpoint ? (
                  <>
                    <Row th={th} lang={lang} label="checkpointId" value={ledger.checkpoint.checkpointId} mono />
                    <Row th={th} lang={lang} label="createdAt" value={ledger.checkpoint.createdAt} />
                    <Row th={th} lang={lang} label="sourceGeneration" value={ledger.checkpoint.sourceGeneration} />
                    <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', marginTop: 4, textAlign: textAlign(lang) }} selectable>
                      counts: {j(ledger.checkpoint.counts)}
                    </Text>
                  </>
                ) : null}
              </Section>

              <SectionTitle th={th} lang={lang}>{isAr ? 'استيراد التمهيد والأرشيف' : 'Bootstrap & archive import'}</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="download-outline" title="ledger_bootstrap_recovery_import_v9">
                {ledger.bootstrapImports?.length ? ledger.bootstrapImports.map((row, index) => (
                  <View key={row.session_id || index} style={{ marginBottom: index < ledger.bootstrapImports.length - 1 ? 8 : 0 }}>
                    <Row th={th} lang={lang} label="session_id" value={row.session_id} mono />
                    <Row th={th} lang={lang} label="status" value={row.status} />
                  </View>
                )) : <Text style={{ color: th.faint, fontSize: 12, textAlign: textAlign(lang) }}>{isAr ? 'لا صفوف' : 'no rows'}</Text>}
              </Section>
              <Section th={th} lang={lang} isAr={isAr} icon="archive-outline" title="ledger_archive_recovery_import_v11">
                {ledger.archiveImports?.length ? ledger.archiveImports.map((row, index) => (
                  <View key={row.session_id || index} style={{ marginBottom: index < ledger.archiveImports.length - 1 ? 8 : 0 }}>
                    <Row th={th} lang={lang} label="session_id" value={row.session_id} mono />
                    <Row th={th} lang={lang} label="status" value={row.status} />
                  </View>
                )) : <Text style={{ color: th.faint, fontSize: 12, textAlign: textAlign(lang) }}>{isAr ? 'لا صفوف' : 'no rows'}</Text>}
              </Section>

              <SectionTitle th={th} lang={lang}>Outbox</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="file-tray-full-outline" title={isAr ? 'الصفوف المعلّقة' : 'Pending rows'}>
                <Row th={th} lang={lang} label="ledger_outbox_v3 pending" value={ledger.outboxV3PendingCount} />
                <Row th={th} lang={lang} label="ledger_outbox_v2 pending" value={ledger.outboxV2PendingCount} />
                <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', marginTop: 4, textAlign: textAlign(lang) }} selectable>
                  ledger_outbox_v3 rows: {j(ledger.outboxV3PendingRows)}
                </Text>
                <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', marginTop: 4, textAlign: textAlign(lang) }} selectable>
                  ledger_outbox_v2 rows: {j(ledger.outboxV2PendingRows)}
                </Text>
              </Section>

              <SectionTitle th={th} lang={lang}>resumePreparedCloudConflictRecoveryV1</SectionTitle>
              <Section th={th} lang={lang} isAr={isAr} icon="play-skip-forward-outline" title={isAr ? 'نتيجة الاستدعاء الحالية' : 'Current call result'}>
                <Row th={th} lang={lang} label="ok" value={ledger.resume?.ok} />
                <Row th={th} lang={lang} label="found" value={ledger.resume?.found} />
                <Row th={th} lang={lang} label="reason" value={ledger.resume?.reason} />
              </Section>
            </>
          )}

          <Text style={{ color: th.faint, fontSize: 10, textAlign: 'center', marginTop: 8 }}>{snapshot.generatedAt}</Text>
        </>
      ) : null}
    </ScreenScroll>
  );
}
