// ─── User Profiles ──────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, initials, roleBadge, lastSeenLabel, getDb, isValidUrl, isValidHex } from './utils.js';
import { addLocalMessage } from './commands.js';
import { updateHeader } from './ui.js';
import { findUser } from './moderation.js';

// ─── Open profile modal ────────────────────────────────────────────────────
export async function openProfile(username) {
  if (!username) username = state.me?.name;
  if (!username) return;

  try {
    const user = state.allUsers.find(u => u.name === username) || await findUser(username);
    if (!user) return;

    const isMe = (user.id || user.uid) === state.me?.uid;
    const joined = user.createdAt?.toDate
      ? user.createdAt.toDate().toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Unknown';
    const presence = lastSeenLabel(user);
    const roleLabel = (user.role || 'user') !== 'user' ? (user.role || 'user') : 'Member';

    $('profBox').innerHTML =
      `<div class="prof-header">` +
        `<button class="prof-close" id="profClose">✕</button>` +
        `<div class="prof-av" style="background:${esc(user.color)}">` +
          (user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="">` : initials(user.name)) +
        `</div>` +
        `<div class="prof-name"><span style="color:${esc(user.color)}">${esc(user.name)}</span>${roleBadge(user.role || 'user')}</div>` +
        `<div class="prof-role-line">${roleLabel} · Joined ${joined}</div>` +
        `<div class="prof-bio ${user.bio ? '' : 'empty'}">${user.bio ? esc(user.bio) : 'No bio set'}</div>` +
      `</div>` +
      `<div class="prof-body">` +
        `<div class="prof-stats">` +
          `<div class="prof-stat">` +
            `<div class="prof-stat-v" style="color:${esc(user.color)}">${presence}</div>` +
            `<div class="prof-stat-l">Presence</div>` +
          `</div>` +
          `<div class="prof-stat">` +
            `<div class="prof-stat-v">${(user.role || 'user').toUpperCase()}</div>` +
            `<div class="prof-stat-l">Role</div>` +
          `</div>` +
        `</div>` +
        (isMe ? renderEditSection() : '') +
      `</div>`;

    $('profOv').classList.add('on');

    // Bind close button
    $('profClose').onclick = closeProfile;

    // Bind save button
    if (isMe) {
      const saveBtn = document.getElementById('profSave');
      if (saveBtn) saveBtn.onclick = saveProfile;
    }

  } catch (e) {
    addLocalMessage('Profile error: ' + e.message, 'err');
  }
}

function renderEditSection() {
  return `<div class="prof-edit-section">` +
    `<div class="fld"><label class="fld-lbl">Bio</label>` +
      `<textarea class="fld-ta" id="profBio" maxlength="200">${esc(state.me?.bio || '')}</textarea></div>` +
    `<div class="fld"><label class="fld-lbl">Avatar URL</label>` +
      `<input class="fld-inp" id="profAv" value="${esc(state.me?.avatarUrl || '')}" placeholder="https://..." style="font-size:.74rem;padding:10px 12px"></div>` +
    `<div class="fld"><label class="fld-lbl">Color</label>` +
      `<input class="fld-inp" id="profCol" value="${esc(state.me?.color || '')}" style="font-size:.74rem;padding:10px 12px"></div>` +
    `<button class="prof-save" id="profSave">Save Profile</button>` +
  `</div>`;
}

// ─── Close profile ──────────────────────────────────────────────────────────
export function closeProfile() {
  $('profOv').classList.remove('on');
}

// ─── Save profile edits ────────────────────────────────────────────────────
async function saveProfile() {
  const bio = (document.getElementById('profBio')?.value || '').substring(0, 200);
  const avatarUrl = document.getElementById('profAv')?.value.trim() || '';
  const color = document.getElementById('profCol')?.value.trim() || state.me.color;

  // Validate
  if (color && !isValidHex(color)) { addLocalMessage('Invalid hex color.', 'err'); return; }
  if (avatarUrl && !isValidUrl(avatarUrl)) { addLocalMessage('Avatar must be a valid http/https URL.', 'err'); return; }

  const db = getDb();
  try {
    await db.collection('users').doc(state.me.uid).update({ bio, avatarUrl, color });
    state.me.bio = bio;
    state.me.avatarUrl = avatarUrl;
    state.me.color = color;
    updateHeader();
    closeProfile();
    addLocalMessage('Profile saved.', 'ok');
  } catch (e) {
    addLocalMessage('Failed: ' + e.message, 'err');
  }
}
