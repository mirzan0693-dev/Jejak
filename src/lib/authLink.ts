import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// The sign-in email link opens Supabase, which then sends the person back into the app here.
export const AUTH_REDIRECT = Platform.OS === 'web' ? `${window.location.origin}/` : 'jejak://auth';

/** Signs in from a jejak://auth link. Handles both token styles Supabase may send. */
export async function handleAuthLink(url: string | null): Promise<string | null> {
  if (!url || !url.startsWith('jejak://')) return null;
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const p = new URLSearchParams(hash || query);
  const q = new URLSearchParams(query);

  const err = p.get('error_description') || q.get('error_description');
  if (err) return err.replace(/\+/g, ' ');

  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return error ? error.message : null;
  }
  const code = q.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? error.message : null;
  }
  return null;
}

export function listenForAuthLinks(onError: (msg: string) => void) {
  Linking.getInitialURL().then((u) => handleAuthLink(u).then((e) => e && onError(e)));
  const sub = Linking.addEventListener('url', ({ url }) => {
    handleAuthLink(url).then((e) => e && onError(e));
  });
  return () => sub.remove();
}
