import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import type { Device, Profile } from './lib/supabase';
import { color as theme } from './theme';
import { EASE_IN_OUT, useReducedMotion } from './motion';
import { Avatar } from './ui';

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
export const PAINTS: Record<Paint, string> = {
  red: '#E5484D',
  blue: '#3E7BFA',
  white: '#F2F2F2',
  black: '#2B2B2B',
  silver: '#A9B1B8',
  yellow: '#F5C542',
  green: '#3DBE6B',
  orange: '#F08A3C',
};

const GLASS = '#BFE3F2';
const TYRE = '#151515';
const HUB = '#9AA3A9';
const TRIM = '#1F2326';

/** Moving faster than a brisk run, with a fresh location. */
export function movingInfo(d?: Device | null) {
  if (!d?.located_at || d.speed_mps == null) return null;
  if (Date.now() - new Date(d.located_at).getTime() > 10 * 60_000) return null;
  if (d.speed_mps < 4.2) return null; // ~15 km/h
  return { kmh: Math.round(d.speed_mps * 3.6), heading: d.heading };
}

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={TYRE} />
      <Circle cx={cx} cy={cy} r={r * 0.45} fill={HUB} />
    </G>
  );
}

function Car({ style, paint }: { style: CarStyle; paint: string }) {
  const body: Record<CarStyle, string> = {
    hatchback: 'M6 29 L6 22 Q8 18 14 17 L22 11 Q24 10 28 10 L42 10 Q46 10 48 14 L52 20 Q58 21 58 24 L58 29 Z',
    sedan: 'M3 29 L3 23 Q4 20 11 19 L19 12 Q21 11 25 11 L39 11 Q42 11 45 14 L50 19 L58 20 Q61 21 61 24 L61 29 Z',
    suv: 'M5 29 L5 18 Q5 14 9 13 L14 8 Q15 7 18 7 L46 7 Q49 7 51 10 L55 17 Q59 18 59 22 L59 29 Z',
    mpv: 'M5 29 L5 15 Q6 9 12 8 L40 8 Q46 8 50 12 L56 19 Q59 20 59 24 L59 29 Z',
    pickup: 'M3 29 L3 20 L29 20 L29 12 Q29 10 32 10 L42 10 Q45 10 47 13 L51 19 Q59 20 60 24 L60 29 Z',
  };
  const glass: Record<CarStyle, string> = {
    hatchback: 'M15 18 L23 12 L34 12 L34 18 Z M36 12 L42 12 Q45 12 46 15 L48 18 L36 18 Z',
    sedan: 'M13 19 L20 13 L31 13 L31 19 Z M33 13 L39 13 Q42 13 43 15 L46 19 L33 19 Z',
    suv: 'M10 15 L15 9 L30 9 L30 15 Z M32 9 L45 9 Q48 9 49 12 L51 15 L32 15 Z',
    mpv: 'M9 15 Q9 10 13 10 L28 10 L28 16 L9 16 Z M30 10 L40 10 Q45 10 48 13 L52 17 L30 17 Z',
    pickup: 'M31 12 L41 12 Q44 12 45 14 L48 19 L31 19 Z',
  };
  const front = style === 'sedan' || style === 'pickup' ? 61 : 59;
  return (
    <G>
      <Path d={body[style]} fill={paint} stroke={TRIM} strokeWidth={0.8} />
      <Path d={glass[style]} fill={GLASS} />
      <Rect x={front - 3} y={22} width={3} height={2.5} rx={1} fill="#FFE9A8" />
      <Rect x={3} y={22} width={2.5} height={2.5} rx={1} fill="#E5484D" />
      <Wheel cx={style === 'sedan' || style === 'pickup' ? 14 : 16} cy={29} r={5.5} />
      <Wheel cx={style === 'sedan' || style === 'pickup' ? 50 : 48} cy={29} r={5.5} />
    </G>
  );
}

type Pt = [number, number];

