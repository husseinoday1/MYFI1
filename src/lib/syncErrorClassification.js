// Sync error classification and display sanitisation.
//
// Two separate jobs used to be done by one raw error string, and it was wrong for
// both:
//
// 1. Retry classification matched /\b502\b/ against the whole error text. A 5xx from
//    the edge arrives as an HTML body with headers and Cloudflare metadata, so any
//    incidental "502" — in an id, a timestamp, a byte count — made an unrelated
//    failure look transient and got it retried.
// 2. The same raw text was rendered to the user in a row labelled "diagnostic code".
//
// Status now comes from the structured field when the client provides one, text
// matching is anchored and length-bounded, and display goes through a sanitiser.

// Bounded so a large HTML error body is never scanned in full.
const SCAN_LIMIT = 300;

const errorText = error => String(
  error?.message || error?.code || error || '',
).slice(0, SCAN_LIMIT).toLowerCase();

/**
 * HTTP status from the structured field, when the transport supplies one.
 * Never parsed out of free text — that is the false-positive source.
 */
export const syncErrorStatusCode = (error) => {
  const raw = error?.status ?? error?.statusCode ?? error?.originalError?.status;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 100 && value <= 599 ? value : null;
};

// 500 is included deliberately: Planning & Audit asked for 500/502/503/504 to back
// off rather than hammer. The circuit breaker bounds the cost if a 500 turns out to
// be deterministic.
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Anchored: the number must be presented as a status, not merely appear somewhere.
const STATUS_IN_TEXT = /\b(?:http|https|status|code)\s*[:=]?\s*(?:408|425|429|500|502|503|504)\b/;

const TRANSIENT_MESSAGE = new RegExp([
  'upstream request timeout',
  'network request failed',
  'fetch failed',
  'gateway timeout',
  'bad gateway',
  'service unavailable',
  'timed out',
  'timeout',
  'econnreset',
  'enotfound',
].join('|'));

/**
 * Failures that retrying can never resolve, whatever SQLSTATE they arrive with.
 *
 * mutation_id_conflict means the same mutationId is already stored with different
 * content (financial_mutation_v1_ack_hardening.sql:77). The server raises it with
 * SQLSTATE 40001 — serialization_failure — which is conventionally a *retryable*
 * class, so excluding it has to be explicit or a future change to the transient
 * rules would silently start retrying an identical conflicting payload forever.
 */
const NEVER_RETRY = /mutation_id_conflict|revision_conflict|restore_epoch_mismatch|ledger_access_denied/;

export const isNeverRetrySyncError = error => NEVER_RETRY.test(errorText(error));

export const isTransientCloudSyncError = (error) => {
  if (isNeverRetrySyncError(error)) return false;
  const status = syncErrorStatusCode(error);
  if (status !== null) return RETRYABLE_HTTP_STATUS.has(status);
  const text = errorText(error);
  return TRANSIENT_MESSAGE.test(text) || STATUS_IN_TEXT.test(text);
};

// ---------------------------------------------------------------------------
// Display sanitisation
// ---------------------------------------------------------------------------

// The app's own reasons are already short snake_case tokens and are safe to show.
const SAFE_CODE = /^[a-z0-9][a-z0-9_:.-]{0,63}$/;

const DISPLAY_CODES = [
  [/mutation_id_conflict/, 'sync_conflict'],
  [/revision_conflict/, 'sync_conflict'],
  [/financial_bootstrap_required/, 'sync_bootstrap_required'],
  [/restore_epoch_mismatch|restore_recovery_required/, 'sync_recovery_required'],
  [/ledger_access_denied|invalid api key|jwt|unauthor/, 'sync_auth_failed'],
  [/network request failed|fetch failed|econnreset|enotfound|offline/, 'network_unavailable'],
  [/timeout|timed out|gateway|unavailable/, 'service_unavailable'],
];

/**
 * Reduce whatever ended up in lastSyncError to something safe to render.
 *
 * A raw 5xx body carries headers, cookies and edge metadata; none of it belongs on
 * screen. Short internal reasons pass through unchanged so the diagnostic row keeps
 * its value; anything else collapses to a stable category.
 */
export const syncDiagnosticCode = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (SAFE_CODE.test(raw)) return raw;
  const text = raw.slice(0, SCAN_LIMIT).toLowerCase();
  for (const [pattern, code] of DISPLAY_CODES) {
    if (pattern.test(text)) return code;
  }
  const status = raw.match(/\b(?:http|status|code)\s*[:=]?\s*([1-5][0-9]{2})\b/i);
  return status ? `service_error_${status[1]}` : 'sync_failed';
};
