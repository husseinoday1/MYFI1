import { buildDecisionItems } from './decisionEngine';

export const NOTIFICATION_DISMISSED_STORAGE_KEY = 'MYFI_DISMISSED_NOTIFICATIONS_V1';

export const buildNotificationItems = (params = {}) => (
  buildDecisionItems(params).filter(item => item.channel !== 'quiet')
);

export const notificationReadKey = (item = {}, at = Date.now()) =>
  `${item.id || 'notification'}:${at.toString(36)}`;

export const sanitizeNotificationReadKeys = (items = []) => (
  (Array.isArray(items) ? items : [])
    .filter(key => /^[^:]+:[0-9a-z]+$/i.test(String(key || '')))
    .slice(-200)
);

const parseDismissedKey = (key = '') => {
  const idx = String(key).lastIndexOf(':');
  if (idx < 0) return null;
  const id = key.slice(0, idx);
  const at = parseInt(key.slice(idx + 1), 36);
  return Number.isFinite(at) ? { id, at } : null;
};

export const filterDismissedNotifications = (items = [], dismissedKeys = [], now = Date.now()) => {
  const dismissed = new Map();
  sanitizeNotificationReadKeys(dismissedKeys).forEach(key => {
    const parsed = parseDismissedKey(key);
    if (!parsed) return;
    const prev = dismissed.get(parsed.id);
    if (!prev || parsed.at > prev) dismissed.set(parsed.id, parsed.at);
  });
  return (Array.isArray(items) ? items : []).filter(item => {
    const lastShown = dismissed.get(item.id);
    if (lastShown == null) return true;
    return (now - lastShown) >= (item.throttleHours || 12) * 3600000;
  });
};