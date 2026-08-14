import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, weight } from '../lib/tokens';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const touchDistance = (touches = []) => {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = Number(a.pageX || 0) - Number(b.pageX || 0);
  const dy = Number(a.pageY || 0) - Number(b.pageY || 0);
  return Math.sqrt((dx * dx) + (dy * dy));
};

export default function SmartImageViewerModal({
  visible,
  uri,
  onClose,
  th,
  lang = 'ar',
}) {
  const ar = lang === 'ar';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleValue = useRef(1);
  const panXValue = useRef(0);
  const panYValue = useRef(0);
  const startPanX = useRef(0);
  const startPanY = useRef(0);
  const startScale = useRef(1);
  const pinchStartDistance = useRef(0);
  const [zoomPercent, setZoomPercent] = useState(100);

  const resetPan = () => {
    panXValue.current = 0;
    panYValue.current = 0;
    translateX.setValue(0);
    translateY.setValue(0);
  };

  const setZoom = (nextValue, animated = true) => {
    const next = clamp(Number(nextValue) || 1, 1, 6);
    scaleValue.current = next;
    setZoomPercent(Math.round(next * 100));
    if (next <= 1.01) resetPan();

    if (animated) {
      Animated.spring(scale, {
        toValue: next,
        useNativeDriver: true,
        friction: 8,
        tension: 70,
      }).start();
    } else {
      scale.setValue(next);
    }
  };

  const resetZoom = () => {
    resetPan();
    pinchStartDistance.current = 0;
    setZoom(1);
  };

  const zoomIn = () => setZoom(scaleValue.current + 0.5);
  const zoomOut = () => setZoom(scaleValue.current - 0.5);

  useEffect(() => {
    if (visible) resetZoom();
  }, [visible, uri]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => {
      const touches = event.nativeEvent.touches || [];
      return touches.length >= 2 || scaleValue.current > 1.01;
    },
    onStartShouldSetPanResponderCapture: (event) => {
      const touches = event.nativeEvent.touches || [];
      return touches.length >= 2 || scaleValue.current > 1.01;
    },
    onMoveShouldSetPanResponder: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) return true;
      return scaleValue.current > 1.01
        && (Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1);
    },
    onMoveShouldSetPanResponderCapture: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) return true;
      return scaleValue.current > 1.01
        && (Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1);
    },
    onPanResponderGrant: (event) => {
      startPanX.current = panXValue.current;
      startPanY.current = panYValue.current;
      startScale.current = scaleValue.current;
      const touches = event.nativeEvent.touches || [];
      pinchStartDistance.current = touches.length >= 2 ? touchDistance(touches) : 0;
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];

      if (touches.length >= 2) {
        const distance = touchDistance(touches);
        if (!pinchStartDistance.current) pinchStartDistance.current = distance || 1;
        const next = clamp(
          startScale.current * (distance / Math.max(1, pinchStartDistance.current)),
          1,
          6,
        );
        scaleValue.current = next;
        scale.setValue(next);
        setZoomPercent(Math.round(next * 100));
        if (next <= 1.01) resetPan();
        return;
      }

      if (scaleValue.current <= 1.01) return;

      const maxX = Math.max(80, (width * (scaleValue.current - 1)) / 1.25);
      const maxY = Math.max(120, (height * (scaleValue.current - 1)) / 1.35);
      const nextX = clamp(startPanX.current + gestureState.dx, -maxX, maxX);
      const nextY = clamp(startPanY.current + gestureState.dy, -maxY, maxY);

      panXValue.current = nextX;
      panYValue.current = nextY;
      translateX.setValue(nextX);
      translateY.setValue(nextY);
    },
    onPanResponderRelease: () => {
      pinchStartDistance.current = 0;
      if (scaleValue.current <= 1.01) resetPan();
    },
    onPanResponderTerminate: () => {
      pinchStartDistance.current = 0;
    },
    onShouldBlockNativeResponder: () => true,
  }), [height, width, scale, translateX, translateY]);

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View
          style={[
            s.header,
            {
              paddingTop: Math.max(insets.top, 12),
              flexDirection: ar ? 'row-reverse' : 'row',
            },
          ]}
        >
          <Pressable onPress={onClose} style={s.headerBtn} accessibilityRole="button">
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </Pressable>
          <Text style={s.title}>{ar ? 'الصورة' : 'Image'}</Text>
          <View style={s.headerBtnSpacer} />
        </View>

        <View style={s.stage} {...panResponder.panHandlers}>
          <Animated.Image
            pointerEvents="none"
            source={{ uri }}
            resizeMode="contain"
            style={[
              s.image,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              },
            ]}
          />
        </View>

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.zoomControls}>
            <Pressable
              onPress={zoomOut}
              disabled={zoomPercent <= 100}
              style={[s.zoomBtn, { opacity: zoomPercent <= 100 ? 0.35 : 1 }]}
              accessibilityRole="button"
            >
              <Ionicons name="remove" size={24} color="#fff" />
            </Pressable>

            <Pressable onPress={resetZoom} style={s.zoomValue} accessibilityRole="button">
              <Text style={s.zoomValueText}>{zoomPercent}%</Text>
            </Pressable>

            <Pressable
              onPress={zoomIn}
              disabled={zoomPercent >= 600}
              style={[s.zoomBtn, { opacity: zoomPercent >= 600 ? 0.35 : 1 }]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000' },
  header: {
    minHeight: 62,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnSpacer: { width: 42, height: 42 },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    ...weight('900'),
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  footer: { minHeight: 70, alignItems: 'center', justifyContent: 'center' },
  zoomControls: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.13)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    gap: 4,
  },
  zoomBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomValue: {
    minWidth: 72,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  zoomValueText: { color: '#fff', fontSize: 13, lineHeight: 18, ...weight('900') },
});
