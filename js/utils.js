// ─── Utility Functions ──────────────────────────────────────────────────────
import { ROLES } from './config.js';
import { state } from './state.js';

// ─── Text escaping ──────────────────────────────────────────────────────────
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Safe for use inside JS attribute strings (onerror, onclick, etc.)
export function escAttr(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e');
}

// ─── User display helpers ───────────────────────────────────────────────────
export function initials(name) {
  return (name || '??').substring(0, 2).toUpperCase();
}

export function avatarHTML(color, name, url, size, showDot = false) {
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38) / 100}rem;`;
  const safeIni = escAttr(initials(name));

  if (url) {
    return `<div class="pfp" style="${s}background:${esc(color)};">` +
      `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" ` +
      `onerror="this.remove();this.parentElement.textContent='${safeIni}';">` +
      `${showDot ? '<div class="od"></div>' : ''}</div>`;
  }
  return `<div class="pfp" style="${s}background:${esc(color)};">` +
    `${initials(name)}${showDot ? '<div class="od"></div>' : ''}</div>`;
}

export function roleBadge(role) {
  if (role === 'dev')   return '<span class="badge badge-dev">DEV</span>';
  if (role === 'admin') return '<span class="badge badge-admin">ADMIN</span>';
  if (role === 'mod')   return '<span class="badge badge-mod">MOD</span>';
  if (role === 'bot')   return '<span class="badge badge-bot">BOT</span>';
  return '';
}

// ─── Role checks ────────────────────────────────────────────────────────────
export function myRole() {
  return state.me?.role || 'user';
}

export function hasRole(min) {
  return (ROLES[myRole()] || 1) >= (ROLES[min] || 1);
}

// ─── Time / date formatting ────────────────────────────────────────────────
export function formatTime(d) {
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function formatDate(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - msgDay) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// Padded time key for message grouping (fixes "11:9" vs "11:09" bug)
export function msgGroupKey(d) {
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ─── Message text formatting ───────────────────────────────────────────────
export function formatMessage(text) {
  let s = esc(text);
  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--g90)">$1</strong>');
  // Auto-link URLs
  s = s.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // @mentions
  s = s.replace(/@(\w{1,20})\b/g, (match, name) => {
    const isMe = state.me?.name && name.toLowerCase() === state.me.name.toLowerCase();
    return `<span class="mention${isMe ? ' mention-me' : ''}" data-mention="${name}">@${name}</span>`;
  });
  return s;
}

// ─── Notification ping (Web Audio) ─────────────────────────────────────────
export function playPing() {
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* audio not available */ }
}

// ─── Firestore helpers ──────────────────────────────────────────────────────
export function serverTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

export function getDb() {
  return firebase.firestore();
}

export function getAuth() {
  return firebase.auth();
}

// Build a message object from current user
export function buildMsgObj(type, text, extra = {}) {
  return {
    type,
    uid:       state.me.uid,
    name:      state.me.name,
    color:     state.me.color,
    role:      state.me.role || 'user',
    avatarUrl: state.me.avatarUrl || '',
    text,
    ts: serverTimestamp(),
    ...extra
  };
}

// ─── DM channel ID (deterministic) ─────────────────────────────────────────
export function dmChannelId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

// ─── Presence label (honest last-seen) ─────────────────────────────────────
export function lastSeenLabel(u) {
  if (!u.lastSeen?.toDate) return 'Offline';
  const diff = Date.now() - u.lastSeen.toDate().getTime();
  if (diff < 90000)    return 'Online';
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ─── Theme-aware color adjustment ───────────────────────────────────────────
// User-chosen colors are designed for dark backgrounds. In light mode,
// bright greens/yellows become invisible. This darkens them for contrast.
export function themeColor(hex) {
  if (!hex) return hex;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (!isLight) return hex;

  // Parse hex to RGB
  let r, g, b;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  } else {
    return hex;
  }

  // Calculate perceived brightness
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // If color is too bright for light bg, darken it
  if (lum > 0.45) {
    const factor = 0.55;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  }

  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ─── Image upload to Firebase Storage ────────────────────────────────────────
export async function uploadChatImage(file) {
  const uid = state.me.uid;
  const ext = file.name?.split('.').pop() || 'png';
  const fileName = uid + '_' + Date.now() + '.' + ext;
  const ref = firebase.storage().ref('chat-images/' + fileName);
  await ref.put(file, { contentType: file.type });
  return ref.getDownloadURL();
}

// ─── URL validation ─────────────────────────────────────────────────────────
export function isValidUrl(str) {
  return /^https?:\/\/.+/.test(str);
}

export function isValidHex(str) {
  return /^#[0-9a-fA-F]{3,6}$/.test(str);
}
