// P10-014B device entry. Selected only by the dedicated GitHub workflow.
import '../../index';
import { useStore } from '../store/useStore';
import {
  P10_014B_CLOUD_HANDSHAKE_ENABLED,
  runP10_014BCloudHandshakeGate,
} from './p10_014bCloudHandshakeGate';

let started = false;
let unsubscribe = null;
const GATE_READY_TIMEOUT_MS = 30000;
const gateDeadline = Date.now() + GATE_READY_TIMEOUT_MS;
const safeMessage = error => String(error?.message || error || 'p10_014b_unknown_error').slice(0, 240);

const startGate = () => {
  if (started || !P10_014B_CLOUD_HANDSHAKE_ENABLED) return;
  const state = useStore.getState();
  const gateReady = Boolean(
    state?.workspaceReady && state?.user?.id && state?.financialLedgerV7Cutover,
  );
  if (!gateReady && Date.now() < gateDeadline) return;
  started = true;
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = null;
  setTimeout(() => {
    let phase = 'entry';
    runP10_014BCloudHandshakeGate({
      getState: useStore.getState,
      onPhase: nextPhase => {
        phase = String(nextPhase || 'unknown');
        console.info('[P10_014B_DEVICE_GATE] PHASE', phase);
      },
    })
      .then(result => console.info('[P10_014B_DEVICE_GATE] RESULT', JSON.stringify(result)))
      .catch(error => console.error('[P10_014B_DEVICE_GATE] FAIL', JSON.stringify({
        code: safeMessage(error),
        phase,
        stack: String(error?.stack || '').slice(0, 1200),
      })));
  }, 0);
};

unsubscribe = useStore.subscribe(startGate);
startGate();
// Auth hydration may legitimately be absent on a new/offline install. Emit the
// explicit BLOCKED result after a bounded wait instead of leaving the device log
// with no terminal P10-014B marker at all.
setTimeout(startGate, GATE_READY_TIMEOUT_MS);
