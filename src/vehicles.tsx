import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';
import type { Device, Profile } from './lib/supabase';
import { color as theme } from './theme';
import { EASE_IN_OUT, EASE_OUT, useReducedMotion } from './motion';
import { Avatar } from './ui';
import { VEHICLE_IMAGES, VEHICLE_IMAGE_SIZE } from './vehicleImages';

export type CarStyle = 'hatchback' | 'sedan' | 'suv' | 'mpv' | 'pickup';
export type BikeStyle = 'scooter' | 'kapcai' | 'superbike' | 'cruiser' | 'bicycle';
export type Paint = 'red' | 'blue' | 'white' | 'black' | 'silver' | 'yellow' | 'green' | 'orange';

export const CAR_STYLES: { id: CarStyle; label: string }[] = [
  { id: 'hatchback', label: 'Hatchback' },
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'mpv', label: 'MPV' },
  { id: 'pickup', label: 'Pickup' },
];
export const BIKE_STYLES: { id: BikeStyle; label: string }[] = [
  { id: 'scooter', label: 'Scooter' },
  { id: 'kapcai', label: 'Kapcai' },
  { id: 'superbike', label: 'Superbike' },
  { id: 'cruiser', label: 'Cruiser' },
  { id: 'bicycle', label: 'Bicycle' },
];
// swatch colours match the paint used in the 3D renders (tools/vehicles/scene.js)
export const PAINTS: Record<Paint, string> = {
  red: '#D8242B',
  blue: '#1F5FE0',
  white: '#F4F4F2',
  black: '#101214',
  silver: '#A7AEB4',
  yellow: '#F2B705',
  green: '#1E9E52',
  orange: '#F0701E',
};

/** Moving faster than a brisk run, with a fresh location. */
export function movingInfo(d?: Device | null) {
  if (!d?.located_at || d.speed_mps == null) return null;
  if (Date.now() - new Date(d.located_at).getTime() > 10 * 60_000) return null;
  if (d.speed_mps < 4.2) return null; // ~15 km/h
  return { kmh: Math.round(d.speed_mps * 3.6), heading: d.heading };
}

/**
 * A vehicle, rendered in 3D with three.js (tools/vehicles) and shipped as two image layers:
 * "base" stays on the road (shadow, tyres, forks), the paint layer rides the suspension.
 * The moving pin bobs only the paint layer.
 */
export function VehicleArt({
  kind,
  style,
  paint,
  width = 64,
  layer = 'all',
}: {
  kind: 'car' | 'motorbike';
  style: string;
  paint: Paint;
  width?: number;
  layer?: 'all' | 'base' | 'body';
}) {
  const height = (width * VEHICLE_IMAGE_SIZE.height) / VEHICLE_IMAGE_SIZE.width;
  const base = VEHICLE_IMAGES[`${kind}/${style}/base`];
  const body = VEHICLE_IMAGES[`${kind}/${style}/${paint}`] ?? VEHICLE_IMAGES[`${kind}/${style}/blue`];
  const size = { width, height };
  return (
    <View style={size} accessible={false}>
      {layer !== 'body' && base ? <Image source={base} style={[size, { position: 'absolute' }]} /> : null}
      {layer !== 'base' && body ? <Image source={body} style={[size, { position: 'absolute' }]} /> : null}
    </View>
  );
}

