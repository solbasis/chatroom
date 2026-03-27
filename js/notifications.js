// ─── Push Notifications (Web Notifications API) ──────────────────────────────
// Uses browser Notification API — NOT Firebase Cloud Messaging.

import { state } from './state.js';

const STORAGE_KEY = 'basis-notifications-enabled';

let _enabled = false;
let _supported = false;

// ─── Init ─────────────────────────────────────────────────────────────────
export function initNotifications() {
  _supported = 'Notification' in window;
  if (!_supported) return;

  const saved = localStorage.getItem(STORAGE_KEY);
  _enabled = saved === 'true';

  // Sync bell icon
  updateBellIcon();
}

// ─── Request permission on first login ───────────────────────────────────
export async function requestNotificationPermission() {
  if (!_supported) return;
  if (Notification.permission === 'granted') {
    _enabled = true;
    localStorage.setItem(STORAGE_KEY, 'true');
    updateBellIcon();
    return;
  }
  if (Notification.permission === 'denied') return;

  // Only ask once (if never asked before)
  const alreadyAsked = localStorage.getItem('basis-notif-asked');
  if (alreadyAsked) return;
  localStorage.setItem('basis-notif-asked', '1');

  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    _enabled = true;
    localStorage.setItem(STORAGE_KEY, 'true');
    updateBellIcon();
  }
}

// ─── Toggle bell ─────────────────────────────────────────────────────────
export async function toggleNotifications() {
  if (!_supported) {
    alert('Your browser does not support push notifications.');
    return;
  }

  if (!_enabled) {
    // Try to enable
    if (Notification.permission === 'denied') {
      alert('Notifications are blocked. Please enable them in your browser settings.');
      return;
    }
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    _enabled = true;
    localStorage.setItem(STORAGE_KEY, 'true');
  } else {
    _enabled = false;
    localStorage.setItem(STORAGE_KEY, 'false');
  }
  updateBellIcon();
}

// ─── Send a notification ──────────────────────────────────────────────────
export function sendNotification(title, body, opts = {}) {
  if (!_enabled || !_supported || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // Don't notify if tab is active

  try {
    const n = new Notification(title, {
      body,
      icon: 'https://chat.databasis.info/favicon.ico',
      badge: 'https://chat.databasis.info/favicon.ico',
      tag: opts.tag || 'basis-chat',
      ...opts,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {
    console.warn('[notif] Failed:', e);
  }
}

// ─── Specific notification helpers ───────────────────────────────────────
export function notifyDm(senderName, preview) {
  sendNotification(
    `DM from ${senderName}`,
    preview || '(image)',
    { tag: 'basis-dm-' + senderName }
  );
}

export function notifyMention(senderName, preview) {
  sendNotification(
    `@mention from ${senderName}`,
    preview,
    { tag: 'basis-mention-' + senderName }
  );
}

export function notifyWhaleBuy(tierEmoji, solAmt, mcapStr) {
  sendNotification(
    `${tierEmoji} Whale Alert!`,
    `${solAmt} SOL buy — Mcap ${mcapStr}`,
    { tag: 'basis-whale' }
  );
}

// ─── Update bell icon UI ──────────────────────────────────────────────────
function updateBellIcon() {
  const bell = document.getElementById('notifBell');
  if (!bell) return;
  if (!_supported) {
    bell.style.opacity = '0.3';
    bell.title = 'Notifications not supported';
    return;
  }
  if (Notification.permission === 'denied') {
    bell.textContent = '🔕';
    bell.classList.remove('on');
    bell.title = 'Notifications blocked — enable in browser settings';
    return;
  }
  bell.textContent = _enabled ? '🔔' : '🔕';
  bell.classList.toggle('on', _enabled);
  bell.title = _enabled ? 'Notifications ON' : 'Notifications OFF';
}

// ─── Getters ─────────────────────────────────────────────────────────────
export function areNotificationsEnabled() { return _enabled; }
export function areNotificationsSupported() { return _supported; }
