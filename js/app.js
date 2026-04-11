// ─── BASIS://CHAT — Main Entry Point ────────────────────────────────────────
import { FIREBASE_CONFIG } from './config.js';
import { state, $ } from './state.js';
import { initAuth, doAuth, switchAuthMode, doPasswordReset, buildColorPicker, logout } from './auth.js';
import { handleSend, setPendingImage, clearPendingImage } from './chat.js';
import {
  toggleSidebar, switchSbTab, scrollToBottom, closePopup, showUserPopup,
  loadTheme, toggleTheme, setReplyTo, clearReplyTo, hideMentionDropdown, insertMention,
  renderAlerts, updateAlertBadge
} from './ui.js';
import { openProfile, closeProfile } from './profile.js';
import { openDM, closeDM, showDmView } from './dm.js';
import { deleteMessage } from './moderation.js';
import { handleCommand } from './commands.js';
import { renderChatMessages, renderDmMessages } from './render.js';
import { initNotifications, toggleNotifications, requestNotificationPermission,
         notifyDm, notifyMention, notifyWhaleBuy } from './notifications.js';
import { initSearch, closeSearch } from './search.js';
import { getPrices, fmtNum, fmtUSD, BASIS_SUPPLY } from './prices.js';

// ─── Firebase init ──────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);

// ─── Theme ───────────────────────────────────────────────────────────────────
loadTheme();

// ─── Build UI ───────────────────────────────────────────────────────────────
buildColorPicker();

// ─── Notifications ────────────────────────────────────────────────────────
initNotifications();

// ─── Start auth flow ────────────────────────────────────────────────────────
initAuth();

// ─── Global function bindings (for inline onclick in HTML) ──────────────────
// We expose minimal functions to window for the HTML onclick handlers.
// All complex logic stays in modules.
window.swAuth    = switchAuthMode;
window.doAuth    = doAuth;
window.doReset   = doPasswordReset;
window.handleSend = handleSend;
window.togSb     = toggleSidebar;
window.logout    = logout;
window.closeDM      = closeDM;
window.openProfile  = openProfile;
window.toggleTheme  = toggleTheme;
// ─── Event Delegation ───────────────────────────────────────────────────────
// Instead of inline onclick handlers in dynamic HTML, we delegate events
// from stable parent elements. This is more robust and prevents XSS via
// injected onclick attributes.

document.addEventListener('click', e => {
  const target = e.target;

  // ── Image lightbox ────────────────────────────────────────────────
  const lbImg = target.closest('[data-lightbox]');
  if (lbImg) {
    e.preventDefault();
    $('lightboxImg').src = lbImg.src;
    $('lightboxOv').classList.add('on');
    return;
  }

  // ── Reply button ─────────────────────────────────────────────────
  const replyBtn = target.closest('.m-reply-btn');
  if (replyBtn) {
    e.preventDefault();
    setReplyTo({
      id: replyBtn.dataset.replyid,
      name: replyBtn.dataset.replyname,
      text: replyBtn.dataset.replytext,
      color: replyBtn.dataset.replycolor
    });
    return;
  }

  // ── Reply bar close ─────────────────────────────────────────────
  if (target === $('replyClose') || target.closest('#replyClose')) {
    e.preventDefault();
    clearReplyTo();
    return;
  }

  // ── Mention dropdown item ───────────────────────────────────────
  const mentionItem = target.closest('.mention-item');
  if (mentionItem) {
    e.preventDefault();
    insertMention(mentionItem.dataset.mention);
    return;
  }

  // ── DEL button (message deletion) ────────────────────────────────
  const delBtn = target.closest('[data-delid]');
  if (delBtn) {
    e.preventDefault();
    deleteMessage(delBtn.dataset.delid);
    return;
  }

  // ── Profile name click (in messages) ─────────────────────────────
  const profName = target.closest('[data-profname]');
  if (profName) {
    e.preventDefault();
    openProfile(profName.dataset.profname);
    return;
  }

  // ── Sidebar user click ───────────────────────────────────────────
  const sbUser = target.closest('.sb-u');
  if (sbUser) {
    e.preventDefault();
    const username = sbUser.dataset.username;
    if (username) showUserPopup(username, sbUser);
    return;
  }

  // ── DM conversation click ────────────────────────────────────────
  const dmConv = target.closest('.dm-conv');
  if (dmConv) {
    e.preventDefault();
    const channelId = dmConv.dataset.channel;
    const targetData = {
      id: dmConv.dataset.targetUid,
      uid: dmConv.dataset.targetUid,
      name: dmConv.dataset.targetName,
      color: dmConv.dataset.targetColor,
      avatarUrl: dmConv.dataset.targetAvatar
    };
    showDmView(channelId, targetData);
    return;
  }

  // ── User popup actions ───────────────────────────────────────────
  const popupBtn = target.closest('.u-popup-btn');
  if (popupBtn) {
    e.preventDefault();
    const action = popupBtn.dataset.action;
    const actionTarget = popupBtn.dataset.target;
    closePopup();

    switch (action) {
      case 'profile': openProfile(actionTarget); break;
      case 'dm':      openDM(actionTarget); break;
      case 'mute':    handleCommand('/mute ' + actionTarget); break;
      case 'kick':    handleCommand('/kick ' + actionTarget); break;
      case 'ban':     handleCommand('/ban ' + actionTarget); break;
    }
    return;
  }

  // ── Close profile overlay (click outside) ────────────────────────
  if (target === $('profOv')) {
    closeProfile();
    return;
  }

  // ── Close user popup overlay or close button ─────────────────────
  if (target === $('popOv') || target === $('popClose') || target.closest('#popClose')) {
    closePopup();
    return;
  }

  // ── Close lightbox (click backdrop or close button) ──────────────
  if (target === $('lightboxOv') || target === $('lightboxClose')) {
    $('lightboxOv').classList.remove('on');
    $('lightboxImg').src = '';
    return;
  }

  // ── New message pill ─────────────────────────────────────────────
  if (target === $('npill') || target.closest('#npill')) {
    scrollToBottom();
    return;
  }
});

