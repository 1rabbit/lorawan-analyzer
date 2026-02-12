// Get base path from current URL
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, '');

// State
let selectedGateway = null;
let selectedHours = 24;
let gateways = [];
let filter = { showOwned: true, showForeign: true, prefixes: [] };
let operatorColors = {};
const OPERATOR_PALETTE = [
  '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#eab308',
  '#ef4444', '#14b8a6', '#ec4899', '#06b6d4', '#84cc16',
  '#f43f5e', '#8b5cf6', '#0ea5e9', '#d946ef', '#10b981'
];
let operatorColorAssignments = {};
let deviceSearchText = '';
let rssiFilterMin = -200;
let rssiFilterMax = 0;
let deviceMetadataMap = {};

// Load filter state from localStorage
function loadFilterState() {
  try {
    const saved = localStorage.getItem('lorawanFilterState');
    if (saved) {
      const state = JSON.parse(saved);
      filter.showOwned = state.showOwned ?? true;
      filter.showForeign = state.showForeign ?? true;
    }
    const savedGateway = localStorage.getItem('lorawanSelectedGateway');
    if (savedGateway) {
      selectedGateway = savedGateway === 'null' ? null : savedGateway;
    }
    const savedHours = localStorage.getItem('lorawanSelectedHours');
    if (savedHours) {
      selectedHours = parseInt(savedHours, 10) || 24;
    }
  } catch (e) {
    console.error('Failed to load filter state:', e);
  }
}

function saveSelectedHours() {
  try {
    localStorage.setItem('lorawanSelectedHours', selectedHours.toString());
  } catch (e) {
    console.error('Failed to save hours:', e);
  }
}

// Save filter state to localStorage
function saveFilterState() {
  try {
    localStorage.setItem('lorawanFilterState', JSON.stringify({
      showOwned: filter.showOwned,
      showForeign: filter.showForeign
    }));
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

// Charts
let trafficChart = null;
let operatorChart = null;
let channelChart = null;
let sfChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  loadFilterState();

  // Apply saved filter state to UI before loading data
  document.getElementById('toggle-owned').classList.toggle('active', filter.showOwned);
  document.getElementById('toggle-foreign').classList.toggle('active', filter.showForeign);

  // Apply saved time range to UI
  document.querySelectorAll('.time-btn').forEach(btn => {
    const hours = parseInt(btn.dataset.hours, 10);
    btn.classList.toggle('active', hours === selectedHours);
  });

  await Promise.all([loadMyDevicesConfig(), loadOperatorColors(), loadDeviceMetadata()]);
  loadGateways();
  loadAllData();
  initCharts();

  // Time range buttons
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedHours = parseInt(btn.dataset.hours, 10);
      saveSelectedHours();
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadAllData();
    });
  });

  // Filter toggles
  document.getElementById('toggle-owned').addEventListener('click', (e) => {
    filter.showOwned = !filter.showOwned;
    e.target.classList.toggle('active', filter.showOwned);
    saveFilterState();
    loadAllData();
  });

  document.getElementById('toggle-foreign').addEventListener('click', (e) => {
    filter.showForeign = !filter.showForeign;
    e.target.classList.toggle('active', filter.showForeign);
    saveFilterState();
    loadAllData();
  });

  // Device search
  document.getElementById('device-search').addEventListener('input', (e) => {
    deviceSearchText = e.target.value.toLowerCase();
    loadDeviceBreakdown();
  });

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
      rssiFilterMin = min;
      rssiFilterMax = max;
    }
  } catch (e) {}

  function updateRssiLabel() {
    const lo = parseInt(rssiMinEl.value, 10);
    const hi = parseInt(rssiMaxEl.value, 10);
    if (lo <= -140 && hi >= -30) {
      rssiRangeLabel.textContent = 'off';
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
    rssiFilterMin = parseInt(rssiMinEl.value, 10);
    updateRssiLabel();
    saveRssiFilter();
  });
  rssiMaxEl.addEventListener('input', () => {
    if (parseInt(rssiMaxEl.value, 10) < parseInt(rssiMinEl.value, 10)) {
      rssiMaxEl.value = rssiMinEl.value;
    }
    rssiFilterMax = parseInt(rssiMaxEl.value, 10);
    updateRssiLabel();
    saveRssiFilter();
  });
  rssiMinEl.addEventListener('change', () => loadDeviceBreakdown());
  rssiMaxEl.addEventListener('change', () => loadDeviceBreakdown());

  // Gateway tab: All Gateways
  document.querySelector('.gateway-tab[data-gateway=""]').addEventListener('click', () => {
    selectGateway(null);
  });

  // Re-render device list when favorites change
  window.addEventListener('favorites-changed', () => loadDeviceBreakdown());

  // Help tooltips
  initHelpTooltips();

  // Auto-refresh every 30 seconds
  setInterval(loadAllData, 30000);
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

