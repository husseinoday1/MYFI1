// MYFI P10-014A-001-R2 — diagnostic-only entrypoint.
// This file is selected only by the P10-014A CI workflow.
// It registers the normal MYFI app through the ordinary root entry and starts the
// Strategy B device harness once the isolated fresh-test workspace is ready.

import '../../index';
import { useStore } from '../store/useStore';
import {
  PHASE10_RESTORE_BENCHMARK_ENABLED,
  runPhase10RestoreBenchmarkHarness,
} from './phase10RestoreBenchmarkHarness';

const LOG_PREFIX = '[P10_014A_DEVICE_GATE]';
let started = false;
let unsubscribe = null;

const safeMessage = error => String(error?.message || error || 'p10_014a_device_gate_unknown').slice(0, 240);

const maybeStart = () => {
  if (started || !PHASE10_RESTORE_BENCHMARK_ENABLED) return;
  const state = useStore.getState();
  if (!state?.workspaceReady) return;

  started = true;
  if (typeof unsubscribe === 'function') {
    unsubscribe();
    unsubscribe = null;
  }

  setTimeout(() => {
    runPhase10RestoreBenchmarkHarness()
      .then(result => {
        console.info(`${LOG_PREFIX} PASS`, JSON.stringify(result));
      })
      .catch(error => {
        console.error(`${LOG_PREFIX} FAIL`, JSON.stringify({ code: safeMessage(error) }));
      });
  }, 0);
};

unsubscribe = useStore.subscribe(maybeStart);
maybeStart();
