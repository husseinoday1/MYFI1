// P19-015A2: process-wide financial maintenance barrier.
//
// Maintenance requests become "pending" synchronously. The UI and background
// schedulers can therefore stop starting new work before the maintenance task
// enters its critical section. Tasks are serialized in FIFO order.
let maintenanceTail = Promise.resolve();
let nextMaintenanceId = 1;
let activeMaintenance = null;
const pendingMaintenance = [];
const listeners = new Set();

const safeReason = value => String(value || 'financial_maintenance').trim() || 'financial_maintenance';
const safePresentation = value => value === 'silent' ? 'silent' : 'blocking';

// A maintenance task always fences writers. Its presentation is independent:
// routine preflight work must not make the mounted UI flash, while a task that
// can replace financial state remains visibly blocking.
const firstVisibleMaintenance = () => {
  if (activeMaintenance?.presentation === 'blocking') return activeMaintenance;
  return pendingMaintenance.find(item => item.presentation === 'blocking') || null;
};

export const getFinancialMaintenanceSnapshot = () => {
  const visibleMaintenance = firstVisibleMaintenance();
  return {
    blocked: !!activeMaintenance || pendingMaintenance.length > 0,
    // `visible` is intentionally not an alias for `blocked`: the barrier still
    // protects data during silent maintenance, without tearing the user's
    // current screen behind a full-screen progress layer.
    visible: !!visibleMaintenance,
    active: !!activeMaintenance,
    pending: pendingMaintenance.length > 0,
    reason: activeMaintenance?.reason || pendingMaintenance[0]?.reason || null,
    activeId: activeMaintenance?.id || null,
    pendingCount: pendingMaintenance.length,
    startedAt: activeMaintenance?.startedAt || null,
  };
};

const publishFinancialMaintenance = () => {
  const snapshot = getFinancialMaintenanceSnapshot();
  for (const listener of [...listeners]) {
    try { listener(snapshot); } catch {}
  }
  return snapshot;
};

export const isFinancialMaintenanceBlocked = () => getFinancialMaintenanceSnapshot().blocked;
export const isFinancialMaintenanceActive = () => !!activeMaintenance;

export const subscribeFinancialMaintenance = listener => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  try { listener(getFinancialMaintenanceSnapshot()); } catch {}
  return () => listeners.delete(listener);
};

const removePending = id => {
  const index = pendingMaintenance.findIndex(item => item.id === id);
  if (index >= 0) pendingMaintenance.splice(index, 1);
};

export async function runFinancialMaintenanceTask({
  reason = 'financial_maintenance',
  presentation = 'blocking',
  beforeEnter = null,
  afterExit = null,
} = {}, task) {
  if (typeof task !== 'function') throw new Error('financial_maintenance_task_required');

  const request = {
    id: `maintenance-${nextMaintenanceId++}`,
    reason: safeReason(reason),
    presentation: safePresentation(presentation),
    requestedAt: new Date().toISOString(),
  };
  pendingMaintenance.push(request);
  publishFinancialMaintenance();

  const execute = async () => {
    try {
      if (typeof beforeEnter === 'function') await beforeEnter(request);
    } catch (error) {
      removePending(request.id);
      publishFinancialMaintenance();
      throw error;
    }

    removePending(request.id);
    activeMaintenance = {
      ...request,
      startedAt: new Date().toISOString(),
    };
    publishFinancialMaintenance();

    try {
      return await task(activeMaintenance);
    } finally {
      activeMaintenance = null;
      publishFinancialMaintenance();
      if (typeof afterExit === 'function') await afterExit(request);
    }
  };

  const queued = maintenanceTail.then(execute, execute);
  maintenanceTail = queued.catch(() => undefined);
  return queued;
}

export const waitForFinancialMaintenanceIdle = () => maintenanceTail.catch(() => undefined);

// Test-only reset. Production code must never call this.
export async function __resetFinancialMaintenanceBarrierForTests() {
  await waitForFinancialMaintenanceIdle();
  activeMaintenance = null;
  pendingMaintenance.splice(0, pendingMaintenance.length);
  maintenanceTail = Promise.resolve();
  nextMaintenanceId = 1;
  publishFinancialMaintenance();
}
