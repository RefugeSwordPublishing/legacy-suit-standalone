/**
 * Browser (system-level) notification utility.
 * Requests permission and sends a native OS notification.
 */

export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export function sendBrowserNotification(title, body, options = {}) {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  // Don't notify if page is visible
  if (document.visibilityState === 'visible') return;
  new Notification(title, { body, icon: '/favicon.ico', ...options });
}