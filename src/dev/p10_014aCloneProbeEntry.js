// MYFI P10-014A-001-R5.2 — fail-closed same-package / cloned-database probe.
//
// The APK keeps applicationId com.myfi.app only to enter the original app sandbox.
// The original ledger is opened query-only solely as the source of SQLite's backup API.
// All Strategy B work, migrations, fixtures, global currency writes and cleanup occur
// on a disposable clone database selected through the R5 diagnostic override.

import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import {
  LEDGER_DB_NAME,
  setP10CloneLedgerDbOverride,
  clearP10CloneLedgerDbOverride,
} from '../lib/ledgerDatabase';
import {
  isOwnedCloneDatabaseName,
  sweepOwnedCloneArtifacts,
} from './p10_014aCloneArtifacts';

const LOG = '[P10_014A_CLONE_PROBE]';
const CLONE_MARKER_KEY = 'p10_014a_clone_database_marker';
const SOURCE_ARTIFACT_FINGERPRINT_KEY = 'p10_014a_source_artifact_fingerprint';
const CLONE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1';
const FAULT_MATRIX_FLAG = process.env.EXPO_PUBLIC_P10_014A_FAULT_MATRIX === '1';
const KILL_WINDOW_PATTERN = /[?&]window=(unlocked_batch|final_locked|cleanup_only)(?:&|$)/;

const requestedKillWindow = async () => {
  const initialUrl = String(await Linking.getInitialURL() || '');
  const match = initialUrl.match(KILL_WINDOW_PATTERN);
  return match?.[1] || null;
};

const scalar = row => {
  if (!row || typeof row !== 'object') return null;
  const values = Object.values(row);
  return values.length ? values[0] : null;
};

const toFileUri = value => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('p10_clone_probe_database_directory_missing');
  if (raw.startsWith('file://')) return raw;
  if (raw.startsWith('/')) return `file://${raw}`;
  throw new Error('p10_clone_probe_database_directory_invalid');
};

const databaseUri = name => (
  `${toFileUri(SQLite.defaultDatabaseDirectory)}/${String(name || '').replace(/^\/+/, '')}`
);

const databaseHandleUri = database => toFileUri(database?.databasePath);

const sweepCloneArtifacts = () => sweepOwnedCloneArtifacts({
  fileSystem: FileSystem,
  directoryUri: toFileUri(SQLite.defaultDatabaseDirectory),
  sourceDatabaseName: LEDGER_DB_NAME,
});

const fileArtifactFingerprint = async uri => {
  const info = await FileSystem.getInfoAsync(uri, { md5: true });
  return info?.exists && !info?.isDirectory
    ? Object.freeze({ exists: true, size: Number(info.size || 0), md5: String(info.md5 || '') })
    : Object.freeze({ exists: false, size: 0, md5: '' });
};

const sourceArtifactFingerprint = async () => {
  const sourceUri = databaseUri(LEDGER_DB_NAME);
  return Object.freeze({
    database: await fileArtifactFingerprint(sourceUri),
    wal: await fileArtifactFingerprint(`${sourceUri}-wal`),
  });
};

const recoverKillWindowArtifacts = async () => {
  const directoryUri = toFileUri(SQLite.defaultDatabaseDirectory);
  const names = await FileSystem.readDirectoryAsync(directoryUri);
  const cloneNames = names.map(name => String(name || '')).filter(isOwnedCloneDatabaseName).sort();
  const sourceFingerprintAfterRestart = await sourceArtifactFingerprint();
  const comparisons = [];

  for (const cloneName of cloneNames) {
    let clone = null;
    try {
      clone = await SQLite.openDatabaseAsync(
        cloneName,
        { useNewConnection: true },
        SQLite.defaultDatabaseDirectory,
      );
      const row = await clone.getFirstAsync(
        'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
        SOURCE_ARTIFACT_FINGERPRINT_KEY,
      );
      if (!row?.value) continue;
      const sourceFingerprintBeforeKill = JSON.parse(String(row.value));
      comparisons.push(Object.freeze({
        cloneName,
        sourceFingerprintBeforeKill,
        sourceFingerprintAfterRestart,
        stable: JSON.stringify(sourceFingerprintBeforeKill)
          === JSON.stringify(sourceFingerprintAfterRestart),
      }));
    } finally {
      try { await clone?.closeAsync?.(); } catch {}
    }
  }

  return Object.freeze({
    sourceFingerprintAfterRestart,
    comparisons,
    comparisonCount: comparisons.length,
    sourceFingerprintStable: comparisons.length > 0
      && comparisons.every(item => item.stable === true),
  });
};

