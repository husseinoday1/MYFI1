// Phase 12 — on-device diagnostics for the V2 sync-conflict / restore-recovery
// chain (see src/dev/p12ConflictRecoveryDiagnostics.js). The whole reading side
// is read-only: no SQLite write, no network, no Supabase call.
//
// It carries exactly one action, and only in one state: when a conflict
// recovery was promoted locally but never activated, the owner can put the
// checkpoint back. It is rendered only while that state actually holds, runs
// only after an explicit confirmation, and never repeats itself. The reading
// collector stays write-free — the action calls the recovery library directly.
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
import { restoreFinancialConflictRecoveryCheckpointV1 } from '../lib/financialBootstrapRecoveryPromotionV2';

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
    workspaceNamespace, user,
  } = useStore();

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

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
    await Clipboard.setStringAsync(JSON.stringify({ ...snapshot, restore: restoreResult }, null, 2));
    Alert.alert('', isAr ? 'تم نسخ كل بيانات التشخيص.' : 'All diagnostic data copied.');
  };

  const ledger = snapshot?.ledger;

  // Both halves must hold: a promotion that never activated, and a checkpoint
  // still on disk. In any other state the library refuses anyway, so the button
  // would only be a trap.
  const canRestore = ledger?.ok === true
    && ledger.intent?.status === 'local_promoted_pending_activation'
    && ledger.checkpointPresent === true
    && !!ledger.intent?.checkpointId
    && !!ledger.activeNamespace;

  const runRestore = async () => {
    setRestoreBusy(true);
    let result;
    try {
      result = await restoreFinancialConflictRecoveryCheckpointV1({
        namespace: ledger.activeNamespace,
        checkpointId: ledger.intent.checkpointId,
      });
    } catch (error) {
      result = { ok: false, reason: `restore_threw:${String(error?.message || error)}` };
    }
    setRestoreResult({ finishedAt: new Date().toISOString(), result });
    setRestoreBusy(false);
    // The store still holds the projection the failed promotion installed. It is
    // deliberately not reloaded here: a full restart is the one path that cannot
    // write stale in-memory data back over what was just restored.
    Alert.alert(
      result?.ok ? (isAr ? 'تمت الاستعادة' : 'Restored')
        : (isAr ? 'لم تتم الاستعادة' : 'Not restored'),
      result?.ok
        ? (isAr
          ? 'عادت بياناتك المالية إلى ما كانت عليه قبل محاولة الاستبدال. أغلق التطبيق كليًا الآن ثم افتحه من جديد قبل أي استخدام آخر.'
          : 'Your financial data is back to what it was before the replacement attempt. Close the app completely now and reopen it before using it again.')
        : (isAr
          ? `لم يتغير شيء. السبب: ${result?.reason || 'غير معروف'}`
          : `Nothing changed. Reason: ${result?.reason || 'unknown'}`),
    );
  };

  const confirmRestore = () => {
    Alert.alert(
      isAr ? 'استعادة بياناتك المحفوظة' : 'Restore your saved data',
      isAr
        ? 'ستعود بياناتك المالية إلى ما كانت عليه قبل محاولة الاستبدال، وتبقى المزامنة متوقفة بعدها. عند النجاح أغلق التطبيق كليًا ثم افتحه من جديد قبل أي استخدام آخر.'
        : 'Your financial data returns to what it was before the replacement attempt, and sync stays stopped afterwards. When it succeeds, close the app completely and reopen it before using it again.',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? 'استعادة' : 'Restore', style: 'destructive', onPress: runRestore },
      ],
    );
  };

  return (
    <ScreenScroll th={th}>
      <View style={{ flexDirection: rowDirection(lang), gap: 8, marginBottom: 14 }}>
        <AppButton th={th} lang={lang} tone="primary" icon="copy-outline" label={isAr ? 'نسخ الكل' : 'Copy all'} onPress={copyAll} disabled={!snapshot} style={{ flex: 1 }} />
        <AppButton th={th} lang={lang} tone="secondary" icon="refresh-outline" label={isAr ? 'تحديث' : 'Refresh'} onPress={refresh} disabled={loading} style={{ flex: 1 }} />
      </View>

      {loading && !snapshot ? (
        <Text style={{ color: th.sub, textAlign: textAlign(lang) }}>{isAr ? 'جارٍ القراءة…' : 'Reading…'}</Text>
      ) : null}

      {canRestore && !restoreResult?.result?.ok ? (
        <SurfaceCard th={th} style={{ marginBottom: 12, gap: 8, borderColor: th.warn, borderWidth: 1 }}>
          <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: textAlign(lang) }}>
            {isAr ? 'استعادة بياناتك المحفوظة' : 'Restore your saved data'}
          </Text>
          <Text style={{ color: th.sub, fontSize: 12, textAlign: textAlign(lang) }}>
            {isAr
              ? 'محاولة استبدال سابقة اكتملت محليًا ولم تُفعَّل. بياناتك الحقيقية محفوظة كما هي، ويمكن إعادتها إلى مكانها. المزامنة تبقى متوقفة بعد ذلك.'
              : 'An earlier replacement completed locally but was never activated. Your real data is still preserved and can be put back. Sync stays stopped afterwards.'}
          </Text>
          <AppButton
            th={th} lang={lang} tone="danger" icon="arrow-undo-outline"
            label={restoreBusy ? (isAr ? 'جارٍ الاستعادة…' : 'Restoring…') : (isAr ? 'استعادة بياناتي' : 'Restore my data')}
            onPress={confirmRestore} disabled={restoreBusy}
          />
        </SurfaceCard>
      ) : null}

      {restoreResult ? (
        <Section th={th} lang={lang} isAr={isAr} icon="arrow-undo-outline" title="restoreFinancialConflictRecoveryCheckpointV1">
          <Row th={th} lang={lang} label="ok" value={restoreResult.result?.ok} />
          <Row th={th} lang={lang} label="reason" value={restoreResult.result?.reason} />
          <Row th={th} lang={lang} label="finishedAt" value={restoreResult.finishedAt} />
          <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace', marginTop: 4, textAlign: textAlign(lang) }} selectable>
            {j(restoreResult.result)}
          </Text>
          {restoreResult.result?.ok ? (
            <Text style={{ color: th.warn, fontSize: 12, ...weight('700'), marginTop: 6, textAlign: textAlign(lang) }}>
              {isAr
                ? 'أغلق التطبيق كليًا ثم افتحه من جديد قبل أي استخدام آخر.'
                : 'Close the app completely and reopen it before using it again.'}
            </Text>
          ) : null}
        </Section>
      ) : null}

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
