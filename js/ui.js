// ─── UI Components ──────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, escAttr, avatarHTML, roleBadge, lastSeenLabel, initials, hasRole, themeColor } from './utils.js';

// ─── Theme toggle ─────────────────────────────────────────────────────────
export function loadTheme() {
  const saved = localStorage.getItem('basis-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('basis-theme', next);
  updateThemeIcon(next);

  // Re-render UI with adjusted colors for new theme
  if (state.me) {
    updateHeader();
    renderUsers(state.allUsers);
    renderDmList();
  }
  // Dispatch event so chat/dm modules can re-render messages
  document.dispatchEvent(new CustomEvent('theme-changed'));
}

function updateThemeIcon(theme) {
  const icon = $('themeIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☽';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#040804' : '#e8e8e0';
}

// ─── Reply bar ────────────────────────────────────────────────────────────
export function setReplyTo(msg) {
  state.replyTo = {
    id: msg.id,
    name: msg.name,
    snippet: (msg.text || '').substring(0, 80),
    color: msg.color || '#78b15a'
  };
  const bar = $('replyBar');
  $('replyName').textContent = msg.name;
  $('replyName').style.color = msg.color || 'var(--g)';
  $('replySnippet').textContent = state.replyTo.snippet;
  bar.classList.add('on');
  $('iInp')?.focus();
}

export function clearReplyTo() {
  state.replyTo = null;
  $('replyBar')?.classList.remove('on');
}

// ─── Mention autocomplete ─────────────────────────────────────────────────
export function showMentionDropdown(query) {
  const drop = $('mentionDrop');
  if (!drop) return;

  const q = query.toLowerCase();
  const matches = state.allUsers
    .filter(u => u.name.toLowerCase().startsWith(q) && u.id !== state.me?.uid)
    .slice(0, 6);

  if (!matches.length) { hideMentionDropdown(); return; }

  let html = '';
  matches.forEach(u => {
    const ini = (u.name || '??').substring(0, 2).toUpperCase();
    html += `<div class="mention-item" data-mention="${esc(u.name)}">` +
      `<div class="mention-item-av" style="background:${esc(u.color)}">` +
        (u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : ini) +
      `</div>` +
      `<span style="color:${esc(themeColor(u.color))}">${esc(u.name)}</span>` +
    `</div>`;
  });

  drop.innerHTML = html;
  drop.classList.add('on');
}

export function hideMentionDropdown() {
  $('mentionDrop')?.classList.remove('on');
}

export function insertMention(username) {
  const inp = $('iInp');
  if (!inp) return;
  const val = inp.value;
  const pos = inp.selectionStart;
  // Find the @ before cursor
  const before = val.substring(0, pos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return;
  const after = val.substring(pos);
  inp.value = before.substring(0, atIdx) + '@' + username + ' ' + after;
  const newPos = atIdx + username.length + 2;
  inp.selectionStart = inp.selectionEnd = newPos;
  hideMentionDropdown();
  inp.focus();
  // Trigger input event for send button state
  inp.dispatchEvent(new Event('input'));
}

// ─── Sidebar toggle (mobile) ───────────────────────────────────────────────
export function toggleSidebar() {
  const sb = $('sb');
  const ov = $('sbOv');
  const isOpen = sb.classList.contains('open');
  sb.classList.toggle('open', !isOpen);
  ov.classList.toggle('on', !isOpen);
}

// ─── Sidebar tab switching ─────────────────────────────────────────────────
export function switchSbTab(tab) {
  state.sbTab = tab;
  $('navChat').classList.toggle('on', tab === 'chat');
  $('navDms').classList.toggle('on', tab === 'dms');
  $('navAlerts')?.classList.toggle('on', tab === 'alerts');
  $('panelChat').classList.toggle('on', tab === 'chat');
  $('panelDms').classList.toggle('on', tab === 'dms');
  $('panelAlerts')?.classList.toggle('on', tab === 'alerts');

  // Clear alerts unread when switching to alerts tab
  if (tab === 'alerts') {
    state.alertsUnread = 0;
    updateAlertBadge();
  }

}

export function updateAlertBadge() {
  const badge = $('alertBadge');
  const count = state.alertsUnread;
  if (badge) {
    if (count > 0) { badge.textContent = count; badge.classList.add('on'); }
    else { badge.classList.remove('on'); }
  }
}

export function renderAlerts(alerts) {
  const list = $('alertList');
  if (!list) return;
  if (!alerts || !alerts.length) {
    list.innerHTML = '<div class="dm-empty"><div class="dm-empty-ic">📊</div>No alerts yet<br><span style="font-size:.56rem">Buy/sell alerts appear here</span></div>';
    return;
  }

  let html = '';
  alerts.forEach(a => {
    const isBuy  = (a.type || '').toLowerCase() !== 'sell';
    const ts     = a.ts?.toDate ? a.ts.toDate() : new Date();
    const time   = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const buyer  = a.buyer || a.address || '';
    const short  = buyer.length > 10 ? buyer.slice(0, 4) + '…' + buyer.slice(-4) : buyer;
    const sol    = a.solAmount   != null ? parseFloat(a.solAmount).toFixed(2)   : '?';
    const basis  = a.basisAmount != null ? parseFloat(a.basisAmount).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '?';
    const tier   = a.tier || (isBuy ? '🟢' : '🔴');
    const mcap   = a.mcap ? fmtAlertMcap(a.mcap) : '';

    html += `<div class="alert-item ${isBuy ? 'buy' : 'sell'}">` +
      `<div class="alert-tier">${tier}</div>` +
      `<div class="alert-body">` +
        `<div class="alert-main">${isBuy ? 'BUY' : 'SELL'} <span class="alert-sol">${sol} SOL</span>` +
        (mcap ? ` · <span class="alert-mcap">${mcap}</span>` : '') + `</div>` +
        `<div class="alert-sub">${basis} BASIS · <span class="alert-addr">${esc(short)}</span></div>` +
      `</div>` +
      `<div class="alert-time">${time}</div>` +
    `</div>`;
  });

  list.innerHTML = html;
}

function fmtAlertMcap(n) {
  if (!n || isNaN(n)) return '';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

// ─── Scroll helpers ─────────────────────────────────────────────────────────
export function scrollToBottom() {
  const msgs = $('msgs');
  if (msgs) {
    msgs.scrollTop = msgs.scrollHeight;
    state.atBottom = true;
    $('npill').classList.remove('on');
  }
}

export function isNearBottom() {
  const msgs = $('msgs');
  return msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 80;
}

// ─── User list rendering ───────────────────────────────────────────────────
export function renderUsers(users) {
  const onlineCount = users.filter(u => isOnline(u)).length;
  $('uCnt').textContent = onlineCount;
  $('hDesc').textContent = onlineCount + ' node' + (onlineCount !== 1 ? 's' : '') + ' connected';

  const list = $('uList');
  if (!users.length) {
    list.innerHTML = '<div style="color:var(--text-mute);font-size:.66rem;padding:8px 10px;letter-spacing:1px">No registered nodes</div>';
    return;
  }

  let html = '';
  // Sort: self first, then online alphabetical, then offline alphabetical
  const sorted = [...users].sort((a, b) => {
    if (a.id === state.me?.uid) return -1;
    if (b.id === state.me?.uid) return 1;
    const aOn = isOnline(a), bOn = isOnline(b);
    if (aOn !== bOn) return aOn ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  sorted.forEach(u => {
    const isMe = u.id === state.me?.uid;
    const presence = lastSeenLabel(u);
    const online = isOnline(u);
    html += `<div class="sb-u${isMe ? ' me' : ''}${!online ? ' offline' : ''}" data-username="${esc(u.name)}" data-uid="${esc(u.id)}">` +
      avatarHTML(u.color, u.name, u.avatarUrl, 32, online) +
      `<div class="sb-u-info">` +
        `<div class="sb-u-name"><span style="color:${esc(themeColor(u.color))}">${esc(u.name)}</span>${roleBadge(u.role || 'user')}</div>` +
        `<div class="sb-u-role">${presence}</div>` +
      `</div></div>`;
  });

  list.innerHTML = html;
}

function isOnline(u) {
  if (!u.lastSeen?.toDate) return false;
  return (Date.now() - u.lastSeen.toDate().getTime()) < 90000;
}

// ─── DM list rendering ─────────────────────────────────────────────────────
export function renderDmList() {
  const list = $('dmList');
  if (!state.dmChannels.length) {
    list.innerHTML = '<div class="dm-empty"><div class="dm-empty-ic">✉</div>' +
      'No conversations yet<br><span style="font-size:.56rem">Click a user → Direct Message</span></div>';
    return;
  }

  let html = '';
  state.dmChannels.forEach(ch => {
    const otherUid = ch.participants.find(p => p !== state.me?.uid);
    const name = ch.participantNames?.[otherUid] || 'Unknown';
    const color = ch.participantColors?.[otherUid] || '#6ee75a';
    const avatar = ch.participantAvatars?.[otherUid] || '';
    const preview = ch.lastMessage || 'No messages yet';
    const time = ch.lastTs?.toDate ? formatDmTime(ch.lastTs.toDate()) : '';

    // Unread count
    const readKey = 'lastRead_' + state.me?.uid;
    const lastTs = ch.lastTs?.toMillis ? ch.lastTs.toMillis() : 0;
    const lastRead = ch[readKey]?.toMillis ? ch[readKey].toMillis() : (typeof ch[readKey] === 'number' ? ch[readKey] : 0);
    const isUnread = lastTs > lastRead && ch.lastSender !== state.me?.name;

    const active = state.dmView?.channelId === ch.id;

    html += `<div class="dm-conv${active ? ' active' : ''}" data-channel="${esc(ch.id)}" ` +
      `data-target-uid="${esc(otherUid)}" data-target-name="${esc(name)}" ` +
      `data-target-color="${esc(color)}" data-target-avatar="${esc(avatar)}">` +
      avatarHTML(color, name, avatar, 34) +
      `<div class="dm-conv-info">` +
        `<div class="dm-conv-name" style="color:${esc(themeColor(color))}">${esc(name)}</div>` +
        `<div class="dm-conv-preview">${esc(preview)}</div>` +
      `</div>` +
      `<div class="dm-conv-meta">` +
        `<div class="dm-conv-time">${time}</div>` +
        `<div class="dm-conv-unread${isUnread ? ' on' : ''}">NEW</div>` +
      `</div></div>`;
  });

  list.innerHTML = html;
}

function formatDmTime(d) {
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── DM unread badge ────────────────────────────────────────────────────────
export function updateDmBadge() {
  let total = 0;
  state.dmChannels.forEach(ch => {
    const readKey = 'lastRead_' + state.me?.uid;
    const lastTs = ch.lastTs?.toMillis ? ch.lastTs.toMillis() : 0;
    const lastRead = ch[readKey]?.toMillis ? ch[readKey].toMillis() : (typeof ch[readKey] === 'number' ? ch[readKey] : 0);
    if (lastTs > lastRead && ch.lastSender !== state.me?.name) total++;
  });
  state.totalUnread = total;
  const badge = $('dmBadge');
  if (total > 0) {
    badge.textContent = total;
    badge.classList.add('on');
  } else {
    badge.classList.remove('on');
  }
}

// ─── User popup ─────────────────────────────────────────────────────────────
export function showUserPopup(username, anchorEl) {
  const user = state.allUsers.find(u => u.name === username);
  if (!user) return;

  const isMe = user.id === state.me?.uid;
  const popup = $('uPop');
  const ov = $('popOv');

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  let top = rect.bottom + 4;
  let left = rect.left;
  if (left + 230 > window.innerWidth) left = window.innerWidth - 240;
  if (top + 200 > window.innerHeight) top = rect.top - 200;

  popup.style.top = top + 'px';
  popup.style.left = Math.max(8, left) + 'px';

  const presence = lastSeenLabel(user);

  popup.innerHTML =
    `<div class="u-popup-head">` +
      avatarHTML(user.color, user.name, user.avatarUrl, 36) +
      `<div class="u-popup-info">` +
        `<div class="u-popup-name"><span style="color:${esc(themeColor(user.color))}">${esc(user.name)}</span>${roleBadge(user.role)}</div>` +
        `<div class="u-popup-role">${presence}</div>` +
      `</div>` +
      `<button class="u-popup-close" id="popClose">✕</button>` +
    `</div>` +
    `<div class="u-popup-body">` +
      `<button class="u-popup-btn" data-action="profile" data-target="${esc(user.name)}"><span class="p-icon">◈</span> View Profile</button>` +
      (!isMe ? `<button class="u-popup-btn" data-action="dm" data-target="${esc(user.name)}"><span class="p-icon">✉</span> Direct Message</button>` : '') +
      (hasRole('mod') && !isMe ? `<div class="u-popup-sep"></div>` +
        `<button class="u-popup-btn danger" data-action="mute" data-target="${esc(user.name)}"><span class="p-icon">⊘</span> ${user.muted ? 'Unmute' : 'Mute'}</button>` : '') +
      (hasRole('admin') && !isMe ? `<button class="u-popup-btn danger" data-action="kick" data-target="${esc(user.name)}"><span class="p-icon">⚡</span> Kick</button>` +
        `<button class="u-popup-btn danger" data-action="ban" data-target="${esc(user.name)}"><span class="p-icon">⛔</span> Ban</button>` : '') +
    `</div>`;

  popup.style.display = 'block';
  ov.classList.add('on');
}

export function closePopup() {
  $('uPop').style.display = 'none';
  $('popOv').classList.remove('on');
}

// ─── Confirm dialog ─────────────────────────────────────────────────────────
let confirmResolve = null;

export function showConfirm(target, action) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    const isDanger = ['kick', 'ban', 'mute'].includes(action);

    $('confirmBox').innerHTML =
      `<div class="confirm-head">⚠ Confirm ${esc(action)}</div>` +
      `<div class="confirm-body">` +
        `${esc(action.charAt(0).toUpperCase() + action.slice(1))} <strong>${esc(target)}</strong>?` +
        `<div class="confirm-warn">This action will be logged.</div>` +
      `</div>` +
      `<div class="confirm-btns">` +
        `<button class="confirm-btn cancel" id="confirmNo">Cancel</button>` +
        `<button class="confirm-btn proceed${isDanger ? ' danger' : ''}" id="confirmYes">${esc(action)}</button>` +
      `</div>`;

    $('confirmOv').classList.add('on');

    $('confirmNo').onclick = () => { $('confirmOv').classList.remove('on'); resolve(false); };
    $('confirmYes').onclick = () => { $('confirmOv').classList.remove('on'); resolve(true); };
  });
}

// ─── Force disconnect ───────────────────────────────────────────────────────
export function forceDisconnect(reason) {
  state.disconnected = true;

  // Clean up all listeners
  Object.values(state.unsubs).forEach(fn => { if (fn) fn(); });
  Object.keys(state.unsubs).forEach(k => { state.unsubs[k] = null; });

  if (state.heartbeatIv) { clearInterval(state.heartbeatIv); state.heartbeatIv = null; }

  // Show force-disconnect overlay
  const ov = document.createElement('div');
  ov.className = 'confirm-ov on';
  ov.innerHTML =
    `<div class="confirm-box">` +
      `<div class="confirm-head" style="color:var(--neg)">⚠ Disconnected</div>` +
      `<div class="confirm-body">${esc(reason)}</div>` +
      `<div class="confirm-btns">` +
        `<button class="confirm-btn proceed" onclick="location.reload()">Reload</button>` +
      `</div>` +
    `</div>`;
  document.body.appendChild(ov);
}

// ─── Header update ──────────────────────────────────────────────────────────
export function updateHeader() {
  if (!state.me) return;
  $('hName').textContent = state.me.name;
  $('hName').style.color = themeColor(state.me.color);
  $('hAv').style.background = state.me.color;

  if (state.me.avatarUrl) {
    $('hAv').innerHTML = `<img src="${esc(state.me.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
  } else {
    $('hAv').textContent = initials(state.me.name);
  }
}
