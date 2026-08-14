// Account identity and financial workspace are separate domains.
// Today every signed-in user resolves to the legacy personal namespace.
// A future shared room/workspace can pass workspaceId without changing profile ownership.
export const workspaceNamespaceForSession = ({ user, workspaceId } = {}) => {
  const id = String(workspaceId || '').trim();
  if (id) return `workspace:${id}`;
  return user?.id ? `user:${user.id}` : 'guest';
};

export const accountOwnerId = user => String(user?.id || '').trim() || null;

export const workspaceMembershipKey = ({ workspaceId, userId } = {}) => {
  const workspace = String(workspaceId || '').trim();
  const user = String(userId || '').trim();
  return workspace && user ? `${workspace}:${user}` : '';
};
