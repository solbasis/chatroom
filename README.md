# BASIS://CHAT

A real-time terminal-themed chatroom built with Firebase, designed with a retro-futuristic hacker aesthetic.

---

## Features

- **Real-time messaging** — Messages stream instantly via Firestore `onSnapshot` listeners, no polling
- **User authentication** — Sign up and log in with username + password (Firebase Auth under the hood)
- **Online presence** — See who's connected in the sidebar with live status indicators
- **Typing indicators** — See when others are composing a message
- **Message grouping** — Consecutive messages from the same user are visually grouped
- **Date separators** — Messages are divided by day (Today, Yesterday, or full date)
- **Text formatting** — Supports `inline code`, **bold**, and auto-linked URLs
- **Notification sound** — Subtle ping when a new message arrives from another user
- **New message pill** — Floating indicator when you're scrolled up and new messages arrive
- **Character counter** — Visual counter when approaching the 1000-character limit
- **Auto-resize input** — Textarea grows as you type multiline messages
- **Node colors** — Each user picks a color on signup that brands their avatar and messages
- **Mobile responsive** — Slide-out sidebar with overlay on small screens
- **CRT aesthetic** — Scanlines, ambient glow, terminal prompt, and IBM Plex Mono typography

---

## Tech Stack

- **Frontend** — Single HTML file, vanilla JS, no build step
- **Auth** — Firebase Authentication (Email/Password)
- **Database** — Cloud Firestore (real-time)
- **Fonts** — IBM Plex Mono, Space Grotesk (Google Fonts)
- **Hosting** — Netlify, GitHub Pages, or any static host

---

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** and follow the wizard

### 2. Enable Authentication

1. In the Firebase Console sidebar, click **Build → Authentication**
2. Click the **Sign-in method** tab
3. Click **Email/Password** and toggle **Enable** on
4. Click **Save**

### 3. Create a Firestore Database

1. In the sidebar, click **Build → Firestore Database**
2. Click **Create database**
3. Select **Start in test mode**
4. Choose a region and click **Done**

### 4. Set Firestore Security Rules

Go to **Firestore → Rules** and replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{doc} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId;
    }
    match /typing/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId;
    }
  }
}
```

Click **Publish**.

### 5. Get Your Firebase Config

1. Go to **Project Settings** (gear icon) → **General**
2. Scroll down to **Your apps** → click the **Web** icon (`</>`)
3. Register your app (any name)
4. Select **Use a `<script>` tag**
5. Copy the `firebaseConfig` object

### 6. Add Config to the App

Open `basis-chat-firebase.html` and find this section near the bottom:

```js
const FC = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

Replace the placeholder values with your actual Firebase config.

---

## Deploy

### Netlify (Easiest)

1. Go to [netlify.com](https://netlify.com) and sign in
2. Drag and drop the `basis-chat-firebase.html` file onto the deploy zone
3. Your chatroom is live

### GitHub Pages

1. Create a new GitHub repository
2. Rename the file to `index.html`
3. Push it to the `main` branch
4. Go to **Settings → Pages** → set source to `main` branch
5. Your site will be live at `https://yourusername.github.io/repo-name`

---

## Firestore Collections

The app uses three Firestore collections:

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `messages` | Chat messages | `type`, `uid`, `name`, `color`, `text`, `ts` |
| `users` | User profiles + presence | `name`, `nameLower`, `color`, `online`, `lastSeen` |
| `typing` | Typing indicators | `uid`, `name`, `ts` |

Messages are capped at the last 200 per query. The `typing` collection uses ephemeral documents that are created when a user types and deleted after 3 seconds of inactivity.

---

## Design System

The app follows the **BASIS** design system:

- **Primary color** — `#6ee75a` (terminal green) with a full opacity ramp from 92% to 3%
- **Background** — Deep black-green (`#040804`) with subtle ambient radial gradients
- **Typography** — IBM Plex Mono for all text, Space Grotesk available for display
- **Surfaces** — Semi-transparent dark panels with green-tinted borders
- **Effects** — CRT scanlines, text glow, pulsing indicators, slide-in animations
- **Components** — Panel bars with triple-dot chrome, terminal prompt (`>`) in inputs, pill badges

---

## How Auth Works

Firebase Auth requires an email, but the app only asks for a username. Under the hood, it maps:

```
username → username@basis.chat
```

This is a synthetic email — no actual emails are sent. The domain is never used for anything. Users only ever see their username.

---

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+
- Mobile Safari / Chrome on iOS and Android

---

## License

MIT
