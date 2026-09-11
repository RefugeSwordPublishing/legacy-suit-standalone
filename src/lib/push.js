// Web Push client helpers: register the service worker, subscribe the device,
// persist the subscription to Supabase, and send a test-to-self notification.
import { supabase } from '@/api/base44Client';
import { Capacitor } from '@capacitor/core';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// ── Native (Capacitor / Android) push via FCM ────────────────────────────────
export function isNativePlatform() {
  try { return Capacitor?.isNativePlatform?.() === true; } catch { return false; }
}

let nativeListenersSet = false;
// Register the device for FCM and store its token (type 'fcm') so send-push can reach it.
export async function registerNativePush() {
  if (!isNativePlatform()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  if (!nativeListenersSet) {
    nativeListenersSet = true;
    PushNotifications.addListener('registration', async (token) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('push_subscriptions').upsert(
          { user_id: user.id, endpoint: token.value, type: 'fcm', user_agent: 'android-native' },
          { onConflict: 'endpoint' },
        );
      } catch (e) { console.warn('FCM token store failed', e); }
    });
    PushNotifications.addListener('registrationError', (err) => console.warn('FCM registration error', err));
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url) window.location.href = url;
    });
  }

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return false;
  await PushNotifications.register();
  return true;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionState() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('SW registration failed', e);
    return null;
  }
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Push notifications are not supported on this device or browser.');
  if (!VAPID_PUBLIC) throw new Error('Push is not configured yet (missing VAPID key).');

  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to enable notifications.');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
  return true;
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

export async function sendTestPush() {
  // user_ids is ignored server-side for JWT callers; the function pushes to self.
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { user_ids: [], title: 'GuildWright', body: 'Push notifications are working on this device.', url: '/notifications' },
  });
  if (error) throw error;
  return data;
}
