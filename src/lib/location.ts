import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { clearLostNotice, ringDevice, showAlert, showLostNotice } from './notify';
import { supabase, type Command } from './supabase';

export const LOCATION_TASK = 'jejak-location-updates';
const DEVICE_KEY = 'jejak.deviceId';
const LAST_ALERT_KEY = 'jejak.lastAlertAt';

export async function getLocalDeviceId() {
  return AsyncStorage.getItem(DEVICE_KEY);
}

/** Make sure this phone is registered under the signed-in account. Returns its device id. */
export async function ensureDeviceRegistered(userId: string): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY);
  if (saved) {
    const { data } = await supabase.from('devices').select('id').eq('id', saved).eq('user_id', userId).maybeSingle();
    if (data) return saved;
  }
  const { count } = await supabase
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_sharing_device', true);
  const name = Device.deviceName || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
  const { data, error } = await supabase
    .from('devices')
    .insert({
      user_id: userId,
      name,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      is_sharing_device: !count, // first phone on the account shares your location
    })
    .select('id')
    .single();
  if (error) throw error;
  await AsyncStorage.setItem(DEVICE_KEY, data.id);
  return data.id;
}

export async function forgetLocalDevice() {
  await stopBackgroundUpdates();
  await AsyncStorage.multiRemove([DEVICE_KEY, LAST_ALERT_KEY]);
}

async function batteryLevel(): Promise<number | null> {
  try {
    const b = await Battery.getBatteryLevelAsync();
    return b >= 0 ? b : null;
  } catch {
    return null;
  }
}

async function handleCommands(commands: Command[]) {
  for (const c of commands) {
    if (c.kind === 'play_sound') await ringDevice();
    if (c.kind === 'lost_on') {
      const { data } = await supabase.from('devices').select('lost_message, lost_phone').eq('id', c.device_id).single();
      await showLostNotice(data?.lost_message ?? null, data?.lost_phone ?? null);
    }
    if (c.kind === 'lost_off') await clearLostNotice();
    await supabase.from('commands').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', c.id);
  }
}

/** Show new alerts (someone arrived, a share request...) as phone notifications. */
export async function deliverNewAlerts() {
  const since = (await AsyncStorage.getItem(LAST_ALERT_KEY)) ?? new Date(Date.now() - 60_000).toISOString();
  const { data } = await supabase
    .from('alerts')
    .select('body, created_at')
    .is('read_at', null)
    .gt('created_at', since)
    .order('created_at')
    .limit(10);
  if (!data?.length) return;
  for (const a of data) await showAlert(a.body);
  await AsyncStorage.setItem(LAST_ALERT_KEY, data[data.length - 1].created_at);
}

/** Upload one position, then act on any pending commands for this phone. */
export async function reportPosition(pos: { latitude: number; longitude: number; accuracy: number | null }) {
  const deviceId = await AsyncStorage.getItem(DEVICE_KEY);
  if (!deviceId) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;
  const { data, error } = await supabase.rpc('report_location', {
    p_device: deviceId,
    p_lat: pos.latitude,
    p_lng: pos.longitude,
    p_accuracy: pos.accuracy ?? null,
    p_battery: await batteryLevel(),
  });
  if (error) return;
  await handleCommands((data ?? []) as Command[]);
  await deliverNewAlerts();
}

export async function reportNow() {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return;
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await reportPosition(loc.coords);
}

/** Commands sent while the app is open arrive instantly via realtime. */
export async function runPendingCommands() {
  const deviceId = await AsyncStorage.getItem(DEVICE_KEY);
  if (!deviceId) return;
  const { data } = await supabase.from('commands').select('*').eq('device_id', deviceId).eq('status', 'pending');
  await handleCommands((data ?? []) as Command[]);
}

export async function startBackgroundUpdates() {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (started) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5 * 60 * 1000,
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Other,
    foregroundService: {
      notificationTitle: 'Jejak is sharing your location',
      notificationBody: 'Only with people you approved. Open the app to see who or to stop.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopBackgroundUpdates() {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

// Must be defined at startup (imported from index.ts), not inside a component.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const last = data.locations[data.locations.length - 1];
  try {
    await reportPosition(last.coords);
  } catch {
    // network down: next update will try again
  }
});
