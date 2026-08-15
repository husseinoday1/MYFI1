// Account identity and financial workspace are separate domains.
// Authentication may link or unlink cloud access, but it must never silently
// redefine which local ledger exists or is currently mounted.
const GUEST_NAMESPACE = 'guest';

const normalizeId = value => String(value || '').trim();

export const accountIdFromWorkspaceNamespace = namespace => {
  const value = normalizeId(namespace);
  const match = /^user:(.+)$/.exec(value);
  return match ? normalizeId(match[1]) || null : null;
};

export const workspaceNamespaceForSession = ({ user, workspaceId } = {}) => {
  const id = normalizeId(workspaceId);
  if (id) return `workspace:${id}`;
  return user?.id ? `user:${user.id}` : GUEST_NAMESPACE;
};

// Pure lifecycle decision used by the runtime and regression tests.
// Logout preserves the mounted ledger. A same-account re-login reuses it.
// Only an explicit account switch (or explicit destructive unlink flow) chooses
// a different namespace. Guest transfer is offered only from a true unlinked
// guest ledger, never merely because the cloud session ended.
export const resolveWorkspaceTransition = ({
  currentNamespace = GUEST_NAMESPACE,
  currentLinkedUserId = null,
  nextUserId = null,
  switchToGuest = false,
} = {}) => {
  const namespace = normalizeId(currentNamespace) || GUEST_NAMESPACE;
  const linkedUserId = normalizeId(currentLinkedUserId) || accountIdFromWorkspaceNamespace(namespace);
  const nextId = normalizeId(nextUserId);

  if (switchToGuest) {
    return {
      namespace: GUEST_NAMESPACE,
      linkedUserId: null,
      preserveCurrent: false,
      accountSwitch: namespace !== GUEST_NAMESPACE,
      shouldOfferGuestTransfer: false,
    };
  }

  if (!nextId) {
    return {
      namespace,
      linkedUserId,
      preserveCurrent: true,
      accountSwitch: false,
      shouldOfferGuestTransfer: false,
    };
  }

  if (linkedUserId === nextId) {
    return {
      namespace,
      linkedUserId: nextId,
      preserveCurrent: true,
      accountSwitch: false,
      shouldOfferGuestTransfer: false,
    };
  }

  return {
    namespace: `user:${nextId}`,
    linkedUserId: nextId,
    preserveCurrent: false,
    accountSwitch: !!linkedUserId && linkedUserId !== nextId,
    shouldOfferGuestTransfer: namespace === GUEST_NAMESPACE && !linkedUserId,
  };
};

export const accountOwnerId = user => normalizeId(user?.id) || null;

export const workspaceMembershipKey = ({ workspaceId, userId } = {}) => {
  const workspace = normalizeId(workspaceId);
  const user = normalizeId(userId);
  return workspace && user ? `${workspace}:${user}` : '';
};
