// Shared utility functions

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// --- Shared gateway tab rendering ---
// Each page calls initGatewayTabs(onSelect) once, then buildGatewayTabs(gateways, selectedGateway, searchInputId) to render.

let _gwOnSelect = null;

function initGatewayTabs(onSelect, onGroupChange) {
  _gwOnSelect = onSelect;

  document.querySelector('.gateway-tab[data-gateway=""]').addEventListener('click', () => {
    onSelect(null);
    collapseGatewaySelector();
  });

  document.getElementById('group-filter').addEventListener('change', (e) => {
    if (onGroupChange) onGroupChange(e.target.value || null);
  });

  document.getElementById('gateway-expand-btn').addEventListener('click', toggleGatewayExpand);

  const scrollEl = document.querySelector('.gateway-tabs-scroll');
  document.getElementById('gateway-scroll-left').addEventListener('click', () => {
    scrollEl.scrollBy({ left: -600, behavior: 'smooth' });
  });
  document.getElementById('gateway-scroll-right').addEventListener('click', () => {
    scrollEl.scrollBy({ left: 600, behavior: 'smooth' });
  });

  document.addEventListener('click', (e) => {
    const selector = document.querySelector('.gateway-selector');
    const btn = document.getElementById('gateway-expand-btn');
    if (selector && selector.classList.contains('expanded') &&
        !selector.contains(e.target) && !btn.contains(e.target)) {
      collapseGatewaySelector();
    }
  });
}

function buildGatewayTabs(gateways, selectedGateway, searchInputId, selectedGroup) {
  const container = document.getElementById('gateway-tabs');

  // Populate group dropdown
  const groupSelect = document.getElementById('group-filter');
  if (groupSelect) {
    const groups = [...new Set(gateways.map(gw => gw.group_name).filter(Boolean))].sort();
    const hasNoGroup = gateways.some(gw => !gw.group_name || gw.group_name.trim() === '') || selectedGroup === '__none__';
    groupSelect.innerHTML = '<option value="">All Groups</option>' +
      groups.map(g => `<option value="${g}">${g}</option>`).join('') +
      (hasNoGroup ? '<option value="__none__">No Group</option>' : '');
    groupSelect.value = selectedGroup || '';
  }

  // Filter tabs by selected group (treat null and '' as ungrouped)
  const noGroup = gw => !gw.group_name || gw.group_name.trim() === '';
  const visible = selectedGroup === '__none__'
    ? gateways.filter(noGroup)
    : selectedGroup
      ? gateways.filter(gw => gw.group_name === selectedGroup)
      : gateways;

  container.innerHTML = visible.map(gw => {
    const label = gw.name || gw.gateway_id;
    const title = gw.name ? `${gw.name} (${gw.gateway_id})` : gw.gateway_id;
    return `<button class="gateway-tab px-3 py-1 rounded text-xs" data-gateway="${gw.gateway_id}" title="${title}">${label}<span class="text-gray-500 ml-1">${formatNumber(gw.packet_count)}</span></button>`;
  }).join('');

  container.querySelectorAll('.gateway-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _gwOnSelect(tab.dataset.gateway || null);
      collapseGatewaySelector();
    });
  });

  // Apply active state across all tabs (static "All" + dynamic ones)
  const validSelected = selectedGateway && gateways.some(gw => gw.gateway_id === selectedGateway)
    ? selectedGateway : null;
  document.querySelectorAll('.gateway-tab').forEach(tab => {
    const gwId = tab.dataset.gateway || null;
    tab.classList.toggle('active', validSelected ? gwId === validSelected : gwId === null);
  });

  document.getElementById('gateway-expand-btn').style.display = gateways.length > 0 ? '' : 'none';
}

function toggleGatewayExpand() {
  const expanded = document.querySelector('.gateway-selector').classList.toggle('expanded');
  document.getElementById('gateway-expand-btn').classList.toggle('expanded');
  document.getElementById('gateway-scroll-left').style.display  = expanded ? 'none' : '';
  document.getElementById('gateway-scroll-right').style.display = expanded ? 'none' : '';
}

function collapseGatewaySelector() {
  document.querySelector('.gateway-selector').classList.remove('expanded');
  document.getElementById('gateway-expand-btn').classList.remove('expanded');
  document.getElementById('gateway-scroll-left').style.display  = '';
  document.getElementById('gateway-scroll-right').style.display = '';
}
