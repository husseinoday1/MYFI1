import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({
  children,
  onPress,
  style,
  disabled = false,
  haptic = 'selection',
  scale = 0.97,
  ...props
}) {
  const value = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue) => {
    Animated.spring(value, {
      toValue,
      useNativeDriver: true,
      speed: 28,
      bounciness: 5,
    }).start();
  };

  const runPress = async (event) => {
    if (disabled) return;
    try {
      if (haptic === 'impact') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (haptic === 'selection') {
        await Haptics.selectionAsync();
      }
    } catch {}
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPress={runPress}
      onPressIn={() => animateTo(scale)}
      onPressOut={() => animateTo(1)}
      style={[style, { transform: [{ scale: value }], opacity: disabled ? 0.55 : 1 }]}
    >
      {children}
    </AnimatedPressable>
  );
}
