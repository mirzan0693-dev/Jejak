import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

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

/** New content slides up a little and fades in (used when one step replaces another). */
export function FadeUp({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 250, easing: EASE_OUT, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: reduced ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A small celebration for rare moments: grows in with a gentle bounce. Fade only with reduce motion. */
export function Pop({ children, active }: { children: ReactNode; active: boolean }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(active ? 0 : 1)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    if (reduced) Animated.timing(v, { toValue: 1, duration: 200, easing: EASE_OUT, useNativeDriver: true }).start();
    else Animated.spring(v, { toValue: 1, bounciness: 8, speed: 12, useNativeDriver: true }).start();
  }, [active]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
        transform: reduced ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Animate the next layout change (a section opening or closing) natively, 220ms. */
export function animateNextLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

/**
 * Glides a map position from where it was to where it is now, so a moving pin travels instead of jumping.
 * Only this marker re-renders during the glide (about 36 frames, once a minute per moving person).
 */
export function useGlidingLngLat(target: [number, number]): [number, number] {
  const reduced = useReducedMotion();
  const [pos, setPos] = useState(target);
  const from = useRef(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = from.current;
    if (reduced || (start[0] === target[0] && start[1] === target[1])) {
      from.current = target;
      setPos(target);
      return;
    }
    // jumps over ~5 km are teleports (phone was off), not travel: snap
    const far = Math.abs(start[0] - target[0]) + Math.abs(start[1] - target[1]) > 0.05;
    if (far) {
      from.current = target;
      setPos(target);
      return;
    }
    const t0 = Date.now();
    const ease = EASE_IN_OUT;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / 600);
      const e = ease(k);
      const p: [number, number] = [start[0] + (target[0] - start[0]) * e, start[1] + (target[1] - start[1]) * e];
      from.current = p;
      setPos(p);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target[0], target[1], reduced]);
  return pos;
}
