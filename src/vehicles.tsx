import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Device, Profile } from './lib/supabase';
import { color as theme } from './theme';
import { EASE_IN_OUT, EASE_OUT, useReducedMotion } from './motion';
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

/** Moving faster than a brisk run, with a fresh location. */
export function movingInfo(d?: Device | null) {
  if (!d?.located_at || d.speed_mps == null) return null;
  if (Date.now() - new Date(d.located_at).getTime() > 10 * 60_000) return null;
  if (d.speed_mps < 4.2) return null; // ~15 km/h
  return { kmh: Math.round(d.speed_mps * 3.6), heading: d.heading };
}

// ---------- shading helpers ----------

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Gradients for one drawing. Ids are unique per drawing so many vehicles on screen don't share them. */
function Shades({ id, paint }: { id: string; paint: string }) {
  return (
    <Defs>
      <LinearGradient id={`body${id}`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={shade(paint, 0.38)} />
        <Stop offset="0.45" stopColor={paint} />
        <Stop offset="1" stopColor={shade(paint, -0.42)} />
      </LinearGradient>
      <LinearGradient id={`glass${id}`} x1="0" y1="0" x2="0.3" y2="1">
        <Stop offset="0" stopColor="#E4F3FA" />
        <Stop offset="1" stopColor="#4F6B78" />
      </LinearGradient>
      <RadialGradient id={`rim${id}`} cx="0.4" cy="0.35" r="0.7">
        <Stop offset="0" stopColor="#F4F6F7" />
        <Stop offset="1" stopColor="#737C82" />
      </RadialGradient>
      <LinearGradient id={`jacket${id}`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#66767F" />
        <Stop offset="1" stopColor="#2B353C" />
      </LinearGradient>
      <RadialGradient id={`helmet${id}`} cx="0.35" cy="0.3" r="0.75">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#A9B3BA" />
      </RadialGradient>
      <RadialGradient id={`shadow${id}`} cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0" stopColor="#000" stopOpacity="0.38" />
        <Stop offset="1" stopColor="#000" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );
}

function GroundShadow({ id, cx, w }: { id: string; cx: number; w: number }) {
  return <Ellipse cx={cx} cy={37} rx={w / 2} ry={2.6} fill={`url(#shadow${id})`} />;
}

function Wheel({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="#141414" />
      <Circle cx={cx} cy={cy} r={r * 0.8} fill="#262626" />
      <Circle cx={cx} cy={cy} r={r * 0.58} fill={`url(#rim${id})`} />
      <Circle cx={cx} cy={cy} r={r * 0.18} fill="#3A4247" />
    </G>
  );
}

function SpokeWheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const spokes = [0, 30, 60, 90, 120, 150].map((d) => {
    const a = (d * Math.PI) / 180;
    return `M${cx - Math.cos(a) * r} ${cy - Math.sin(a) * r} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
  });
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke="#141414" strokeWidth={2.2} fill="none" />
      <Circle cx={cx} cy={cy} r={r - 1.4} stroke="#8E979D" strokeWidth={0.7} fill="none" />
      <Path d={spokes.join(' ')} stroke="#B8C0C5" strokeWidth={0.35} />
      <Circle cx={cx} cy={cy} r={1} fill="#59636A" />
    </G>
  );
}

/** Painted panel: shaded fill, a hairline in a darker shade (no cartoon outline), and gloss on the upper half. */
function Panel({ id, d, paint, glossTo, part = '' }: { id: string; d: string; paint: string; glossTo: number; part?: string }) {
  const clip = `clip${id}${part}`;
  return (
    <G>
      <ClipPath id={clip}>
        <Path d={d} />
      </ClipPath>
      <Path d={d} fill={`url(#body${id})`} stroke={shade(paint, -0.55)} strokeWidth={0.45} />
      <Rect x={0} y={-6} width={64} height={glossTo + 6} fill="#FFFFFF" opacity={0.16} clipPath={`url(#${clip})`} />
    </G>
  );
}

function Glass({ id, d }: { id: string; d: string }) {
  const clip = `gclip${id}`;
  return (
    <G>
      <ClipPath id={clip}>
        <Path d={d} />
      </ClipPath>
      <Path d={d} fill={`url(#glass${id})`} />
      <Path d="M18 4 L26 4 L16 22 L8 22 Z M30 4 L33 4 L23 22 L20 22 Z" fill="#FFFFFF" opacity={0.32} clipPath={`url(#${clip})`} />
    </G>
  );
}

// ---------- cars ----------

const CARS: Record<CarStyle, { body: string; glass: string; wheels: [number, number]; belt: number; door?: number }> = {
  hatchback: {
    body: 'M6 29 L6 22 Q8 18 14 17 L22 11 Q24 10 28 10 L42 10 Q46 10 48 14 L52 20 Q58 21 58 24 L58 29 Z',
    glass: 'M15 18 L23 12 L34 12 L34 18 Z M36 12 L42 12 Q45 12 46 15 L48 18 L36 18 Z',
    wheels: [16, 48],
    belt: 18,
    door: 35,
  },
  sedan: {
    body: 'M3 29 L3 23 Q4 20 11 19 L19 12 Q21 11 25 11 L39 11 Q42 11 45 14 L50 19 L58 20 Q61 21 61 24 L61 29 Z',
    glass: 'M13 19 L20 13 L31 13 L31 19 Z M33 13 L39 13 Q42 13 43 15 L46 19 L33 19 Z',
    wheels: [14, 50],
    belt: 19,
    door: 32,
  },
  suv: {
    body: 'M5 29 L5 18 Q5 14 9 13 L14 8 Q15 7 18 7 L46 7 Q49 7 51 10 L55 17 Q59 18 59 22 L59 29 Z',
    glass: 'M10 15 L15 9 L30 9 L30 15 Z M32 9 L45 9 Q48 9 49 12 L51 15 L32 15 Z',
    wheels: [16, 48],
    belt: 15,
    door: 31,
  },
  mpv: {
    body: 'M5 29 L5 15 Q6 9 12 8 L40 8 Q46 8 50 12 L56 19 Q59 20 59 24 L59 29 Z',
    glass: 'M9 15 Q9 10 13 10 L28 10 L28 16 L9 16 Z M30 10 L40 10 Q45 10 48 13 L52 17 L30 17 Z',
    wheels: [16, 48],
    belt: 16,
    door: 29,
  },
  pickup: {
    body: 'M3 29 L3 20 L29 20 L29 12 Q29 10 32 10 L42 10 Q45 10 47 13 L51 19 Q59 20 60 24 L60 29 Z',
    glass: 'M31 12 L41 12 Q44 12 45 14 L48 19 L31 19 Z',
    wheels: [14, 50],
    belt: 19,
  },
};

function CarBase({ id, style }: { id: string; style: CarStyle }) {
  const c = CARS[style];
  return (
    <G>
      <GroundShadow id={id} cx={(c.wheels[0] + c.wheels[1]) / 2} w={c.wheels[1] - c.wheels[0] + 20} />
      <Wheel id={id} cx={c.wheels[0]} cy={29} r={5.6} />
      <Wheel id={id} cx={c.wheels[1]} cy={29} r={5.6} />
    </G>
  );
}

function CarBody({ id, style, paint }: { id: string; style: CarStyle; paint: string }) {
  const c = CARS[style];
  const front = style === 'sedan' || style === 'pickup' ? 61 : 59;
  const back = style === 'sedan' || style === 'pickup' ? 3 : 5;
  return (
    <G>
      <Panel id={id} d={c.body} paint={paint} glossTo={c.belt + 3} />
      {/* wheel arches: dark openings the tyres sit in */}
      <Path d={`M${c.wheels[0] - 7} 29 A7 7 0 0 1 ${c.wheels[0] + 7} 29 Z M${c.wheels[1] - 7} 29 A7 7 0 0 1 ${c.wheels[1] + 7} 29 Z`} fill="#0E0E0E" opacity={0.9} />
      <Glass id={id} d={c.glass} />
      {c.door ? <Path d={`M${c.door} ${c.belt} L${c.door} 27`} stroke={shade(paint, -0.35)} strokeWidth={0.5} /> : null}
      <Rect x={(c.door ?? 36) + 3} y={c.belt + 2.5} width={3} height={0.9} rx={0.45} fill={shade(paint, -0.45)} />
      <Rect x={front - 3.2} y={21.6} width={3.2} height={2.6} rx={1.1} fill="#FFF4CF" />
      <Rect x={front - 2.6} y={21.9} width={1.4} height={1} rx={0.5} fill="#FFFFFF" />
      <Rect x={back - 0.2} y={21.8} width={2.6} height={2.4} rx={1} fill="#D93A40" />
    </G>
  );
}

// ---------- riders and bikes ----------

type Pt = [number, number];

function Rider({ id, hip, shoulder, hand, knee, foot, head }: { id: string; hip: Pt; shoulder: Pt; hand: Pt; knee: Pt; foot: Pt; head: Pt }) {
  const limb = '#353F46';
  return (
    <G>
      <Path d={`M${hip[0]} ${hip[1]} L${knee[0]} ${knee[1]} L${foot[0]} ${foot[1]}`} stroke={limb} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={`M${hip[0]} ${hip[1]} L${shoulder[0]} ${shoulder[1]}`} stroke={`url(#jacket${id})`} strokeWidth={5.6} strokeLinecap="round" />
      <Path d={`M${shoulder[0]} ${shoulder[1]} L${hand[0]} ${hand[1]}`} stroke={limb} strokeWidth={2.7} strokeLinecap="round" />
      <Circle cx={hand[0]} cy={hand[1]} r={1.3} fill="#1E252A" />
      <Circle cx={head[0]} cy={head[1]} r={4.5} fill={`url(#helmet${id})`} />
      <Path d={`M${head[0] + 0.4} ${head[1] - 1.8} Q${head[0] + 4.6} ${head[1] - 1.3} ${head[0] + 4.3} ${head[1] + 1.5} L${head[0] + 0.4} ${head[1] + 1.1} Z`} fill="#18232B" />
      <Path d={`M${head[0] + 1.4} ${head[1] - 1.1} L${head[0] + 3.6} ${head[1] - 0.9}`} stroke="#FFFFFF" strokeWidth={0.6} opacity={0.6} strokeLinecap="round" />
    </G>
  );
}

const BIKE_WHEELS: Record<BikeStyle, { w: [number, number]; r: number; cy: number }> = {
  scooter: { w: [14, 49], r: 5, cy: 32 },
  kapcai: { w: [13, 51], r: 6, cy: 31 },
  superbike: { w: [13, 51], r: 6.5, cy: 31 },
  cruiser: { w: [11, 54], r: 6.5, cy: 31 },
  bicycle: { w: [13, 51], r: 7.5, cy: 30 },
};

function BikeBase({ id, style }: { id: string; style: BikeStyle }) {
  const b = BIKE_WHEELS[style];
  const metal = '#9AA3A9';
  return (
    <G>
      <GroundShadow id={id} cx={(b.w[0] + b.w[1]) / 2} w={b.w[1] - b.w[0] + 14} />
      {/* forks and swingarms stay with the wheels */}
      {style === 'kapcai' ? <Path d="M13 31 L27 27 M48 12 L51 31" stroke={metal} strokeWidth={2} /> : null}
      {style === 'superbike' ? <Path d="M13 31 L28 26 M50 19 L51 31" stroke={metal} strokeWidth={2.4} /> : null}
      {style === 'cruiser' ? <Path d="M11 31 L24 27 M45 8 L54 31" stroke={metal} strokeWidth={2.4} /> : null}
      {style === 'bicycle' ? (
        <>
          <SpokeWheel cx={b.w[0]} cy={b.cy} r={b.r} />
          <SpokeWheel cx={b.w[1]} cy={b.cy} r={b.r} />
        </>
      ) : (
        <>
          <Wheel id={id} cx={b.w[0]} cy={b.cy} r={b.r} />
          <Wheel id={id} cx={b.w[1]} cy={b.cy} r={b.r} />
        </>
      )}
    </G>
  );
}

function BikeBody({ id, style, paint }: { id: string; style: BikeStyle; paint: string }) {
  const seat = '#1C2226';
  switch (style) {
    case 'scooter':
      return (
        <G>
          <Panel id={id} d="M8 30 Q8 20 18 20 L29 20 Q34 20 35 25 L36 30 Z" paint={paint} glossTo={24} />
          <Rect x={30} y={27} width={14} height={3} rx={0.8} fill="#2A3136" />
          <Panel id={id} part="shield" d="M40 30 L43 16 L48 16 L47 30 Z" paint={paint} glossTo={21} />
          <Path d="M46 16 L47 11 M44 11 L51 11" stroke="#2A3136" strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={49} cy={18} r={1.7} fill="#FFF4CF" />
          <Rect x={13} y={17.5} width={15} height={3} rx={1.5} fill={seat} />
          <Rider id={id} hip={[21, 17]} knee={[32, 18]} foot={[36, 26]} shoulder={[25, 6]} hand={[46, 11]} head={[27, 1.8]} />
        </G>
      );
    case 'kapcai':
      return (
        <G>
          <Panel id={id} d="M5 21 Q9 16 19 16.5 L30 17 L29 22 Q20 25 11 24 Z" paint={paint} glossTo={19} />
          <Path d="M29 20 Q35 27 42 21 L47 13" stroke={paint} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d="M30 19.5 Q35 25 41 20" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.35} fill="none" strokeLinecap="round" />
          <Rect x={25} y={23} width={10} height={6} rx={1.5} fill="#4A545B" />
          <Path d="M26 25 L34 25 M26 27 L34 27" stroke="#2F363B" strokeWidth={0.5} />
          <Rect x={14} y={13.5} width={16} height={3.5} rx={1.7} fill={seat} />
          <Path d="M45 10 L51 10" stroke="#2A3136" strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={49.5} cy={13} r={1.4} fill="#FFF4CF" />
          <Rider id={id} hip={[22, 13]} knee={[31, 16]} foot={[31, 26]} shoulder={[28, 2.5]} hand={[46, 10]} head={[31, -1.5]} />
        </G>
      );
    case 'superbike':
      return (
        <G>
          <Panel id={id} d="M6 17 L18 18 L33 17 Q43 10 52 14 L57 21 L50 27 L24 28 L17 23 Z" paint={paint} glossTo={19} />
          <Path d="M43 12 Q49 9.5 53 14.5 L46 15.5 Z" fill={`url(#glass${id})`} />
          <Path d="M24 24 L44 22" stroke={shade(paint, -0.4)} strokeWidth={0.6} />
          <Rect x={12} y={14.5} width={11} height={3.5} rx={1.5} fill={seat} />
          <Circle cx={55} cy={20} r={1.3} fill="#FFF4CF" />
          <Rider id={id} hip={[18, 13]} knee={[28, 14]} foot={[25, 24]} shoulder={[33, 5]} hand={[44, 13]} head={[38, 2]} />
        </G>
      );
    case 'cruiser':
      return (
        <G>
          <Path d="M4 27 Q6 21 15 22" stroke={paint} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Panel id={id} d="M25 18 Q31 12 39 14 L41 20 L27 21 Z" paint={paint} glossTo={16} />
          <Rect x={24} y={21} width={14} height={7} rx={2} fill={`url(#rim${id})`} />
          <Path d="M25 23 L37 23 M25 25.5 L37 25.5" stroke="#5E676D" strokeWidth={0.5} />
          <Rect x={11} y={18.5} width={15} height={4} rx={2} fill={seat} />
          <Path d="M41 7 L48 5" stroke="#2A3136" strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={47} cy={11} r={1.8} fill="#FFF4CF" />
          <Rider id={id} hip={[18, 17]} knee={[30, 17]} foot={[39, 25]} shoulder={[16, 4.5]} hand={[42, 7]} head={[18, 0]} />
        </G>
      );
    case 'bicycle':
      return (
        <G>
          <Path
            d="M13 30 L28 30 L24 16 Z M28 30 L44 17 L24 17 M44 17 L51 30 M44 17 L45 12 L49 12"
            stroke={paint}
            strokeWidth={2.3}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Path d="M24.5 16.4 L43.5 16.4" stroke="#FFFFFF" strokeWidth={0.6} opacity={0.4} />
          <Rect x={20} y={14} width={8} height={2.5} rx={1} fill={seat} />
          <Circle cx={28} cy={30} r={1.8} fill="#59636A" />
          <Rider id={id} hip={[24, 13]} knee={[33, 20]} foot={[29, 30]} shoulder={[33, 3.5]} hand={[48, 12]} head={[37, 0]} />
        </G>
      );
  }
}

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * A vehicle drawing. layer "base" is what stays on the road (shadow, wheels, forks);
 * "body" is what rides on the suspension (paint, glass, rider). The moving pin bobs only the body.
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
  const id = useSvgId();
  const fill = PAINTS[paint] ?? PAINTS.blue;
  const base = layer !== 'body';
  const body = layer !== 'base';
  return (
    <Svg width={width} height={(width * 46) / 64} viewBox="0 -6 64 46">
      <Shades id={id} paint={fill} />
      {kind === 'car' ? (
        <>
          {base ? <CarBase id={id} style={style as CarStyle} /> : null}
          {body ? <CarBody id={id} style={style as CarStyle} paint={fill} /> : null}
        </>
      ) : (
        <>
          {base ? <BikeBase id={id} style={style as BikeStyle} /> : null}
          {body ? <BikeBody id={id} style={style as BikeStyle} paint={fill} /> : null}
        </>
      )}
    </Svg>
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
  const H = (W * 46) / 64;

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
