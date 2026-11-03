import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const CH_FIND = 'find-device';
export const CH_ALERTS = 'alerts';
export const CH_LOST = 'lost-mode';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CH_FIND, {
    name: 'Find my device (loud)',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    sound: 'default',
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(CH_ALERTS, {
    name: 'Arrive and leave alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(CH_LOST, {
    name: 'Lost mode',
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ringDevice() {
  // Several loud notifications in a row so the sound lasts long enough to follow.
  for (let i = 0; i < 3; i++) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Finding this phone',
        body: 'Someone on your account is looking for this phone. Open the app to stop.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        interruptionLevel: 'timeSensitive',
      },
      trigger: Platform.OS === 'android' ? { channelId: CH_FIND } : null,
    });
    await new Promise((r) => setTimeout(r, 2500));
  }
}

export async function showLostNotice(message: string | null, phone: string | null) {
  await Notifications.scheduleNotificationAsync({
    identifier: 'lost-mode',
    content: {
      title: 'This phone has been reported lost',
      body: [message, phone ? `Please call ${phone}` : null].filter(Boolean).join('\n') || 'Please contact the owner.',
      sticky: true,
      autoDismiss: false,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: Platform.OS === 'android' ? { channelId: CH_LOST } : null,
  });
}

export async function clearLostNotice() {
  await Notifications.dismissNotificationAsync('lost-mode').catch(() => {});
}

export async function showAlert(body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Jejak', body, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId: CH_ALERTS } : null,
  });
}

export async function requestNotificationPermission() {
  await Notifications.requestPermissionsAsync().catch(() => {});
}
