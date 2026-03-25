// ─── UI Components ──────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, avatarHTML, roleBadge, lastSeenLabel, initials, hasRole } from './utils.js';

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
  $('panelChat').classList.toggle('on', tab === 'chat');
  $('panelDms').classList.toggle('on', tab === 'dms');
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
  $('uCnt').textContent = users.length;
  $('hDesc').textContent = users.length + ' node' + (users.length !== 1 ? 's' : '') + ' connected';

  const list = $('uList');
  if (!users.length) {
    list.innerHTML = '<div style="color:var(--text-mute);font-size:.66rem;padding:8px 10px;letter-spacing:1px">No nodes online</div>';
    return;
  }

  let html = '';
  // Sort: self first, then alphabetical
  const sorted = [...users].sort((a, b) => {
    if (a.id === state.me?.uid) return -1;
    if (b.id === state.me?.uid) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  sorted.forEach(u => {
    const isMe = u.id === state.me?.uid;
    const presence = lastSeenLabel(u);
    html += `<div class="sb-u${isMe ? ' me' : ''}" data-username="${esc(u.name)}" data-uid="${esc(u.id)}">` +
      avatarHTML(u.color, u.name, u.avatarUrl, 32, presence === 'Online') +
      `<div class="sb-u-info">` +
        `<div class="sb-u-name"><span style="color:${esc(u.color)}">${esc(u.name)}</span>${roleBadge(u.role || 'user')}</div>` +
        `<div class="sb-u-role">${presence}</div>` +
      `</div></div>`;
  });

  list.innerHTML = html;
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
        `<div class="dm-conv-name" style="color:${esc(color)}">${esc(name)}</div>` +
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
        `<div class="u-popup-name"><span style="color:${esc(user.color)}">${esc(user.name)}</span>${roleBadge(user.role)}</div>` +
        `<div class="u-popup-role">${presence}</div>` +
      `</div>` +
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
  $('hName').style.color = state.me.color;
  $('hAv').style.background = state.me.color;

  if (state.me.avatarUrl) {
    $('hAv').innerHTML = `<img src="${esc(state.me.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
  } else {
    $('hAv').textContent = initials(state.me.name);
  }
}
