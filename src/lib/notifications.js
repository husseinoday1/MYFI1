import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { STR } from './strings';
import { STORAGE } from './constants';
import { getUpcomingRecurring } from '../utils/calc';
import { formatCommitmentDate, getUpcomingCommitments } from './commitments';
import { getDefaultWalletId, getWalletBalances } from './wallets';
import { buildDecisionItems } from './decisionEngine';
import { BRAND_GREEN } from './theme';
import { filterByActiveScope, getModules, isExpenseFlow } from './modules';

const CHANNEL_ID = 'myfi-reminders';
const THROTTLE_KEY = 'MYFI_ALERT_THROTTLE_V1';
const isWeb = Platform.OS === 'web';
const isExpoGo = !!Constants.expoGoConfig || Constants.appOwnership === 'expo';
const isExpoGoAndroid = Platform.OS === 'android' && isExpoGo;
let notificationsApi = null;
let notificationsLoad = null;
let handlerConfigured = false;

const loadNotifications = async () => {
  if (isWeb || isExpoGoAndroid) return null;
  if (notificationsApi) return notificationsApi;
  if (!notificationsLoad) {
    notificationsLoad = import('expo-notifications')
      .then(module => {
        notificationsApi = module;
        if (!handlerConfigured) {
          notificationsApi.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
          handlerConfigured = true;
        }
        return notificationsApi;
      })
      .catch(error => {
        console.warn('[MYFI] expo-notifications unavailable in this runtime:', error?.message || error);
        notificationsLoad = null;
        return null;
      });
  }
  return notificationsLoad;
};

const localText = (lang) => {
  const ar = lang === 'ar';
  return {
    unsupported: ar
      ? 'الإشعارات لا تعمل على الويب. جرّبها من الهاتف أو من APK.'
      : 'Notifications are not supported on web. Test them on phone or APK.',
    expoGoUnsupported: ar
      ? 'إشعارات MYFI الكاملة تحتاج Development Build على Android. Expo Go يبقى مناسباً لاختبار الواجهة فقط.'
      : 'Full MYFI notifications require an Android development build. Expo Go remains suitable for UI testing.',
    denied: ar
      ? 'الإشعارات غير مفعلة من إعدادات النظام.'
      : 'Notifications are disabled in system settings.',
    dailyTitle: ar ? 'MYFI' : 'MYFI',
    dailyEmpty: ar ? 'لا تنس تسجيل مصاريف اليوم' : "Don't forget to log today's expenses",
    dailyAvg: ar ? 'معدل إنفاقك' : 'Daily average',
    logToday: ar ? 'سجل مصاريف اليوم' : "Log today's expenses",
    lowBalance: ar ? 'تنبيه انخفاض الرصيد' : 'Low balance alert',
    debt: ar ? 'تذكير دين عليّ' : 'Debt reminder',
    commitment: ar ? 'تذكير بالالتزامات' : 'Commitment reminder',
  };
};

const ensureAndroidChannel = async (Notifications) => {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'MYFI reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: BRAND_GREEN,
    sound: 'default',
  });
};

export const ensureNotificationPermission = async (lang = 'ar') => {
  const text = localText(lang);
  if (isWeb) return { ok: false, reason: text.unsupported };
  if (isExpoGoAndroid) return { ok: false, reason: text.expoGoUnsupported, developmentBuildRequired: true };

  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, reason: text.expoGoUnsupported, developmentBuildRequired: true };
  await ensureAndroidChannel(Notifications);

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') return { ok: false, reason: text.denied };
  return { ok: true };
};

const immediateTrigger = () => (
  Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null
);

export const setupDailyNotif = async (lang, trans = [], hour = 21) => {
  const permission = await ensureNotificationPermission(lang);
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };

  const now = new Date();
  const mo = now.getMonth();
  const yr = now.getFullYear();
  const day = now.getDate();
  const isAr = lang === 'ar';
  const text = localText(lang);

  const mt = trans.filter(t => {
    if (!t.dateISO) return false;
    const d = new Date(t.dateISO + 'T12:00:00');
    return d.getMonth() === mo && d.getFullYear() === yr;
  });
  const spent = mt.filter(isExpenseFlow).reduce((sum, tx) => sum + Math.abs(Number(tx.amt || 0)), 0);
  const avg = day > 0 ? Math.round(spent / day) : 0;
  const sym = isAr ? 'د.ع' : 'IQD';
  const body = avg > 0
    ? `${text.dailyAvg}: ${avg.toLocaleString()} ${sym} - ${text.logToday}`
    : text.dailyEmpty;

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: STR[lang]?.notifTitle || text.dailyTitle,
      body,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      channelId: CHANNEL_ID,
    },
  });
  await AsyncStorage.setItem(STORAGE.NOTIF, JSON.stringify({ enabled: true, hour }));
  return { ok: true };
};

export const cancelNotifs = async () => {
  if (isWeb || isExpoGoAndroid) return { ok: false, developmentBuildRequired: isExpoGoAndroid };
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(STORAGE.NOTIF, JSON.stringify({ enabled: false }));
  return { ok: true };
};

export const sendTestNotification = async (lang = 'ar') => {
  const permission = await ensureNotificationPermission(lang);
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };
  const ar = lang === 'ar';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'MYFI',
      body: ar ? 'الإشعارات تعمل بشكل صحيح' : 'Notifications are working',
      sound: 'default',
    },
    trigger: immediateTrigger(),
  });
  return { ok: true };
};

