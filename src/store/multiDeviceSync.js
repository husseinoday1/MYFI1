import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from '../lib/cloudWorkspaceMetadata.js';

const isObject = value => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      const next = value[key];
      if (next !== undefined) out[key] = canonical(next);
      return out;
    }, {});
};

const stable = value => JSON.stringify(canonical(value));

export const valuesEqual = (a, b) => stable(a) === stable(b);

const noteConflict = (conflicts, details) => {
  if (!Array.isArray(conflicts)) return;
  const entry = {
    ...details,
    at: details.at || new Date().toISOString(),
  };
  const key = `${entry.path || ''}:${entry.type || ''}:${entry.resolution || ''}`;
  if (!conflicts.some(item => `${item.path || ''}:${item.type || ''}:${item.resolution || ''}` === key)) {
    conflicts.push(entry);
  }
};

const mergeValue3 = (base, local, remote, path = '', conflicts = null) => {
  if (valuesEqual(local, remote)) return local;
  if (valuesEqual(local, base)) return remote;
  if (valuesEqual(remote, base)) return local;

  if (isObject(local) && isObject(remote)) {
    const baseObject = isObject(base) ? base : {};
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);
    const merged = {};
    keys.forEach(key => {
      const hasBase = Object.prototype.hasOwnProperty.call(baseObject, key);
      const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);

      if (!hasLocal && !hasRemote) return;

      if (hasBase) {
        if (!hasLocal || !hasRemote) {
          // A removed property wins over a stale property.
          noteConflict(conflicts, {
            path: path ? `${path}.${key}` : key,
            type: 'property_deleted_vs_edited',
            resolution: 'deletion',
          });
          return;
        }
        merged[key] = mergeValue3(
          baseObject[key],
          local[key],
          remote[key],
          path ? `${path}.${key}` : key,
          conflicts,
        );
        return;
      }

      if (hasLocal && hasRemote) {
        merged[key] = mergeValue3(
          undefined,
          local[key],
          remote[key],
          path ? `${path}.${key}` : key,
          conflicts,
        );
      }
      else merged[key] = hasLocal ? local[key] : remote[key];
    });
    return merged;
  }

  // True concurrent scalar conflict with no item-level revision.
  // Prefer the value edited on this device while preserving all
  // non-conflicting remote fields at object level.
  noteConflict(conflicts, {
    path,
    type: 'value_changed_on_both_devices',
    resolution: 'local',
  });
  return local;
};

const toIdMap = items => {
  const map = new Map();
  const anonymous = [];
  (Array.isArray(items) ? items : []).forEach(item => {
    const id = item?.id;
    if (id === null || id === undefined || id === '') anonymous.push(item);
    else map.set(String(id), item);
  });
  return { map, anonymous };
};

const mergeAnonymous = (local = [], remote = []) => {
  const seen = new Set();
  const out = [];
  [...local, ...remote].forEach(item => {
    const key = stable(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
};

const mergeItem3 = (base, local, remote, nestedKeys = [], path = '', conflicts = null) => {
  const stripNested = value => {
    const next = { ...(value || {}) };
    nestedKeys.forEach(key => delete next[key]);
    return next;
  };
  const merged = mergeValue3(
    stripNested(base),
    stripNested(local),
    stripNested(remote),
    path,
    conflicts,
  );
  nestedKeys.forEach(key => {
    merged[key] = mergeArray3(
      base?.[key] || [],
      local?.[key] || [],
      remote?.[key] || [],
      [],
      { path: `${path}.${key}`, conflicts },
    );
  });
  return merged;
};

export const mergeArray3 = (
  baseItems = [],
  localItems = [],
  remoteItems = [],
  nestedKeys = [],
  context = {},
) => {
  const path = context.path || 'items';
  const conflicts = context.conflicts || null;
  const base = toIdMap(baseItems);
  const local = toIdMap(localItems);
  const remote = toIdMap(remoteItems);

  const order = [];
  const seenOrder = new Set();
  [...local.map.keys(), ...remote.map.keys(), ...base.map.keys()].forEach(id => {
    if (seenOrder.has(id)) return;
    seenOrder.add(id);
    order.push(id);
  });

  const merged = [];

  order.forEach(id => {
    const b = base.map.get(id);
    const l = local.map.get(id);
    const r = remote.map.get(id);

    if (b) {
      if (!l && !r) return;

      // Once both devices have shared a base, absence on either side
      // means that side deleted the record. Deletion wins so old cloud
      // data cannot resurrect it.
      if (!l || !r) {
        noteConflict(conflicts, {
          path: `${path}[${id}]`,
          type: 'record_deleted_vs_edited',
          resolution: 'deletion',
        });
        return;
      }

      merged.push(mergeItem3(b, l, r, nestedKeys, `${path}[${id}]`, conflicts));
      return;
    }

    // No common-base record: this is new data on one or both devices.
    if (l && r) merged.push(mergeItem3(undefined, l, r, nestedKeys, `${path}[${id}]`, conflicts));
    else if (l) merged.push(l);
    else if (r) merged.push(r);
  });

  return [
    ...merged,
    ...mergeAnonymous(local.anonymous, remote.anonymous),
  ];
};

export const canonicalWorkspaceCfg = cfg => cloudWorkspaceCfg(cfg);

const dataView = state => ({
  trans: state?.trans || [],
  debts: state?.debts || [],
  goals: state?.goals || [],
  wallets: state?.wallets || [],
  commitments: state?.commitments || [],
  cats: state?.cats || [],
  cfg: canonicalWorkspaceCfg(state?.cfg),
});

export const sameWorkspaceData = (a, b) => (
  valuesEqual(dataView(a), dataView(b))
);

export const mergeWorkspaceStates = ({
  base = null,
  local = {},
  remote = {},
  conflicts = null,
} = {}) => {
  const b = base || {};

  return {
    trans: mergeArray3(
      b.trans || [],
      local.trans || [],
      remote.trans || [],
      [],
      { path: 'trans', conflicts },
    ),
    debts: mergeArray3(
      b.debts || [],
      local.debts || [],
      remote.debts || [],
      ['payments'],
      { path: 'debts', conflicts },
    ),
    goals: mergeArray3(
      b.goals || [],
      local.goals || [],
      remote.goals || [],
      ['savings'],
      { path: 'goals', conflicts },
    ),
    wallets: mergeArray3(
      b.wallets || [],
      local.wallets || [],
      remote.wallets || [],
      [],
      { path: 'wallets', conflicts },
    ),
    commitments: mergeArray3(
      b.commitments || [],
      local.commitments || [],
      remote.commitments || [],
      [],
      { path: 'commitments', conflicts },
    ),
    cats: mergeArray3(
      b.cats || [],
      local.cats || [],
      remote.cats || [],
      [],
      { path: 'cats', conflicts },
    ),
    cfg: mergeCloudWorkspaceCfg(
      local.cfg,
      mergeValue3(
        canonicalWorkspaceCfg(b.cfg),
        canonicalWorkspaceCfg(local.cfg),
        canonicalWorkspaceCfg(remote.cfg),
        'cfg',
        conflicts,
      ),
    ),
    // Notification preferences are still local-only in the current
    // cloud schema, so never discard this device's notification config.
    notif: local.notif || remote.notif || {},
  };
};
