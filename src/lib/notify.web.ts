// Web version. iPhone home-screen web apps can't show notifications without a push server,
// so alerts appear in the app (Recent alerts) and as a browser notification where the browser allows it.
export const CH_FIND = 'find-device';
export const CH_ALERTS = 'alerts';
export const CH_LOST = 'lost-mode';

export async function setupNotificationChannels() {}

export async function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {}
}

function notify(title: string, body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon-192.png' });
  } catch {
    // iOS doesn't allow page-created notifications; the in-app list still has it
  }
}

/** Find my phone while the page is open: three loud beeps. */
export async function ringDevice() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = i % 2 ? 1320 : 880;
      g.gain.value = 0.25;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      o.start(t);
      o.stop(t + 0.35);
    }
    if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
  } catch {}
  notify('Finding this phone', 'Someone on your account is looking for this phone.');
}

export async function showLostNotice(message: string | null, phone: string | null) {
  const text = [message, phone ? `Please call ${phone}` : null].filter(Boolean).join('\n') || 'Please contact the owner.';
  window.alert(`This phone has been reported lost\n\n${text}`);
}

export async function clearLostNotice() {}

export async function showAlert(body: string) {
  notify('Jejak', body);
}
