import {
  buildTrackerPaymentDraft,
  collectTrackerReferenceImpact,
  normalizeTrackerItem,
  normalizeTrackerTypeDefinition,
  validateTrackerDefinition,
  validateTrackerItem,
} from '../../lib/trackerBuilder';
import { getLedgerNamespace } from '../../lib/activeLedgerRepository';
import { commitEntityChangesV7 } from '../../lib/financialLedgerV7Repository';
import { uid } from '../domain';

const storageReady = state => !!state.financialLedgerV7Cutover;
const timestamp = () => new Date().toISOString();

// Custom financial trackers are V7 entities. They intentionally do not fall
// back to the legacy snapshot-sync format: that transport cannot promise a
// second device or a restore will retain their definitions.
export const createTrackerBuilderSlice = (set, get) => ({
  getCustomTrackerReferenceImpact: ({ walletId = null, categoryId = null } = {}) => (
    collectTrackerReferenceImpact({
      trackerTypes: get().trackerTypes,
      trackerItems: get().trackerItems,
      walletId,
      categoryId,
    })
  ),

  createCustomTrackerType: async (draft = {}) => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const now = timestamp();
    const definition = normalizeTrackerTypeDefinition({
      ...draft, id: draft.id || uid(), createdAt: draft.createdAt || now, updatedAt: now,
    }, {
      walletIds: state.wallets.map(item => item.id),
      categoryIds: state.cats.map(item => item.id),
    });
    const validation = validateTrackerDefinition(definition);
    if (!validation.ok) return { ok: false, reason: validation.errors[0], errors: validation.errors };
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [{ entityType: 'tracker_type', id: definition.id, payload: definition }],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_type_commit_failed' };
    set(current => ({ trackerTypes: [...current.trackerTypes, definition] }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_type_create' });
    return { ok: true, trackerType: definition };
  },

  updateCustomTrackerType: async (id, patch = {}) => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const current = state.trackerTypes.find(item => item.id === id);
    if (!current) return { ok: false, reason: 'custom_tracker_type_not_found' };
    const definition = normalizeTrackerTypeDefinition({
      ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: timestamp(),
    }, {
      walletIds: state.wallets.map(item => item.id),
      categoryIds: state.cats.map(item => item.id),
    });
    const validation = validateTrackerDefinition(definition);
    if (!validation.ok) return { ok: false, reason: validation.errors[0], errors: validation.errors };
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [{ entityType: 'tracker_type', id, payload: definition }],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_type_commit_failed' };
    set(currentState => ({
      trackerTypes: currentState.trackerTypes.map(item => item.id === id ? definition : item),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_type_update' });
    return { ok: true, trackerType: definition };
  },

  deleteCustomTrackerType: async (id, { deleteItems = false } = {}) => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const definition = state.trackerTypes.find(item => item.id === id);
    if (!definition) return { ok: false, reason: 'custom_tracker_type_not_found' };
    const linkedItems = state.trackerItems.filter(item => item.typeId === id);
    if (linkedItems.length && !deleteItems) {
      return { ok: false, reason: 'custom_tracker_type_has_items', itemCount: linkedItems.length };
    }
    const deletedAt = timestamp();
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [
        { entityType: 'tracker_type', id, deletedAt, payload: { ...definition, deletedAt, status: 'archived' } },
        ...linkedItems.map(item => ({
          entityType: 'tracker_item', id: item.id, deletedAt,
          payload: { ...item, deletedAt, status: 'archived' },
        })),
      ],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_type_delete_failed' };
    set(current => ({
      trackerTypes: current.trackerTypes.filter(item => item.id !== id),
      trackerItems: current.trackerItems.filter(item => item.typeId !== id),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_type_delete' });
    return { ok: true, deletedItems: linkedItems.length };
  },

  createCustomTrackerItem: async (trackerTypeId, draft = {}) => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const definition = state.trackerTypes.find(item => item.id === trackerTypeId);
    if (!definition) return { ok: false, reason: 'custom_tracker_type_not_found' };
    const now = timestamp();
    const item = normalizeTrackerItem({
      ...draft, id: draft.id || uid(), typeId: trackerTypeId, createdAt: draft.createdAt || now, updatedAt: now,
    }, { typeIds: state.trackerTypes.map(type => type.id) });
    const validation = validateTrackerItem(item, definition);
    if (!validation.ok) return { ok: false, reason: validation.errors[0], errors: validation.errors };
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [{ entityType: 'tracker_item', id: item.id, payload: item }],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_item_commit_failed' };
    set(current => ({ trackerItems: [...current.trackerItems, item] }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_item_create' });
    return { ok: true, trackerItem: item };
  },

  updateCustomTrackerItem: async (id, patch = {}) => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const current = state.trackerItems.find(item => item.id === id);
    if (!current) return { ok: false, reason: 'custom_tracker_item_not_found' };
    const definition = state.trackerTypes.find(item => item.id === current.typeId);
    if (!definition) return { ok: false, reason: 'custom_tracker_type_not_found' };
    const item = normalizeTrackerItem({
      ...current, ...patch, id: current.id, typeId: current.typeId, createdAt: current.createdAt, updatedAt: timestamp(),
    }, { typeIds: state.trackerTypes.map(type => type.id) });
    const validation = validateTrackerItem(item, definition);
    if (!validation.ok) return { ok: false, reason: validation.errors[0], errors: validation.errors };
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [{ entityType: 'tracker_item', id, payload: item }],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_item_commit_failed' };
    set(currentState => ({ trackerItems: currentState.trackerItems.map(entry => entry.id === id ? item : entry) }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_item_update' });
    return { ok: true, trackerItem: item };
  },

  deleteCustomTrackerItem: async id => {
    const state = get();
    if (!storageReady(state)) return { ok: false, reason: 'custom_tracker_storage_not_ready' };
    const item = state.trackerItems.find(entry => entry.id === id);
    if (!item) return { ok: false, reason: 'custom_tracker_item_not_found' };
    const deletedAt = timestamp();
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
      changes: [{ entityType: 'tracker_item', id, deletedAt, payload: { ...item, deletedAt, status: 'archived' } }],
    });
    if (!committed.ok) return { ok: false, reason: committed.reason || 'custom_tracker_item_delete_failed' };
    set(current => ({ trackerItems: current.trackerItems.filter(entry => entry.id !== id) }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'custom_tracker_item_delete' });
    return { ok: true };
  },

  buildCustomTrackerPaymentDraft: ({ trackerTypeId, trackerItemId, amount, dateISO, note } = {}) => {
    const state = get();
    const definition = state.trackerTypes.find(item => item.id === trackerTypeId);
    const item = state.trackerItems.find(entry => entry.id === trackerItemId);
    if (!definition || !item || item.typeId !== definition.id) {
      return { ok: false, reason: 'tracker_payment_invalid_reference' };
    }
    return buildTrackerPaymentDraft({ definition, item, amount, dateISO, note });
  },
});
