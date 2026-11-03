import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'https://not-configured.supabase.co', anonKey ?? 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Profile = { id: string; email: string; display_name: string };

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
