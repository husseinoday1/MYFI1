// P10-014B device entry. Selected only by the dedicated GitHub workflow.
import '../../index';
import { useStore } from '../store/useStore';
import {
  P10_014B_CLOUD_HANDSHAKE_ENABLED,
  runP10_014BCloudHandshakeGate,
} from './p10_014bCloudHandshakeGate';

let started = false;
let unsubscribe = null;
const safeMessage = error => String(error?.message || error || 'p10_014b_unknown_error').slice(0, 240);

const maybeStart = () => {
  if (started || !P10_014B_CLOUD_HANDSHAKE_ENABLED) return;
  const state = useStore.getState();
  // Auth hydration and workspace hydration complete on separate startup paths.
  // Waiting for workspaceReady alone can run the gate in the small interval where
  // the workspace exists but the original Supabase user is not in the store yet.
  if (!state?.workspaceReady || !state?.user?.id) return;
  started = true;
  if (typeof unsubscribe === 'function') unsubscribe();
  unsubscribe = null;
  setTimeout(() => {
    runP10_014BCloudHandshakeGate({ getState: useStore.getState })
      .then(result => console.info('[P10_014B_DEVICE_GATE] RESULT', JSON.stringify(result)))
      .catch(error => console.error('[P10_014B_DEVICE_GATE] FAIL', JSON.stringify({ code: safeMessage(error) })));
  }, 0);
};

unsubscribe = useStore.subscribe(maybeStart);
maybeStart();