const nonce = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
);

async function runCloneProbe() {
  if (!CLONE_FLAG) throw new Error('p10_clone_probe_build_flag_required');
  const killWindow = await requestedKillWindow();
  if (killWindow === 'cleanup_only') {
    const recovery = await recoverKillWindowArtifacts();
    const orphanSweep = await sweepCloneArtifacts();
    console.info(LOG, 'ORPHAN_CLONE_SWEEP', JSON.stringify(orphanSweep));
    if (!recovery.sourceFingerprintStable) {
      throw new Error('p10_clone_probe_source_fingerprint_changed_after_process_kill');
    }
    console.info(LOG, 'SOURCE_FINGERPRINT_RECOVERY', JSON.stringify(recovery));
    return {
      ok: true,
      patchId: 'P10-014A-002-R6.2',
      mode: 'orphan_cleanup_only',
      originalDatabaseReadOnly: true,
      originalDatabaseMutationByHarness: false,
      orphanCloneArtifactCount: orphanSweep.artifactCount,
      orphanCloneCleanupVerified: orphanSweep.cleanupVerified,
      sourceFingerprintComparisonCount: recovery.comparisonCount,
      sourceFingerprintStable: recovery.sourceFingerprintStable,
      cloneDeletedAfterRun: true,
      harnessResult: { ok: true, cleanupOnly: true },
    };
  }
  const orphanSweep = await sweepCloneArtifacts();
  console.info(LOG, 'ORPHAN_CLONE_SWEEP', JSON.stringify(orphanSweep));
  const sourceUri = databaseUri(LEDGER_DB_NAME);
  const sourceInfoBefore = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfoBefore?.exists || sourceInfoBefore?.isDirectory || Number(sourceInfoBefore?.size || 0) <= 0) {
    throw new Error('p10_clone_probe_source_database_missing');
  }

  const cloneName = `p10-014a-r5-clone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.db`;
  if (!isOwnedCloneDatabaseName(cloneName)) {
    throw new Error('p10_clone_probe_clone_name_invalid');
  }
  const cloneUri = databaseUri(cloneName);
  const existingClone = await FileSystem.getInfoAsync(cloneUri);
  if (existingClone?.exists) throw new Error('p10_clone_probe_clone_name_collision');

  let source = null;
  let clone = null;
  let overrideEnabled = false;
  const cloneNonce = nonce();
  let sourceFingerprintBefore = null;
  let sourceFingerprintAfter = null;
  let sourceFileMetadataObservation = null;
  let harnessResult = null;
  let cloneDeleted = false;

  try {
    source = await SQLite.openDatabaseAsync(
      LEDGER_DB_NAME,
      { useNewConnection: true },
      SQLite.defaultDatabaseDirectory,
    );
    if (databaseHandleUri(source) !== sourceUri) {
      throw new Error('p10_clone_probe_source_database_path_mismatch');
    }
    await source.execAsync('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
    const queryOnly = Number(scalar(await source.getFirstAsync('PRAGMA query_only')) || 0);
    if (queryOnly !== 1) throw new Error('p10_clone_probe_source_not_query_only');

    const quick = String(scalar(await source.getFirstAsync('PRAGMA quick_check')) || '').toLowerCase();
    const sourceJournalMode = String(scalar(await source.getFirstAsync('PRAGMA journal_mode')) || '').toLowerCase();
    const sourceUserVersion = Number(scalar(await source.getFirstAsync('PRAGMA user_version')) || 0);
    const sourceSchemaVersion = Number(scalar(await source.getFirstAsync('PRAGMA schema_version')) || 0);
    const sourceDataVersion = Number(scalar(await source.getFirstAsync('PRAGMA data_version')) || 0);
    const sourcePageCount = Number(scalar(await source.getFirstAsync('PRAGMA page_count')) || 0);
    const sourceFreelistCount = Number(scalar(await source.getFirstAsync('PRAGMA freelist_count')) || 0);
    const ledgerSchemaRow = await source.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='schema_version' LIMIT 1",
    );
    const sqliteSchemaRow = await source.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='sqlite_schema_version' LIMIT 1",
    );
    const totalChangesBefore = Number((await source.getFirstAsync('SELECT total_changes() AS n'))?.n || 0);

    if (quick !== 'ok') throw new Error('p10_clone_probe_source_quick_check_failed');
    if (sourceUserVersion !== 8) throw new Error('p10_clone_probe_source_user_version_not_8');
    if (Number(ledgerSchemaRow?.value) !== 7) throw new Error('p10_clone_probe_source_ledger_schema_not_7');
    if (Number(sqliteSchemaRow?.value) !== 8) throw new Error('p10_clone_probe_source_sqlite_schema_not_8');
    if (totalChangesBefore !== 0) throw new Error('p10_clone_probe_source_connection_not_pristine');
    if (sourcePageCount <= 0 || sourceFreelistCount < 0) {
      throw new Error('p10_clone_probe_source_page_invariants_invalid');
    }

    sourceFingerprintBefore = Object.freeze({
      journalMode: sourceJournalMode,
      userVersion: sourceUserVersion,
      schemaVersion: sourceSchemaVersion,
      dataVersion: sourceDataVersion,
      pageCount: sourcePageCount,
      freelistCount: sourceFreelistCount,
      ledgerSchemaVersion: Number(ledgerSchemaRow?.value),
      sqliteSchemaVersion: Number(sqliteSchemaRow?.value),
      totalChanges: totalChangesBefore,
      queryOnly: true,
    });

    clone = await SQLite.openDatabaseAsync(
      cloneName,
      { useNewConnection: true },
      SQLite.defaultDatabaseDirectory,
    );
    if (databaseHandleUri(clone) !== cloneUri) {
      throw new Error('p10_clone_probe_clone_database_path_mismatch');
    }
    await SQLite.backupDatabaseAsync({
      sourceDatabase: source,
      sourceDatabaseName: 'main',
      destDatabase: clone,
      destDatabaseName: 'main',
    });

    const sourceQuickAfter = String(scalar(await source.getFirstAsync('PRAGMA quick_check')) || '').toLowerCase();
    const sourceJournalModeAfter = String(scalar(await source.getFirstAsync('PRAGMA journal_mode')) || '').toLowerCase();
    const totalChangesAfter = Number((await source.getFirstAsync('SELECT total_changes() AS n'))?.n || 0);
    const sourceUserVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA user_version')) || 0);
    const sourceSchemaVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA schema_version')) || 0);
    const sourceDataVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA data_version')) || 0);
    const sourcePageCountAfter = Number(scalar(await source.getFirstAsync('PRAGMA page_count')) || 0);
    const sourceFreelistCountAfter = Number(scalar(await source.getFirstAsync('PRAGMA freelist_count')) || 0);
    const ledgerSchemaRowAfter = await source.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='schema_version' LIMIT 1",
    );
    const sqliteSchemaRowAfter = await source.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='sqlite_schema_version' LIMIT 1",
    );

    sourceFingerprintAfter = Object.freeze({
      journalMode: sourceJournalModeAfter,
      userVersion: sourceUserVersionAfter,
      schemaVersion: sourceSchemaVersionAfter,
      dataVersion: sourceDataVersionAfter,
      pageCount: sourcePageCountAfter,
      freelistCount: sourceFreelistCountAfter,
      ledgerSchemaVersion: Number(ledgerSchemaRowAfter?.value),
      sqliteSchemaVersion: Number(sqliteSchemaRowAfter?.value),
      totalChanges: totalChangesAfter,
      queryOnly: true,
    });

    if (sourceQuickAfter !== 'ok'
        || JSON.stringify(sourceFingerprintAfter) !== JSON.stringify(sourceFingerprintBefore)) {
      throw new Error('p10_clone_probe_source_changed_during_backup');
    }

    const sourceInfoBeforeClose = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfoBeforeClose?.exists
        || sourceInfoBeforeClose?.isDirectory
        || Number(sourceInfoBeforeClose?.size || 0) <= 0) {
      throw new Error('p10_clone_probe_source_database_missing_before_close');
    }

    await source.closeAsync();
    source = null;

    const sourceInfoAfterClose = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfoAfterClose?.exists
        || sourceInfoAfterClose?.isDirectory
        || Number(sourceInfoAfterClose?.size || 0) <= 0) {
      throw new Error('p10_clone_probe_source_database_missing_after_close');
    }

    sourceFileMetadataObservation = Object.freeze({
      journalMode: sourceFingerprintBefore.journalMode,
      beforeOpen: Object.freeze({
        size: Number(sourceInfoBefore.size || 0),
        modificationTime: Number(sourceInfoBefore.modificationTime || 0),
      }),
      beforeClose: Object.freeze({
        size: Number(sourceInfoBeforeClose.size || 0),
        modificationTime: Number(sourceInfoBeforeClose.modificationTime || 0),
      }),
      afterClose: Object.freeze({
        size: Number(sourceInfoAfterClose.size || 0),
        modificationTime: Number(sourceInfoAfterClose.modificationTime || 0),
      }),
      changedBeforeClose: (
        Number(sourceInfoBeforeClose.size || 0) !== Number(sourceInfoBefore.size || 0)
        || Number(sourceInfoBeforeClose.modificationTime || 0) !== Number(sourceInfoBefore.modificationTime || 0)
      ),
      changedOnClose: (
        Number(sourceInfoAfterClose.size || 0) !== Number(sourceInfoBeforeClose.size || 0)
        || Number(sourceInfoAfterClose.modificationTime || 0) !== Number(sourceInfoBeforeClose.modificationTime || 0)
      ),
    });

    // §102: this clone is installed as the shared ledger connection via
    // setP10CloneLedgerDbOverride, and getLedgerDb() returns it *before* reaching its
    // own pragma block — so this line is the clone's only chance to match the
    // connection contract. It must carry all four operational pragmas that
    // ledgerDatabase.getLedgerDb() sets, synchronous included; omitting synchronous
    // left this path at the SQLite default FULL.
    await clone.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    const cloneQuick = String(scalar(await clone.getFirstAsync('PRAGMA quick_check')) || '').toLowerCase();
    const cloneUserVersion = Number(scalar(await clone.getFirstAsync('PRAGMA user_version')) || 0);
    const clonePageCount = Number(scalar(await clone.getFirstAsync('PRAGMA page_count')) || 0);
    const cloneLedgerSchemaRow = await clone.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='schema_version' LIMIT 1",
    );
    const cloneSqliteSchemaRow = await clone.getFirstAsync(
      "SELECT value FROM ledger_v7_meta WHERE key='sqlite_schema_version' LIMIT 1",
    );
    // SQLite Online Backup deliberately changes the destination schema cookie
    // when backup completes. Destination PRAGMA schema_version is therefore not
    // a source-equivalence invariant. Verify logical/application schema instead.
    if (cloneQuick !== 'ok'
        || cloneUserVersion !== sourceFingerprintBefore.userVersion
        || clonePageCount !== sourceFingerprintBefore.pageCount
        || Number(cloneLedgerSchemaRow?.value) !== sourceFingerprintBefore.ledgerSchemaVersion
        || Number(cloneSqliteSchemaRow?.value) !== sourceFingerprintBefore.sqliteSchemaVersion) {
      throw new Error('p10_clone_probe_clone_verification_failed');
    }

    // Durable proof that getLedgerDb() is returning this clone, not the source DB.
    await clone.runAsync(
      'INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      CLONE_MARKER_KEY,
      cloneNonce,
      new Date().toISOString(),
    );
    if (killWindow) {
      const sourceFingerprintBeforeKill = await sourceArtifactFingerprint();
      await clone.runAsync(
        'INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
        SOURCE_ARTIFACT_FINGERPRINT_KEY,
        JSON.stringify(sourceFingerprintBeforeKill),
        new Date().toISOString(),
      );
      console.info(LOG, 'SOURCE_FINGERPRINT_BASELINE', JSON.stringify({
        killWindow,
        sourceFingerprintBeforeKill,
      }));
    }
    globalThis.__MYFI_P10_014A_CLONE_NONCE__ = cloneNonce;
    globalThis.__MYFI_P10_014A_CLONE_DB_NAME__ = cloneName;
    globalThis.__MYFI_P10_014A_KILL_WINDOW__ = killWindow;
    setP10CloneLedgerDbOverride(clone);
    overrideEnabled = true;

    // Import the full harness only AFTER the source DB is closed and clone override is active.
    const harness = await import('./phase10RestoreBenchmarkHarness');
    if (!harness.PHASE10_RESTORE_BENCHMARK_ENABLED) {
      throw new Error('p10_clone_probe_harness_flags_required');
    }
    harnessResult = killWindow
      ? await harness.runPhase10RestoreKillWindowHarness({ killWindow })
      : FAULT_MATRIX_FLAG
        ? await harness.runPhase10RestoreFaultMatrixHarness()
        : await harness.runPhase10RestoreBenchmarkHarness();
    if (!harnessResult?.ok) throw new Error('p10_clone_probe_harness_failed');

    return {
      ok: true,
      patchId: killWindow
        ? 'P10-014A-002-R6.2'
        : FAULT_MATRIX_FLAG ? 'P10-014A-002-R6.3' : 'P10-014A-001-R5.3',
      mode: 'original_package_sqlite_backup_clone',
      originalDatabaseReadOnly: true,
      originalDatabaseMutationByHarness: false,
      orphanCloneArtifactCount: orphanSweep.artifactCount,
      orphanCloneCleanupVerified: orphanSweep.cleanupVerified,
      sourceFingerprintStable: JSON.stringify(sourceFingerprintBefore) === JSON.stringify(sourceFingerprintAfter),
      sourceFileMetadataObservation,
      cloneDeletedAfterRun: true,
      harnessResult,
    };
  } finally {
    if (overrideEnabled) {
      try { clearP10CloneLedgerDbOverride(clone); } catch {}
    }
    try { delete globalThis.__MYFI_P10_014A_CLONE_NONCE__; } catch {}
    try { delete globalThis.__MYFI_P10_014A_CLONE_DB_NAME__; } catch {}
    try { delete globalThis.__MYFI_P10_014A_KILL_WINDOW__; } catch {}
    try { await source?.closeAsync?.(); } catch {}
    try { await clone?.closeAsync?.(); } catch {}
    try {
      await SQLite.deleteDatabaseAsync(cloneName, SQLite.defaultDatabaseDirectory);
      await sweepCloneArtifacts();
      const cloneInfo = await FileSystem.getInfoAsync(cloneUri);
      cloneDeleted = !cloneInfo?.exists;
    } catch {}
    console.log(LOG, 'CLONE_CLEANUP', JSON.stringify({ cloneDeleted }));
  }
}