// ── Sidebar tab buttons (delegated) ─────────────────────────────────────────
document.addEventListener('click', e => {
  const navTab = e.target.closest('.sb-nav-tab');
  if (navTab) {
    if (navTab.id === 'navChat') switchSbTab('chat');
    else if (navTab.id === 'navDms') switchSbTab('dms');
    else if (navTab.id === 'navAlerts') switchSbTab('alerts');
  }

  // ── Reaction + button ─────────────────────────────────────────────
  const reactBtn = e.target.closest('.m-react-btn');
  if (reactBtn && !state.dmView) {
    e.preventDefault();
    e.stopPropagation();
    showEmojiPicker(reactBtn, reactBtn.dataset.msgid);
    return;
  }

  // ── Reaction chip (toggle) ────────────────────────────────────────
  const reactChip = e.target.closest('.m-react-chip');
  if (reactChip && !state.dmView) {
    e.preventDefault();
    toggleReaction(reactChip.dataset.msgid, reactChip.dataset.emoji);
    return;
  }

  // ── Emoji picker option ────────────────────────────────────────────
  const emojiOpt = e.target.closest('.emoji-opt');
  if (emojiOpt) {
    e.preventDefault();
    const picker = $('emojiPicker');
    const msgId = picker.dataset.msgid;
    if (msgId) toggleReaction(msgId, emojiOpt.dataset.emoji);
    picker.style.display = 'none';
    picker.dataset.msgid = '';
    return;
  }

  // ── Close emoji picker if clicking elsewhere ───────────────────────
  if (!e.target.closest('#emojiPicker') && !e.target.closest('.m-react-btn')) {
    const picker = $('emojiPicker');
    if (picker && picker.style.display !== 'none') {
      picker.style.display = 'none';
      picker.dataset.msgid = '';
    }
  }
});

// ─── Keyboard shortcut: Escape to close modals ─────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Close lightbox first if open
    if ($('lightboxOv')?.classList.contains('on')) {
      $('lightboxOv').classList.remove('on');
      $('lightboxImg').src = '';
      return;
    }
    // Close search bar
    if ($('searchBar')?.classList.contains('on')) {
      closeSearch();
      return;
    }
    // Close emoji picker
    const picker = $('emojiPicker');
    if (picker && picker.style.display !== 'none') {
      picker.style.display = 'none';
      picker.dataset.msgid = '';
      return;
    }
    clearReplyTo();
    hideMentionDropdown();
    closePopup();
    closeProfile();
    $('confirmOv')?.classList.remove('on');
    $('cropOv')?.classList.remove('on');
  }
  // Enter key on auth inputs submits the form
  if (e.key === 'Enter' && (e.target === $('aName') || e.target === $('aPass'))) {
    e.preventDefault();
    doAuth();
  }
});