/** The map pin while someone is moving: their vehicle, bouncing, with speed lines and their photo as a badge. */
export function MovingPin({ profile, heading, kmh }: { profile: Profile; heading: number | null; kmh: number }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const lines = useRef(new Animated.Value(0)).current;
  // hysteresis: switch to the quick bounce above 75 km/h, back below 65, so it can't flicker around one number
  const fastRef = useRef(kmh > 75);
  if (kmh > 75) fastRef.current = true;
  else if (kmh < 65) fastRef.current = false;
  const fast = fastRef.current;

  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      // reduce motion: keep the vehicle and speed label, drop the bouncing and moving lines
      bounce.setValue(0);
      lines.setValue(0.5);
      return;
    }
    const half = fast ? 160 : 260;
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: half, easing: EASE_IN_OUT, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: half, easing: EASE_IN_OUT, useNativeDriver: true }),
      ]),
    );
    // constant motion → linear
    const l = Animated.loop(Animated.timing(lines, { toValue: 1, duration: fast ? 450 : 750, easing: Easing.linear, useNativeDriver: true }));
    b.start();
    l.start();
    return () => {
      b.stop();
      l.stop();
    };
  }, [fast, reduced]);

  // Drawings face right. Only change direction when the heading is clearly east or west, so GPS wobble
  // while heading north or south (178°↔182°) can't flip the vehicle back and forth.
  const [facingLeft, setFacingLeft] = useState(heading != null && heading > 200 && heading < 340);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (heading == null) return;
    const wantLeft = heading > 200 && heading < 340 ? true : heading > 20 && heading < 160 ? false : facingLeft;
    if (wantLeft === facingLeft) return;
    if (reduced) {
      setFacingLeft(wantLeft);
      return;
    }
    // crossfade the turn instead of snapping: out fast, flip while invisible, back in
    Animated.timing(fade, { toValue: 0, duration: 100, easing: EASE_OUT, useNativeDriver: true }).start(() => {
      setFacingLeft(wantLeft);
      Animated.timing(fade, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: true }).start();
    });
  }, [heading]);

  const kind = profile.active_vehicle === 'motorbike' ? 'motorbike' : 'car';
  const style = kind === 'car' ? profile.car_style ?? 'sedan' : profile.bike_style ?? 'kapcai';
  const paint = ((kind === 'car' ? profile.car_color : profile.bike_color) as Paint) ?? 'blue';
  const W = 64;
  const H = (W * VEHICLE_IMAGE_SIZE.height) / VEHICLE_IMAGE_SIZE.width;

  return (
    <View style={{ width: 84, alignItems: 'center' }} accessibilityLabel={`${profile.display_name} is ${kind === 'car' ? 'driving' : 'riding'} at ${kmh} km/h`}>
      <Animated.View style={{ opacity: fade, transform: [{ scaleX: facingLeft ? -1 : 1 }], flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View
          style={{
            width: 14,
            gap: 4,
            opacity: lines.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 0] }),
            transform: [{ translateX: lines.interpolate({ inputRange: [0, 1], outputRange: [6, -6] }) }],
          }}
        >
          {/* dark, translucent: the map is light, white lines would vanish */}
          {[10, 6, 9].map((w, i) => (
            <View key={i} style={{ height: 2, width: w, borderRadius: 1, backgroundColor: 'rgba(15,20,22,0.55)', alignSelf: 'flex-end' }} />
          ))}
        </Animated.View>
        <View style={{ width: W, height: H }}>
          {/* wheels and shadow stay on the road… */}
          <View style={{ position: 'absolute' }}>
            <VehicleArt kind={kind} style={style} paint={paint} width={W} layer="base" />
          </View>
          {/* …only the body rides the suspension */}
          <Animated.View
            style={{ position: 'absolute', transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -1.4] }) }] }}
          >
            <VehicleArt kind={kind} style={style} paint={paint} width={W} layer="body" />
          </Animated.View>
        </View>
      </Animated.View>
      <View style={{ position: 'absolute', top: -14, right: 2 }}>
        <Avatar name={profile.display_name || profile.email} url={profile.avatar_url} size={26} />
      </View>
      <View style={{ backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginTop: 1, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{kmh} km/h</Text>
      </View>
    </View>
  );
}

/** "Driving · 45 km/h" for lists. */
export function movingLabel(p: Profile, d?: Device | null) {
  const m = movingInfo(d);
  if (!m) return null;
  const verb = p.active_vehicle === 'motorbike' ? (p.bike_style === 'bicycle' ? 'Cycling' : 'Riding') : 'Driving';
  return `${verb} · ${m.kmh} km/h`;
}
