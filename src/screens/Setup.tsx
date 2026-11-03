import * as Location from 'expo-location';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { avatarUrls, pickAndUploadAvatar } from '../lib/avatar';
import { requestAlwaysLocation, startBackgroundUpdates } from '../lib/location';
import { requestNotificationPermission } from '../lib/notify';
import { errorText, supabase } from '../lib/supabase';
import { color, space } from '../theme';
import { Avatar, Button, Card, Field, T } from '../ui';

export function Setup({ userId, currentName, onDone }: { userId: string; currentName: string; onDone: () => void }) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function addPhoto() {
    setError(null);
    setPhotoBusy(true);
    try {
      if (await pickAndUploadAvatar(userId, photoPath)) {
        const { data } = await supabase.from('profiles').select('avatar_path').eq('id', userId).single();
        if (data?.avatar_path) {
          setPhotoPath(data.avatar_path);
          const urls = await avatarUrls([data.avatar_path]);
          setPhotoUri(urls[data.avatar_path] ?? null);
        }
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function finish() {
    setError(null);
    if (!name.trim()) return setError('Add the name your family will see.');
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId);
      if (error) throw error;

      await requestNotificationPermission();

      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) {
        setNeedsSettings(true);
        throw new Error('Location is needed so the people you approve can see where you are.');
      }
      if (await requestAlwaysLocation()) await startBackgroundUpdates();
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={name || '?'} url={photoUri} size={64} />
        <View style={{ flex: 1 }}>
          <Button
            label={photoUri ? 'Change photo' : 'Add a photo (optional)'}
            variant="secondary"
            loading={photoBusy}
            onPress={addPhoto}
          />
        </View>
      </View>
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Your name" />
      <Card>
        <T bold>How sharing works</T>
        <T muted>
          Nobody sees your location unless you approve them. You'll always see who can see you, and you can stop sharing
          with one tap.
        </T>
        {Platform.OS !== 'web' ? (
          <>
        <T bold>Why we ask for location "all the time"</T>
            <T muted>
              So your family sees where you are, and you can find this phone, even when the app is closed. On Android a small
              notification stays on while sharing is on. If you choose "only while using the app", sharing only updates when the
              app is open.
            </T>
          </>
        ) : null}
        {Platform.OS === 'web' ? (
          <>
            <T bold>On iPhone web</T>
            <T muted>
              iPhone only lets a web app use location while it's open on screen. Your family sees your last spot when you
              close Jejak, and "Play sound" only works while it's open.
            </T>
          </>
        ) : null}
        <T bold>Notifications</T>
        <T muted>For arrive and leave alerts, share requests, and the loud sound when you're finding this phone.</T>
      </Card>
      <Button label="Continue" onPress={finish} loading={busy} />
      {error ? <T color={color.danger}>{error}</T> : null}
      {needsSettings ? (
        Platform.OS === 'web' ? (
          <T muted>Allow location for this site: Settings → Apps → Safari → Location → Ask or Allow, then reopen Jejak.</T>
        ) : (
          <Button label="Open phone settings" variant="secondary" onPress={() => Linking.openSettings()} />
        )
      ) : null}
    </ScrollView>
  );
}
