// P10-012 proof-bound Supabase adapter. It is dependency-injected and dormant:
// no project client is imported and no live request occurs until a later approved
// entrypoint supplies one.

const text = value => String(value ?? '').trim();
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const validHash = value => /^[0-9a-f]{64}$/i.test(text(value));
const one = value => (Array.isArray(value) ? value[0] : value);
const safeFailureCode = (error, fallback) => {
  const code = text(error?.code);
  if (code === '42501') return 'restore_epoch_access_denied';
  if (code === '22023') return 'restore_epoch_request_invalid';
  if (code === '40001' || code === '23505') return 'restore_epoch_conflict';
  return fallback;
};
const definitivePostgresError = error => ['42501', '22023', '40001', '23505'].includes(text(error?.code));

const normalizeProof = (value) => {
  const row = one(value);
  if (!row || typeof row !== 'object') return null;
  return {
    eventId: text(row.eventId ?? row.event_uuid).toLowerCase(),
    ownerId: text(row.ownerId ?? row.owner_user_id).toLowerCase(),
    ledgerId: text(row.ledgerId ?? row.ledger_id),
    fromEpoch: Number(row.fromEpoch ?? row.from_epoch),
    toEpoch: Number(row.toEpoch ?? row.to_epoch ?? row.restoreEpoch ?? row.restore_epoch),
    reason: text(row.reason),
    deviceId: text(row.deviceId ?? row.device_id),
    operationId: text(row.operationId ?? row.operation_id).toLowerCase(),
    restoreProofDigest: text(row.restoreProofDigest ?? row.restore_proof_digest).toLowerCase(),
    provedAt: row.provedAt ?? row.created_at ?? null,
    outcome: text(row.outcome),
  };
};

const exactProof = (proof, request) => (
  proof
  && validUuid(proof.eventId)
  && proof.ownerId === request.ownerId
  && proof.ledgerId === request.ledgerId
  && proof.fromEpoch === request.fromEpoch
  && proof.toEpoch === request.toEpoch
  && proof.reason === 'backup_restore'
  && proof.deviceId === request.deviceId
  && proof.operationId === request.operationId
  && proof.restoreProofDigest === request.restoreProofDigest
);

const normalizeRequest = (operation = {}) => {
  const request = {
    ownerId: text(operation.ownerId).toLowerCase(),
    ledgerId: text(operation.ledgerId),
    fromEpoch: Number(operation.fromEpoch),
    toEpoch: Number(operation.toEpoch),
    deviceId: text(operation.deviceId),
    operationId: text(operation.operationId).toLowerCase(),
    restoreProofDigest: text(operation.restoreProofDigest).toLowerCase(),
    reason: text(operation.reason),
  };
  if (!validUuid(request.ownerId) || !request.ledgerId
      || !Number.isInteger(request.fromEpoch) || request.fromEpoch < 1
      || !Number.isInteger(request.toEpoch) || request.toEpoch !== request.fromEpoch + 1
      || !request.deviceId || request.deviceId.length > 200
      || !validUuid(request.operationId) || !validHash(request.restoreProofDigest)
      || request.reason !== 'backup_restore') {
    throw new Error('restore_epoch_v3_request_invalid');
  }
  return request;
};

const invokeProofBoundRpc = async ({ supabase, request }) => {
  try {
    return await supabase.rpc('advance_financial_restore_epoch_v3', {
      p_ledger_id: request.ledgerId,
      p_expected_epoch: request.fromEpoch,
      p_new_epoch: request.toEpoch,
      p_reason: 'backup_restore',
      p_device_id: request.deviceId,
      p_operation_id: request.operationId,
      p_restore_proof_digest: request.restoreProofDigest,
    });
  } catch (error) {
    return { data: null, error };
  }
};

const provenResponse = (response, request) => {
  if (response?.error) return null;
  const proof = normalizeProof(response?.data);
  return exactProof(proof, request)
    && ['advanced', 'already_advanced'].includes(proof.outcome) ? proof : null;
};

/**
 * One logical RPC plus at most one exact resolver invocation. The resolver is the
 * same idempotent, ledger-locking function with the same immutable operation UUID;
 * it serializes behind a timed-out server transaction instead of guessing from a
 * racy table read. There is no loop and no post-attempt cancellation path.
 */
export const advanceOrResolveFinancialRestoreEpochV3 = async ({
  supabase,
  operation,
} = {}) => {
  if (!supabase?.rpc) {
    return { supported: false, ok: false, reason: 'supabase_unavailable' };
  }
  let request;
  try {
    request = normalizeRequest(operation);
  } catch (error) {
    return { supported: true, ok: false, ambiguous: false, reason: text(error?.message) || 'restore_epoch_v3_request_invalid' };
  }

  const response = await invokeProofBoundRpc({ supabase, request });
  const firstProof = provenResponse(response, request);
  if (firstProof) return { supported: true, ok: true, ...firstProof };
  if (definitivePostgresError(response.error)) {
    return {
      supported: true,
      ok: false,
      ambiguous: false,
      reason: safeFailureCode(response.error, 'restore_epoch_rpc_rejected'),
    };
  }
  const resolved = await invokeProofBoundRpc({ supabase, request });
  const resolvedProof = provenResponse(resolved, request);
  if (resolvedProof) {
    return {
      supported: true,
      ok: true,
      ...resolvedProof,
      outcome: 'evidence_resolved',
    };
  }
  if (definitivePostgresError(resolved.error)) {
    return {
      supported: true,
      ok: false,
      ambiguous: false,
      reason: safeFailureCode(resolved.error, 'restore_epoch_rpc_rejected'),
    };
  }
  return {
    supported: true,
    ok: false,
    ambiguous: true,
    reason: 'restore_epoch_server_outcome_unknown',
    nextRetryAt: new Date(Date.now() + 5000).toISOString(),
  };
};
