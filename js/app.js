// ─── BASIS://CHAT — Main Entry Point ────────────────────────────────────────
import { FIREBASE_CONFIG } from './config.js';
import { state, $ } from './state.js';
import { initAuth, doAuth, switchAuthMode, doPasswordReset, buildColorPicker, logout } from './auth.js';
import { handleSend } from './chat.js';
import { toggleSidebar, switchSbTab, scrollToBottom, closePopup, showUserPopup } from './ui.js';
import { openProfile, closeProfile } from './profile.js';
import { openDM, closeDM, showDmView } from './dm.js';
import { deleteMessage } from './moderation.js';
import { handleCommand } from './commands.js';

// ─── Firebase init ──────────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
firebase.firestore().enablePersistence().catch(() => {});

// ─── Build UI ───────────────────────────────────────────────────────────────
buildColorPicker();

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
window.closeDM   = closeDM;
window.openProfile = openProfile;

// ─── Event Delegation ───────────────────────────────────────────────────────
// Instead of inline onclick handlers in dynamic HTML, we delegate events
// from stable parent elements. This is more robust and prevents XSS via
// injected onclick attributes.

document.addEventListener('click', e => {
  const target = e.target;

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

  // ── Close user popup overlay ─────────────────────────────────────
  if (target === $('popOv')) {
    closePopup();
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
  }
});

// ─── Keyboard shortcut: Escape to close modals ─────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePopup();
    closeProfile();
    $('confirmOv')?.classList.remove('on');
  }
  // Enter key on auth inputs submits the form
  if (e.key === 'Enter' && (e.target === $('aName') || e.target === $('aPass'))) {
    e.preventDefault();
    doAuth();
  }
});

console.log('%c BASIS://CHAT ', 'background:#040804;color:#6ee75a;font-size:14px;font-weight:bold;padding:4px 12px;border:1px solid #6ee75a;border-radius:4px;');
console.log('%c Modular build — github.com/solbasis/chatroom ', 'color:#6ee75a80;font-size:10px;');