function getOperatorColor(operator, index) {
  // 1) Config-provided color (from config.toml)
  if (operatorColors[operator]) return operatorColors[operator];
  // 2) Already assigned palette color
  if (operatorColorAssignments[operator]) return operatorColorAssignments[operator];
  // 3) Assign from palette based on index or next available slot
  const idx = index !== undefined ? index : Object.keys(operatorColorAssignments).length;
  const color = OPERATOR_PALETTE[idx % OPERATOR_PALETTE.length];
  operatorColorAssignments[operator] = color;
  return color;
}

// Get filter mode and prefixes for API calls
function getFilterParams() {
  if (filter.showOwned && filter.showForeign) {
    return { filter_mode: 'all' };
  } else if (filter.showOwned && !filter.showForeign) {
    return { filter_mode: 'owned', prefixes: filter.prefixes.join(',') };
  } else if (!filter.showOwned && filter.showForeign) {
    return { filter_mode: 'foreign', prefixes: filter.prefixes.join(',') };
  }
  // Neither selected - show nothing (use impossible filter)
  return { filter_mode: 'owned', prefixes: 'FFFFFFFF/32' };
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

// Device Metadata
async function loadDeviceMetadata() {
  try {
    const data = await api('/api/metadata/devices');
    deviceMetadataMap = {};
    for (const d of data.devices || []) {
      deviceMetadataMap[d.dev_addr] = d;
    }
  } catch (e) {
    // Metadata enrichment is optional
  }
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
        <span class="text-gray-500 ml-1">${formatNumber(gw.packet_count)}</span>
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
}

function selectGateway(gatewayId) {
  selectedGateway = gatewayId;
  saveSelectedGateway();
  document.querySelectorAll('.gateway-tab').forEach(tab => {
    const isActive = (tab.dataset.gateway || null) === gatewayId;
    tab.classList.toggle('active', isActive);
  });
  loadAllData();
}

// Load All Data
function loadAllData() {
  loadStats();
  loadTrafficChart();
  loadOperatorChart();
  loadDeviceBreakdown();
  loadChannelChart();
  loadSFChart();
  loadRecentJoins();
}

// Stats
async function loadStats() {
  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  if (selectedGateway) params.set('gateway_id', selectedGateway);

  try {
    const data = await api(`/api/stats/summary?${params}`);
    document.getElementById('stat-packets').textContent = formatNumber(data.total_packets || 0);
    document.getElementById('stat-devices').textContent = formatNumber(data.unique_devices || 0);
    document.getElementById('stat-airtime').textContent = formatAirtime(data.total_airtime_ms || 0);

    // Load RX airtime and TX duty cycle
    const dcParams = new URLSearchParams({ hours: selectedHours, ...filterParams });
    if (selectedGateway) dcParams.set('gateway_id', selectedGateway);
    const dcData = await api(`/api/stats/duty-cycle?${dcParams}`);
    const dcStats = dcData.stats || {};

    // RX Airtime
    const rxPercent = dcStats.rx_airtime_percent || 0;
    const rxClass = rxPercent >= 5 ? 'duty-high' : rxPercent >= 1 ? 'duty-medium' : 'duty-low';
    document.getElementById('stat-rx-airtime').innerHTML = `<span class="${rxClass}">${formatPercent(rxPercent)}</span>`;

    // TX Duty Cycle
    const txPercent = dcStats.tx_duty_cycle_percent || 0;
    const txClass = txPercent >= 1 ? 'duty-high' : txPercent >= 0.5 ? 'duty-medium' : 'duty-low';
    document.getElementById('stat-tx-duty').innerHTML = `<span class="${txClass}">${formatPercent(txPercent)}</span>`;

    // Load downlink stats
    const dlParams = new URLSearchParams({ hours: selectedHours });
    if (selectedGateway) dlParams.set('gateway_id', selectedGateway);
    const dlData = await api(`/api/stats/downlinks?${dlParams}`);
    const dlStats = dlData.stats || {};

    const downlinks = dlStats.downlinks || 0;
    const ackOk = dlStats.tx_ack_ok || 0;
    const ackFailed = dlStats.tx_ack_failed || 0;

    document.getElementById('stat-downlinks').textContent = formatNumber(downlinks);
    document.getElementById('stat-ack-ok').innerHTML = `<span class="duty-low">${formatNumber(ackOk)}</span>`;
    document.getElementById('stat-ack-fail').innerHTML = ackFailed > 0
      ? `<span class="duty-high">${formatNumber(ackFailed)}</span>`
      : `<span class="duty-low">0</span>`;
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// Charts
function initCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#9ca3af', boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#6b7280' }, grid: { color: '#374151' } },
      y: { ticks: { color: '#6b7280' }, grid: { color: '#374151' }, beginAtZero: true }
    }
  };

  trafficChart = new Chart(document.getElementById('traffic-chart'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      ...chartOptions,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...chartOptions.plugins,
        legend: {
          ...chartOptions.plugins.legend,
          onClick: (e, legendItem, legend) => {
            const chart = legend.chart;
            const ci = legendItem.datasetIndex;
            if (chart._soloIndex === ci) {
              chart.data.datasets.forEach((_, i) => chart.setDatasetVisibility(i, true));
              chart._soloIndex = null;
            } else {
              chart.data.datasets.forEach((_, i) => chart.setDatasetVisibility(i, i === ci));
              chart._soloIndex = ci;
            }
            chart.update();
          }
        }
      }
    }
  });

  operatorChart = new Chart(document.getElementById('operator-chart'), {
    type: 'doughnut',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12 } } }
    }
  });

  const barChartOptions = {
    ...chartOptions,
    plugins: { legend: { display: false } },
    interaction: { mode: 'index', intersect: false }
  };

  channelChart = new Chart(document.getElementById('channel-chart'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: barChartOptions
  });

  sfChart = new Chart(document.getElementById('sf-chart'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: barChartOptions
  });
}

