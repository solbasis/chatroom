// ─── Chat Controller ────────────────────────────────────────────────────────
import { HEARTBEAT_MS, TYPING_TIMEOUT_MS, TYPING_STALE_MS, MSG_QUERY_LIMIT } from './config.js';
import { state, $ } from './state.js';
import { getDb, serverTimestamp, buildMsgObj, playPing, uploadChatImage } from './utils.js';
import { showScreen } from './auth.js';
import { renderChatMessages } from './render.js';
import {
  updateHeader, renderUsers, renderDmList, updateDmBadge,
  scrollToBottom, forceDisconnect, toggleSidebar,
  clearReplyTo, showMentionDropdown, hideMentionDropdown
} from './ui.js';
import { handleCommand, addLocalMessage } from './commands.js';
import { showChatView, sendDmMessage } from './dm.js';
import { checkMuted } from './moderation.js';
import { handleBotSystemMessage, handleBotCommand, isBotCommand } from './botengine.js';

// ─── Enter chat (after auth) ───────────────────────────────────────────────
export async function enterChat() {
  const db = getDb();

  showScreen('chat');
  state.cmdResults = [];
  state.disconnected = false;
  state.dmView = null;
  state.initialLoadDone = false;
  state.atBottom = true;

  updateHeader();
  showChatView();
  // Signal app.js to init new features (avoid circular imports)
  document.dispatchEvent(new CustomEvent('user-logged-in'));

  // ─── Messages listener ─────────────────────────────────────────────
  if (state.unsubs.messages) state.unsubs.messages();
  state.unsubs.messages = db.collection('messages')
    .orderBy('ts', 'asc')
    .limitToLast(MSG_QUERY_LIMIT)
    .onSnapshot(snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const isNew = state.initialLoadDone && msgs.length > state.lastMsgCount;
      const last = msgs[msgs.length - 1];

      state.cachedMsgs = msgs;

      // Only render if we're in chatroom view
      if (!state.dmView) renderChatMessages(msgs);

      // Ping + pill for new messages (skip initial load)
      if (isNew && last && last.uid !== state.me?.uid) {
        const mentionsMe = last.text && state.me?.name &&
          last.text.toLowerCase().includes('@' + state.me.name.toLowerCase());
        if (!state.atBottom && !state.dmView) $('npill').classList.add('on');
        if (!state.dmView) playPing();
        if (state.dmView && mentionsMe) playPing();
        if (state.dmView) $('chatDot').classList.add('on');
        // Push notification for @mentions (via event to avoid circular import)
        if (mentionsMe) document.dispatchEvent(new CustomEvent('chat-mention', { detail: last }));
      }

      state.lastMsgCount = msgs.length;

      // Bot: handle new system messages (welcome / goodbye)
      if (isNew && last && last.type === 'system' && last.uid !== 'bot-databasis') {
        handleBotSystemMessage(last.text);
      }

      if (!state.initialLoadDone) {
        state.initialLoadDone = true;
        scrollToBottom();
      }
    });

  // ─── All registered users listener ────────────────────────────────
  if (state.unsubs.users) state.unsubs.users();
  state.unsubs.users = db.collection('users')
    .onSnapshot(snap => {
      const prev = state.allUsers;
      state.allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderUsers(state.allUsers);
      // Re-render messages only when avatar/color/role actually changed
      const profileChanged = state.allUsers.some(u => {
        const old = prev.find(p => p.id === u.id);
        return !old || old.avatarUrl !== u.avatarUrl || old.color !== u.color || old.role !== u.role;
      });
      if (profileChanged && !state.dmView) renderChatMessages(state.cachedMsgs);
    });

  // ─── Typing indicators listener ───────────────────────────────────
  if (state.unsubs.typing) state.unsubs.typing();
  state.unsubs.typing = db.collection('typing').onSnapshot(snap => {
    if (state.dmView) return;
    const now = Date.now();
    const typers = snap.docs
      .map(d => d.data())
      .filter(t => t.uid !== state.me?.uid && t.ts && (now - t.ts.toMillis()) < TYPING_STALE_MS);

    const bar = $('typBar');
    if (typers.length) {
      $('typTxt').textContent = typers.map(t => t.name).join(', ') +
        (typers.length > 1 ? ' are' : ' is') + ' typing...';
      bar.classList.add('on');
    } else {
      bar.classList.remove('on');
    }
  });

  // ─── DM channels listener ─────────────────────────────────────────
  attachDmChannels(false);

  // ─── Heartbeat (presence + state sync) ─────────────────────────────
  if (state.heartbeatIv) clearInterval(state.heartbeatIv);
  state.heartbeatIv = setInterval(async () => {
    if (state.disconnected || !state.me) return;
    try {
      const snap = await db.collection('users').doc(state.me.uid).get();
      if (!snap.exists) return;
      const d = snap.data();
      state.me.muted = d.muted || false;
      state.me.role = d.role || 'user';
      state.me.avatarUrl = d.avatarUrl || '';
      state.me.bio = d.bio || '';
      state.me.color = d.color || state.me.color;

      if (d.kicked) {
        clearInterval(state.heartbeatIv);
        state.heartbeatIv = null;
        forceDisconnect('You have been kicked.');
        return;
      }
      await db.collection('users').doc(state.me.uid).update({ online: true, lastSeen: serverTimestamp() });
    } catch (e) { console.warn('HB:', e); }
  }, HEARTBEAT_MS);

  // Set online immediately
  updatePresence(true);

  // ─── Self listener (real-time profile/kick sync) ───────────────────
  if (state.unsubs.self) state.unsubs.self();
  state.unsubs.self = db.collection('users').doc(state.me.uid).onSnapshot(snap => {
    if (!snap.exists || state.disconnected) return;
    const d = snap.data();
    state.me.muted = d.muted || false;
    state.me.role = d.role || 'user';
    state.me.avatarUrl = d.avatarUrl || '';
    state.me.bio = d.bio || '';
    state.me.color = d.color || state.me.color;
    if (d.kicked) {
      clearInterval(state.heartbeatIv);
      state.heartbeatIv = null;
      forceDisconnect('You have been kicked.');
    }
  }, e => console.warn('Self listener:', e));

  // ─── Ban listener ─────────────────────────────────────────────────
  if (state.unsubs.ban) state.unsubs.ban();
  state.unsubs.ban = db.collection('bans').doc(state.me.nameLower).onSnapshot(snap => {
    if (state.disconnected) return;
    if (snap.exists) {
      clearInterval(state.heartbeatIv);
      state.heartbeatIv = null;
      forceDisconnect('You have been banned.');
    }
  }, e => console.warn('Ban listener:', e));

  // ─── Input setup ──────────────────────────────────────────────────
  setupInput();

  // ─── Scroll tracking ──────────────────────────────────────────────
  $('msgs').onscroll = function () {
    state.atBottom = this.scrollTop + this.clientHeight >= this.scrollHeight - 80;
    if (state.atBottom) $('npill').classList.remove('on');
  };

  // ─── Before unload ────────────────────────────────────────────────
  window.onbeforeunload = () => {
    updatePresence(false);
    clearTyping();
  };
}