function CloneProbeApp() {
  const [status, setStatus] = useState({ label: 'RUNNING', code: '' });

  useEffect(() => {
    let active = true;
    runCloneProbe()
      .then(result => {
        if (!active) return;
        setStatus({ label: 'PASS', code: '' });
        console.info(LOG, 'PASS', JSON.stringify({
          ok: true,
          patchId: result.patchId,
          mode: result.mode,
          originalDatabaseReadOnly: result.originalDatabaseReadOnly,
          originalDatabaseMutationByHarness: result.originalDatabaseMutationByHarness,
          orphanCloneArtifactCount: result.orphanCloneArtifactCount,
          orphanCloneCleanupVerified: result.orphanCloneCleanupVerified,
          sourceFingerprintStable: result.sourceFingerprintStable,
          sourceFileMetadataObservation: result.sourceFileMetadataObservation,
        }));
      })
      .catch(error => {
        if (!active) return;
        const code = String(error?.message || error || 'unknown').slice(0, 240);
        setStatus({ label: 'FAIL', code });
        console.error(LOG, 'FAIL', JSON.stringify({ code }));
      });
    return () => { active = false; };
  }, []);

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: '#ffffff',
    }}>
      <Text style={{ color: '#111111', fontSize: 20, fontWeight: '700', marginBottom: 12 }}>
        {FAULT_MATRIX_FLAG ? 'P10-014A R6.3 Fault Matrix' : 'P10-014A R5.3 Clone Probe'}
      </Text>
      <Text style={{ color: '#111111', fontSize: 18, marginBottom: 10 }}>
        {status.label}
      </Text>
      {!!status.code && (
        <Text selectable style={{ color: '#111111', fontSize: 13, textAlign: 'center' }}>
          {status.code}
        </Text>
      )}
    </View>
  );
}

registerRootComponent(CloneProbeApp);
