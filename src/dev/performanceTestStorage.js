// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from '../lib/constants';

const STORAGE_VERSION = 2;
const TRANSACTION_CHUNK_SIZE = 750;
const WRITE_BATCH_SIZE = 1;
const SCHEDULE_DELAY_MS = 350;
const chunkKey = index => `${STORAGE.DEMO_DATA}:CHUNK:${index}`;
const overlayKey = `${STORAGE.DEMO_DATA}:OVERLAY`;
let scheduledWrite = null;
let scheduledTimer = null;
let scheduledGeneration = 0;
let scheduledInFlight = Promise.resolve();
let lastLogicalSnapshot = null;
let performanceOverlay = null;

const yieldToUi = () => (
  typeof setTimeout === 'function'
    ? new Promise(resolve => setTimeout(resolve, 0))
    : Promise.resolve()
);

const parseJson = (raw, fallback = null) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const getStoredChunkCount = async () => {
  const raw = await AsyncStorage.getItem(STORAGE.DEMO_DATA);
  const meta = parseJson(raw, null);
  return Number(meta?.performanceStorage?.chunkCount || 0);
};

export const clearPerformanceSnapshot = async () => {
  scheduledGeneration += 1;
  scheduledWrite = null;
  if (scheduledTimer) clearTimeout(scheduledTimer);
  scheduledTimer = null;
  await scheduledInFlight.catch(() => undefined);
  const chunkCount = await getStoredChunkCount();
  lastLogicalSnapshot = null;
  performanceOverlay = null;
  const keys = [STORAGE.DEMO_DATA, STORAGE.DEMO_ACTIVE, overlayKey];
  for (let index = 0; index < chunkCount; index += 1) keys.push(chunkKey(index));
  await AsyncStorage.multiRemove(keys);
};

export const writePerformanceSnapshot = async (snapshot, { namespace = 'guest', tier = '', startedAt = null } = {}) => {
  const transactions = Array.isArray(snapshot?.data?.trans) ? snapshot.data.trans : [];
  const previousChunkCount = await getStoredChunkCount();
  const chunkCount = Math.ceil(transactions.length / TRANSACTION_CHUNK_SIZE);

  const storedSnapshot = {
    ...snapshot,
    data: {
      ...(snapshot?.data || {}),
      trans: [],
    },
    performanceStorage: {
      version: STORAGE_VERSION,
      chunkSize: TRANSACTION_CHUNK_SIZE,
      chunkCount,
      transactionCount: transactions.length,
    },
  };

  const now = new Date().toISOString();
  // Persist a few chunks at a time and yield between batches. A 100k fixture
  // must not monopolise the React Native JS thread or allocate one enormous
  // multiSet payload.
  for (let index = 0; index < chunkCount; index += WRITE_BATCH_SIZE) {
    const pairs = [];
    const end = Math.min(chunkCount, index + WRITE_BATCH_SIZE);
    for (let chunkIndex = index; chunkIndex < end; chunkIndex += 1) {
      const offset = chunkIndex * TRANSACTION_CHUNK_SIZE;
      pairs.push([chunkKey(chunkIndex), JSON.stringify(transactions.slice(offset, offset + TRANSACTION_CHUNK_SIZE))]);
    }
    if (pairs.length) await AsyncStorage.multiSet(pairs);
    if (end < chunkCount) await yieldToUi();
  }

  // Publish metadata only after every chunk is durable so a restart can never
  // observe a new count with missing chunks.
  await AsyncStorage.multiSet([
    [STORAGE.DEMO_DATA, JSON.stringify(storedSnapshot)],
    [STORAGE.DEMO_ACTIVE, JSON.stringify({
      active: true,
      namespace,
      tier: String(tier || snapshot?.cfg?.performanceTestTier || ''),
      startedAt: startedAt || now,
      storageVersion: STORAGE_VERSION,
    })],
  ]);

  if (previousChunkCount > chunkCount) {
    const staleKeys = [];
    for (let index = chunkCount; index < previousChunkCount; index += 1) staleKeys.push(chunkKey(index));
    if (staleKeys.length) await AsyncStorage.multiRemove(staleKeys);
  }
  await AsyncStorage.removeItem(overlayKey);
  lastLogicalSnapshot = snapshot;
  performanceOverlay = null;
};

const snapshotWithoutTransactions = snapshot => ({
  ...snapshot,
  data: {
    ...(snapshot?.data || {}),
    trans: [],
  },
});

