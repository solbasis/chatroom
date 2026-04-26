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

// ─── reCAPTCHA v3 site key for Firebase App Check ───────────────────────────
// PUBLIC VALUE — ships in every Firebase web bundle that uses App Check. The
// secret key lives in Google Cloud and is what validates tokens server-side.
// Shared with burn.databasis.info and dao.databasis.info — all three apps
// live under *.databasis.info so reusing one reCAPTCHA config keeps the
// admin console simple.
//
// Project basis-acfec has Firestore App Check ENFORCEMENT enabled, which
// means every Firestore read/write (SDK or REST) requires a valid App Check
// token. Without this the chatroom can't reach Firestore at all — login
// fails with "Missing or insufficient permissions" because the REST helper
// in auth.js gets a 403 on every read.
//
// Dedicated reCAPTCHA v3 key for chat.databasis.info (label "basis-chat",
// owned by the basis Google Cloud project). The matching SECRET key is
// registered in Firebase Console → App Check → basis chatroom. Keep these
// in sync — if you rotate the key in reCAPTCHA admin, also update the
// secret half in Firebase Console.
export const RECAPTCHA_SITE_KEY = '6Ld34sssAAAAAMpVYpHF2zY5EROfO-upX5wQU_Ng';

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
export const MSG_QUERY_LIMIT   = 1000;    // Last N messages to load (history preserved)
export const DM_QUERY_LIMIT    = 100;     // Last N DM messages to load
