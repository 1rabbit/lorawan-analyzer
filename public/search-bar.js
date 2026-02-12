// Global search bar component - works across all pages
// Loads device metadata and provides instant search with dropdown results
(function () {
  const FAVORITES_KEY = 'lorawanFavorites';

  // State
  let allDevices = [];
  let favorites = loadFavorites();
  let searchOpen = false;

  // ---- Favorites persistence ----
  function loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    } catch { return []; }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {}
  }

  window.isFavorite = function (devAddr) {
    return favorites.includes(devAddr);
  };

  window.toggleFavorite = function (devAddr, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const idx = favorites.indexOf(devAddr);
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(devAddr);
    }
    saveFavorites();
    // Dispatch event so dashboard can re-sort
    window.dispatchEvent(new CustomEvent('favorites-changed'));
    // Update star icons in search results
    updateSearchStars();
    return favorites.includes(devAddr);
  };

  window.getFavorites = function () {
    return [...favorites];
  };

  // ---- Search component ----
  function init() {
    const container = document.getElementById('global-search');
    if (!container) return;

    container.innerHTML = `
      <div class="global-search-wrap">
        <input type="text" id="global-search-input" placeholder="${t('search.placeholder')}"
               class="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/40 w-48 focus:outline-none focus:border-white/40 focus:w-64 transition-all">
        <div id="global-search-dropdown" class="global-search-dropdown hidden"></div>
      </div>
    `;

    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('global-search-dropdown');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 1) {
        closeDropdown();
        return;
      }
      showResults(q);
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length >= 1) showResults(q);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) closeDropdown();
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(); input.blur(); }
      if (e.key === 'Enter') {
        const first = dropdown.querySelector('.search-result-item');
        if (first) first.click();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateResults(e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    // Global shortcut: Ctrl+K or / to focus search
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !isInputFocused())) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });

    loadDevices();

    // Re-translate on language change
    window.addEventListener('langchange', () => {
      input.placeholder = t('search.placeholder');
      // Re-render dropdown if open
      const q = input.value.trim().toLowerCase();
      if (q.length >= 1 && searchOpen) showResults(q);
    });
  }

  function isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  async function loadDevices() {
    try {
      const res = await fetch('/api/metadata/devices');
      const data = await res.json();
      allDevices = (data.devices || []).map(d => ({
        dev_addr: d.dev_addr,
        dev_eui: d.dev_eui || '',
        device_name: d.device_name || '',
        application_name: d.application_name || '',
        operator: '',
      }));
    } catch {
      // Metadata not available - search will work with favorites only
    }

    // Also try to load device list from gateway API for operator info
    try {
      const res = await fetch('/api/gateways/all/devices?hours=168&limit=500');
      const data = await res.json();
      const devices = data.devices || [];
      for (const d of devices) {
        const existing = allDevices.find(m => m.dev_addr === d.dev_addr);
        if (existing) {
          existing.operator = d.operator || '';
          if (!existing.device_name && d.device_name) existing.device_name = d.device_name;
        } else {
          allDevices.push({
            dev_addr: d.dev_addr,
            dev_eui: '',
            device_name: d.device_name || '',
            application_name: '',
            operator: d.operator || '',
          });
        }
      }
    } catch {}
  }

  function showResults(query) {
    const dropdown = document.getElementById('global-search-dropdown');
    if (!dropdown) return;

    // Search across all fields
    let results = allDevices.filter(d => {
      const searchable = [d.dev_addr, d.dev_eui, d.device_name, d.application_name, d.operator]
        .filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query);
    });

    // Also include favorites that match
    for (const fav of favorites) {
      if (!results.find(r => r.dev_addr === fav) && fav.toLowerCase().includes(query)) {
        results.push({ dev_addr: fav, dev_eui: '', device_name: '', application_name: '', operator: '' });
      }
    }

    // Sort: favorites first, then by name presence, then alphabetical
    results.sort((a, b) => {
      const aFav = favorites.includes(a.dev_addr) ? 0 : 1;
      const bFav = favorites.includes(b.dev_addr) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      const aName = a.device_name ? 0 : 1;
      const bName = b.device_name ? 0 : 1;
      if (aName !== bName) return aName - bName;
      return a.dev_addr.localeCompare(b.dev_addr);
    });

    results = results.slice(0, 15);

    if (results.length === 0) {
      dropdown.innerHTML = `<div class="search-no-results">${t('search.no_results')}</div>`;
    } else {
      dropdown.innerHTML = results.map((d, i) => {
        const isFav = favorites.includes(d.dev_addr);
        const starClass = isFav ? 'search-star active' : 'search-star';
        const nameHtml = d.device_name
          ? `<span class="search-result-name">${esc(d.device_name)}</span>`
          : '';
        const euiHtml = d.dev_eui
          ? `<span class="search-result-eui">${d.dev_eui}</span>`
          : '';
        const opHtml = d.operator
          ? `<span class="search-result-op">${esc(d.operator)}</span>`
          : '';
        return `
          <div class="search-result-item${i === 0 ? ' selected' : ''}" data-addr="${d.dev_addr}" onclick="window.location.href='device.html?addr=${d.dev_addr}'">
            <button class="${starClass}" onclick="toggleFavorite('${d.dev_addr}', event)" title="${t('search.toggle_favorite')}">&#9733;</button>
            <span class="search-result-addr">${d.dev_addr}</span>
            ${nameHtml}${euiHtml}${opHtml}
          </div>`;
      }).join('');
    }

    dropdown.classList.remove('hidden');
    searchOpen = true;
  }

  function closeDropdown() {
    const dropdown = document.getElementById('global-search-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    searchOpen = false;
  }

  function navigateResults(direction) {
    const dropdown = document.getElementById('global-search-dropdown');
    if (!dropdown) return;
    const items = [...dropdown.querySelectorAll('.search-result-item')];
    if (items.length === 0) return;

    const current = dropdown.querySelector('.search-result-item.selected');
    let idx = current ? items.indexOf(current) : -1;
    if (current) current.classList.remove('selected');

    idx += direction;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;

    items[idx].classList.add('selected');
    items[idx].scrollIntoView({ block: 'nearest' });

    // Update enter target
    const input = document.getElementById('global-search-input');
    input.addEventListener('keydown', function handler(e) {
      if (e.key === 'Enter') {
        const sel = dropdown.querySelector('.search-result-item.selected');
        if (sel) sel.click();
      }
    }, { once: true });
  }

  function updateSearchStars() {
    const dropdown = document.getElementById('global-search-dropdown');
    if (!dropdown) return;
    dropdown.querySelectorAll('.search-star').forEach(star => {
      const item = star.closest('.search-result-item');
      if (!item) return;
      const addr = item.dataset.addr;
      star.classList.toggle('active', favorites.includes(addr));
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Init on DOM ready ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
