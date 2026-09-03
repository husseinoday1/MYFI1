// Phase 13 Stage C -- the legacy `user_data` mirror write.
//
// The same RPC serves two different worlds, which is why this is a gate and not
// a deletion:
//
//   Before the V7 cutover `user_data` IS the sync channel. It is pulled, merged
//   three ways and pushed back, so silencing the write would strand a device
//   that has not migrated yet with no cloud copy at all.
//
//   After the cutover it is output nobody consumes. The pull side refuses to
//   read financial state back out of it (`financial_v7_snapshot_pull_forbidden`)
//   and `cfg` reaches the cloud as a V7 `workspace` entity instead, so the row
//   is a mirror of a projection no reader is allowed to trust. Frozen plan
//   section 82 Stage C ("stop V6 writes, old financial mirrors") is about
//   exactly this write.
//
// Deleting the call site belongs to Stage E, together with dropping the table.
// Until then the decision lives here so it can be tested on its own.

// A revision is never invented. Settling on a number larger than the one the
// cloud actually holds would out-rank the real row for any reader still
// comparing the two, so anything that is not a usable count reads as 0.
const usableRevision = (value) => {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
};

// `cutoverBridge` must be exactly true to retire the write. A caller that
// cannot say which world it is in gets today's behaviour -- an unexplained
// `undefined` must not silently skip an upload the device still depends on.
export const legacyUserDataMirrorPlanV1 = ({
  cutoverBridge, cloudRevision, localRevision,
} = {}) => {
  if (cutoverBridge !== true) {
    return {
      write: true,
      settleRevision: null,
      reason: 'pre_cutover_snapshot_authoritative',
    };
  }
  // Nothing advances the row any more, so the sync settles on what the cloud
  // already holds -- but never below what this device has already recorded.
  // A missing row reads as revision 0, and a device whose row was deleted
  // server-side would otherwise settle backwards from, say, 11 to 0, write that
  // 0 into the synced V7 `workspace` entity, and hand every other device a
  // counter that had run in reverse. Holding the floor keeps the retired
  // number inert instead of making it lie in a new direction.
  return {
    write: false,
    settleRevision: Math.max(usableRevision(cloudRevision), usableRevision(localRevision)),
    reason: 'v7_authoritative_mirror_retired',
  };
};
