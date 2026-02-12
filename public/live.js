// Get base path from current URL
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, '');

// Parse UTC timestamp from DB (comes without timezone info)
function parseUTCTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts);
  if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
}

// State
let selectedGateway = null;
let liveEntries = [];
let ws = null;
let gateways = [];
let filter = { showOwned: true, showForeign: true, prefixes: [] };
let typeFilter = { up: true, join: true, down: true, ack: true };
let operatorColors = {};

// Load filter state from localStorage
function loadFilterState() {
  try {
    const saved = localStorage.getItem('lorawanFilterState');
    if (saved) {
      const state = JSON.parse(saved);
      filter.showOwned = state.showOwned ?? true;
      filter.showForeign = state.showForeign ?? true;
    }
    const savedTypes = localStorage.getItem('lorawanTypeFilter');
    if (savedTypes) {
      const types = JSON.parse(savedTypes);
      typeFilter.up = types.up ?? true;
      typeFilter.join = types.join ?? true;
      typeFilter.down = types.down ?? true;
      typeFilter.ack = types.ack ?? true;
    }
    const savedGateway = localStorage.getItem('lorawanSelectedGateway');
    if (savedGateway) {
      selectedGateway = savedGateway === 'null' ? null : savedGateway;
    }
  } catch (e) {
    console.error('Failed to load filter state:', e);
  }
}

// Save filter state to localStorage
function saveFilterState() {
  try {
    localStorage.setItem('lorawanFilterState', JSON.stringify({
      showOwned: filter.showOwned,
      showForeign: filter.showForeign
    }));
    localStorage.setItem('lorawanTypeFilter', JSON.stringify(typeFilter));
  } catch (e) {
    console.error('Failed to save filter state:', e);
  }
}

function saveSelectedGateway() {
  try {
    localStorage.setItem('lorawanSelectedGateway', selectedGateway === null ? 'null' : selectedGateway);
  } catch (e) {
    console.error('Failed to save gateway:', e);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  loadFilterState();

  await Promise.all([loadMyDevicesConfig(), loadOperatorColors()]);

  // Apply saved filter state to UI
  document.getElementById('toggle-owned').classList.toggle('active', filter.showOwned);
  document.getElementById('toggle-foreign').classList.toggle('active', filter.showForeign);
  document.getElementById('toggle-up').classList.toggle('active', typeFilter.up);
  document.getElementById('toggle-join').classList.toggle('active', typeFilter.join);
  document.getElementById('toggle-down').classList.toggle('active', typeFilter.down);
  document.getElementById('toggle-ack').classList.toggle('active', typeFilter.ack);

  // RSSI range slider
  const rssiMinEl = document.getElementById('rssi-min');
  const rssiMaxEl = document.getElementById('rssi-max');
  const rssiRangeLabel = document.getElementById('rssi-range-label');

  // Restore saved RSSI filter
  try {
    const saved = localStorage.getItem('lorawanRssiFilter');
    if (saved) {
      const { min, max } = JSON.parse(saved);
      rssiMinEl.value = min;
      rssiMaxEl.value = max;
    }
  } catch (e) {}

  function updateRssiLabel() {
    const lo = parseInt(rssiMinEl.value, 10);
    const hi = parseInt(rssiMaxEl.value, 10);
    if (lo <= -140 && hi >= -30) {
      rssiRangeLabel.textContent = t('common.off');
    } else if (lo <= -140) {
      rssiRangeLabel.textContent = `< ${hi}`;
    } else if (hi >= -30) {
      rssiRangeLabel.textContent = `> ${lo}`;
    } else {
      rssiRangeLabel.textContent = `${lo}..${hi}`;
    }
  }

  function saveRssiFilter() {
    try {
      localStorage.setItem('lorawanRssiFilter', JSON.stringify({
        min: parseInt(rssiMinEl.value, 10),
        max: parseInt(rssiMaxEl.value, 10)
      }));
    } catch (e) {}
  }

  updateRssiLabel();

  rssiMinEl.addEventListener('input', () => {
    if (parseInt(rssiMinEl.value, 10) > parseInt(rssiMaxEl.value, 10)) {
      rssiMinEl.value = rssiMaxEl.value;
    }
    updateRssiLabel();
    saveRssiFilter();
  });
  rssiMaxEl.addEventListener('input', () => {
    if (parseInt(rssiMaxEl.value, 10) < parseInt(rssiMinEl.value, 10)) {
      rssiMaxEl.value = rssiMinEl.value;
    }
    updateRssiLabel();
    saveRssiFilter();
  });
  rssiMinEl.addEventListener('change', () => reloadWithNewFilter());
  rssiMaxEl.addEventListener('change', () => reloadWithNewFilter());

  // Init shared packet feed — filter bar is in the page header
  initPacketFeed('live-feed-container', {
    showGateway: true,
    showAddr: true,
    showOperator: true,
    showDevEui: true,
    clickable: true,
    noFilterBar: true,
    countEl: document.getElementById('packet-count'),
    searchEl: document.getElementById('search-input'),
    isMyDevice,
    getOperatorStyle,
    getGatewayName: (gwId) => {
      const gw = gateways.find(g => g.gateway_id === gwId);
      return gw ? (gw.name || gwId) : null;
    },
  });

  loadGateways();
  loadRecentPackets(selectedGateway);
  connectWebSocket(selectedGateway);

  // Packet type filter toggles
  ['up', 'join', 'down', 'ack'].forEach(key => {
    document.getElementById(`toggle-${key}`).addEventListener('click', (e) => {
      typeFilter[key] = !typeFilter[key];
      e.target.classList.toggle('active', typeFilter[key]);
      saveFilterState();
      reloadWithNewFilter();
    });
  });

  // Device ownership filter toggles
  document.getElementById('toggle-owned').addEventListener('click', (e) => {
    filter.showOwned = !filter.showOwned;
    e.target.classList.toggle('active', filter.showOwned);
    saveFilterState();
    reloadWithNewFilter();
  });

  document.getElementById('toggle-foreign').addEventListener('click', (e) => {
    filter.showForeign = !filter.showForeign;
    e.target.classList.toggle('active', filter.showForeign);
    saveFilterState();
    reloadWithNewFilter();
  });

  // Gateway tab: All Gateways
  document.querySelector('.gateway-tab[data-gateway=""]').addEventListener('click', () => {
    selectGateway(null);
  });

  // Re-translate on language change
  window.addEventListener('langchange', () => {
    updateRssiLabel();
  });
});

