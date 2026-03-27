// ─── Message Rendering ──────────────────────────────────────────────────────
import { state, $ } from './state.js';
import {
  esc, escAttr, initials, avatarHTML, roleBadge,
  formatTime, formatDate, msgGroupKey, formatMessage, hasRole, themeColor
} from './utils.js';

// ─── Lookup current user profile for live avatar/color ─────────────────────
function liveProfile(m) {
  const user = state.allUsers.find(u => u.id === m.uid);
  return {
    avatarUrl: user?.avatarUrl || m.avatarUrl || '',
    color: user?.color || m.color || '#6ee75a',
    role: user?.role || m.role || 'user'
  };
}

// ─── Render chatroom messages ───────────────────────────────────────────────
export function renderChatMessages(msgs) {
  const container = $('msgs');
  const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 80;

  if (!msgs.length && !state.cmdResults.length) {
    container.innerHTML =
      '<div class="msgs-empty">' +
        '<div class="msgs-empty-ic">◈</div>' +
        '<div class="msgs-empty-t">Awaiting Transmissions</div>' +
        '<div class="msgs-empty-s">Type /help for commands</div>' +
      '</div>';
    return;
  }

  let html = '';
  let lastDate = '', lastUid = '', lastMinute = '';

  msgs.forEach(m => {
    // Date separator
    if (m.ts?.toDate) {
      const dateStr = formatDate(m.ts.toDate());
      if (dateStr !== lastDate) {
        html += `<div class="d-sep"><span class="d-sep-l"></span><span class="d-sep-t">${dateStr}</span><span class="d-sep-l"></span></div>`;
        lastDate = dateStr;
        lastUid = '';
      }
    }

    // System messages
    if (m.type === 'system') {
      lastUid = '';
      html += `<div class="s-msg"><span class="s-msg-l"></span><span class="s-msg-t">${esc(m.text)}</span><span class="s-msg-l"></span></div>`;
      return;
    }

    // Action messages (/me)
    if (m.type === 'action') {
      lastUid = '';
      html += `<div class="act-msg"><strong style="color:${esc(themeColor(m.color || '#6ee75a'))}" class="clickable-name" data-profname="${esc(m.name)}">${esc(m.name)}</strong> ${esc(m.text)}</div>`;
      return;
    }

    // User messages — use live profile for current avatar/color
    const live = liveProfile(m);
    const isMine = m.uid === state.me?.uid;
    const time = m.ts?.toDate ? formatTime(m.ts.toDate()) : '';
    const minute = m.ts?.toDate ? msgGroupKey(m.ts.toDate()) : '';
    const isGrouped = m.uid === lastUid && minute === lastMinute;
    const rawColor = live.color;
    const color = esc(themeColor(rawColor));
    const isDeleted = m.deleted;
    const canDelete = hasRole('admin') && !isDeleted;

    html += `<div class="m-row ${isMine ? 'mi' : 'ot'}">`;
    html += `<div class="m-grp"${isMine ? ' style="flex-direction:row-reverse"' : ''}>`;

    // Avatar (other users only — use live avatar, raw color for bg)
    if (!isMine) {
      const safeIni = escAttr(initials(m.name));
      html += `<div class="m-av pfp ${isGrouped ? 'hid' : ''}" style="background:${esc(rawColor)};cursor:pointer" data-profname="${esc(m.name)}">`;
      if (live.avatarUrl) {
        html += `<img src="${esc(live.avatarUrl)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.textContent='${safeIni}';">`;
      } else {
        html += initials(m.name);
      }
      html += `</div>`;
    }

    html += `<div class="m-cnt"${isMine ? ' style="align-items:flex-end"' : ''}>`;

    // Author line (other users, not grouped)
    if (!isMine && !isGrouped) {
      html += `<div class="m-au clickable-name" style="color:${color}" data-profname="${esc(m.name)}"><span>${esc(m.name)}</span>${roleBadge(live.role)}</div>`;
    }

    // Bubble
    html += `<div class="m-bub ${isMine ? 'mi' : 'ot'}${isDeleted ? ' deleted' : ''}" style="border-color:${isMine ? color + '20' : 'var(--border)'}">`;

    // Reply quote
    if (m.replyToId && !isDeleted) {
      html += `<div class="m-reply" data-scrollto="${esc(m.replyToId)}">` +
        `<div class="m-reply-name" style="color:${esc(themeColor(m.replyToColor || '#78b15a'))}">${esc(m.replyToName)}</div>` +
        `<div class="m-reply-text">${esc(m.replyToSnippet)}</div>` +
      `</div>`;
    }

    if (isDeleted) {
      html += `<div class="m-txt" style="color:var(--text-mute)">[deleted${m.deletedBy ? ' by ' + esc(m.deletedBy) : ''}]</div>`;
    } else {
      if (m.imageUrl) {
        html += `<div class="m-img"><img src="${esc(m.imageUrl)}" alt="shared image" loading="lazy" data-lightbox></div>`;
      }
      if (m.text) html += `<div class="m-txt">${formatMessage(m.text)}</div>`;
    }

    html += `<div class="m-meta"><span class="m-time">${time}</span>`;
    if (!isDeleted) {
      html += `<button class="m-reply-btn" data-replyid="${esc(m.id)}" data-replyname="${esc(m.name)}" data-replytext="${escAttr((m.text || (m.imageUrl ? '📷 Image' : '')).substring(0, 80))}" data-replycolor="${esc(m.color)}">REPLY</button>`;
    }
    if (canDelete) {
      html += `<button class="m-del" data-delid="${esc(m.id)}">DEL</button>`;
    }
    html += `</div></div></div></div></div>`;

    lastUid = m.uid;
    lastMinute = minute;
  });

  // Append command results
  state.cmdResults.forEach(cr => {
    const cls = cr.type === 'err' ? 'cmd-err' : cr.type === 'ok' ? 'cmd-ok' : '';
    html += `<div class="cmd-res ${cls}">${cr.text}</div>`;
  });

  container.innerHTML = html;
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

// ─── Render DM messages ─────────────────────────────────────────────────────
export function renderDmMessages(msgs) {
  const container = $('msgs');
  const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 80;

  if (!msgs.length) {
    container.innerHTML =
      '<div class="msgs-empty">' +
        '<div class="msgs-empty-ic">✉</div>' +
        '<div class="msgs-empty-t">Start of conversation</div>' +
        '<div class="msgs-empty-s">Say hello!</div>' +
      '</div>';
    return;
  }

  let html = '';
  let lastDate = '', lastUid = '', lastMinute = '';

  msgs.forEach(m => {
    // Date separator
    if (m.ts?.toDate) {
      const dateStr = formatDate(m.ts.toDate());
      if (dateStr !== lastDate) {
        html += `<div class="d-sep"><span class="d-sep-l"></span><span class="d-sep-t">${dateStr}</span><span class="d-sep-l"></span></div>`;
        lastDate = dateStr;
        lastUid = '';
      }
    }

    const live = liveProfile(m);
    const isMine = m.uid === state.me?.uid;
    const time = m.ts?.toDate ? formatTime(m.ts.toDate()) : '';
    const minute = m.ts?.toDate ? msgGroupKey(m.ts.toDate()) : '';
    const isGrouped = m.uid === lastUid && minute === lastMinute;
    const rawColor = live.color;
    const color = esc(themeColor(rawColor));

    html += `<div class="m-row ${isMine ? 'mi' : 'ot'}">`;
    html += `<div class="m-grp"${isMine ? ' style="flex-direction:row-reverse"' : ''}>`;

    // Avatar (use live avatar, raw color for bg)
    if (!isMine) {
      const safeIni = escAttr(initials(m.name));
      html += `<div class="m-av pfp ${isGrouped ? 'hid' : ''}" style="background:${esc(rawColor)}">`;
      if (live.avatarUrl) {
        html += `<img src="${esc(live.avatarUrl)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.textContent='${safeIni}';">`;
      } else {
        html += initials(m.name);
      }
      html += `</div>`;
    }

    html += `<div class="m-cnt"${isMine ? ' style="align-items:flex-end"' : ''}>`;

    if (!isMine && !isGrouped) {
      html += `<div class="m-au" style="color:${color}"><span>${esc(m.name)}</span></div>`;
    }

    html += `<div class="m-bub ${isMine ? 'mi' : 'ot'}" style="border-color:${isMine ? color + '20' : 'var(--border)'}">`;

    // Reply quote
    if (m.replyToId) {
      html += `<div class="m-reply" data-scrollto="${esc(m.replyToId)}">` +
        `<div class="m-reply-name" style="color:${esc(themeColor(m.replyToColor || '#78b15a'))}">${esc(m.replyToName)}</div>` +
        `<div class="m-reply-text">${esc(m.replyToSnippet)}</div>` +
      `</div>`;
    }

    if (m.imageUrl) {
      html += `<div class="m-img"><img src="${esc(m.imageUrl)}" alt="shared image" loading="lazy" data-lightbox></div>`;
    }
    if (m.text) html += `<div class="m-txt">${formatMessage(m.text)}</div>`;
    html += `<div class="m-meta"><span class="m-time">${time}</span>`;
    html += `<button class="m-reply-btn" data-replyid="${esc(m.id)}" data-replyname="${esc(m.name)}" data-replytext="${escAttr((m.text || '').substring(0, 80))}" data-replycolor="${esc(m.color)}">REPLY</button>`;
    html += `</div></div></div></div></div>`;

    lastUid = m.uid;
    lastMinute = minute;
  });

  container.innerHTML = html;
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}
