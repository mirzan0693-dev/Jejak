import { Camera, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert as RNAlert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Appear, EASE_IN_OUT, useReducedMotion } from '../motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  forgetLocalDevice,
  getLocalDeviceId,
  reportNow,
  startBackgroundUpdates,
  stopBackgroundUpdates,
} from '../lib/location';
import { pickAndUploadAvatar, removeAvatar } from '../lib/avatar';
import { displayName, errorText, supabase, type Device, type Profile, type Share } from '../lib/supabase';
import { color, font, MAP_STYLE, radius, space } from '../theme';
import { Avatar, Button, Card, Chip, Field, Row, Sheet, T, distanceText, isStale, timeAgo } from '../ui';
import { useAppData, type AppData } from '../useData';
import { BIKE_STYLES, CAR_STYLES, MovingPin, PAINTS, VehicleArt, movingInfo, movingLabel, type Paint } from '../vehicles';

type Tab = 'people' | 'devices' | 'me';
const TABS: Tab[] = ['people', 'devices', 'me'];

export function Main({ userId }: { userId: string }) {
  const data = useAppData(userId);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('people');
  const [person, setPerson] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const camera = useRef<CameraRef>(null);
  const reduced = useReducedMotion();
  const [tabsW, setTabsW] = useState(0);
  const tabX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // the highlight slides to the tapped tab: on-screen movement, so ease-in-out, kept short because tabs are tapped often
    Animated.timing(tabX, {
      toValue: (TABS.indexOf(tab) * tabsW) / 3,
      duration: reduced || !tabsW ? 0 : 220,
      easing: EASE_IN_OUT,
      useNativeDriver: true,
    }).start();
  }, [tab, tabsW]);

  useEffect(() => {
    getLocalDeviceId().then(setLocalDeviceId);
    reportNow().catch(() => {});
  }, []);

  const view = useMemo(() => derive(data, userId), [data, userId]);
  const myPhone = data.devices.find((d) => d.id === localDeviceId) ?? null;

  const points = [
    ...view.visiblePeople.filter((p) => p.device?.lat != null).map((p) => p.device as Device),
    ...view.myDevices.filter((d) => d.lat != null),
  ];

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !points.length) return;
    fitted.current = true;
    if (points.length === 1) {
      camera.current?.jumpTo({ center: [points[0].lng!, points[0].lat!], zoom: 14 });
    } else {
      const lngs = points.map((p) => p.lng!);
      const lats = points.map((p) => p.lat!);
      camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
        padding: { top: 80, bottom: 80, left: 60, right: 60 },
        duration: 0,
      });
    }
  }, [points.length]);

  function focus(d?: Device | null) {
    if (d?.lat != null && d.lng != null) camera.current?.flyTo({ center: [d.lng, d.lat], zoom: 15, duration: 800 });
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1 }}>
        <Map style={{ flex: 1 }} mapStyle={MAP_STYLE} compass={false} attribution logo={false}>
          <Camera ref={camera} initialViewState={{ center: [101.69, 3.14], zoom: 9 }} />
          {view.visiblePeople.map((p) =>
            p.device?.lat != null && p.device.lng != null ? (
              <ViewAnnotation
                key={`p-${p.profile.id}`}
                id={`p-${p.profile.id}`}
                lngLat={[p.device.lng, p.device.lat]}
                onPress={() => setPerson(p.profile.id)}
              >
                {(() => {
                  const m = movingInfo(p.device);
                  // keyed so switching between walking and driving fades the new pin in instead of snapping
                  return m ? (
                    <Appear key="moving">
                      <MovingPin profile={p.profile} heading={m.heading ?? null} kmh={m.kmh} />
                    </Appear>
                  ) : (
                    <Appear key="still">
                      <Avatar name={displayName(p.profile)} url={p.profile.avatar_url} ring={isStale(p.device.located_at) ? color.textMuted : color.accent} />
                    </Appear>
                  );
                })()}
              </ViewAnnotation>
            ) : null,
          )}
          {view.myDevices.map((d) =>
            d.lat != null && d.lng != null ? (
              <ViewAnnotation key={`d-${d.id}`} id={`d-${d.id}`} lngLat={[d.lng, d.lat]} onPress={() => setDevice(d.id)}>
                <View style={[styles.devicePin, d.lost && { borderColor: color.danger }]}>
                  <Text style={{ fontSize: 18 }}>📱</Text>
                </View>
              </ViewAnnotation>
            ) : null,
          )}
        </Map>
        <View style={[styles.topBar, { top: insets.top + space.sm }]}>
          <View style={[styles.shareBadge, !view.watchers.length && { opacity: 0.85 }]}>
            <View style={[styles.dot, { backgroundColor: view.watchers.length ? color.accent : color.textMuted }]} />
            <Text style={{ color: color.text, fontSize: font.small, fontWeight: '600' }}>
              {view.watchers.length
                ? `Sharing your location with ${view.watchers.length} ${view.watchers.length === 1 ? 'person' : 'people'}`
                : 'Not sharing your location'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.tabs} onLayout={(e) => setTabsW(e.nativeEvent.layout.width - 8)}>
          {tabsW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.tabIndicator, { width: tabsW / 3, transform: [{ translateX: tabX }] }]}
            />
          ) : null}
          {TABS.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={styles.tab}
            >
              <Text style={{ color: tab === t ? color.text : color.textMuted, fontWeight: '700' }}>
                {t === 'people' ? 'People' : t === 'devices' ? 'Devices' : 'Me'}
                {t === 'people' && view.incoming.length ? ` (${view.incoming.length})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
          {data.error ? <T color={color.danger}>{data.error}</T> : null}
          {tab === 'people' && (
            <PeopleTab
              view={view}
              myPhone={myPhone}
              onOpen={(id) => {
                setPerson(id);
                focus(view.visiblePeople.find((p) => p.profile.id === id)?.device);
              }}
              onInvite={() => setInviting(true)}
              refresh={data.refresh}
            />
          )}
          {tab === 'devices' && (
            <DevicesTab
              devices={view.myDevices}
              localDeviceId={localDeviceId}
              onOpen={(id) => {
                setDevice(id);
                focus(view.myDevices.find((d) => d.id === id));
              }}
            />
          )}
          {tab === 'me' && <MeTab data={data} view={view} myPhone={myPhone} userId={userId} />}
        </ScrollView>
      </View>

      <InviteSheet visible={inviting} onClose={() => setInviting(false)} refresh={data.refresh} />
      <PersonSheet
        personId={person}
        data={data}
        view={view}
        myPhone={myPhone}
        userId={userId}
        onClose={() => setPerson(null)}
      />
      <DeviceSheet device={data.devices.find((d) => d.id === device) ?? null} myPhone={myPhone} userId={userId} onClose={() => setDevice(null)} />
    </View>
  );
}

// ---------- derived view of the data ----------

type Person = { profile: Profile; share: Share; device: Device | null };

function derive(data: AppData, me: string) {
  const prof = (id: string) => data.profiles[id] ?? { id, email: '', display_name: 'Someone' };
  const active = data.shares.filter((s) => s.status === 'active');
  return {
    visiblePeople: active
      .filter((s) => s.viewer_id === me)
      .map<Person>((s) => ({
        profile: prof(s.owner_id),
        share: s,
        device: data.devices.find((d) => d.user_id === s.owner_id && d.is_sharing_device) ?? null,
      })),
    watchers: active.filter((s) => s.owner_id === me).map((s) => ({ profile: prof(s.viewer_id), share: s })),
    incoming: data.shares
      .filter((s) => s.status === 'pending' && s.requested_by !== me)
      .map((s) => ({ share: s, other: prof(s.requested_by) })),
    outgoing: data.shares
      .filter((s) => s.status === 'pending' && s.requested_by === me)
      .map((s) => ({ share: s, other: prof(s.owner_id === me ? s.viewer_id : s.owner_id) })),
    myDevices: data.devices.filter((d) => d.user_id === me),
    alertsOnMe: data.geofences.filter((g) => g.subject_id === me && g.created_by !== me),
  };
}
type View_ = ReturnType<typeof derive>;

// ---------- People ----------

function PeopleTab({
  view,
  myPhone,
  onOpen,
  onInvite,
  refresh,
}: {
  view: View_;
  myPhone: Device | null;
  onOpen: (id: string) => void;
  onInvite: () => void;
  refresh: () => Promise<void>;
}) {
  async function respond(id: string, accept: boolean) {
    const { error } = await supabase.rpc('respond_share', { share_id: id, accept });
    if (error) RNAlert.alert('Could not answer', errorText(error));
    refresh();
  }
  async function cancel(id: string) {
    await supabase.rpc('end_share', { share_id: id });
    refresh();
  }

  return (
    <>
      {view.incoming.map(({ share, other }) => (
        <Card key={share.id}>
          <T bold>
            {share.owner_id === share.requested_by
              ? `${displayName(other)} wants to share their location with you`
              : `${displayName(other)} is asking to see your location`}
          </T>
          {share.owner_id !== share.requested_by ? (
            <T muted>If you accept, they can see where you are{share.expires_at ? ' until the time they chose' : ' until you stop'}.</T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Accept" onPress={() => respond(share.id, true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Decline" variant="secondary" onPress={() => respond(share.id, false)} />
            </View>
          </View>
        </Card>
      ))}

      {view.visiblePeople.length === 0 && view.incoming.length === 0 ? (
        <T muted>No one is sharing with you yet. Invite family or friends — they need the app on their phone too.</T>
      ) : null}

      {view.visiblePeople.map((p) => (
        <Row
          key={p.profile.id}
          left={<Avatar name={displayName(p.profile)} url={p.profile.avatar_url} ring={isStale(p.device?.located_at ?? null) ? color.textMuted : color.accent} />}
          title={displayName(p.profile)}
          subtitle={[movingLabel(p.profile, p.device) ?? timeAgo(p.device?.located_at ?? null), distanceText(myPhone, p.device)]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => onOpen(p.profile.id)}
        />
      ))}

      {view.outgoing.map(({ share, other }) => (
        <Row
          key={share.id}
          left={<Avatar name={displayName(other)} url={other.avatar_url} ring={color.warning} />}
          title={displayName(other)}
          subtitle="Waiting for them to accept"
          right={
            <Pressable onPress={() => cancel(share.id)} accessibilityRole="button">
              <Text style={{ color: color.danger, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          }
        />
      ))}

      <Button label="+ Add someone" variant="secondary" onPress={onInvite} />
    </>
  );
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

function InviteSheet({ visible, onClose, refresh }: { visible: boolean; onClose: () => void; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [direction, setDirection] = useState<'share' | 'request'>('share');
  const [duration, setDuration] = useState<'1h' | 'today' | 'always'>('always');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    const expires =
      duration === '1h' ? new Date(Date.now() + 3600_000).toISOString() : duration === 'today' ? endOfToday() : null;
    const { error } = await supabase.rpc('create_share', { target_email: email, direction, expires });
    setBusy(false);
    if (error) return setError(errorText(error));
    setEmail('');
    refresh();
    onClose();
  }

  return (
    <Sheet visible={visible} title="Add someone" onClose={onClose}>
      <Field
        label="Their email (the one they signed up with)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="family@example.com"
      />
      <T muted>What do you want to do?</T>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label="Share my location" selected={direction === 'share'} onPress={() => setDirection('share')} />
        <Chip label="Ask to see theirs" selected={direction === 'request'} onPress={() => setDirection('request')} />
      </View>
      <T muted>For how long?</T>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label="1 hour" selected={duration === '1h'} onPress={() => setDuration('1h')} />
        <Chip label="Until end of day" selected={duration === 'today'} onPress={() => setDuration('today')} />
        <Chip label="Until I stop" selected={duration === 'always'} onPress={() => setDuration('always')} />
      </View>
      <T muted>They'll get a request and nothing is shared until they accept.</T>
      <Button label="Send request" onPress={send} loading={busy} disabled={!email.trim()} />
      {error ? <T color={color.danger}>{error}</T> : null}
    </Sheet>
  );
}

function PersonSheet({
  personId,
  data,
  view,
  myPhone,
  userId,
  onClose,
}: {
  personId: string | null;
  data: AppData;
  view: View_;
  myPhone: Device | null;
  userId: string;
  onClose: () => void;
}) {
  const p = view.visiblePeople.find((x) => x.profile.id === personId);
  const [adding, setAdding] = useState(false);
  const [trigger, setTrigger] = useState<'arrive' | 'leave'>('arrive');
  const [where, setWhere] = useState<'their' | 'mine'>('their');
  const [placeName, setPlaceName] = useState('');
  const [radiusM, setRadiusM] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!p) return null;
  const fences = data.geofences.filter((g) => g.watcher_id === userId && g.subject_id === p.profile.id);

  async function addAlert() {
    setError(null);
    const src = where === 'their' ? p!.device : myPhone;
    if (src?.lat == null || src.lng == null) return setError('That location is not known yet.');
    if (!placeName.trim()) return setError('Give the place a name, e.g. Home or School.');
    setBusy(true);
    const { error } = await supabase.from('geofences').insert({
      watcher_id: userId,
      subject_id: p!.profile.id,
      created_by: userId,
      name: placeName.trim(),
      lat: src.lat,
      lng: src.lng,
      radius_m: radiusM,
      trigger,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    setAdding(false);
    setPlaceName('');
    data.refresh();
  }

  async function removeFence(id: string) {
    await supabase.from('geofences').delete().eq('id', id);
    data.refresh();
  }

  function stopSeeing() {
    RNAlert.alert('Stop seeing their location?', `You'll need to ask ${displayName(p!.profile)} again to see it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          await supabase.rpc('end_share', { share_id: p!.share.id });
          data.refresh();
          onClose();
        },
      },
    ]);
  }

  const d = p.device;
  return (
    <Sheet visible title={displayName(p.profile)} onClose={onClose}>
      <T muted>
        {d?.located_at
          ? `Last updated ${timeAgo(d.located_at)}${distanceText(myPhone, d) ? ' · ' + distanceText(myPhone, d) : ''}`
          : 'No location yet — their phone may be off or not set up.'}
      </T>
      {isStale(d?.located_at ?? null) && d?.located_at ? (
        <T color={color.warning}>This location is old. Their phone may be off, out of signal, or in battery saver.</T>
      ) : null}
      {d?.battery != null ? <T muted>Battery {Math.round(d.battery * 100)}%</T> : null}
      {p.share.expires_at ? <T muted>Sharing ends {new Date(p.share.expires_at).toLocaleString()}</T> : null}
      {d?.lat != null ? (
        <Button
          label="Directions"
          variant="secondary"
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`)}
        />
      ) : null}

      <T bold>Notify me</T>
      {fences.length === 0 && !adding ? <T muted>No alerts set.</T> : null}
      {fences.map((g) => (
        <Row
          key={g.id}
          title={`When they ${g.trigger === 'arrive' ? 'arrive at' : 'leave'} ${g.name}`}
          subtitle={g.created_by === g.subject_id ? `Set by ${displayName(p.profile)} · within ${g.radius_m} m` : `Within ${g.radius_m} m`}
          right={
            <Pressable onPress={() => removeFence(g.id)} accessibilityRole="button">
              <Text style={{ color: color.danger, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          }
        />
      ))}
      {adding ? (
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="When they arrive" selected={trigger === 'arrive'} onPress={() => setTrigger('arrive')} />
            <Chip label="When they leave" selected={trigger === 'leave'} onPress={() => setTrigger('leave')} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Chip label="Their current spot" selected={where === 'their'} onPress={() => setWhere('their')} />
            <Chip label="Where I am now" selected={where === 'mine'} onPress={() => setWhere('mine')} />
          </View>
          <Field label="Place name" value={placeName} onChangeText={setPlaceName} placeholder="Home, School, Office…" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {[150, 500, 1000].map((r) => (
              <Chip key={r} label={r < 1000 ? `${r} m` : '1 km'} selected={radiusM === r} onPress={() => setRadiusM(r)} />
            ))}
          </View>
          <T muted>{displayName(p.profile)} will be told that you set this alert.</T>
          <Button label="Save alert" onPress={addAlert} loading={busy} />
          {error ? <T color={color.danger}>{error}</T> : null}
        </Card>
      ) : (
        <Button label="+ Add an alert" variant="secondary" onPress={() => setAdding(true)} />
      )}

      <Button label="Stop seeing their location" variant="danger" onPress={stopSeeing} />
    </Sheet>
  );
}

// ---------- Devices ----------

function DevicesTab({
  devices,
  localDeviceId,
  onOpen,
}: {
  devices: Device[];
  localDeviceId: string | null;
  onOpen: (id: string) => void;
}) {
  if (!devices.length) return <T muted>Sign in to this app on your other phones to see them here.</T>;
  return (
    <>
      {devices.map((d) => (
        <Row
          key={d.id}
          left={
            <View style={[styles.devicePin, d.lost && { borderColor: color.danger }]}>
              <Text style={{ fontSize: 18 }}>📱</Text>
            </View>
          }
          title={`${d.name}${d.id === localDeviceId ? ' (this phone)' : ''}`}
          subtitle={[
            d.lost ? 'Marked as lost' : null,
            timeAgo(d.located_at),
            d.battery != null ? `${Math.round(d.battery * 100)}% battery` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => onOpen(d.id)}
        />
      ))}
      <T muted>To find a phone, open this app on another phone signed in to your account.</T>
    </>
  );
}

function DeviceSheet({
  device,
  myPhone,
  userId,
  onClose,
}: {
  device: Device | null;
  myPhone: Device | null;
  userId: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setMessage(device?.lost_message ?? 'This phone is lost. Please call me.');
    setPhone(device?.lost_phone ?? '');
    setNote(null);
  }, [device?.id]);

  if (!device) return null;

  async function send(kind: 'play_sound' | 'lost_on' | 'lost_off') {
    setBusy(kind);
    try {
      if (kind === 'lost_on') {
        const { error } = await supabase
          .from('devices')
          .update({ lost_message: message.trim() || null, lost_phone: phone.trim() || null })
          .eq('id', device!.id);
        if (error) throw error;
      }
      const { error } = await supabase.from('commands').insert({ device_id: device!.id, user_id: userId, kind });
      if (error) throw error;
      setNote(
        kind === 'play_sound'
          ? 'Sound sent. It plays right away if the phone has the app open, otherwise within a few minutes.'
          : kind === 'lost_on'
            ? 'Lost mode is on. The phone will show your message and keep reporting where it is.'
            : 'Lost mode is off.',
      );
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    RNAlert.alert('Remove this device?', 'It will stop showing here. Sign in on it again to add it back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('devices').delete().eq('id', device!.id);
          onClose();
        },
      },
    ]);
  }

  return (
    <Sheet visible title={device.name} onClose={onClose}>
      <T muted>
        {device.located_at ? `Last seen ${timeAgo(device.located_at)}` : 'No location yet'}
        {distanceText(myPhone, device) && myPhone?.id !== device.id ? ` · ${distanceText(myPhone, device)}` : ''}
        {device.battery != null ? ` · ${Math.round(device.battery * 100)}% battery` : ''}
      </T>
      {device.platform === 'ios' ? (
        <T muted>On iPhone the sound may not play if the phone is on silent.</T>
      ) : null}
      <Button label="Play sound" onPress={() => send('play_sound')} loading={busy === 'play_sound'} />
      {device.lat != null ? (
        <Button
          label="Directions"
          variant="secondary"
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${device.lat},${device.lng}`)}
        />
      ) : null}
      <T bold>Lost mode</T>
      {device.lost ? (
        <Button label="Turn off lost mode" variant="secondary" onPress={() => send('lost_off')} loading={busy === 'lost_off'} />
      ) : (
        <>
          <T muted>Shows a message and your number on the lost phone, and you get told when it reports a new location.</T>
          <Field label="Message" value={message} onChangeText={setMessage} />
          <Field label="Phone number to call" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button label="Turn on lost mode" variant="danger" onPress={() => send('lost_on')} loading={busy === 'lost_on'} />
        </>
      )}
      {note ? <T muted>{note}</T> : null}
      <Button label="Remove this device" variant="secondary" onPress={remove} />
    </Sheet>
  );
}