// ─── DM channels listener with index fallback ──────────────────────────────
function attachDmChannels(fallback) {
  if (state.unsubs.dmChannels) state.unsubs.dmChannels();

  const db = getDb();
  const query = fallback
    ? db.collection('dm-channels').where('participants', 'array-contains', state.me.uid)
    : db.collection('dm-channels').where('participants', 'array-contains', state.me.uid).orderBy('lastTs', 'desc');

  state.unsubs.dmChannels = query.onSnapshot(snap => {
    state.dmChannels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (fallback) {
      state.dmChannels.sort((a, b) => {
        const at = a.lastTs?.toMillis ? a.lastTs.toMillis() : 0;
        const bt = b.lastTs?.toMillis ? b.lastTs.toMillis() : 0;
        return bt - at;
      });
    }
    renderDmList();
    updateDmBadge();
  }, e => {
    if (!fallback && (e.code === 'failed-precondition' || e.message?.includes('index'))) {
      attachDmChannels(true);
    } else {
      console.warn('DM channels error:', e);
    }
  });
}

// ─── Input setup ────────────────────────────────────────────────────────────
function setupInput() {
  const inp = $('iInp');

  inp.oninput = () => {
    const len = inp.value.length;
    const ok = inp.value.trim() && len <= 1000;

    $('iSend').disabled = !ok;
    $('iSend').className = ok ? 'i-send ok' : 'i-send';

    // Character counter
    const cc = $('iCc');
    if (len > 750) {
      cc.textContent = len + '/1000';
      cc.className = 'i-cc' + (len > 1000 ? ' o' : len > 900 ? ' w' : '');
    } else {
      cc.textContent = '';
      cc.className = 'i-cc';
    }

    // Auto-resize
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 140) + 'px';

    // @mention autocomplete
    const pos = inp.selectionStart;
    const before = inp.value.substring(0, pos);
    const atMatch = before.match(/@(\w{0,20})$/);
    if (atMatch && atMatch[1].length > 0) {
      showMentionDropdown(atMatch[1]);
    } else {
      hideMentionDropdown();
    }

    // Typing indicator (chatroom only)
    if (!state.dmView) setTyping();
  };

  inp.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  setTimeout(() => inp.focus(), 150);
}

