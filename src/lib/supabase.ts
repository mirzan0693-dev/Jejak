import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// The anon key is public by design: the database's row-level security decides what each person can see.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wmxechxoqcimgvwmdvgn.supabase.co';
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteGVjaHhvcWNpbWd2d21kdmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MDc2NzcsImV4cCI6MjEwOTI4MzY3N30.mZzEyKTRtDw8LQuomrR18_lqM1ExI2BiVQbzFNLX54E';

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'https://not-configured.supabase.co', anonKey ?? 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web', // web: the sign-in link lands back on this page
  },
});

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_path?: string | null;
  avatar_url?: string | null; // filled in by the app from avatar_path
  active_vehicle?: 'car' | 'motorbike';
  car_style?: string;
  car_color?: string;
  bike_style?: string;
  bike_color?: string;
};

export type Device = {
  id: string;
  user_id: string;
  name: string;
  platform: 'android' | 'ios' | 'web';
  is_sharing_device: boolean;
  battery: number | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  located_at: string | null;
  speed_mps?: number | null;
  heading?: number | null;
  lost: boolean;
  lost_message: string | null;
  lost_phone: string | null;
};

export type Share = {
  id: string;
  owner_id: string;
  viewer_id: string;
  requested_by: string;
  status: 'pending' | 'active' | 'declined';
  expires_at: string | null;
};

export type Geofence = {
  id: string;
  watcher_id: string;
  subject_id: string;
  created_by?: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  trigger: 'arrive' | 'leave';
  repeat: boolean;
  active: boolean;
};

export type Alert = {
  id: string;
  kind: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type Command = {
  id: string;
  device_id: string;
  kind: 'play_sound' | 'lost_on' | 'lost_off';
  status: 'pending' | 'done';
};

export function displayName(p?: Profile | null) {
  if (!p) return 'Someone';
  return p.display_name || p.email;
}

export function errorText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong';
}