// ─── Theme change → re-render messages with adjusted colors ─────────────
document.addEventListener('theme-changed', () => {
  if (!state.me) return;
  if (state.dmView) {
    renderDmMessages(state.dmMsgs);
  } else {
    renderChatMessages(state.cachedMsgs);
  }
});

// ─── Image attach button + paste handler ──────────────────────────────────
$('iAttach').addEventListener('click', () => $('imgFileInput').click());
$('imgFileInput').addEventListener('change', e => {
  if (e.target.files[0]) setPendingImage(e.target.files[0]);
  e.target.value = '';
});
$('imgPreviewClose').addEventListener('click', () => clearPendingImage());

// Paste image from clipboard
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      setPendingImage(item.getAsFile());
      return;
    }
  }
});

// Drag and drop image
const ibar = document.querySelector('.ibar');
if (ibar) {
  ibar.addEventListener('dragover', e => { e.preventDefault(); ibar.classList.add('drag-over'); });
  ibar.addEventListener('dragleave', () => ibar.classList.remove('drag-over'));
  ibar.addEventListener('drop', e => {
    e.preventDefault();
    ibar.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) setPendingImage(file);
  });
}

// ─── Search init ──────────────────────────────────────────────────────────
initSearch();

// ─── Notification bell ────────────────────────────────────────────────────
const notifBell = $('notifBell');
if (notifBell) notifBell.addEventListener('click', toggleNotifications);

// ─── Price ticker ─────────────────────────────────────────────────────────
async function updatePriceTicker() {
  try {
    const p = await getPrices();
    const basisEl  = $('tickBasis');
    const mcapEl   = $('tickMcap');
    const solEl    = $('tickSol');
    const mcapMob  = $('tickMcapMobile');

    if (p.basis) {
      const price = p.basis < 0.001 ? p.basis.toFixed(8) : fmtNum(p.basis, 6);
      const change = p.change24h != null ? ` (${p.change24h >= 0 ? '+' : ''}${fmtNum(p.change24h, 2)}%)` : '';
      const changeClass = p.change24h != null ? (p.change24h >= 0 ? 'pos' : 'neg') : '';
      if (basisEl) basisEl.innerHTML = `$BASIS <span class="ticker-price">${price}</span>` +
        (change ? `<span class="ticker-change ${changeClass}">${change}</span>` : '');
    }
    if (p.basis) {
      const mcap = fmtUSD(p.basis * BASIS_SUPPLY);
      if (mcapEl) mcapEl.innerHTML = `MCAP <span class="ticker-price">${mcap}</span>`;
      if (mcapMob) mcapMob.innerHTML = `MCAP <span class="ticker-price">${mcap}</span>`;
    }
    if (p.sol && solEl) {
      solEl.innerHTML = `SOL <span class="ticker-price">$${fmtNum(p.sol, 2)}</span>`;
    }
  } catch (e) {
    console.warn('[ticker]', e);
  }
}

// ─── Alerts listener ─────────────────────────────────────────────────────
function initAlerts() {
  const db = firebase.firestore();
  if (state.unsubs.alerts) state.unsubs.alerts();
  state.unsubs.alerts = db.collection('alerts')
    .orderBy('ts', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.alerts = alerts;
      renderAlerts(alerts);

      // Unread badge: count new docs since last view
      if (state.sbTab !== 'alerts') {
        const newCount = snap.docChanges().filter(c => c.type === 'added').length;
        if (newCount > 0) {
          state.alertsUnread += newCount;
          updateAlertBadge();

          // Whale notification
          snap.docChanges().forEach(c => {
            if (c.type !== 'added') return;
            const a = c.doc.data();
            const isBuy = (a.type || '').toLowerCase() !== 'sell';
            if (isBuy && parseFloat(a.solAmount) >= 10) {
              notifyWhaleBuy(a.tier || '🐳', a.solAmount, a.mcap ? fmtUSD(a.mcap) : '');
            }
          });
        }
      }
    }, e => console.warn('[alerts]', e));
}