// API Helper
async function api(path) {
  const res = await fetch(BASE_PATH + path);
  return res.json();
}

// My Devices Config
async function loadMyDevicesConfig() {
  try {
    const data = await api('/api/config/my-devices');
    filter.prefixes = (data.ranges || [])
      .filter(r => r.type === 'dev_addr')
      .map(r => r.prefix);
  } catch (e) {
    console.error('Failed to load my_devices config:', e);
  }
}

async function loadOperatorColors() {
  try {
    operatorColors = await api('/api/config/operator-colors');
  } catch (e) {
    console.error('Failed to load operator colors:', e);
  }
}

function isMyDevice(devAddr) {
  if (!devAddr || filter.prefixes.length === 0) return false;
  const addrNum = parseInt(devAddr.replace(/[^0-9A-Fa-f]/g, ''), 16);
  for (const prefixStr of filter.prefixes) {
    const parts = prefixStr.split('/');
    const prefixHex = parts[0].toUpperCase();
    const bits = parts[1] ? parseInt(parts[1], 10) : 32;
    const prefix = parseInt(prefixHex, 16);
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    if ((addrNum & mask) === (prefix & mask)) return true;
  }
  return false;
}

function shouldShowDevice(devAddr) {
  const isOwned = isMyDevice(devAddr);
  if (isOwned && filter.showOwned) return true;
  if (!isOwned && filter.showForeign) return true;
  return false;
}

function getOperatorStyle(operator) {
  const color = operatorColors[operator];
  return color ? `style="color: ${color}"` : 'class="op-unknown"';
}

// Gateway Management
async function loadGateways() {
  const data = await api('/api/gateways');
  gateways = data.gateways || [];
  renderGatewayTabs();
}

function renderGatewayTabs() {
  const container = document.getElementById('gateway-tabs');
  container.innerHTML = gateways.map(gw => {
    const label = gw.name || gw.gateway_id;
    return `
      <button class="gateway-tab px-3 py-1 rounded text-xs" data-gateway="${gw.gateway_id}" title="${gw.gateway_id}">
        ${label}
      </button>
    `;
  }).join('');

  container.querySelectorAll('.gateway-tab').forEach(tab => {
    tab.addEventListener('click', () => selectGateway(tab.dataset.gateway));
  });

  // Apply saved gateway selection
  if (selectedGateway && gateways.some(gw => gw.gateway_id === selectedGateway)) {
    document.querySelectorAll('.gateway-tab').forEach(tab => {
      const isActive = (tab.dataset.gateway || null) === selectedGateway;
      tab.classList.toggle('active', isActive);
    });
  } else {
    selectedGateway = null;
    document.querySelector('.gateway-tab[data-gateway=""]')?.classList.add('active');
  }

  // Show/hide gateway column based on selection
  const showGwCol = !selectedGateway;
  document.querySelectorAll('.gateway-col').forEach(el => {
    el.style.display = showGwCol ? '' : 'none';
  });
}

function selectGateway(gatewayId) {
  selectedGateway = gatewayId;
  saveSelectedGateway();
  document.querySelectorAll('.gateway-tab').forEach(tab => {
    const isActive = (tab.dataset.gateway || null) === gatewayId;
    tab.classList.toggle('active', isActive);
  });

  // Show/hide gateway column based on selection
  const showGwCol = !gatewayId;
  document.querySelectorAll('.gateway-col').forEach(el => {
    el.style.display = showGwCol ? '' : 'none';
  });

  // Clear and reload
  liveEntries = [];
  loadRecentPackets(gatewayId);
  connectWebSocket(gatewayId);
}

