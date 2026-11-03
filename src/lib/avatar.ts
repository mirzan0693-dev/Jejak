import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/** Let the person pick a photo, crop it square, and save it as their profile photo. Returns false if they cancel. */
export async function pickAndUploadAvatar(userId: string, oldPath?: string | null): Promise<boolean> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.4,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return false;

  const asset = result.assets[0];
  const bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('That photo is too big. Try a different one.');

  const path = `${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) throw error;

  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]).catch(() => {});
  return true;
}

export async function removeAvatar(userId: string, path: string) {
  await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  await supabase.storage.from('avatars').remove([path]).catch(() => {});
}

// Photos are private, so the app gets short-lived links. Cache them so the map doesn't flicker on every refresh.
const cache = new Map<string, { url: string; until: number }>();

export async function avatarUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit && hit.until > now) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(missing, 60 * 60 * 24);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        out[row.path] = row.signedUrl;
        cache.set(row.path, { url: row.signedUrl, until: now + 60 * 60 * 23 * 1000 });
      }
    }
  }
  return out;
}