async function loadTrafficChart() {
  const filterParams = getFilterParams();
  const params = new URLSearchParams({
    interval: selectedHours <= 6 ? '5m' : selectedHours <= 24 ? '1h' : '1d',
    metric: 'packets',
    group_by: 'operator',
    ...filterParams
  });
  if (selectedGateway) params.set('gateway_id', selectedGateway);
  const from = new Date(Date.now() - selectedHours * 60 * 60 * 1000);
  params.set('from', from.toISOString());

  const data = await api(`/api/stats/timeseries?${params}`);
  const points = data.data || [];

  const groups = {};
  for (const point of points) {
    const group = point.group || 'Total';
    if (!groups[group]) groups[group] = [];
    groups[group].push(point);
  }

  const allTimestamps = [...new Set(points.map(p => p.timestamp))].sort();

  const datasets = Object.entries(groups).map(([name, pts], i) => {
    const pointMap = new Map(pts.map(p => [p.timestamp, p.value]));
    const color = getOperatorColor(name, i);
    return {
      label: name,
      data: allTimestamps.map(t => pointMap.get(t) || 0),
      borderColor: color,
      backgroundColor: color + '33',
      fill: true,
      tension: 0.3
    };
  });

  trafficChart.data.labels = allTimestamps.map(t => {
    const d = new Date(t);
    return selectedHours <= 24
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });
  trafficChart.data.datasets = datasets;
  trafficChart.update('none');
}

async function loadOperatorChart() {
  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  if (selectedGateway) params.set('gateway_id', selectedGateway);

  const data = await api(`/api/stats/operators?${params}`);
  const operators = data.operators || [];

  operatorChart.data.labels = operators.map(o => o.operator);
  operatorChart.data.datasets = [{
    data: operators.map(o => o.packet_count),
    backgroundColor: operators.map((o, i) => getOperatorColor(o.operator, i)),
    borderWidth: 0
  }];
  operatorChart.update('none');
}

async function loadChannelChart() {
  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  if (selectedGateway) params.set('gateway_id', selectedGateway);

  const data = await api(`/api/stats/channels?${params}`);
  const channels = data.channels || [];

  channelChart.data.labels = channels.map(c => (c.frequency / 1000000).toFixed(1));
  channelChart.data.datasets = [{
    label: t('chart.packets'),
    data: channels.map(c => c.packet_count),
    backgroundColor: channels.map(c =>
      c.usage_percent > 30 ? '#ef4444' : c.usage_percent > 15 ? '#eab308' : '#22c55e'
    ),
    borderRadius: 4
  }];
  channelChart.update('none');
}

