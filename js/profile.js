// ─── User Profiles ──────────────────────────────────────────────────────────
import { state, $ } from './state.js';
import { esc, initials, roleBadge, lastSeenLabel, getDb, isValidUrl, isValidHex, themeColor } from './utils.js';
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

    // Fetch message count asynchronously
    let msgCount = '—';
    try {
      const db = getDb();
      const snap = await db.collection('messages').where('uid', '==', user.id || user.uid).get();
      msgCount = snap.size;
    } catch {}

    $('profBox').innerHTML =
      `<div class="prof-header">` +
        `<button class="prof-close" id="profClose">✕</button>` +
        `<div class="prof-av" style="background:${esc(user.color)}">` +
          (user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="">` : initials(user.name)) +
        `</div>` +
        `<div class="prof-name"><span style="color:${esc(themeColor(user.color))}">${esc(user.name)}</span>${roleBadge(user.role || 'user')}</div>` +
        `<div class="prof-role-line">${roleLabel} · Joined ${joined}</div>` +
        `<div class="prof-bio ${user.bio ? '' : 'empty'}">${user.bio ? esc(user.bio) : 'No bio set'}</div>` +
        // Twitter / Wallet display (non-edit view)
        (!isMe && user.twitterHandle ? `<div class="prof-link"><a href="https://x.com/${esc(user.twitterHandle)}" target="_blank" rel="noopener">@${esc(user.twitterHandle)} ↗</a></div>` : '') +
        (!isMe && user.walletAddress ? `<div class="prof-link"><a href="https://solscan.io/address/${esc(user.walletAddress)}" target="_blank" rel="noopener">${esc(user.walletAddress.slice(0,4))}…${esc(user.walletAddress.slice(-4))} ↗</a></div>` : '') +
      `</div>` +
      `<div class="prof-body">` +
        `<div class="prof-stats">` +
          `<div class="prof-stat">` +
            `<div class="prof-stat-v" style="color:${esc(themeColor(user.color))}">${presence}</div>` +
            `<div class="prof-stat-l">Presence</div>` +
          `</div>` +
          `<div class="prof-stat">` +
            `<div class="prof-stat-v">${(user.role || 'user').toUpperCase()}</div>` +
            `<div class="prof-stat-l">Role</div>` +
          `</div>` +
          `<div class="prof-stat">` +
            `<div class="prof-stat-v">${msgCount}</div>` +
            `<div class="prof-stat-l">Messages</div>` +
          `</div>` +
        `</div>` +
        (isMe ? renderEditSection(user) : '') +
      `</div>`;

    $('profOv').classList.add('on');

    // Bind close button
    $('profClose').onclick = closeProfile;

    // Bind save and upload buttons
    if (isMe) {
      const saveBtn = document.getElementById('profSave');
      if (saveBtn) saveBtn.onclick = saveProfile;

      const uploadBtn = document.getElementById('profUploadBtn');
      const fileInput = document.getElementById('profFileInput');
      if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = e => {
          const file = e.target.files[0];
          if (file) openCropModal(file);
          fileInput.value = '';
        };
      }
    }

  } catch (e) {
    addLocalMessage('Profile error: ' + e.message, 'err');
  }
}

function renderEditSection(user) {
  const me = state.me || {};
  return `<div class="prof-edit-section">` +
    `<div class="fld"><label class="fld-lbl">Bio</label>` +
      `<textarea class="fld-ta" id="profBio" maxlength="200">${esc(me.bio || '')}</textarea></div>` +
    `<div class="fld"><label class="fld-lbl">Avatar</label>` +
      `<div class="prof-av-upload">` +
        `<button class="prof-upload-btn" id="profUploadBtn">Upload Image</button>` +
        `<span class="prof-av-or">or</span>` +
        `<input class="fld-inp" id="profAv" value="${esc(me.avatarUrl || '')}" placeholder="Paste URL..." style="font-size:.74rem;padding:10px 12px;flex:1">` +
      `</div>` +
      `<input type="file" id="profFileInput" accept="image/*" style="display:none">` +
    `</div>` +
    `<div class="fld"><label class="fld-lbl">Color</label>` +
      `<input class="fld-inp" id="profCol" value="${esc(me.color || '')}" style="font-size:.74rem;padding:10px 12px"></div>` +
    `<div class="fld"><label class="fld-lbl">Twitter / X Handle</label>` +
      `<input class="fld-inp" id="profTwitter" value="${esc(me.twitterHandle || '')}" placeholder="@yourhandle" style="font-size:.74rem;padding:10px 12px" maxlength="50"></div>` +
    `<div class="fld"><label class="fld-lbl">Wallet Address (Solana)</label>` +
      `<input class="fld-inp" id="profWallet" value="${esc(me.walletAddress || '')}" placeholder="Your SOL wallet address" style="font-size:.74rem;padding:10px 12px" maxlength="60"></div>` +
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
  const twitterHandle = (document.getElementById('profTwitter')?.value.trim() || '').replace(/^@/, '');
  const walletAddress = document.getElementById('profWallet')?.value.trim() || '';

  // Validate
  if (color && !isValidHex(color)) { addLocalMessage('Invalid hex color.', 'err'); return; }
  if (avatarUrl && !isValidUrl(avatarUrl)) { addLocalMessage('Avatar must be a valid http/https URL.', 'err'); return; }

  const db = getDb();
  try {
    await db.collection('users').doc(state.me.uid).update({ bio, avatarUrl, color, twitterHandle, walletAddress });
    state.me.bio = bio;
    state.me.avatarUrl = avatarUrl;
    state.me.color = color;
    state.me.twitterHandle = twitterHandle;
    state.me.walletAddress = walletAddress;
    updateHeader();
    closeProfile();
    addLocalMessage('Profile saved.', 'ok');
  } catch (e) {
    addLocalMessage('Failed: ' + e.message, 'err');
  }
}

// ─── Crop modal ───────────────────────────────────────────────────────────
let cropState = { img: null, x: 0, y: 0, size: 200, dragging: false, startX: 0, startY: 0 };

function openCropModal(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      cropState.img = img;
      cropState.size = Math.min(200, Math.min(img.width, img.height));
      cropState.x = Math.floor((img.width - cropState.size) / 2);
      cropState.y = Math.floor((img.height - cropState.size) / 2);

      const slider = $('cropSize');
      slider.min = 50;
      slider.max = Math.min(img.width, img.height);
      slider.value = cropState.size;

      drawCrop();
      $('cropOv').classList.add('on');
      bindCropEvents();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function drawCrop() {
  const canvas = $('cropCanvas');
  const img = cropState.img;
  if (!img) return;

  // Scale canvas to fit display (max 320px)
  const scale = Math.min(320 / img.width, 320 / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  const ctx = canvas.getContext('2d');
  // Draw image dimmed
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw crop region bright
  const sx = cropState.x * scale;
  const sy = cropState.y * scale;
  const ss = cropState.size * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, ss, ss);
  ctx.clip();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Draw crop border
  ctx.strokeStyle = 'rgba(120,177,90,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, ss, ss);
}

function bindCropEvents() {
  const canvas = $('cropCanvas');
  const slider = $('cropSize');
  const img = cropState.img;

  function getScale() {
    return Math.min(320 / img.width, 320 / img.height, 1);
  }

  function clampPos() {
    cropState.x = Math.max(0, Math.min(cropState.x, img.width - cropState.size));
    cropState.y = Math.max(0, Math.min(cropState.y, img.height - cropState.size));
  }

  // Drag to move crop region
  canvas.onmousedown = canvas.ontouchstart = e => {
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    cropState.dragging = true;
    cropState.startX = pt.clientX;
    cropState.startY = pt.clientY;
    cropState.origX = cropState.x;
    cropState.origY = cropState.y;
  };

  const onMove = e => {
    if (!cropState.dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const scale = getScale();
    cropState.x = cropState.origX + (pt.clientX - cropState.startX) / scale;
    cropState.y = cropState.origY + (pt.clientY - cropState.startY) / scale;
    clampPos();
    drawCrop();
  };

  const onUp = () => { cropState.dragging = false; };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);

  // Size slider
  slider.oninput = () => {
    const center = { x: cropState.x + cropState.size / 2, y: cropState.y + cropState.size / 2 };
    cropState.size = parseInt(slider.value);
    cropState.x = center.x - cropState.size / 2;
    cropState.y = center.y - cropState.size / 2;
    clampPos();
    drawCrop();
  };

  // Cancel
  $('cropCancel').onclick = () => {
    $('cropOv').classList.remove('on');
    cleanup();
  };

  // Save → upload to Firebase Storage
  $('cropSave').onclick = async () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 256;
    outCanvas.height = 256;
    const octx = outCanvas.getContext('2d');
    octx.drawImage(img, cropState.x, cropState.y, cropState.size, cropState.size, 0, 0, 256, 256);

    $('cropSave').textContent = 'Uploading...';
    $('cropSave').disabled = true;

    try {
      const blob = await new Promise(r => outCanvas.toBlob(r, 'image/jpeg', 0.85));
      const ref = firebase.storage().ref(`avatars/${state.me.uid}.jpg`);
      await ref.put(blob, { contentType: 'image/jpeg' });
      const url = await ref.getDownloadURL();

      // Update profile URL field
      const avInput = document.getElementById('profAv');
      if (avInput) avInput.value = url;

      $('cropOv').classList.remove('on');
      addLocalMessage('Avatar uploaded! Click Save Profile to apply.', 'ok');
    } catch (e) {
      addLocalMessage('Upload failed: ' + e.message, 'err');
    } finally {
      $('cropSave').textContent = 'Upload';
      $('cropSave').disabled = false;
      cleanup();
    }
  };

  function cleanup() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }
}
