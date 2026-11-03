import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { startBackgroundUpdates } from '../lib/location';
import { errorText, supabase } from '../lib/supabase';
import { color, space } from '../theme';
import { Button, Card, Field, T } from '../ui';

export function Setup({ userId, currentName, onDone }: { userId: string; currentName: string; onDone: () => void }) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);

  async function finish() {
    setError(null);
    if (!name.trim()) return setError('Add the name your family will see.');
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId);
      if (error) throw error;

      await Notifications.requestPermissionsAsync();

      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        setNeedsSettings(true);
        throw new Error('Location is needed so the people you approve can see where you are.');
      }
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.granted) await startBackgroundUpdates();
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingTop: 80 }}>
      <T size="heading" bold>
        Set up
      </T>
      <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Mirzan" />
      <Card>
        <T bold>How sharing works</T>
        <T muted>
          Nobody sees your location unless you approve them. You'll always see who can see you, and you can stop sharing
          with one tap.
        </T>
        <T bold>Why we ask for location "all the time"</T>
        <T muted>
          So your family sees where you are, and you can find this phone, even when the app is closed. On Android a small
          notification stays on while sharing is on. If you choose "only while using the app", sharing only updates when the
          app is open.
        </T>
        <T bold>Notifications</T>
        <T muted>For arrive and leave alerts, share requests, and the loud sound when you're finding this phone.</T>
      </Card>
      <Button label="Continue" onPress={finish} loading={busy} />
      {error ? <T color={color.danger}>{error}</T> : null}
      {needsSettings ? <Button label="Open phone settings" variant="secondary" onPress={() => Linking.openSettings()} /> : null}
    </ScrollView>
  );
}