const prependDelta = (previousRows = [], nextRows = []) => {
  if (previousRows === nextRows) return [];
  const addedCount = nextRows.length - previousRows.length;
  if (addedCount < 0 || addedCount > 32) return null;
  if (addedCount === 0) {
    if (previousRows.length === 0) return [];
    const middle = Math.floor(previousRows.length / 2);
    return previousRows[0] === nextRows[0]
      && previousRows[middle] === nextRows[middle]
      && previousRows[previousRows.length - 1] === nextRows[nextRows.length - 1]
      ? []
      : null;
  }
  if (previousRows.length === 0) return nextRows.slice(0, addedCount);
  const middle = Math.floor(previousRows.length / 2);
  const preserved = previousRows[0] === nextRows[addedCount]
    && previousRows[middle] === nextRows[addedCount + middle]
    && previousRows[previousRows.length - 1] === nextRows[nextRows.length - 1];
  return preserved ? nextRows.slice(0, addedCount) : null;
};

const writePerformanceOverlay = async snapshot => {
  if (!lastLogicalSnapshot) return false;
  const previousRows = Array.isArray(lastLogicalSnapshot?.data?.trans) ? lastLogicalSnapshot.data.trans : [];
  const nextRows = Array.isArray(snapshot?.data?.trans) ? snapshot.data.trans : [];
  const added = prependDelta(previousRows, nextRows);
  if (added == null) return false;
  const nextOverlay = {
    version: 1,
    addedTransactions: [...added, ...(performanceOverlay?.addedTransactions || [])],
    snapshot: snapshotWithoutTransactions(snapshot),
  };
  await AsyncStorage.setItem(overlayKey, JSON.stringify(nextOverlay));
  performanceOverlay = nextOverlay;
  lastLogicalSnapshot = snapshot;
  return true;
};

const persistScheduledSnapshot = async (snapshot, options) => {
  if (await writePerformanceOverlay(snapshot)) return;
  await writePerformanceSnapshot(snapshot, options);
};

export const schedulePerformanceSnapshotWrite = (snapshot, options = {}) => {
  const generation = scheduledGeneration;
  scheduledWrite = { snapshot, options, generation };
  if (scheduledTimer) clearTimeout(scheduledTimer);
  scheduledTimer = setTimeout(async () => {
    scheduledTimer = null;
    const pending = scheduledWrite;
    scheduledWrite = null;
    if (!pending || pending.generation !== scheduledGeneration) return;
    scheduledInFlight = persistScheduledSnapshot(pending.snapshot, pending.options);
    try {
      await scheduledInFlight;
    } catch (error) {
      console.warn('[PERFORMANCE STORAGE] deferred write failed', error);
    }
  }, SCHEDULE_DELAY_MS);
  return true;
};

export const flushScheduledPerformanceSnapshot = async () => {
  if (scheduledTimer) clearTimeout(scheduledTimer);
  scheduledTimer = null;
  const pending = scheduledWrite;
  scheduledWrite = null;
  if (!pending || pending.generation !== scheduledGeneration) return false;
  scheduledInFlight = persistScheduledSnapshot(pending.snapshot, pending.options);
  await scheduledInFlight;
  return true;
};

export const readPerformanceSnapshot = async (namespace = 'guest') => {
  const active = parseJson(await AsyncStorage.getItem(STORAGE.DEMO_ACTIVE), null);
  if (!active?.active || String(active.namespace || '') !== String(namespace || 'guest')) return null;

  const raw = await AsyncStorage.getItem(STORAGE.DEMO_DATA);
  const snapshot = parseJson(raw, null);
  if (!snapshot) return null;

  const storageMeta = snapshot.performanceStorage;
  if (Number(storageMeta?.version || 0) !== STORAGE_VERSION) {
    return snapshot;
  }

  const chunkCount = Number(storageMeta.chunkCount || 0);
  const expectedCount = Number(storageMeta.transactionCount || 0);
  const keys = Array.from({ length: chunkCount }, (_, index) => chunkKey(index));
  const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const transactions = [];
  for (const [, chunkRaw] of pairs) {
    const chunk = parseJson(chunkRaw, null);
    if (!Array.isArray(chunk)) return null;
    transactions.push(...chunk);
  }
  if (transactions.length !== expectedCount) return null;

  const baseSnapshot = {
    ...snapshot,
    data: {
      ...(snapshot.data || {}),
      trans: transactions,
    },
  };
  const storedOverlay = parseJson(await AsyncStorage.getItem(overlayKey), null);
  const restored = Number(storedOverlay?.version || 0) === 1 && storedOverlay?.snapshot
    ? {
        ...storedOverlay.snapshot,
        data: {
          ...(storedOverlay.snapshot.data || {}),
          trans: [...(storedOverlay.addedTransactions || []), ...transactions],
        },
      }
    : baseSnapshot;
  lastLogicalSnapshot = restored;
  performanceOverlay = restored === baseSnapshot ? null : storedOverlay;
  return restored;
};
