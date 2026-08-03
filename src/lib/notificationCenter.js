import { buildDecisionItems } from './decisionEngine';

export const NOTIFICATION_DISMISSED_STORAGE_KEY = 'MYFI_DISMISSED_NOTIFICATIONS_V1';

export const buildNotificationItems = (params = {}) => (
  buildDecisionItems(params).filter(item => item.channel !== 'quiet')
);

export const notificationReadKey = (item = {}) => {
  const source = `${item.id || ''}:${item.fingerprint || item.body || ''}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${item.id || 'notification'}:${(hash >>> 0).toString(16)}`;
};

export const sanitizeNotificationReadKeys = (items = []) => (
  (Array.isArray(items) ? items : [])
    .filter(key => /^[^:]+:[0-9a-f]{8}$/i.test(String(key || '')))
    .slice(-200)
);

export const filterDismissedNotifications = (items = [], dismissedKeys = []) => {
  const dismissed = new Set(sanitizeNotificationReadKeys(dismissedKeys));
  return (Array.isArray(items) ? items : []).filter(item => !dismissed.has(notificationReadKey(item)));
};