// Load recent packets from DB with server-side filtering
async function loadRecentPackets(gatewayId = null) {
  try {
    const params = new URLSearchParams({ limit: '500' });
    if (gatewayId) params.set('gateway_id', gatewayId);

    // Determine filter mode based on filter settings
    if (filter.showOwned && filter.showForeign) {
      params.set('filter_mode', 'all');
    } else if (filter.showOwned && !filter.showForeign) {
      params.set('filter_mode', 'owned');
      params.set('prefixes', filter.prefixes.join(','));
    } else if (!filter.showOwned && filter.showForeign) {
      params.set('filter_mode', 'foreign');
      params.set('prefixes', filter.prefixes.join(','));
    }

    // Add packet type filter
    const types = [];
    if (typeFilter.up) types.push('data');
    if (typeFilter.join) types.push('join_request');
    if (typeFilter.down) types.push('downlink');
    if (typeFilter.ack) types.push('tx_ack');
    if (types.length > 0 && types.length < 4) {
      params.set('packet_types', types.join(','));
    }

    // Add RSSI filter
    const rssiLo = parseInt(document.getElementById('rssi-min').value, 10);
    const rssiHi = parseInt(document.getElementById('rssi-max').value, 10);
    if (rssiLo > -140) params.set('rssi_min', rssiLo);
    if (rssiHi < -30) params.set('rssi_max', rssiHi);

    const data = await api(`/api/packets/recent?${params}`);
    const packets = data.packets || [];

    // Convert DB format to live format
    for (const p of packets) {
      const freqMhz = p.frequency > 1000000 ? p.frequency / 1000000 : p.frequency;
      const dataRate = p.spreading_factor
        ? `SF${p.spreading_factor}BW${(p.bandwidth || 125000) / 1000}`
        : '-';
      const livePacket = {
        timestamp: parseUTCTimestamp(p.timestamp).getTime(),
        gateway_id: p.gateway_id,
        type: p.packet_type,
        dev_addr: p.dev_addr,
        f_cnt: p.f_cnt,
        f_port: p.f_port,
        join_eui: p.join_eui,
        dev_eui: p.dev_eui,
        operator: p.operator,
        data_rate: dataRate,
        frequency: freqMhz,
        rssi: p.rssi,
        snr: p.snr,
        payload_size: p.payload_size,
        airtime_ms: p.airtime_us ? p.airtime_us / 1000 : 0,
        tx_status: p.packet_type === 'tx_ack' ? p.operator : undefined,
        confirmed: p.confirmed,
        device_name: p.device_name,
      };
      liveEntries.push(livePacket);
    }
    setPacketFeedData(liveEntries, true);
  } catch (e) {
    console.error('Failed to load recent packets:', e);
  }
}

// Reload packets when filter changes
function reloadWithNewFilter() {
  liveEntries = [];
  loadRecentPackets(selectedGateway);
  connectWebSocket(selectedGateway);
}

// WebSocket
function connectWebSocket(gatewayId = null) {
  if (ws) ws.close();

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = gatewayId
    ? `${protocol}//${location.host}${BASE_PATH}/api/live/${gatewayId}`
    : `${protocol}//${location.host}${BASE_PATH}/api/live`;

  const wsParams = new URLSearchParams();

  // Add packet type filter
  const types = [];
  if (typeFilter.up) types.push('data');
  if (typeFilter.join) types.push('join_request');
  if (typeFilter.down) types.push('downlink');
  if (typeFilter.ack) types.push('tx_ack');
  if (types.length > 0 && types.length < 4) {
    wsParams.set('types', types.join(','));
  }

  // Add RSSI filter
  const rssiLo = parseInt(document.getElementById('rssi-min').value, 10);
  const rssiHi = parseInt(document.getElementById('rssi-max').value, 10);
  if (rssiLo > -140) wsParams.set('rssi_min', rssiLo);
  if (rssiHi < -30) wsParams.set('rssi_max', rssiHi);

  // Add ownership filter
  if (filter.showOwned && !filter.showForeign) {
    wsParams.set('filter_mode', 'owned');
    wsParams.set('prefixes', filter.prefixes.join(','));
  } else if (!filter.showOwned && filter.showForeign) {
    wsParams.set('filter_mode', 'foreign');
    wsParams.set('prefixes', filter.prefixes.join(','));
  }

  const qs = wsParams.toString();
  if (qs) url += `?${qs}`;

  ws = new WebSocket(url);
  ws.onmessage = (event) => {
    const packet = JSON.parse(event.data);
    addLiveEntry(packet);
  };
  ws.onerror = (err) => console.error('WebSocket error:', err);
  ws.onclose = () => setTimeout(() => connectWebSocket(selectedGateway), 5000);
}

function addLiveEntry(packet) {
  liveEntries.unshift(packet);
  if (liveEntries.length > 500) liveEntries = liveEntries.slice(0, 500);
  setPacketFeedData(liveEntries);
}
