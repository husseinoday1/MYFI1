// P21 (Phase 14 §92) -- schema migration and canonical cutover run nested
// inside whichever maintenance call is the actual barrier owner: loadLocal
// alone, setUser wrapping loadLocal, or loadLocal auto-triggering cutover.
// There is no single call site that both does the work and owns the barrier's
// afterExit, so the "a migration/cutover just changed operational state"
// signal has to survive from wherever it happens up to whichever afterExit
// fires first. There is exactly one afterExit per barrier session -- nesting
// reuses the same session via maintenanceOwned rather than opening a second
// one -- so a plain last-write module variable is enough; nothing here needs
// a queue.
let pendingReason = null;

export const requestMaintenanceResumeSync = (reason) => {
  pendingReason = String(reason || 'financial_maintenance_resume');
};

// Reading the signal always clears it. A stale reason must never resurrect
// itself on a later, unrelated maintenance call that raised nothing of its
// own -- that would arm a sync for a change that already got its resume.
export const consumeMaintenanceResumeSignal = () => {
  const reason = pendingReason;
  pendingReason = null;
  return reason;
};

export const __resetMaintenanceResumeSignalForTests = () => {
  pendingReason = null;
};
