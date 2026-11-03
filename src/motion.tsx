import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

// Strong custom curves — the built-in ones are too weak to feel intentional.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1); // entering, responding to a touch
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1); // moving across the screen
export const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1); // bottom sheets

/** Respect the phone's "reduce motion" setting: keep fades, drop movement. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

type PressScaleProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; children: ReactNode; scaleTo?: number };

/** Anything tappable shrinks slightly under the finger so the app feels like it heard you. */
export function PressScale({ style, children, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number, ms: number) =>
    Animated.timing(scale, { toValue: v, duration: ms, easing: EASE_OUT, useNativeDriver: true }).start();
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) to(scaleTo, 100);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1, 160);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Fade + slight scale up when something appears (never from scale 0). */
export function Appear({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: reduced ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
