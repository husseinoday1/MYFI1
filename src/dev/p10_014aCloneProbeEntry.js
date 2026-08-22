// MYFI P10-014A-001-R5 — fail-closed same-package / cloned-database probe.
//
// The APK keeps applicationId com.myfi.app only to enter the original app sandbox.
// The original ledger is opened query-only solely as the source of SQLite's backup API.
// All Strategy B work, migrations, fixtures, global currency writes and cleanup occur
// on a disposable clone database selected through the R5 diagnostic override.

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import {
  LEDGER_DB_NAME,
  setP10CloneLedgerDbOverride,
  clearP10CloneLedgerDbOverride,
} from '../lib/ledgerDatabase';

const LOG = '[P10_014A_CLONE_PROBE]';
const CLONE_MARKER_KEY = 'p10_014a_clone_database_marker';
const CLONE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1';

const scalar = row => {
  if (!row || typeof row !== 'object') return null;
  const values = Object.values(row);
  return values.length ? values[0] : null;
};

const databaseUri = name => (
  `${String(SQLite.defaultDatabaseDirectory || '').replace(/\/+$/, '')}/${name}`
);

const nonce = () => (
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
);

async function runCloneProbe() {
  if (!CLONE_FLAG) throw new Error('p10_clone_probe_build_flag_required');
  const sourceUri = databaseUri(LEDGER_DB_NAME);
  const sourceInfoBefore = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfoBefore?.exists || sourceInfoBefore?.isDirectory || Number(sourceInfoBefore?.size || 0) <= 0) {
    throw new Error('p10_clone_probe_source_database_missing');
  }

  const cloneName = `p10-014a-r5-clone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.db`;
  const cloneUri = databaseUri(cloneName);
  const existingClone = await FileSystem.getInfoAsync(cloneUri);
  if (existingClone?.exists) throw new Error('p10_clone_probe_clone_name_collision');

  let source = null;
  let clone = null;
  let overrideEnabled = false;
  const cloneNonce = nonce();
  let sourceFingerprintBefore = null;
  let sourceFingerprintAfter = null;
  let harnessResult = null;
  let cloneDeleted = false;

  try {
    source = await SQLite.openDatabaseAsync(
      LEDGER_DB_NAME,
      {},
      SQLite.defaultDatabaseDirectory,
    );
    await source.execAsync('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
    const queryOnly = Number(scalar(await source.getFirstAsync('PRAGMA query_only')) || 0);
    if (queryOnly !== 1) throw new Error('p10_clone_probe_source_not_query_only');

    const quick = String(scalar(await source.getFirstAsync('PRAGMA quick_check')) || '').toLowerCase();
    const sourceUserVersion = Number(scalar(await source.getFirstAsync('PRAGMA user_version')) || 0);
    const sourceSchemaVersion = Number(scalar(await source.getFirstAsync('PRAGMA schema_version')) || 0);
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

    sourceFingerprintBefore = Object.freeze({
      userVersion: sourceUserVersion,
      schemaVersion: sourceSchemaVersion,
      fileSize: Number(sourceInfoBefore.size || 0),
      modificationTime: Number(sourceInfoBefore.modificationTime || 0),
      totalChanges: totalChangesBefore,
      queryOnly: true,
    });

    clone = await SQLite.openDatabaseAsync(
      cloneName,
      {},
      SQLite.defaultDatabaseDirectory,
    );
    await SQLite.backupDatabaseAsync({
      sourceDatabase: source,
      sourceDatabaseName: 'main',
      destDatabase: clone,
      destDatabaseName: 'main',
    });

    const totalChangesAfter = Number((await source.getFirstAsync('SELECT total_changes() AS n'))?.n || 0);
    const sourceUserVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA user_version')) || 0);
    const sourceSchemaVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA schema_version')) || 0);
    if (totalChangesAfter !== 0
        || sourceUserVersionAfter !== sourceFingerprintBefore.userVersion
        || sourceSchemaVersionAfter !== sourceFingerprintBefore.schemaVersion) {
      throw new Error('p10_clone_probe_source_changed_during_backup');
    }

    await source.closeAsync();
    source = null;
    const sourceInfoAfter = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfoAfter?.exists
        || Number(sourceInfoAfter.size || 0) !== sourceFingerprintBefore.fileSize
        || Number(sourceInfoAfter.modificationTime || 0) !== sourceFingerprintBefore.modificationTime) {
      throw new Error('p10_clone_probe_source_file_changed_during_backup');
    }
    sourceFingerprintAfter = Object.freeze({
      userVersion: sourceUserVersionAfter,
      schemaVersion: sourceSchemaVersionAfter,
      fileSize: Number(sourceInfoAfter.size || 0),
      modificationTime: Number(sourceInfoAfter.modificationTime || 0),
      totalChanges: totalChangesAfter,
      queryOnly: true,
    });

    await clone.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const cloneQuick = String(scalar(await clone.getFirstAsync('PRAGMA quick_check')) || '').toLowerCase();
    const cloneUserVersion = Number(scalar(await clone.getFirstAsync('PRAGMA user_version')) || 0);
    if (cloneQuick !== 'ok' || cloneUserVersion !== sourceFingerprintBefore.userVersion) {
      throw new Error('p10_clone_probe_clone_verification_failed');
    }

    // Durable proof that getLedgerDb() is returning this clone, not the source DB.
    await clone.runAsync(
      'INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      CLONE_MARKER_KEY,
      cloneNonce,
      new Date().toISOString(),
    );
    globalThis.__MYFI_P10_014A_CLONE_NONCE__ = cloneNonce;
    setP10CloneLedgerDbOverride(clone);
    overrideEnabled = true;

    // Import the full harness only AFTER the source DB is closed and clone override is active.
    const harness = await import('./phase10RestoreBenchmarkHarness');
    if (!harness.PHASE10_RESTORE_BENCHMARK_ENABLED) {
      throw new Error('p10_clone_probe_harness_flags_required');
    }
    harnessResult = await harness.runPhase10RestoreBenchmarkHarness();
    if (!harnessResult?.ok) throw new Error('p10_clone_probe_harness_failed');

    return {
      ok: true,
      patchId: 'P10-014A-001-R5',
      mode: 'original_package_sqlite_backup_clone',
      originalDatabaseReadOnly: true,
      originalDatabaseMutationByHarness: false,
      sourceFingerprintStable: JSON.stringify(sourceFingerprintBefore) === JSON.stringify(sourceFingerprintAfter),
      cloneDeletedAfterRun: true,
      harnessResult,
    };
  } finally {
    if (overrideEnabled) {
      try { clearP10CloneLedgerDbOverride(clone); } catch {}
    }
    try { delete globalThis.__MYFI_P10_014A_CLONE_NONCE__; } catch {}
    try { await source?.closeAsync?.(); } catch {}
    try { await clone?.closeAsync?.(); } catch {}
    try {
      await SQLite.deleteDatabaseAsync(cloneName, SQLite.defaultDatabaseDirectory);
      const cloneInfo = await FileSystem.getInfoAsync(cloneUri);
      cloneDeleted = !cloneInfo?.exists;
    } catch {}
    console.log(LOG, 'CLONE_CLEANUP', JSON.stringify({ cloneDeleted }));
  }
}

function CloneProbeApp() {
  const [status, setStatus] = useState('RUNNING');

  useEffect(() => {
    let active = true;
    runCloneProbe()
      .then(result => {
        if (!active) return;
        setStatus('PASS');
        console.info(LOG, 'PASS', JSON.stringify({
          ok: true,
          patchId: result.patchId,
          mode: result.mode,
          originalDatabaseReadOnly: result.originalDatabaseReadOnly,
          originalDatabaseMutationByHarness: result.originalDatabaseMutationByHarness,
          sourceFingerprintStable: result.sourceFingerprintStable,
        }));
      })
      .catch(error => {
        if (!active) return;
        setStatus('FAIL');
        console.error(LOG, 'FAIL', JSON.stringify({
          code: String(error?.message || error || 'unknown').slice(0, 240),
        }));
      });
    return () => { active = false; };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text>P10-014A R5 Clone Probe</Text>
      <Text>{status}</Text>
    </View>
  );
}

registerRootComponent(CloneProbeApp);