function Rider({ hip, shoulder, hand, knee, foot, head }: { hip: Pt; shoulder: Pt; hand: Pt; knee: Pt; foot: Pt; head: Pt }) {
  const limb = '#2F3B44';
  return (
    <G>
      <Path d={`M${hip[0]} ${hip[1]} L${knee[0]} ${knee[1]} L${foot[0]} ${foot[1]}`} stroke={limb} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={`M${hip[0]} ${hip[1]} L${shoulder[0]} ${shoulder[1]}`} stroke="#45545F" strokeWidth={5.5} strokeLinecap="round" />
      <Path d={`M${shoulder[0]} ${shoulder[1]} L${hand[0]} ${hand[1]}`} stroke={limb} strokeWidth={2.8} strokeLinecap="round" />
      <Circle cx={head[0]} cy={head[1]} r={4.4} fill="#F2F5F6" stroke={TRIM} strokeWidth={0.8} />
      <Path d={`M${head[0] + 0.5} ${head[1] - 1.6} Q${head[0] + 4.4} ${head[1] - 1.2} ${head[0] + 4.2} ${head[1] + 1.4} L${head[0] + 0.5} ${head[1] + 1}`} fill={TRIM} />
    </G>
  );
}

function Bike({ style, paint }: { style: BikeStyle; paint: string }) {
  switch (style) {
    case 'scooter':
      return (
        <G>
          <Path d="M8 30 Q8 20 18 20 L29 20 Q34 20 35 25 L36 30 Z" fill={paint} stroke={TRIM} strokeWidth={0.8} />
          <Rect x={30} y={27} width={14} height={3} fill={TRIM} />
          <Path d="M40 30 L43 16 L48 16 L47 30 Z" fill={paint} stroke={TRIM} strokeWidth={0.8} />
          <Path d="M46 16 L47 11 M44 11 L51 11" stroke={TRIM} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={49} cy={18} r={1.6} fill="#FFE9A8" />
          <Rect x={13} y={17.5} width={15} height={3} rx={1.5} fill={TRIM} />
          <Rider hip={[21, 17]} knee={[32, 18]} foot={[36, 26]} shoulder={[25, 6]} hand={[46, 11]} head={[27, 1.8]} />
          <Wheel cx={14} cy={32} r={5} />
          <Wheel cx={49} cy={32} r={5} />
        </G>
      );
    case 'kapcai':
      return (
        <G>
          <Path d="M13 31 L27 27" stroke={HUB} strokeWidth={2} />
          <Path d="M48 12 L51 31" stroke={HUB} strokeWidth={2.2} />
          <Path d="M5 21 Q9 16 19 16.5 L30 17 L29 22 Q20 25 11 24 Z" fill={paint} stroke={TRIM} strokeWidth={0.8} />
          <Path d="M29 20 Q35 27 42 21 L47 13" stroke={paint} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Rect x={25} y={23} width={10} height={6} rx={1.5} fill="#4A545B" />
          <Rect x={14} y={13.5} width={16} height={3.5} rx={1.7} fill={TRIM} />
          <Path d="M45 10 L51 10" stroke={TRIM} strokeWidth={1.8} strokeLinecap="round" />
          <Rider hip={[22, 13]} knee={[31, 16]} foot={[31, 26]} shoulder={[28, 2.5]} hand={[46, 10]} head={[31, -1.5]} />
          <Wheel cx={13} cy={31} r={6} />
          <Wheel cx={51} cy={31} r={6} />
        </G>
      );
    case 'superbike':
      return (
        <G>
          <Path d="M13 31 L28 26" stroke={HUB} strokeWidth={2.4} />
          <Path d="M50 19 L51 31" stroke={HUB} strokeWidth={2.4} />
          <Path d="M6 17 L18 18 L33 17 Q43 10 52 14 L57 21 L50 27 L24 28 L17 23 Z" fill={paint} stroke={TRIM} strokeWidth={0.8} />
          <Path d="M43 12 Q49 9.5 53 14.5 L46 15.5 Z" fill={GLASS} />
          <Rect x={12} y={14.5} width={11} height={3.5} rx={1.5} fill={TRIM} />
          <Rider hip={[18, 13]} knee={[28, 14]} foot={[25, 24]} shoulder={[33, 5]} hand={[44, 13]} head={[38, 2]} />
          <Wheel cx={13} cy={31} r={6.5} />
          <Wheel cx={51} cy={31} r={6.5} />
        </G>
      );
    case 'cruiser':
      return (
        <G>
          <Path d="M11 31 L24 27" stroke={HUB} strokeWidth={2.2} />
          <Path d="M45 8 L54 31" stroke={HUB} strokeWidth={2.6} />
          <Path d="M4 27 Q6 21 15 22" stroke={paint} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Path d="M25 18 Q31 12 39 14 L41 20 L27 21 Z" fill={paint} stroke={TRIM} strokeWidth={0.8} />
          <Rect x={24} y={21} width={14} height={7} rx={2} fill={HUB} />
          <Rect x={11} y={18.5} width={15} height={4} rx={2} fill={TRIM} />
          <Path d="M41 7 L48 5" stroke={TRIM} strokeWidth={1.8} strokeLinecap="round" />
          <Rider hip={[18, 17]} knee={[30, 17]} foot={[39, 25]} shoulder={[16, 4.5]} hand={[42, 7]} head={[18, 0]} />
          <Wheel cx={11} cy={31} r={6.5} />
          <Wheel cx={54} cy={31} r={6.5} />
        </G>
      );
    case 'bicycle':
      return (
        <G>
          <Circle cx={13} cy={30} r={7.5} stroke={TYRE} strokeWidth={2} fill="none" />
          <Circle cx={51} cy={30} r={7.5} stroke={TYRE} strokeWidth={2} fill="none" />
          <Path d="M13 30 L28 30 L24 16 Z M28 30 L44 17 L24 17 M44 17 L51 30 M44 17 L45 12 L49 12" stroke={paint} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Rect x={20} y={14} width={8} height={2.5} rx={1} fill={TRIM} />
          <Rider hip={[24, 13]} knee={[33, 20]} foot={[29, 30]} shoulder={[33, 3.5]} hand={[48, 12]} head={[37, 0]} />
        </G>
      );
  }
}

