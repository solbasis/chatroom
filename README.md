# BASIS://CHAT — Modular Build

A real-time terminal-themed chatroom built with Firebase, designed with a retro-futuristic hacker aesthetic.

## Project Structure

```
basis-chat/
├── index.html              ← Clean HTML shell (no inline JS logic)
├── CNAME                   ← Custom domain config
├── firestore.rules         ← Hardened Firestore security rules
├── css/
│   └── styles.css          ← Complete stylesheet (extracted from monolith)
└── js/
    ├── app.js              ← Entry point — init, event delegation
    ├── config.js            ← Firebase config, constants, timing
    ├── state.js             ← Global state management
    ├── utils.js             ← Escaping, formatting, helpers
    ├── auth.js              ← Login, signup, logout, password reset
    ├── chat.js              ← Chat controller — listeners, send, presence
    ├── commands.js          ← Slash command router (/help, /me, /roll, etc.)
    ├── dm.js                ← Direct messages — open, view, send
    ├── moderation.js        ← Mute, kick, ban, role management
    ├── profile.js           ← User profile modal
    ├── render.js            ← Message rendering (chatroom + DM)
    └── ui.js                ← Sidebar, popups, scroll, confirm dialogs
```

## What Changed from v1 (Monolith)

### Architecture
- **Split from 1 file → 12 modules** with clear separation of concerns
- **Event delegation** replaces inline `onclick` handlers in dynamic HTML
- **ES modules** (`import`/`export`) for proper dependency management
- **Centralized state** in `state.js` — no scattered globals

### Bug Fixes
- **DM rendering truncation** — `renderDmMessages` HTML output was cut mid-tag
- **Message grouping time bug** — "11:9" vs "11:09" fixed with padded keys
- **Initial load ping** — no spurious notification sound on first snapshot
- **Scroll-to-bottom on DM close** — returning to chatroom now scrolls correctly
- **Avatar onerror XSS** — `escAttr()` prevents script injection via image errors
- **Password reset** — now shows on login tab only, doesn't reveal account existence

### Security Hardening
- **Firestore rules rewritten** — validates field types, sizes, ownership
  - Messages: must match auth UID, text ≤ 1000 chars, valid type
  - Users: can't self-promote roles, can't modify protected fields
  - DMs: only participants can read/write
  - Bans: admin-only create/delete
  - No hard deletes on messages or users
- **Role assignment** — signup always creates `role: 'user'`, never `dev`
- **Input validation** — URL and hex color validation on avatar/color changes
- **XSS prevention** — `escAttr()` for all dynamic attribute content
- **No inline JS in dynamic HTML** — event delegation prevents injection

### UI/UX Improvements
- **Honest presence** — shows "Online", "5m ago", "2h ago" instead of binary
- **Sorted user list** — self first, then alphabetical
- **Better error messages** — friendly auth errors with specific guidance
- **Node count grammar** — "1 node connected" vs "3 nodes connected"
- **Command output improvements** — better formatting, missing arg hints
- **Profile close via overlay click** — click outside to dismiss

## Setup

1. Clone this repo
2. The Firebase config in `js/config.js` points to the existing `basis-acfec` project
3. Deploy the `firestore.rules` to your Firebase project
4. Serve the root directory with any static host

### Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

### Hosting Options

- **GitHub Pages**: Push to `main`, enable Pages in Settings
- **Netlify**: Drag-and-drop the project folder
- **Firebase Hosting**: `firebase deploy --only hosting`

## Tech Stack

- **Frontend** — Vanilla JS (ES modules), no build step required
- **Auth** — Firebase Authentication (Email/Password)
- **Database** — Cloud Firestore (real-time)
- **Fonts** — IBM Plex Mono (Google Fonts)
- **Hosting** — Any static host (GitHub Pages, Netlify, etc.)

## License

MIT
