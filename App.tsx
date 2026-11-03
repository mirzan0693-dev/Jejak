import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { listenForAuthLinks } from './src/lib/authLink';
import { ensureDeviceRegistered, reportNow, runPendingCommands, startBackgroundUpdates } from './src/lib/location';
import { setupNotificationChannels } from './src/lib/notify';
import { isConfigured, supabase } from './src/lib/supabase';
import { Main } from './src/screens/Main';
import { Setup } from './src/screens/Setup';
import { SignIn } from './src/screens/SignIn';
import { color, space } from './src/theme';
import { T } from './src/ui';

// Keep the session fresh only while the app is in front (Supabase's recommended setup for React Native).
AppState.addEventListener('change', (s) => {
  if (s === 'active') {
    supabase.auth.startAutoRefresh();
    reportNow().catch(() => {});
    runPendingCommands().catch(() => {});
  } else supabase.auth.stopAutoRefresh();
});

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => listenForAuthLinks(setLinkError), []);

  useEffect(() => {
    setupNotificationChannels().catch(() => {});
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setSetupDone(null);
      return;
    }
    (async () => {
      try {
        await ensureDeviceRegistered(session.user.id);
        const { data } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).single();
        setProfileName(data?.display_name ?? '');
        // first time on this phone: show setup
        const { status } = await import('expo-location').then((L) => L.getForegroundPermissionsAsync());
        setSetupDone(status === 'granted');
        // web can't track in the background, so start following the position each time the app opens
        if (status === 'granted' && Platform.OS === 'web') startBackgroundUpdates().catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the server.');
      }
    })();
  }, [session?.user.id]);

  let screen;
  if (!isConfigured) {
    screen = (
      <Centered>
        <T bold>Not set up yet</T>
        <T muted>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see SETUP.md), then rebuild.</T>
      </Centered>
    );
  } else if (error) {
    screen = (
      <Centered>
        <T color={color.danger}>{error}</T>
      </Centered>
    );
  } else if (session === undefined || (session && setupDone === null)) {
    screen = (
      <Centered>
        <ActivityIndicator color={color.accent} />
      </Centered>
    );
  } else if (!session) {
    screen = <SignIn linkError={linkError} />;
  } else if (!setupDone) {
    screen = <Setup userId={session.user.id} currentName={profileName} onDone={() => setSetupDone(true)} />;
  } else {
    screen = <Main userId={session.user.id} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: color.bg }}>{screen}</View>
    </SafeAreaProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>{children}</View>;
}