// ─── Mobile swipe detection ───────────────────────────────────────────────
(function initSwipe() {
  const msgs = $('msgs');
  if (!msgs) return;
  let startX = 0, startY = 0;

  msgs.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  msgs.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy)) return; // Vertical scroll, ignore
    if (dx > 60) {
      // Swipe right → open sidebar
      const sb = $('sb');
      if (sb && !sb.classList.contains('open')) toggleSidebar();
    } else if (dx < -60) {
      // Swipe left → close sidebar
      const sb = $('sb');
      if (sb && sb.classList.contains('open')) toggleSidebar();
    }
  }, { passive: true });
})();

// ─── Search event handlers ────────────────────────────────────────────────
document.addEventListener('search-render', e => {
  const { msgs, query } = e.detail;
  // Tag each message with search query so render.js can highlight
  const tagged = msgs.map(m => ({ ...m, _searchQuery: query }));
  renderChatMessages(tagged);
});

document.addEventListener('search-close', () => {
  // Restore normal rendering after search close
  if (!state.dmView) renderChatMessages(state.cachedMsgs);
});

// ─── Reactions: show emoji picker ────────────────────────────────────────
function showEmojiPicker(anchor, msgId) {
  const picker = $('emojiPicker');
  if (!picker) return;
  picker.dataset.msgid = msgId;
  picker.style.display = 'flex';

  // Position near anchor
  const rect = anchor.getBoundingClientRect();
  picker.style.position = 'fixed';
  let top = rect.top - picker.offsetHeight - 6;
  if (top < 8) top = rect.bottom + 6;
  let left = rect.left;
  picker.style.top = top + 'px';

  // Defer measurement to after display
  requestAnimationFrame(() => {
    const pw = picker.offsetWidth;
    let l = rect.left;
    if (l + pw > window.innerWidth - 8) l = window.innerWidth - pw - 8;
    picker.style.left = Math.max(8, l) + 'px';
  });
}

// ─── Reactions: toggle reaction on message ────────────────────────────────
async function toggleReaction(msgId, emoji) {
  if (!state.me || !msgId || !emoji) return;
  const db = firebase.firestore();
  const ref = db.collection('messages').doc(msgId);
  const uid = state.me.uid;

  // Check if already reacted
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  const existing = (data.reactions || {})[emoji] || [];
  const hasReacted = existing.includes(uid);

  const fieldPath = `reactions.${emoji}`;
  try {
    if (hasReacted) {
      await ref.update({ [fieldPath]: firebase.firestore.FieldValue.arrayRemove(uid) });
    } else {
      await ref.update({ [fieldPath]: firebase.firestore.FieldValue.arrayUnion(uid) });
    }
  } catch (e) {
    console.warn('[reactions]', e);
  }
}

// ─── Hook: init alerts + ticker + notifications on login ─────────────────
document.addEventListener('user-logged-in', () => {
  // Request notification permission (once)
  requestNotificationPermission();

  // Start price ticker
  updatePriceTicker();
  setInterval(updatePriceTicker, 30000);

  // Start alerts listener
  initAlerts();

  // Show ticker
  const ticker = $('priceTicker');
  if (ticker) ticker.classList.add('on');
});

// ─── DM received event ───────────────────────────────────────────────────
document.addEventListener('dm-received', e => {
  const msg = e.detail;
  if (!state.me || msg.uid === state.me.uid) return;
  notifyDm(msg.name || 'Someone', (msg.text || '').substring(0, 80));
});

// ─── @mention event ───────────────────────────────────────────────────────
document.addEventListener('chat-mention', e => {
  const msg = e.detail;
  if (!state.me || msg.uid === state.me.uid) return;
  notifyMention(msg.name || 'Someone', (msg.text || '').substring(0, 80));
});

console.log('%c BASIS://CHAT ', 'background:#040804;color:#6ee75a;font-size:14px;font-weight:bold;padding:4px 12px;border:1px solid #6ee75a;border-radius:4px;');
console.log('%c Modular build — github.com/solbasis/chatroom ', 'color:#6ee75a80;font-size:10px;');