// ─── Send handler ───────────────────────────────────────────────────────────
export async function handleSend() {
  const inp = $('iInp');
  const raw = inp.value.trim();
  const hasImage = !!state.pendingImage;

  if ((!raw && !hasImage) || !state.me || state.disconnected) return;

  // Clear input
  inp.value = '';
  inp.style.height = 'auto';
  $('iSend').disabled = true;
  $('iSend').className = 'i-send';
  $('iCc').textContent = '';

  // Grab and clear pending image
  const imageFile = state.pendingImage;
  clearPendingImage();

  // DM mode
  if (state.dmView) {
    await sendDmMessage(raw, imageFile);
    inp.focus();
    return;
  }

  // Clear typing
  clearTyping();

  // Bot commands (handles /price, /ca, /mcap, ca, price, etc.)
  if (raw && isBotCommand(raw)) {
    const db = getDb();
    try {
      await db.collection('messages').add(buildMsgObj('user', raw, { deleted: false }));
    } catch {}
    await handleBotCommand(raw);
    scrollToBottom();
    inp.focus();
    return;
  }

  // Slash commands (user commands like /help, /me, /mute, etc.)
  if (raw && raw.startsWith('/')) {
    await handleCommand(raw);
    inp.focus();
    return;
  }

  // Check mute
  if (await checkMuted()) {
    addLocalMessage('You are muted.', 'err');
    inp.focus();
    return;
  }

  // Upload image if attached
  let imageUrl = '';
  if (imageFile) {
    try {
      imageUrl = await uploadChatImage(imageFile);
    } catch (e) {
      console.error('Image upload error:', e);
      addLocalMessage('Failed to upload image.', 'err');
      inp.focus();
      return;
    }
  }

  // Build reply fields if replying
  const extra = { deleted: false };
  if (imageUrl) extra.imageUrl = imageUrl;
  if (state.replyTo) {
    extra.replyToId = state.replyTo.id;
    extra.replyToName = state.replyTo.name;
    extra.replyToSnippet = state.replyTo.snippet;
    extra.replyToColor = state.replyTo.color;
  }
  clearReplyTo();

  // Send message
  const db = getDb();
  try {
    await db.collection('messages').add(buildMsgObj('user', raw || '', extra));
    scrollToBottom();
  } catch (e) {
    console.error('Send error:', e);
    inp.value = raw; // Restore on failure
  }
  inp.focus();
}

// ─── Image attachment helpers ────────────────────────────────────────────────
export function setPendingImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 5 * 1024 * 1024) {
    addLocalMessage('Image must be under 5MB.', 'err');
    return;
  }
  state.pendingImage = file;
  const preview = $('imgPreview');
  const img = $('imgPreviewImg');
  img.src = URL.createObjectURL(file);
  preview.classList.add('on');
  $('iSend').disabled = false;
  $('iSend').className = 'i-send ok';
}

export function clearPendingImage() {
  state.pendingImage = null;
  const preview = $('imgPreview');
  const img = $('imgPreviewImg');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = '';
  preview.classList.remove('on');
  // Re-check if send should be enabled
  const inp = $('iInp');
  const ok = inp && inp.value.trim();
  $('iSend').disabled = !ok;
  $('iSend').className = ok ? 'i-send ok' : 'i-send';
}

// ─── Typing presence ────────────────────────────────────────────────────────
async function setTyping() {
  if (!state.me || state.disconnected) return;
  const db = getDb();
  try {
    await db.collection('typing').doc(state.me.uid).set({
      uid: state.me.uid,
      name: state.me.name,
      ts: serverTimestamp()
    });
  } catch {}

  if (state.typingTo) clearTimeout(state.typingTo);
  state.typingTo = setTimeout(clearTyping, TYPING_TIMEOUT_MS);
}

async function clearTyping() {
  if (!state.me || state.disconnected) return;
  try {
    await getDb().collection('typing').doc(state.me.uid).delete();
  } catch {}
}

// ─── Presence update ────────────────────────────────────────────────────────
async function updatePresence(online) {
  if (!state.me || state.disconnected) return;
  try {
    await getDb().collection('users').doc(state.me.uid).update({
      online,
      lastSeen: serverTimestamp()
    });
  } catch {}
}
