// Automatic cloud sync must never begin in the middle of a financial editor.
// Holds live outside Zustand state: they coordinate scheduling only and must not
// trigger screen renders or become durable user data.
let nextHoldId = 1;
const activeHolds = new Map();

const cleanReason = value => String(value || 'financial_editor').trim() || 'financial_editor';

export const acquireAutomaticSyncInteractionHold = reason => {
  const token = `sync-hold-${nextHoldId++}`;
  activeHolds.set(token, cleanReason(reason));
  return token;
};

export const releaseAutomaticSyncInteractionHold = token => activeHolds.delete(String(token || ''));

export const isAutomaticSyncInteractionHeld = () => activeHolds.size > 0;

// Test-only reset. Production code releases the token when its editor unmounts.
export const __resetAutomaticSyncInteractionHoldsForTests = () => {
  activeHolds.clear();
  nextHoldId = 1;
};
