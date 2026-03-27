// ─── Message Search ───────────────────────────────────────────────────────────
import { state, $ } from './state.js';

let searchActive = false;
let searchQuery = '';

// ─── Init search ─────────────────────────────────────────────────────────
export function initSearch() {
  const btn = $('searchBtn');
  const bar = $('searchBar');
  const input = $('searchInput');
  const closeBtn = $('searchClose');
  const count = $('searchCount');

  if (!btn) return;

  btn.addEventListener('click', () => {
    if (state.dmView) return; // Only in chatroom view
    openSearch();
  });

  closeBtn.addEventListener('click', closeSearch);

  input.addEventListener('input', () => {
    searchQuery = input.value;
    runSearch();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearch();
  });
}

// ─── Open search bar ──────────────────────────────────────────────────────
export function openSearch() {
  if (state.dmView) return;
  searchActive = true;
  searchQuery = '';
  const bar = $('searchBar');
  const input = $('searchInput');
  const count = $('searchCount');
  bar.classList.add('on');
  input.value = '';
  if (count) count.textContent = '';
  input.focus();
}

// ─── Close search bar ─────────────────────────────────────────────────────
export function closeSearch() {
  searchActive = false;
  searchQuery = '';
  const bar = $('searchBar');
  const input = $('searchInput');
  bar.classList.remove('on');
  input.value = '';
  // Restore normal message rendering via event
  document.dispatchEvent(new CustomEvent('search-close'));
}

// ─── Run search filter ────────────────────────────────────────────────────
function runSearch() {
  const q = searchQuery.trim().toLowerCase();
  const count = $('searchCount');

  if (!q) {
    if (count) count.textContent = '';
    renderChatMessages(state.cachedMsgs);
    return;
  }

  const filtered = state.cachedMsgs.filter(m => {
    if (m.deleted) return false;
    const inText = m.text && m.text.toLowerCase().includes(q);
    const inName = m.name && m.name.toLowerCase().includes(q);
    return inText || inName;
  });

  if (count) count.textContent = filtered.length + ' result' + (filtered.length !== 1 ? 's' : '');

  // Trigger render via event (avoids circular import with render.js)
  if (!filtered.length) {
    const container = $('msgs');
    container.innerHTML =
      '<div class="msgs-empty">' +
        '<div class="msgs-empty-ic">🔍</div>' +
        '<div class="msgs-empty-t">No results</div>' +
        '<div class="msgs-empty-s">Try a different search term</div>' +
      '</div>';
  } else {
    document.dispatchEvent(new CustomEvent('search-render', {
      detail: { msgs: filtered, query: q }
    }));
  }
}

// ─── Highlight text helper (exported for render.js usage) ─────────────────
export function highlightText(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

// ─── Getters ─────────────────────────────────────────────────────────────
export function isSearchActive() { return searchActive; }
export function getSearchQuery() { return searchQuery; }
