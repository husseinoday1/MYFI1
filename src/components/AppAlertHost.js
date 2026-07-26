import React, { useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { Touchable } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

const nativeAlert = Alert.alert.bind(Alert);

const actionIcon = (button = {}) => {
  const text = String(button.text || '').toLowerCase();
  if (button.style === 'destructive' || /حذف|مسح|delete|remove/.test(text)) return 'trash-outline';
  if (button.style === 'cancel' || /إلغاء|cancel/.test(text)) return 'close';
  if (/كاميرا|camera|photo/.test(text)) return 'camera-outline';
  if (/صور|معرض|gallery|library/.test(text)) return 'images-outline';
  if (/إعدادات|settings/.test(text)) return 'settings-outline';
  return 'checkmark-outline';
};

export default function AppAlertHost({ children }) {
  const cfg = useStore(state => state.cfg);
  const th = TH[cfg.theme] || TH.dark;
  const ar = cfg.lang === 'ar';
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const appAlert = (title, message, buttons, options = {}) => {
      setDialog({
        title: String(title || ''),
        message: String(message || ''),
        buttons: buttons?.length ? buttons : [{ text: ar ? 'حسناً' : 'OK' }],
        options,
      });
    };
    Alert.alert = appAlert;
    return () => {
      if (Alert.alert === appAlert) Alert.alert = nativeAlert;
    };
  }, [ar]);

  const dismiss = () => {
    const current = dialog;
    setDialog(null);
    current?.options?.onDismiss?.();
  };

  const choose = (button) => {
    setDialog(null);
    requestAnimationFrame(() => button?.onPress?.());
  };

  return (
    <>
      {children}
      <Modal
        visible={!!dialog}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          const cancel = dialog?.buttons?.find(button => button.style === 'cancel');
          if (cancel) choose(cancel);
          else if (dialog?.options?.cancelable !== false) dismiss();
        }}
      >
        <View style={[s.backdrop, { backgroundColor: th.overlay }]}>
          <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.mark, { backgroundColor: th.primSoft }]}>
              <Ionicons
                name={dialog?.buttons?.some(button => button.style === 'destructive') ? 'alert-circle-outline' : 'information-circle-outline'}
                size={25}
                color={dialog?.buttons?.some(button => button.style === 'destructive') ? th.exp : th.primary}
              />
            </View>
            {!!dialog?.title && (
              <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{dialog.title}</Text>
            )}
            {!!dialog?.message && (
              <Text style={[s.message, { color: th.sub, textAlign: 'center' }]}>{dialog.message}</Text>
            )}
            <View style={s.actions}>
              {dialog?.buttons?.map((button, index) => {
                const danger = button.style === 'destructive';
                const cancel = button.style === 'cancel';
                return (
                  <Touchable
                    key={`${button.text}-${index}`}
                    onPress={() => choose(button)}
                    haptic={danger ? 'warning' : 'selection'}
                    style={[
                      s.action,
                      {
                        backgroundColor: danger ? th.expBg : cancel ? th.cardHigh : th.primary,
                        borderColor: cancel ? th.border : 'transparent',
                        flexDirection: ar ? 'row-reverse' : 'row',
                      },
                    ]}
                  >
                    <Ionicons
                      name={actionIcon(button)}
                      size={18}
                      color={danger ? th.exp : cancel ? th.sub : th.onPrimary}
                    />
                    <Text
                      style={[
                        s.actionText,
                        { color: danger ? th.exp : cancel ? th.sub : th.onPrimary },
                      ]}
                    >
                      {button.text || (ar ? 'حسناً' : 'OK')}
                    </Text>
                  </Touchable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export { nativeAlert };

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 16,
    ...SHADOW.card,
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, lineHeight: 24, ...weight('900') },
  message: { fontSize: 12, lineHeight: 20, ...weight('700'), marginTop: 6 },
  actions: { gap: 8, marginTop: 16 },
  action: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    gap: 8,
  },
  actionText: { fontSize: 13, ...weight('900') },
});
