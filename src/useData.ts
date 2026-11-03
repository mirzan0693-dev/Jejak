import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarUrls } from './lib/avatar';
import { runPendingCommands } from './lib/location';
import { supabase, type Alert, type Device, type Geofence, type Profile, type Share } from './lib/supabase';

export type AppData = {
  me: Profile | null;
  profiles: Record<string, Profile>;
  shares: Share[];
  devices: Device[];
  geofences: Geofence[];
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useAppData(userId: string): AppData {
  const [state, setState] = useState<Omit<AppData, 'refresh'>>({
    me: null,
    profiles: {},
    shares: [],
    devices: [],
    geofences: [],
    alerts: [],
    loading: true,
    error: null,
  });
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [p, sh, d, g, a] = await Promise.all([
        supabase.from('profiles').select('id, email, display_name, avatar_path'),
        supabase.from('shares').select('*'),
        supabase.from('devices').select('*').order('created_at'),
        supabase.from('geofences').select('*').eq('active', true),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(30),
      ]);
      const err = p.error ?? sh.error ?? d.error ?? g.error ?? a.error;
      const profiles: Record<string, Profile> = {};
      for (const row of (p.data ?? []) as Profile[]) profiles[row.id] = row;
      const paths = Object.values(profiles)
        .map((x) => x.avatar_path)
        .filter((x): x is string => !!x);
      const urls = paths.length ? await avatarUrls(paths).catch(() => ({}) as Record<string, string>) : {};
      for (const prof of Object.values(profiles)) prof.avatar_url = prof.avatar_path ? urls[prof.avatar_path] ?? null : null;
      const now = Date.now();
      setState({
        me: profiles[userId] ?? null,
        profiles,
        shares: ((sh.data ?? []) as Share[]).filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now),
        devices: (d.data ?? []) as Device[],
        geofences: (g.data ?? []) as Geofence[],
        alerts: (a.data ?? []) as Alert[],
        loading: false,
        error: err ? err.message : null,
      });
    } finally {
      busy.current = false;
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`live-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shares' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commands' }, () => {
        runPendingCommands();
      })
      .subscribe();
    const timer = setInterval(refresh, 60_000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { ...state, refresh };
}