// ---------- Me ----------

function MeTab({ data, view, myPhone, userId }: { data: AppData; view: View_; myPhone: Device | null; userId: string }) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [name, setName] = useState(data.me?.display_name ?? '');

  useEffect(() => {
    Location.hasStartedLocationUpdatesAsync('jejak-location-updates')
      .then((on) => setPaused(!on))
      .catch(() => setPaused(true));
  }, []);

  async function toggleSharing() {
    if (paused) {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (!bg.granted) {
        RNAlert.alert('Location "all the time" is off', 'Turn it on in your phone settings so sharing works when the app is closed.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      await startBackgroundUpdates();
      setPaused(false);
    } else {
      await stopBackgroundUpdates();
      setPaused(true);
    }
  }

  async function makeSharingPhone() {
    if (!myPhone) return;
    await supabase.from('devices').update({ is_sharing_device: false }).eq('user_id', userId).eq('is_sharing_device', true);
    await supabase.from('devices').update({ is_sharing_device: true }).eq('id', myPhone.id);
    data.refresh();
  }

  async function stopSharingWith(shareId: string, who: string) {
    RNAlert.alert(`Stop sharing with ${who}?`, 'They will no longer see where you are.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop sharing',
        style: 'destructive',
        onPress: async () => {
          await supabase.rpc('end_share', { share_id: shareId });
          data.refresh();
        },
      },
    ]);
  }

  async function saveName() {
    if (!name.trim()) return;
    await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId);
    data.refresh();
  }

  const [photoBusy, setPhotoBusy] = useState(false);
  async function changePhoto() {
    setPhotoBusy(true);
    try {
      if (await pickAndUploadAvatar(userId, data.me?.avatar_path)) await data.refresh();
    } catch (e) {
      RNAlert.alert('Could not save photo', errorText(e));
    } finally {
      setPhotoBusy(false);
    }
  }
  async function deletePhoto() {
    if (!data.me?.avatar_path) return;
    await removeAvatar(userId, data.me.avatar_path);
    data.refresh();
  }

  async function signOut() {
    await forgetLocalDevice();
    await supabase.auth.signOut();
  }

  function deleteAccount() {
    RNAlert.alert('Delete your account?', 'This removes your account, your devices and every share. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('delete_my_account');
          if (error) return RNAlert.alert('Could not delete', errorText(error));
          await forgetLocalDevice();
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <>
      <Card>
        <T bold>Who can see you</T>
        {view.watchers.length === 0 ? <T muted>Nobody. Your location is private.</T> : null}
        {view.watchers.map((w) => (
          <Row
            key={w.share.id}
            left={<Avatar name={displayName(w.profile)} url={w.profile.avatar_url} size={32} />}
            title={displayName(w.profile)}
            subtitle={w.share.expires_at ? `Until ${new Date(w.share.expires_at).toLocaleString()}` : 'Until you stop'}
            right={
              <Pressable onPress={() => stopSharingWith(w.share.id, displayName(w.profile))} accessibilityRole="button">
                <Text style={{ color: color.danger, fontWeight: '600' }}>Stop</Text>
              </Pressable>
            }
          />
        ))}
        {view.alertsOnMe.map((g) => (
          <Row
            key={g.id}
            title={`${displayName(data.profiles[g.watcher_id])} is notified when you ${g.trigger === 'arrive' ? 'arrive at' : 'leave'} ${g.name}`}
            right={
              <Pressable
                onPress={async () => {
                  await supabase.from('geofences').delete().eq('id', g.id);
                  data.refresh();
                }}
                accessibilityRole="button"
              >
                <Text style={{ color: color.danger, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            }
          />
        ))}
      </Card>

      <SendAlertsCard data={data} view={view} myPhone={myPhone} userId={userId} />

      <VehicleCard data={data} userId={userId} />

      <Card>
        <T bold>This phone</T>
        {myPhone && !myPhone.is_sharing_device ? (
          <>
            <T muted>Your location is shared from another of your devices.</T>
            <Button label="Share from this phone instead" variant="secondary" onPress={makeSharingPhone} />
          </>
        ) : null}
        <Button
          label={paused === null ? 'Checking…' : paused ? 'Resume location updates' : 'Pause location updates'}
          variant={paused ? 'primary' : 'secondary'}
          onPress={toggleSharing}
          disabled={paused === null}
        />
        <T muted>
          {paused
            ? 'Paused: people see your last location as old. Find-my-phone only works while the app is open.'
            : 'On: updates about every 5 minutes or when you move.'}
        </T>
      </Card>

      <Card>
        <T bold>Recent alerts</T>
        {data.alerts.length === 0 ? <T muted>None yet.</T> : null}
        {data.alerts.slice(0, 10).map((a) => (
          <T key={a.id} muted>
            {a.body} · {timeAgo(a.created_at)}
          </T>
        ))}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={displayName(data.me)} url={data.me?.avatar_url} size={64} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Button
              label={photoBusy ? 'Uploading…' : data.me?.avatar_path ? 'Change photo' : 'Add a photo'}
              variant="secondary"
              loading={photoBusy}
              onPress={changePhoto}
            />
            {data.me?.avatar_path ? (
              <Pressable onPress={deletePhoto} accessibilityRole="button">
                <Text style={{ color: color.danger, fontWeight: '600', textAlign: 'center' }}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <T muted>Only people you share with can see your photo.</T>
        <Field label="Your name" value={name} onChangeText={setName} onEndEditing={saveName} />
        <T muted>{data.me?.email}</T>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        <Button label="Delete account" variant="danger" onPress={deleteAccount} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  shareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  devicePin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: 1,
    borderColor: color.border,
  },
  tabs: { flexDirection: 'row', backgroundColor: color.bg, borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  tabIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.sm, backgroundColor: color.surface2 },
});

// ---------- "Tell people when I arrive" ----------

function SendAlertsCard({ data, view, myPhone, userId }: { data: AppData; view: View_; myPhone: Device | null; userId: string }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string[]>([]);
  const [trigger, setTrigger] = useState<'arrive' | 'leave'>('arrive');
  const [placeName, setPlaceName] = useState('');
  const [radiusM, setRadiusM] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = data.geofences.filter((g) => g.subject_id === userId && g.created_by === userId);

  async function save() {
    setError(null);
    if (!who.length) return setError('Choose who to tell.');
    if (!placeName.trim()) return setError('Give the place a name, e.g. Home or Office.');
    if (myPhone?.lat == null || myPhone.lng == null) return setError("Your location isn't known yet. Try again in a moment.");
    setBusy(true);
    const rows = who.map((w) => ({
      watcher_id: w,
      subject_id: userId,
      created_by: userId,
      name: placeName.trim(),
      lat: myPhone.lat!,
      lng: myPhone.lng!,
      radius_m: radiusM,
      trigger,
    }));
    const { error } = await supabase.from('geofences').insert(rows);
    setBusy(false);
    if (error) return setError(errorText(error));
    setOpen(false);
    setWho([]);
    setPlaceName('');
    data.refresh();
  }

  return (
    <Card>
      <T bold>Tell people when I arrive</T>
      <T muted>Stand at the place (home, office, school), then choose who gets a notification when you arrive or leave.</T>
      {mine.map((g) => (
        <Row
          key={g.id}
          title={`${displayName(data.profiles[g.watcher_id])} · when I ${g.trigger === 'arrive' ? 'arrive at' : 'leave'} ${g.name}`}
          subtitle={`Within ${g.radius_m} m`}
          right={
            <Pressable
              onPress={async () => {
                await supabase.from('geofences').delete().eq('id', g.id);
                data.refresh();
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: color.danger, fontWeight: '600' }}>Turn off</Text>
            </Pressable>
          }
        />
      ))}
      {view.watchers.length === 0 ? (
        <T muted>Share your location with someone first — then you can notify them.</T>
      ) : open ? (
        <>
          <T muted>Who to tell</T>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {view.watchers.map((w) => (
              <Chip
                key={w.profile.id}
                label={displayName(w.profile)}
                selected={who.includes(w.profile.id)}
                onPress={() => setWho((cur) => (cur.includes(w.profile.id) ? cur.filter((x) => x !== w.profile.id) : [...cur, w.profile.id]))}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="When I arrive" selected={trigger === 'arrive'} onPress={() => setTrigger('arrive')} />
            <Chip label="When I leave" selected={trigger === 'leave'} onPress={() => setTrigger('leave')} />
          </View>
          <Field label="Name of this place" value={placeName} onChangeText={setPlaceName} placeholder="Home" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {[150, 500, 1000].map((r) => (
              <Chip key={r} label={r < 1000 ? `${r} m` : '1 km'} selected={radiusM === r} onPress={() => setRadiusM(r)} />
            ))}
          </View>
          <T muted>Uses where you are right now as the place.</T>
          <Button label="Turn on" onPress={save} loading={busy} />
          <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
          {error ? <T color={color.danger}>{error}</T> : null}
        </>
      ) : (
        <Button label="+ Add" variant="secondary" onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

// ---------- vehicle picker ----------

function VehicleCard({ data, userId }: { data: AppData; userId: string }) {
  const me = data.me;
  const [saving, setSaving] = useState(false);
  if (!me) return null;

  async function set(patch: Partial<Profile>) {
    setSaving(true);
    await supabase.from('profiles').update(patch).eq('id', userId);
    await data.refresh();
    setSaving(false);
  }

  const kind = me.active_vehicle === 'motorbike' ? 'motorbike' : 'car';
  const styles_ = kind === 'car' ? CAR_STYLES : BIKE_STYLES;
  const curStyle = kind === 'car' ? me.car_style ?? 'sedan' : me.bike_style ?? 'kapcai';
  const curPaint = ((kind === 'car' ? me.car_color : me.bike_color) ?? 'blue') as Paint;

  return (
    <Card>
      <T bold>My vehicle</T>
      <T muted>When you're moving faster than walking, your pin on everyone's map turns into this.</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Car" selected={kind === 'car'} onPress={() => set({ active_vehicle: 'car' })} />
        <Chip label="Motorbike / bicycle" selected={kind === 'motorbike'} onPress={() => set({ active_vehicle: 'motorbike' })} />
      </View>
      <View style={{ alignItems: 'center', paddingVertical: space.sm, opacity: saving ? 0.6 : 1 }}>
        <VehicleArt kind={kind} style={curStyle} paint={curPaint} width={128} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {styles_.map((st) => (
          <Pressable
            key={st.id}
            accessibilityRole="button"
            accessibilityState={{ selected: curStyle === st.id }}
            accessibilityLabel={st.label}
            onPress={() => set(kind === 'car' ? { car_style: st.id } : { bike_style: st.id })}
            style={{
              alignItems: 'center',
              padding: space.xs,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: curStyle === st.id ? color.accent : color.border,
              backgroundColor: color.surface2,
              width: 76,
            }}
          >
            <VehicleArt kind={kind} style={st.id} paint={curPaint} width={60} />
            <Text style={{ color: color.text, fontSize: 11, fontWeight: '600' }}>{st.label}</Text>
          </Pressable>
        ))}
      </View>
      <T muted>Colour</T>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {(Object.keys(PAINTS) as Paint[]).map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={c}
            accessibilityState={{ selected: curPaint === c }}
            onPress={() => set(kind === 'car' ? { car_color: c } : { bike_color: c })}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: PAINTS[c],
              borderWidth: curPaint === c ? 3 : 1,
              borderColor: curPaint === c ? color.accent : color.border,
            }}
          />
        ))}
      </View>
      <T muted>Switch between Car and Motorbike before you set off — the phone can't tell which one you're on.</T>
    </Card>
  );
}
