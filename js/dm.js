// ─── Direct Messages ────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, initials, getDb, serverTimestamp, dmChannelId, lastSeenLabel, uploadChatImage } from './utils.js';
import { addLocalMessage } from './commands.js';
import { renderDmMessages, renderChatMessages } from './render.js';
import { renderDmList, updateDmBadge, switchSbTab, scrollToBottom, toggleSidebar } from './ui.js';
import { findUser } from './moderation.js';
import { openProfile } from './profile.js';

// ─── Open a DM conversation ────────────────────────────────────────────────
export async function openDM(targetName) {
  const db = getDb();

  try {
    const target = state.allUsers.find(u => u.name === targetName) || await findUser(targetName);
    if (!target) { addLocalMessage(`"${esc(targetName)}" not found.`, 'err'); return; }

    const targetUid = target.id || target.uid;
    if (targetUid === state.me.uid) { addLocalMessage("Can't DM yourself.", 'err'); return; }

    const channelId = dmChannelId(state.me.uid, targetUid);

    // Create/update channel (idempotent with merge)
    await db.collection('dm-channels').doc(channelId).set({
      participants: [state.me.uid, targetUid],
      participantNames: { [state.me.uid]: state.me.name, [targetUid]: target.name },
      participantColors: { [state.me.uid]: state.me.color, [targetUid]: target.color },
      participantAvatars: { [state.me.uid]: state.me.avatarUrl || '', [targetUid]: target.avatarUrl || '' },
      lastMessage: '',
      lastSender: '',
      lastTs: serverTimestamp(),
      ['lastRead_' + state.me.uid]: firebase.firestore.FieldValue.serverTimestamp(),
      ['lastRead_' + targetUid]: 0
    }, { merge: true });

    switchSbTab('dms');
    showDmView(channelId, target);
  } catch (e) {
    console.error('openDM error:', e);
    addLocalMessage('Failed to open DM: ' + e.message, 'err');
  }
}

// ─── Show DM view ───────────────────────────────────────────────────────────
export function showDmView(channelId, target) {
  const db = getDb();
  const targetUid = target.id || target.uid;

  state.dmView = {
    channelId,
    targetUid,
    targetName: target.name,
    targetColor: target.color,
    targetAvatar: target.avatarUrl || ''
  };

  // Update header
  $('chatHead').style.display = 'none';
  $('dmHead').classList.add('on');
  $('dmHeadName').textContent = target.name;

  const avEl = $('dmHeadAv');
  avEl.style.background = target.color;
  if (target.avatarUrl) {
    avEl.innerHTML = `<img src="${esc(target.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">`;
  } else {
    avEl.textContent = initials(target.name);
  }

  // Presence
  const online = state.allUsers.find(u => u.name === target.name);
  $('dmHeadStatus').textContent = online ? lastSeenLabel(online) : 'Offline';

  // Profile link
  $('dmHeadInfo').onclick = () => openProfile(target.name);

  // Typing bar hidden in DM
  $('typBar').classList.remove('on');
  $('iInp').placeholder = 'Type a message...';

  // Listen to DM messages
  if (state.unsubs.dmMessages) state.unsubs.dmMessages();

  let dmInitDone = false;
  state.unsubs.dmMessages = db.collection('dm-channels').doc(channelId)
    .collection('messages')
    .orderBy('ts', 'asc')
    .limitToLast(100)
    .onSnapshot(snap => {
      state.dmMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDmMessages(state.dmMsgs);

      // Notify on new DMs (via event to avoid circular import)
      if (dmInitDone) {
        snap.docChanges().forEach(c => {
          if (c.type === 'added') {
            document.dispatchEvent(new CustomEvent('dm-received', { detail: c.doc.data() }));
          }
        });
      }
      dmInitDone = true;

      // Mark as read
      const chan = state.dmChannels.find(c => c.id === channelId);
      if (chan) {
        const readKey = 'lastRead_' + state.me.uid;
        const lastTs = chan.lastTs?.toMillis ? chan.lastTs.toMillis() : 0;
        const lastRead = chan[readKey]?.toMillis ? chan[readKey].toMillis() : (typeof chan[readKey] === 'number' ? chan[readKey] : 0);
        if (lastTs > lastRead) {
          db.collection('dm-channels').doc(channelId).update({
            [readKey]: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(() => {});
        }
      }
    }, e => console.warn('DM msgs error:', e));

  // Close sidebar on mobile
  if (window.innerWidth <= 768) toggleSidebar();
}

// ─── Close DM view (back to chatroom) ───────────────────────────────────────
export function closeDM() {
  showChatView();
}

// ─── Switch to chatroom view ────────────────────────────────────────────────
export function showChatView() {
  $('chatHead').style.display = 'flex';
  $('dmHead').classList.remove('on');
  $('typBar').style.display = '';
  $('iInp').placeholder = 'Type your message or /help...';

  state.dmView = null;
  if (state.unsubs.dmMessages) { state.unsubs.dmMessages(); state.unsubs.dmMessages = null; }

  renderChatMessages(state.cachedMsgs);
  setTimeout(() => scrollToBottom(), 50);
  $('chatDot').classList.remove('on');
}

// ─── Send DM message ────────────────────────────────────────────────────────
export async function sendDmMessage(text, imageFile) {
  if (!state.dmView) return;

  const db = getDb();
  const channelId = state.dmView.channelId;

  // Upload image if provided
  let imageUrl = '';
  if (imageFile) {
    try {
      imageUrl = await uploadChatImage(imageFile);
    } catch (e) {
      console.error('DM image upload error:', e);
      addLocalMessage('Failed to upload image.', 'err');
      return;
    }
  }

  // Build message with optional reply
  const msg = {
    uid: state.me.uid,
    name: state.me.name,
    color: state.me.color,
    avatarUrl: state.me.avatarUrl || '',
    text: text || '',
    ts: serverTimestamp()
  };
  if (imageUrl) msg.imageUrl = imageUrl;
  if (state.replyTo) {
    msg.replyToId = state.replyTo.id;
    msg.replyToName = state.replyTo.name;
    msg.replyToSnippet = state.replyTo.snippet;
    msg.replyToColor = state.replyTo.color;
  }

  // Import clearReplyTo lazily to avoid circular deps
  const { clearReplyTo } = await import('./ui.js');
  clearReplyTo();

  try {
    await db.collection('dm-channels').doc(channelId).collection('messages').add(msg);

    await db.collection('dm-channels').doc(channelId).update({
      lastMessage: imageUrl ? (text || '📷 Image') : text.substring(0, 100),
      lastSender: state.me.name,
      lastTs: serverTimestamp(),
      ['lastRead_' + state.me.uid]: firebase.firestore.FieldValue.serverTimestamp()
    });

    scrollToBottom();
  } catch (e) {
    console.error('DM send error:', e);
    addLocalMessage('Failed to send DM: ' + e.message, 'err');
  }
}
