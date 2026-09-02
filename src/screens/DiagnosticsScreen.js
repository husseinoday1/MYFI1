// Phase 12 — on-device diagnostics for the V2 sync-conflict / restore-recovery
// chain (see src/dev/p12ConflictRecoveryDiagnostics.js). Entirely read-only:
// no SQLite write, no network, no Supabase call, no action/repair button.
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
    await Clipboard.setStringAsync(JSON.stringify(snapshot, null, 2));
    Alert.alert('', isAr ? 'تم نسخ كل بيانات التشخيص.' : 'All diagnostic data copied.');
  };

  const ledger = snapshot?.ledger;

  return (
    <ScreenScroll th={th}>
      <View style={{ flexDirection: rowDirection(lang), gap: 8, marginBottom: 14 }}>
        <AppButton th={th} lang={lang} tone="primary" icon="copy-outline" label={isAr ? 'نسخ الكل' : 'Copy all'} onPress={copyAll} disabled={!snapshot} style={{ flex: 1 }} />
        <AppButton th={th} lang={lang} tone="secondary" icon="refresh-outline" label={isAr ? 'تحديث' : 'Refresh'} onPress={refresh} disabled={loading} style={{ flex: 1 }} />
      </View>

      {loading && !snapshot ? (
        <Text style={{ color: th.sub, textAlign: textAlign(lang) }}>{isAr ? 'جارٍ القراءة…' : 'Reading…'}</Text>
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