async function loadSFChart() {
  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  if (selectedGateway) params.set('gateway_id', selectedGateway);

  const data = await api(`/api/stats/spreading-factors?${params}`);
  const sfs = data.spreadingFactors || [];

  sfChart.data.labels = sfs.map(s => `SF${s.spreading_factor}`);
  sfChart.data.datasets = [{
    label: t('chart.packets'),
    data: sfs.map(s => s.packet_count),
    backgroundColor: sfs.map(s => {
      const sf = s.spreading_factor;
      if (sf <= 7) return '#22c55e';  // green
      if (sf === 8) return '#84cc16'; // lime
      if (sf === 9) return '#eab308'; // yellow
      if (sf === 10) return '#f97316'; // orange
      if (sf === 11) return '#ef4444'; // red
      return '#dc2626'; // darker red for SF12
    }),
    borderRadius: 4
  }];
  sfChart.update('none');
}

// Device Breakdown
async function loadDeviceBreakdown() {
  const deviceListContainer = document.getElementById('device-list');
  const operatorContainer = document.getElementById('breakdown-operator');
  const summaryContainer = document.getElementById('breakdown-summary');

  const params = new URLSearchParams({ hours: selectedHours, limit: 100 });
  if (selectedGateway) params.set('gateway_id', selectedGateway);
  if (rssiFilterMin > -140) params.set('rssi_min', rssiFilterMin);
  if (rssiFilterMax < -30) params.set('rssi_max', rssiFilterMax);

  try {
    // Fetch both tree (operators) and devices data
    const [treeData, devicesData] = await Promise.all([
      api(`/api/gateways/${selectedGateway || 'all'}/tree?hours=${selectedHours}`),
      api(`/api/gateways/${selectedGateway || 'all'}/devices?${params}`)
    ]);

    const operators = treeData.operators || [];
    let devices = devicesData.devices || [];

    // Filter devices by visibility
    devices = devices.filter(d => {
      const isOwned = isMyDevice(d.dev_addr);
      if (isOwned && filter.showOwned) return true;
      if (!isOwned && filter.showForeign) return true;
      return false;
    });

    // Filter by search text
    if (deviceSearchText) {
      devices = devices.filter(d => {
        const meta = deviceMetadataMap[d.dev_addr];
        const searchable = [d.dev_addr, d.operator, meta?.device_name, meta?.dev_eui].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(deviceSearchText);
      });
    }

    // === Device List Panel ===
    if (devices.length === 0) {
      deviceListContainer.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">' + t('dashboard.no_devices') + '</div>';
    } else {
      // Sort: favorites first, then by packet count descending
      const favs = typeof getFavorites === 'function' ? getFavorites() : [];
      const sortedDevices = [...devices].sort((a, b) => {
        const aFav = favs.includes(a.dev_addr) ? 0 : 1;
        const bFav = favs.includes(b.dev_addr) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return b.packet_count - a.packet_count;
      });
      deviceListContainer.innerHTML = sortedDevices.map(d => {
        const isOwned = isMyDevice(d.dev_addr);
        const isFav = favs.includes(d.dev_addr);
        const opColor = getOperatorColor(d.operator);
        const avgRssiClass = d.avg_rssi > -100 ? 'good' : d.avg_rssi > -115 ? 'medium' : 'bad';
        const avgSnrClass = d.avg_snr > 5 ? 'good' : d.avg_snr > 0 ? 'medium' : 'bad';
        const lossClass = d.loss_percent < 1 ? 'good' : d.loss_percent < 5 ? 'medium' : 'bad';
        const lastSeen = formatLastSeen(d.last_seen);
        const sfDisplay = d.min_sf === d.max_sf ? `SF${d.min_sf}` : `SF${d.min_sf}-${d.max_sf}`;
        const intervalDisplay = d.avg_interval_s > 0 ? formatInterval(d.avg_interval_s) : '—';
        const lossDisplay = d.loss_percent > 0 ? `${d.loss_percent.toFixed(1)}%` : '0%';
        return `
          <div class="device-detail-item ${isOwned ? 'mine' : ''}" onclick="window.location.href='device.html?addr=${d.dev_addr}'">
            <div class="device-detail-main">
              <button class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite('${d.dev_addr}', event)" title="Toggle favorite">&#9733;</button>
              <span class="device-addr ${isOwned ? 'text-blue-400' : ''}">${d.dev_addr}</span>
              ${(() => { const meta = deviceMetadataMap[d.dev_addr]; const name = d.device_name || meta?.device_name; const eui = meta?.dev_eui; return (name || eui) ? `<span class="text-xs text-white/50 truncate max-w-[200px]" title="${[name, eui].filter(Boolean).join(' | ')}">${name ? name : ''}${name && eui ? ' ' : ''}${eui ? '<span class="font-mono text-white/30">' + eui + '</span>' : ''}</span>` : ''; })()}
              <span class="device-operator" style="color: ${opColor}">${d.operator || '?'}</span>
              <span class="device-sf">${sfDisplay}</span>
              <span class="device-interval">${intervalDisplay}</span>
              <span class="device-packets">${formatNumber(d.packet_count)} ${t('dashboard.pkts')}</span>
            </div>
            <div class="device-detail-stats">
              <div class="device-signal-group">
                <span class="signal-label">RSSI</span>
                <span class="signal-val ${avgRssiClass}">${d.avg_rssi?.toFixed(0) || '?'}</span>
                <span class="signal-range">${d.min_rssi?.toFixed(0) || '?'}/${d.max_rssi?.toFixed(0) || '?'}</span>
              </div>
              <div class="device-signal-group">
                <span class="signal-label">SNR</span>
                <span class="signal-val ${avgSnrClass}">${d.avg_snr?.toFixed(1) || '?'}</span>
                <span class="signal-range">${d.min_snr?.toFixed(1) || '?'}/${d.max_snr?.toFixed(1) || '?'}</span>
              </div>
              <div class="device-signal-group">
                <span class="signal-label">Loss</span>
                <span class="signal-val ${lossClass}">${lossDisplay}</span>
              </div>
              <span class="device-lastseen">${lastSeen}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // === By Operator Panel ===
    if (operators.length === 0) {
      operatorContainer.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">' + t('common.no_data') + '</div>';
    } else {
      const totalDevices = operators.reduce((sum, op) => sum + op.device_count, 0);
      operatorContainer.innerHTML = operators.map(op => {
        const pct = totalDevices > 0 ? ((op.device_count / totalDevices) * 100).toFixed(0) : 0;
        const opColor = getOperatorColor(op.operator);
        return `
          <div class="breakdown-row">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium" style="color: ${opColor}">${op.operator || t('common.unknown')}</span>
              <span class="text-xs text-gray-400">${op.device_count} ${t('dashboard.dev')}</span>
            </div>
            <div class="breakdown-bar">
              <div class="breakdown-bar-fill" style="width: ${pct}%; background: ${opColor}"></div>
            </div>
            <div class="text-xs text-gray-500 mt-1">${formatNumber(op.packet_count)} ${t('dashboard.pkts')} · ${formatAirtime(op.airtime_ms)}</div>
          </div>
        `;
      }).join('');
    }

    // === Summary Panel (Ownership + Activity) ===
    const myDevices = devices.filter(d => isMyDevice(d.dev_addr));
    const unknownDevices = devices.filter(d => !isMyDevice(d.dev_addr));
    const myPackets = myDevices.reduce((sum, d) => sum + d.packet_count, 0);
    const unknownPackets = unknownDevices.reduce((sum, d) => sum + d.packet_count, 0);
    const totalPackets = myPackets + unknownPackets;

    const highActivity = devices.filter(d => d.packet_count >= 100).length;
    const medActivity = devices.filter(d => d.packet_count >= 10 && d.packet_count < 100).length;
    const lowActivity = devices.filter(d => d.packet_count < 10).length;

    summaryContainer.innerHTML = `
      <div class="summary-section">
        <div class="summary-title">${t('dashboard.ownership')}</div>
        <div class="summary-row">
          <span class="text-blue-400">${t('dashboard.mine')}</span>
          <span class="text-blue-400 font-bold">${myDevices.length}</span>
        </div>
        <div class="summary-row">
          <span class="text-gray-400">${t('common.unknown')}</span>
          <span class="text-gray-400 font-bold">${unknownDevices.length}</span>
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-title">${t('dashboard.activity')}</div>
        <div class="summary-row">
          <span class="text-green-400">${t('dashboard.high_activity')}</span>
          <span class="text-green-400 font-bold">${highActivity}</span>
        </div>
        <div class="summary-row">
          <span class="text-yellow-400">${t('dashboard.med_activity')}</span>
          <span class="text-yellow-400 font-bold">${medActivity}</span>
        </div>
        <div class="summary-row">
          <span class="text-gray-500">${t('dashboard.low_activity')}</span>
          <span class="text-gray-500 font-bold">${lowActivity}</span>
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-title">${t('dashboard.totals')}</div>
        <div class="summary-row">
          <span>${t('dashboard.devices')}</span>
          <span class="font-bold">${devices.length}</span>
        </div>
        <div class="summary-row">
          <span>${t('dashboard.packets')}</span>
          <span class="font-bold">${formatNumber(totalPackets)}</span>
        </div>
      </div>
    `;

  } catch (e) {
    console.error('Device breakdown error:', e);
    deviceListContainer.innerHTML = '<div class="text-red-500 text-sm">' + t('common.failed_to_load') + '</div>';
    operatorContainer.innerHTML = '<div class="text-red-500 text-sm">' + t('common.failed_to_load') + '</div>';
    summaryContainer.innerHTML = '<div class="text-red-500 text-sm">' + t('common.failed_to_load') + '</div>';
  }
}

// Parse UTC timestamp from DB (comes without timezone info)
function parseUTCTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts);
  if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
}

// Helper: format last seen time
function formatLastSeen(timestamp) {
  if (!timestamp) return '?';
  const now = Date.now();
  const then = parseUTCTimestamp(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}


// Helper: format airtime
function formatAirtime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// Recent Joins
async function loadRecentJoins() {
  const container = document.getElementById('recent-joins');
  const params = new URLSearchParams({ hours: selectedHours, limit: 15 });
  if (selectedGateway) params.set('gateway_id', selectedGateway);

  try {
    const data = await api(`/api/joins?${params}`);
    const joins = data.joins || [];

    if (joins.length === 0) {
      container.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">' + t('dashboard.no_join_requests') + '</div>';
      return;
    }

    container.innerHTML = joins.map(j => `
      <div class="join-item">
        <span class="eui">${j.dev_eui.slice(0, 12)}...</span>
        <span class="stats">${formatTime(j.timestamp)}</span>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div class="text-red-500 text-sm">' + t('common.failed_to_load') + '</div>';
  }
}

// Utilities
function formatAirtime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(timestamp) {
  return parseUTCTimestamp(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatPercent(p) {
  if (p === 0) return '0%';
  if (p >= 1) return `${p.toFixed(2)}%`;
  if (p >= 0.01) return `${p.toFixed(3)}%`;
  if (p >= 0.001) return `${p.toFixed(4)}%`;
  return `${p.toFixed(5)}%`;
}

// Device Modal
let deviceSignalChart = null;
let deviceUplinkChart = null;

function openDeviceModal(devAddr) {
  const modal = document.getElementById('device-modal');
  const header = document.getElementById('modal-device-addr');
  const body = document.getElementById('modal-device-body');

  header.textContent = devAddr;
  body.innerHTML = '<div class="text-gray-500 text-center py-8">' + t('common.loading') + '</div>';
  modal.classList.remove('hidden');

  // Fetch all device data
  const gwParam = selectedGateway ? `&gateway_id=${selectedGateway}` : '';
  Promise.all([
    api(`/api/devices/${devAddr}/profile?hours=${selectedHours}${gwParam}`),
    api(`/api/devices/${devAddr}/distributions?hours=${selectedHours}${gwParam}`),
    api(`/api/devices/${devAddr}/signal-trends?hours=${selectedHours}${gwParam}`),
    api(`/api/devices/${devAddr}?hours=${selectedHours}${gwParam}`)
  ]).then(([profileRes, distRes, trendsRes, activityRes]) => {
    const profile = profileRes.profile;
    const dist = distRes.distributions || {};
    const trends = trendsRes.trends || [];
    const activity = activityRes.activity || [];

    if (!profile) {
      body.innerHTML = '<div class="text-gray-500 text-center py-8">' + t('modal.no_data_found') + '</div>';
      return;
    }

    const isOwned = isMyDevice(devAddr);
    const opColor = getOperatorColor(profile.operator);

    // Calculate average interval from trends data (has more points)
    const intervals = [];
    for (let i = 1; i < trends.length; i++) {
      const diff = parseUTCTimestamp(trends[i].timestamp) - parseUTCTimestamp(trends[i-1].timestamp);
      intervals.push(diff / 1000);
    }
    const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
    const recentPackets = activity.slice(-50);

    body.innerHTML = `
      <div class="modal-grid">
        <!-- Left Column: Stats -->
        <div class="modal-stats">
          <div class="modal-stat-card ${isOwned ? 'mine' : ''}">
            <div class="stat-row">
              <span class="stat-label">${t('modal.operator')}</span>
              <span class="font-medium" style="color: ${opColor}">${profile.operator || t('common.unknown')}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.packets')}</span>
              <span class="font-bold">${formatNumber(profile.packet_count)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.total_airtime')}</span>
              <span>${formatAirtime(profile.total_airtime_ms || 0)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.avg_interval')}</span>
              <span>${avgInterval > 0 ? formatInterval(avgInterval) : '—'}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.first_seen')}</span>
              <span class="text-xs">${formatDateTime(profile.first_seen)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.last_seen')}</span>
              <span class="text-xs">${formatDateTime(profile.last_seen)}</span>
            </div>
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">${t('modal.signal_quality')}</div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.avg_rssi')}</span>
              <span class="${profile.avg_rssi > -100 ? 'good' : profile.avg_rssi > -115 ? 'medium' : 'bad'}">${profile.avg_rssi?.toFixed(1) || '?'} dBm</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">${t('modal.avg_snr')}</span>
              <span class="${profile.avg_snr > 5 ? 'good' : profile.avg_snr > 0 ? 'medium' : 'bad'}">${profile.avg_snr?.toFixed(1) || '?'} dB</span>
            </div>
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">${t('modal.spreading_factors')}</div>
            ${(dist.spreadingFactors || []).map(sf => `
              <div class="stat-row">
                <span class="stat-label">SF${sf.spreading_factor}</span>
                <span>${sf.packet_count} (${sf.percentage?.toFixed(0) || 0}%)</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">' + t('common.no_data') + '</div>'}
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">${t('modal.frequencies')}</div>
            ${(dist.frequencies || []).slice(0, 5).map(f => `
              <div class="stat-row">
                <span class="stat-label">${(f.frequency / 1000000).toFixed(1)} MHz</span>
                <span>${f.packet_count} (${f.percentage?.toFixed(0) || 0}%)</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">' + t('common.no_data') + '</div>'}
          </div>
        </div>

        <!-- Right Column: Chart -->
        <div class="modal-chart-area">
          <div class="stat-header">${t('modal.signal_per_uplink')}</div>
          <div class="modal-chart-container">
            <canvas id="device-signal-chart"></canvas>
          </div>

          <div class="stat-header mt-4">${t('modal.uplinks_over_time')}</div>
          <div class="modal-chart-container">
            <canvas id="device-uplink-chart"></canvas>
          </div>

          <div class="stat-header mt-4">${t('modal.recent_activity')}</div>
          <div class="modal-activity-list">
            ${recentPackets.slice(-20).reverse().map(p => `
              <div class="activity-entry">
                <span class="activity-time">${formatDateTime(p.timestamp)}</span>
                <span class="activity-fcnt">f_cnt: ${p.f_cnt ?? '?'}</span>
                <span class="${p.rssi > -100 ? 'good' : p.rssi > -115 ? 'medium' : 'bad'}">${p.rssi} dBm</span>
                <span class="${p.snr > 5 ? 'good' : p.snr > 0 ? 'medium' : 'bad'}">${p.snr?.toFixed(1)} dB</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">' + t('modal.no_recent_activity') + '</div>'}
          </div>
        </div>
      </div>
    `;

    // Create signal trend chart (scatter with lines for individual data points)
    if (trends.length > 0) {
      const ctx = document.getElementById('device-signal-chart').getContext('2d');
      if (deviceSignalChart) deviceSignalChart.destroy();

      // Use time-based x-axis data
      const signalData = trends.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.avg_rssi }));
      const snrData = trends.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.avg_snr }));

      deviceSignalChart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: t('feed.rssi'),
              data: signalData,
              borderColor: '#3b82f6',
              backgroundColor: '#3b82f6',
              pointRadius: 2,
              pointHoverRadius: 4,
              borderWidth: 1,
              tension: 0,
              yAxisID: 'y'
            },
            {
              label: t('feed.snr'),
              data: snrData,
              borderColor: '#22c55e',
              backgroundColor: '#22c55e',
              pointRadius: 2,
              pointHoverRadius: 4,
              borderWidth: 1,
              tension: 0,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: '#9ca3af', boxWidth: 12 } } },
          scales: {
            x: {
              type: 'time',
              time: { displayFormats: { hour: 'HH:mm', minute: 'HH:mm' } },
              ticks: { color: '#6b7280', maxTicksLimit: 8 },
              grid: { color: '#374151' }
            },
            y: {
              type: 'linear',
              position: 'left',
              ticks: { color: '#3b82f6' },
              grid: { color: '#374151' },
              title: { display: true, text: t('chart.rssi_dbm'), color: '#3b82f6' }
            },
            y1: {
              type: 'linear',
              position: 'right',
              ticks: { color: '#22c55e' },
              grid: { drawOnChartArea: false },
              title: { display: true, text: t('chart.snr_db'), color: '#22c55e' }
            }
          }
        }
      });

      // Create uplink bar chart - one bar per packet at actual timestamp
      const uplinkCtx = document.getElementById('device-uplink-chart').getContext('2d');
      if (deviceUplinkChart) deviceUplinkChart.destroy();

      const uplinkData = trends.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: 1 }));

      deviceUplinkChart = new Chart(uplinkCtx, {
        type: 'bar',
        data: {
          datasets: [{
            label: t('feed.uplink'),
            data: uplinkData,
            backgroundColor: '#8b5cf6',
            barThickness: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              type: 'time',
              time: { displayFormats: { hour: 'HH:mm', minute: 'HH:mm' } },
              ticks: { color: '#6b7280', maxTicksLimit: 8 },
              grid: { color: '#374151' }
            },
            y: {
              display: false,
              beginAtZero: true,
              max: 1
            }
          }
        }
      });
    }
  }).catch(e => {
    console.error('Failed to load device details:', e);
    body.innerHTML = '<div class="text-red-500 text-center py-8">' + t('modal.failed_load') + '</div>';
  });
}

function closeDeviceModal() {
  document.getElementById('device-modal').classList.add('hidden');
  if (deviceSignalChart) {
    deviceSignalChart.destroy();
    deviceSignalChart = null;
  }
  if (deviceUplinkChart) {
    deviceUplinkChart.destroy();
    deviceUplinkChart = null;
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return '?';
  const d = parseUTCTimestamp(timestamp);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatInterval(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDeviceModal();
});

// Help Tooltips
function initHelpTooltips() {
  const tooltip = document.getElementById('help-tooltip');
  let activeBtn = null;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-btn');
    if (btn) {
      e.stopPropagation();
      if (activeBtn === btn) {
        tooltip.classList.add('hidden');
        activeBtn = null;
        return;
      }
      const key = btn.dataset.help;
      tooltip.textContent = t(key);
      tooltip.classList.remove('hidden');
      activeBtn = btn;

      // Position near the button
      const rect = btn.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;

      // Keep within viewport
      if (left + 340 > window.innerWidth) left = window.innerWidth - 350;
      if (left < 10) left = 10;
      if (top + 120 > window.innerHeight) top = rect.top - 6 - tooltip.offsetHeight;

      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    } else if (!e.target.closest('.help-tooltip')) {
      tooltip.classList.add('hidden');
      activeBtn = null;
    }
  });
}

// Update chart labels when language changes
window.addEventListener('langchange', function() {
  // Update Traffic chart dataset labels (keep operator names as-is)
  if (trafficChart && trafficChart.data.datasets.length > 0) {
    trafficChart.update('none');
  }

  // Update Channel chart
  if (channelChart && channelChart.data.datasets.length > 0) {
    channelChart.data.datasets[0].label = t('chart.packets');
    channelChart.update('none');
  }

  // Update SF chart
  if (sfChart && sfChart.data.datasets.length > 0) {
    sfChart.data.datasets[0].label = t('chart.packets');
    sfChart.update('none');
  }

  // Update modal charts if they exist
  if (deviceSignalChart) {
    deviceSignalChart.data.datasets[0].label = t('feed.rssi');
    deviceSignalChart.data.datasets[1].label = t('feed.snr');
    deviceSignalChart.options.scales.y.title.text = t('chart.rssi_dbm');
    deviceSignalChart.options.scales.y1.title.text = t('chart.snr_db');
    deviceSignalChart.update('none');
  }

  if (deviceUplinkChart) {
    deviceUplinkChart.data.datasets[0].label = t('feed.uplink');
    deviceUplinkChart.update('none');
  }

  // Re-render all dynamic content
  loadDeviceBreakdown();
  loadRecentJoins();
});
