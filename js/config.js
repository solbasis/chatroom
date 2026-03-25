// ─── Firebase Config ────────────────────────────────────────────────────────
// NOTE: This is a client-side Firebase config. It is NOT a secret — Firebase
// client keys are designed to be public. Security comes from Firestore rules
// and (recommended) Firebase App Check.
//
// To harden further:
//   1. Enable Firebase App Check with reCAPTCHA Enterprise
//   2. Restrict the API key in Google Cloud Console to your domain
//   3. Deploy the companion Cloud Functions for server-side validation

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDh3Xdavtn8q3w_g6kiDyWJfK5jeMD46ww",
  authDomain:        "basis-acfec.firebaseapp.com",
  projectId:         "basis-acfec",
  storageBucket:     "basis-acfec.firebasestorage.app",
  messagingSenderId: "884887459105",
  appId:             "1:884887459105:web:e39be97abde4afcc271a60"
};

// ─── Node colors available on signup ────────────────────────────────────────
export const NODE_COLORS = [
  "#6ee75a", "#5abbe7", "#e75ae7", "#e7a85a", "#e75a5a",
  "#5ae7c8", "#e7e15a", "#b05ae7", "#5a8ee7", "#e7e7e7"
];

// ─── Message character limit ────────────────────────────────────────────────
export const MAX_CHARS = 1000;

// ─── Role hierarchy (higher = more privileged) ─────────────────────────────
export const ROLES = { dev: 4, admin: 3, mod: 2, user: 1 };

// ─── Timing constants ───────────────────────────────────────────────────────
export const HEARTBEAT_MS      = 15000;   // Presence heartbeat interval
export const TYPING_TIMEOUT_MS = 3000;    // Clear typing indicator after
export const TYPING_STALE_MS   = 5000;    // Ignore typing older than
export const MSG_QUERY_LIMIT   = 200;     // Last N messages to load
export const DM_QUERY_LIMIT    = 100;     // Last N DM messages to load
