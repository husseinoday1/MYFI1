// MYFI Phase 15 — one place that knows every performance instrument.
//
// WHY THIS EXISTS
//
// The Diagnostics reset button called two of the three instrument resets and
// left the third, and separately left the cold-start ring sitting in
// AsyncStorage where an in-memory reset cannot reach it. So the owner pressed
// "reset", measured a tier, and read numbers that were still carrying samples
// from the previous tier. The 200-tier run on 2026-09-09 was invalidated by
// exactly that.
//
// The root cause was not any one missed call: it was that "clear everything"
// was spread across call sites, so completeness could only be maintained by
// remembering. This module makes it one function, so the question "does reset
// clear everything?" has one place to look and one place to test.
//
// A new instrument MUST be added here. The test for this module asserts that
// every reset exported by the instrument modules is called from
// `resetAllPerformanceInstrumentsV1`, so forgetting fails the gate rather than
// silently producing blended numbers on a device.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE } from './constants';
import { resetPerformanceTelemetryV1 } from './performanceTelemetry';
import { resetAddOperationTimings } from './addOperationTiming';
import { resetHistoryReadPathTelemetry } from './historyReadPathTelemetry';

/**
 * Clear every performance sample this app records, in memory and on disk.
 *
 * Async because the cold-start ring is persisted: it survives a launch by
 * design (one launch produces one sample, so percentiles need history), which
 * is exactly why an in-memory-only reset left it behind.
 *
 * @returns {Promise<{ ok: boolean, cleared: string[], failed: string[] }>}
 */
export const resetAllPerformanceInstrumentsV1 = async () => {
  const cleared = [];
  const failed = [];

  // Each is attempted independently: one instrument failing to clear must not
  // leave the others carrying stale samples, because partially-cleared state is
  // what produces a confidently wrong measurement.
  const attempt = (name, run) => {
    try { run(); cleared.push(name); } catch { failed.push(name); }
  };

  attempt('performanceTelemetry', resetPerformanceTelemetryV1);
  attempt('addOperationTiming', resetAddOperationTimings);
  attempt('historyReadPathTelemetry', resetHistoryReadPathTelemetry);

  try {
    await AsyncStorage.removeItem(STORAGE.PERF_COLD_START);
    cleared.push('persistedColdStart');
  } catch {
    failed.push('persistedColdStart');
  }

  // Reported rather than swallowed: if the owner presses reset and something
  // did not clear, the evidence he pastes back has to say so, or he measures a
  // tier against samples he believes are gone.
  return { ok: failed.length === 0, cleared, failed };
};