/** A still drawing of a vehicle, used in the picker. */
export function VehicleArt({
  kind,
  style,
  paint,
  width = 64,
}: {
  kind: 'car' | 'motorbike';
  style: string;
  paint: Paint;
  width?: number;
}) {
  const fill = PAINTS[paint] ?? PAINTS.blue;
  return (
    <Svg width={width} height={(width * 46) / 64} viewBox="0 -6 64 46">
      {kind === 'car' ? <Car style={style as CarStyle} paint={fill} /> : <Bike style={style as BikeStyle} paint={fill} />}
    </Svg>
  );
}

/** The map pin while someone is moving: their vehicle, bouncing, with speed lines and their photo as a badge. */
export function MovingPin({ profile, heading, kmh }: { profile: Profile; heading: number | null; kmh: number }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const lines = useRef(new Animated.Value(0)).current;
  const fast = kmh > 70;

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

  // drawings face right; flip when heading west-ish
  const flip = heading != null && heading > 180 && heading < 360;
  const kind = profile.active_vehicle === 'motorbike' ? 'motorbike' : 'car';
  const style = kind === 'car' ? profile.car_style ?? 'sedan' : profile.bike_style ?? 'kapcai';
  const paint = (kind === 'car' ? profile.car_color : profile.bike_color) as Paint;

  return (
    <View style={{ width: 84, alignItems: 'center' }} accessibilityLabel={`${profile.display_name} is ${kind === 'car' ? 'driving' : 'riding'} at ${kmh} km/h`}>
      <View style={{ transform: [{ scaleX: flip ? -1 : 1 }], flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View
          style={{
            width: 14,
            gap: 4,
            opacity: lines.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0] }),
            transform: [{ translateX: lines.interpolate({ inputRange: [0, 1], outputRange: [6, -6] }) }],
          }}
        >
          {[10, 6, 9].map((w, i) => (
            <View key={i} style={{ height: 2, width: w, borderRadius: 1, backgroundColor: theme.text, alignSelf: 'flex-end' }} />
          ))}
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) }] }}>
          <VehicleArt kind={kind} style={style} paint={paint ?? 'blue'} width={64} />
        </Animated.View>
      </View>
      <View style={{ position: 'absolute', top: -14, right: 2 }}>
        <Avatar name={profile.display_name || profile.email} url={profile.avatar_url} size={26} />
      </View>
      <View style={{ backgroundColor: theme.surface, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginTop: 1, borderWidth: 1, borderColor: theme.border }}>
        <Animated.Text style={{ color: theme.text, fontSize: 11, fontWeight: '700' }}>{kmh} km/h</Animated.Text>
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