export const checkDecisionAlerts = async ({
  trans = [],
  debts = [],
  goals = [],
  wallets = [],
  commitments = [],
  cats = [],
  cfg = {},
  notif = {},
  symbol = '',
} = {}) => {
  const decisions = buildDecisionItems({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol })
    .filter(item => item.notify && item.channel !== 'quiet')
    .slice(0, 2);

  if (decisions.length === 0) return { ok: false };

  const permission = await ensureNotificationPermission(cfg.lang || 'ar');
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };

  let fired = 0;
  const privateBody = (cfg.lang || 'ar') === 'ar'
    ? 'لديك تحديث مالي يحتاج مراجعتك داخل MYFI.'
    : 'A financial update needs your review in MYFI.';
  for (const item of decisions) {
    const key = `decision-${item.fingerprint || item.id}`;
    if (!(await canFire(key, item.throttleHours || 12))) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: cfg.hideNotificationDetails !== false ? privateBody : item.body,
        sound: 'default',
      },
      trigger: immediateTrigger(),
    });
    fired += 1;
  }

  return { ok: fired > 0, count: fired };
};

export const checkRecurringAlerts = async (lang = 'ar', trans = []) => {
  const due = getUpcomingRecurring(trans).filter(item => item.daysUntil <= 1);
  if (due.length === 0) return { ok: false };
  const permission = await ensureNotificationPermission(lang);
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };
  const key = `recurring-${due.map(item => `${item.recurringGroupId || item.id}:${item.dueISO}`).join('|')}`;
  if (!(await canFire(key, 12))) return { ok: false };
  const ar = lang === 'ar';
  const first = due[0];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: ar ? 'MYFI - تذكير تكرار شهري' : 'MYFI - recurring reminder',
      body: due.length === 1
        ? (ar
          ? `${first.title} تنتظر قبولك أو تعديلك لهذا الشهر`
          : `${first.title} is waiting for your review this month`)
        : (ar
          ? `${due.length} معاملات متكررة تنتظر قبولك أو تعديلك`
          : `${due.length} recurring entries are waiting for review`),
      sound: 'default',
    },
    trigger: immediateTrigger(),
  });
  return { ok: true };
};

export const checkCommitmentAlerts = async (lang = 'ar', commitments = [], notifCfg = {}) => {
  if (!notifCfg.commitment?.on) return { ok: false };
  const due = getUpcomingCommitments(commitments).filter(item => item.actionable);
  if (due.length === 0) return { ok: false };
  const permission = await ensureNotificationPermission(lang);
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };
  const key = `commitment-${due.map(item => `${item.id}:${item.dueISO}`).join('|')}`;
  if (!(await canFire(key, 12))) return { ok: false };
  const ar = lang === 'ar';
  const first = due[0];
  const deferredText = first.deferredUntilISO
    ? (ar
      ? ` - \u0645\u0624\u062c\u0644 \u0625\u0644\u0649 ${formatCommitmentDate(first.dueISO, lang)}`
      : ` - deferred to ${formatCommitmentDate(first.dueISO, lang)}`)
    : '';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: ar ? 'MYFI - تذكير التزام شهري' : 'MYFI - monthly commitment reminder',
      body: due.length === 1
        ? (ar
          ? `${first.name} يحتاج تسجيل دفع أو مراجعة${deferredText}`
          : `${first.name} needs payment or review${deferredText}`)
        : (ar
          ? `${due.length} التزامات شهرية تحتاج متابعة`
          : `${due.length} monthly commitments need attention`),
      sound: 'default',
    },
    trigger: immediateTrigger(),
  });
  return { ok: true };
};

const canFire = async (key, hours = 12) => {
  try {
    const raw = await AsyncStorage.getItem(THROTTLE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const last = map[key] || 0;
    if (Date.now() - last < hours * 3600 * 1000) return false;
    map[key] = Date.now();
    await AsyncStorage.setItem(THROTTLE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return true;
  }
};

export const checkDebtAndBalanceAlerts = async (lang, trans = [], debts = [], notifCfg = {}, cfg = {}, wallets = []) => {
  const modules = getModules(cfg);
  trans = filterByActiveScope(trans, cfg);
  wallets = filterByActiveScope(wallets, cfg);
  debts = filterByActiveScope(debts, cfg).filter(item => item.direction !== 'receivable');
  if (!notifCfg.low?.on && !(modules.debtsOwed && notifCfg.debt?.on)) return { ok: false };

  const isAr = lang === 'ar';
  const text = localText(lang);
  const bal = getWalletBalances(wallets, trans, cfg.currency, getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId))
    .reduce((s, wallet) => s + Number(wallet.balance || 0), 0);
  const remaining = debts.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0);
  const hasUnpaid = debts.some(d => d.total - d.paid > 0);
  const lowHit = !!notifCfg.low?.on && bal < Number(notifCfg.low.value || 0);
  const debtHit = modules.debtsOwed && !!notifCfg.debt?.on && hasUnpaid && remaining > 0;

  if (!lowHit && !debtHit) return { ok: false };

  const permission = await ensureNotificationPermission(lang);
  if (!permission.ok) return permission;
  const Notifications = await loadNotifications();
  if (!Notifications) return { ok: false, developmentBuildRequired: true };

  if (lowHit) {
    if (await canFire('low')) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: text.lowBalance,
          body: isAr
            ? `رصيدك الحالي ${bal.toLocaleString()} وصل تحت الحد المحدد`
            : `Your balance ${bal.toLocaleString()} is below your limit`,
          sound: 'default',
        },
        trigger: immediateTrigger(),
      });
    }
  }

  if (debtHit) {
    if (await canFire('debt')) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: text.debt,
          body: isAr
            ? `المتبقي من دين عليّ ${remaining.toLocaleString()} - لا تنس السداد`
            : `You have ${remaining.toLocaleString()} remaining - don't forget to pay`,
          sound: 'default',
        },
        trigger: immediateTrigger(),
      });
    }
  }
  return { ok: true };
};
