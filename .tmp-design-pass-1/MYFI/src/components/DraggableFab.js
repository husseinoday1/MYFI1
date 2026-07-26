import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, StyleSheet } from 'react-native';
import { Touchable } from './AppPrimitives';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { STORAGE } from '../lib/constants';
import { ELEVATION } from '../lib/tokens';

const FAB_SIZE = 58;
const NAV_H = 112;

const defaultPos = () => {
  const { width, height } = Dimensions.get('window');
  return { x: width - FAB_SIZE - 18, y: height - NAV_H - FAB_SIZE };
};

const clampPos = (x, y) => {
  const { width, height } = Dimensions.get('window');
  return {
    x: Math.min(Math.max(Number(x) || 8, 8), width - FAB_SIZE - 8),
    y: Math.min(Math.max(Number(y) || 72, 72), height - NAV_H - FAB_SIZE),
  };
};

export default function DraggableFab({ th, onPress, bottomInset = 0 }) {
  const pan = useRef(new Animated.ValueXY(defaultPos())).current;
  const posRef = useRef(defaultPos());
  const movedRef = useRef(false);
  const onPressRef = useRef(onPress);
  const [loaded, setLoaded] = useState(false);

  onPressRef.current = onPress;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE.FAB_POS).then(raw => {
      let next = defaultPos();
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          next = clampPos(saved.x, saved.y);
        } catch {}
      }
      posRef.current = next;
      pan.setValue(next);
      AsyncStorage.setItem(STORAGE.FAB_POS, JSON.stringify(next));
      setLoaded(true);
    });
  }, [pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
        pan.setOffset(posRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) movedRef.current = true;
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const next = clampPos(posRef.current.x + g.dx, posRef.current.y + g.dy);
        posRef.current = next;
        Animated.spring(pan, { toValue: next, useNativeDriver: false, friction: 7 }).start();
        AsyncStorage.setItem(STORAGE.FAB_POS, JSON.stringify(next));
        if (!movedRef.current) onPressRef.current();
      },
    })
  ).current;

  if (Platform.OS !== 'web') {
    return (
      <Touchable
        onPress={onPress}
        haptic="medium"
        scaleTo={0.92}
        style={[s.fixedFab, { backgroundColor: th.primary, bottom: 82 + Math.max(Number(bottomInset) || 0, 0) }]}
      >
        <Ionicons name="add" size={30} color={th.onPrimary} />
      </Touchable>
    );
  }

  if (!loaded) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[s.fab, { backgroundColor: th.primary, transform: pan.getTranslateTransform() }]}
    >
      <Ionicons name="add" size={28} color={th.onPrimary} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...ELEVATION.e3,
    zIndex: 999,
  },
  fixedFab: {
    position: 'absolute',
    right: 18,
    bottom: 86,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...ELEVATION.e3,
    zIndex: 999,
  },
});
