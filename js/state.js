// ─── Global Application State ───────────────────────────────────────────────
// Single source of truth for all mutable state. Import and mutate directly —
// ES module bindings are live, so all importers see the same object.

export const state = {
  // Auth
  mode: 'login',          // 'login' | 'signup'
  selCol: '#6ee75a',      // Selected signup color
  me: null,               // Current user { uid, name, color, role, bio, avatarUrl, ... }
  busy: false,            // Prevents double auth attempts
  disconnected: false,    // Set when force-disconnected

  // Firestore listeners (unsubscribe functions)
  unsubs: {
    messages:    null,
    users:       null,
    typing:      null,
    self:        null,
    ban:         null,
    dmChannels:  null,
    dmMessages:  null,
  },

  // Intervals / timeouts
  heartbeatIv: null,
  typingTo:    null,

  // Chat data
  allUsers:    [],         // Online users snapshot
  cachedMsgs:  [],         // Chatroom messages cache
  cmdResults:  [],         // Local command output
  lastMsgCount: 0,         // For detecting new messages
  atBottom:    true,       // Scroll position tracking
  initialLoadDone: false,  // Prevents spurious ping on first load

  // DM data
  dmView:      null,       // { channelId, targetUid, targetName, targetColor, targetAvatar }
  dmChannels:  [],         // DM channel list
  dmMsgs:      [],         // Current DM conversation messages
  totalUnread: 0,          // Total unread DM count

  // Sidebar
  sbTab: 'chat',           // 'chat' | 'dms'

  // Audio
  audioCtx: null,          // Web Audio context for notification pings
};

// ─── Quick accessors ────────────────────────────────────────────────────────
export const $ = id => document.getElementById(id);
