// Get base path from current URL
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, '');

// State
let selectedGateway = null;
let selectedHours = 24;
let gateways = [];
let filter = { showOwned: true, showForeign: true, prefixes: [] };
let operatorColors = {};
let deviceSearchText = '';
let rssiFilterMin = -200;
let rssiFilterMax = 0;

// --- URL state ---
function readUrlState() {
  const p = new URLSearchParams(location.search);
  selectedGateway = p.get('gw') || null;
  selectedHours   = parseInt(p.get('hours') || '24', 10) || 24;
  filter.showOwned   = p.get('owned')   !== '0';
  filter.showForeign = p.get('foreign') !== '0';
  return {
    rssiMin: p.get('rssi_min'),
    rssiMax: p.get('rssi_max'),
    search:  p.get('search') || '',
  };
}

function pushUrlState() {
  const p = new URLSearchParams();
  if (selectedGateway) p.set('gw', selectedGateway);
  if (selectedHours !== 24) p.set('hours', selectedHours);
  if (!filter.showOwned)   p.set('owned',   '0');
  if (!filter.showForeign) p.set('foreign', '0');
  const rssiLo = parseInt(document.getElementById('rssi-min')?.value, 10);
  const rssiHi = parseInt(document.getElementById('rssi-max')?.value, 10);
  if (rssiLo > -140) p.set('rssi_min', rssiLo);
  if (rssiHi < -30)  p.set('rssi_max', rssiHi);
  const searchVal = document.getElementById('device-search')?.value?.trim();
  if (searchVal) p.set('search', searchVal);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  updateNavLinks();
}

// Keep all URL params in sync on nav links so cross-page navigation preserves state
function updateNavLinks() {
  const p = new URLSearchParams();
  if (selectedGateway) p.set('gw', selectedGateway);
  if (selectedHours !== 24) p.set('hours', selectedHours);
  if (!filter.showOwned)   p.set('owned',   '0');
  if (!filter.showForeign) p.set('foreign', '0');
  const rssiLo = parseInt(document.getElementById('rssi-min')?.value, 10);
  const rssiHi = parseInt(document.getElementById('rssi-max')?.value, 10);
  if (rssiLo > -140) p.set('rssi_min', rssiLo);
  if (rssiHi < -30)  p.set('rssi_max', rssiHi);
  const searchVal = document.getElementById('device-search')?.value?.trim();
  if (searchVal) p.set('search', searchVal);
  const qs = p.toString();
  document.querySelectorAll('nav a').forEach(a => {
    const base = a.href.split('?')[0];
    a.href = qs ? `${base}?${qs}` : base;
  });
}

// Charts
let trafficChart = null;
let operatorChart = null;
let channelChart = null;
let sfChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const { rssiMin: initRssiMin, rssiMax: initRssiMax, search: initSearch } = readUrlState();

  // Apply URL state to UI before loading data
  document.getElementById('toggle-owned').classList.toggle('active', filter.showOwned);
  document.getElementById('toggle-foreign').classList.toggle('active', filter.showForeign);

  // Apply time range to UI
  document.querySelectorAll('.time-btn').forEach(btn => {
    const hours = parseInt(btn.dataset.hours, 10);
    btn.classList.toggle('active', hours === selectedHours);
  });

  await Promise.all([loadMyDevicesConfig(), loadOperatorColors()]);
  initGatewayMap();
  loadGateways();
  loadAllData();
  initCharts();

  // Time range buttons
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedHours = parseInt(btn.dataset.hours, 10);
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pushUrlState();
      loadAllData();
    });
  });

  // Filter toggles
  document.getElementById('toggle-owned').addEventListener('click', (e) => {
    filter.showOwned = !filter.showOwned;
    e.target.classList.toggle('active', filter.showOwned);
    pushUrlState();
    loadAllData();
  });

  document.getElementById('toggle-foreign').addEventListener('click', (e) => {
    filter.showForeign = !filter.showForeign;
    e.target.classList.toggle('active', filter.showForeign);
    pushUrlState();
    loadAllData();
  });

  // Device search
  const deviceSearchEl = document.getElementById('device-search');
  if (initSearch) { deviceSearchEl.value = initSearch; deviceSearchText = initSearch.toLowerCase(); }
  deviceSearchEl.addEventListener('input', (e) => {
    deviceSearchText = e.target.value.toLowerCase();
    renderGatewayTabs();
    pushUrlState();
    loadDeviceBreakdown();
  });

  // RSSI range slider
  const rssiMinEl = document.getElementById('rssi-min');
  const rssiMaxEl = document.getElementById('rssi-max');
  const rssiRangeLabel = document.getElementById('rssi-range-label');

  if (initRssiMin) { rssiMinEl.value = initRssiMin; rssiFilterMin = parseInt(initRssiMin, 10); }
  if (initRssiMax) { rssiMaxEl.value = initRssiMax; rssiFilterMax = parseInt(initRssiMax, 10); }

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

  updateRssiLabel();

  rssiMinEl.addEventListener('input', () => {
    if (parseInt(rssiMinEl.value, 10) > parseInt(rssiMaxEl.value, 10)) {
      rssiMinEl.value = rssiMaxEl.value;
    }
    rssiFilterMin = parseInt(rssiMinEl.value, 10);
    updateRssiLabel();
  });
  rssiMaxEl.addEventListener('input', () => {
    if (parseInt(rssiMaxEl.value, 10) < parseInt(rssiMinEl.value, 10)) {
      rssiMaxEl.value = rssiMinEl.value;
    }
    rssiFilterMax = parseInt(rssiMaxEl.value, 10);
    updateRssiLabel();
  });
  rssiMinEl.addEventListener('change', () => { pushUrlState(); loadDeviceBreakdown(); });
  rssiMaxEl.addEventListener('change', () => { pushUrlState(); loadDeviceBreakdown(); });

  initGatewayTabs(gwId => selectGateway(gwId));

  // Reset all filters
  document.getElementById('reset-filters').addEventListener('click', () => {
    selectedGateway = null;
    selectedHours = 24;
    filter.showOwned = true;
    filter.showForeign = true;
    deviceSearchText = '';
    document.getElementById('device-search').value = '';
    document.getElementById('rssi-min').value = -140;
    document.getElementById('rssi-max').value = -30;
    rssiFilterMin = -200;
    rssiFilterMax = 0;
    updateRssiLabel();
    document.getElementById('toggle-owned').classList.add('active');
    document.getElementById('toggle-foreign').classList.add('active');
    document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.hours, 10) === 24));
    selectGateway(null);
    pushUrlState();
    loadAllData();
  });

  // Auto-refresh every 30 seconds
  setInterval(loadAllData, 30000);

  updateNavLinks();
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

function getOperatorColor(operator) {
  if (operatorColors[operator]) return operatorColors[operator];
  return operator === 'Unknown' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.85)';
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

// Gateway Management
async function loadGateways() {
  const data = await api('/api/gateways');
  gateways = data.gateways || [];
  renderGatewayTabs();
  updateGatewayInfoPanel();

  // Update map based on selection
  if (!selectedGateway) {
    updateGatewayMap(gateways);
  } else {
    const selected = gateways.find(g => g.gateway_id === selectedGateway);
    updateGatewayMap(selected ? [selected] : []);
  }
}

function renderGatewayTabs() {
  buildGatewayTabs(gateways, selectedGateway, 'device-search');
}

function updateGatewayInfoPanel() {
  const panel = document.getElementById('gateway-info-panel');
  if (!panel) return;

  if (selectedGateway) {
    const gw = gateways.find(g => g.gateway_id === selectedGateway);
    if (gw) {
      document.getElementById('gateway-info-name').textContent = gw.name || 'Unnamed';
      document.getElementById('gateway-info-alias').textContent = gw.alias || '—';
      document.getElementById('gateway-info-group').textContent = gw.group_name || '—';
      document.getElementById('gateway-info-id').textContent = gw.gateway_id;
      panel.classList.remove('hidden');
      return;
    }
  }
  panel.classList.add('hidden');
}

function selectGateway(gatewayId) {
  selectedGateway = gatewayId;
  pushUrlState();
  renderGatewayTabs();
  updateGatewayInfoPanel();

  // Update map based on selection
  if (!gatewayId) {
    updateGatewayMap(gateways);
  } else {
    const selected = gateways.find(g => g.gateway_id === gatewayId);
    updateGatewayMap(selected ? [selected] : []);
  }

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
      radius: '70%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#9ca3af',
            boxWidth: 12,
            padding: 4,
            font: { size: 12 }
          }
        }
      }
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

  const datasets = Object.entries(groups).map(([name, pts]) => {
    const pointMap = new Map(pts.map(p => [p.timestamp, p.value]));
    const color = getOperatorColor(name);
    const bgColor = color.startsWith('rgba') ? color.replace(/[\d.]+\)$/, '0.15)') : color + '33';
    return {
      label: name,
      data: allTimestamps.map(t => pointMap.get(t) || 0),
      borderColor: color,
      backgroundColor: bgColor,
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

  const total = operators.reduce((sum, o) => sum + o.packet_count, 0);

  operatorChart.data.labels = operators.map(o => {
    const pct = total > 0 ? ((o.packet_count / total) * 100).toFixed(1) : 0;
    return `${o.operator} ${pct}%`;
  });
  operatorChart.data.datasets = [{
    data: operators.map(o => o.packet_count),
    backgroundColor: operators.map(o => getOperatorColor(o.operator)),
    borderWidth: 0
  }];
  operatorChart.update('none');
}

async function loadChannelChart() {
  if (!selectedGateway) {
    channelChart.data.labels = [];
    channelChart.data.datasets = [];
    channelChart.update('none');
    return;
  }

  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  const data = await api(`/api/spectrum/${selectedGateway}/channels?${params}`);
  const channels = data.channels || [];

  channelChart.data.labels = channels.map(c => (c.frequency / 1000000).toFixed(1));
  channelChart.data.datasets = [{
    label: 'Packets',
    data: channels.map(c => c.packet_count),
    backgroundColor: channels.map(c =>
      c.usage_percent > 30 ? '#ef4444' : c.usage_percent > 15 ? '#eab308' : '#22c55e'
    ),
    borderRadius: 4
  }];
  channelChart.update('none');
}

async function loadSFChart() {
  if (!selectedGateway) {
    sfChart.data.labels = [];
    sfChart.data.datasets = [];
    sfChart.update('none');
    return;
  }

  const filterParams = getFilterParams();
  const params = new URLSearchParams({ hours: selectedHours, ...filterParams });
  const data = await api(`/api/spectrum/${selectedGateway}/spreading-factors?${params}`);
  const sfs = data.spreadingFactors || [];

  sfChart.data.labels = sfs.map(s => `SF${s.spreading_factor}`);
  sfChart.data.datasets = [{
    label: 'Packets',
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
        const searchable = [d.dev_addr, d.operator].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(deviceSearchText);
      });
    }

    // === Device List Panel ===
    if (devices.length === 0) {
      deviceListContainer.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">No devices</div>';
    } else {
      // Sort by packet count descending
      const sortedDevices = [...devices].sort((a, b) => b.packet_count - a.packet_count);
      deviceListContainer.innerHTML = sortedDevices.map(d => {
        const isOwned = isMyDevice(d.dev_addr);
        const opColor = getOperatorColor(d.operator);
        const avgRssiClass = d.avg_rssi > -100 ? 'good' : d.avg_rssi > -115 ? 'medium' : 'bad';
        const avgSnrClass = d.avg_snr > 5 ? 'good' : d.avg_snr > 0 ? 'medium' : 'bad';
        const lossClass = d.loss_percent < 1 ? 'good' : d.loss_percent < 5 ? 'medium' : 'bad';
        const lastSeen = formatLastSeen(d.last_seen);
        const sfDisplay = d.min_sf === d.max_sf ? `SF${d.min_sf}` : `SF${d.min_sf}-${d.max_sf}`;
        const intervalDisplay = d.avg_interval_s > 0 ? formatInterval(d.avg_interval_s) : '—';
        const lossDisplay = d.loss_percent > 0 ? `${d.loss_percent.toFixed(1)}%` : '0%';
        return `
          <div class="device-detail-item ${isOwned ? 'mine' : ''}" onclick="window.location.href='device.html?' + new URLSearchParams({...Object.fromEntries(new URLSearchParams(location.search)), addr: '${d.dev_addr}'}).toString()">
            <div class="device-detail-main">
              <span class="device-addr ${isOwned ? 'text-blue-400' : ''}">${d.dev_addr}</span>
              <span class="device-operator" style="color: ${opColor}">${d.operator || '?'}</span>
              <span class="device-sf">${sfDisplay}</span>
              <span class="device-interval">${intervalDisplay}</span>
              <span class="device-packets">${formatNumber(d.packet_count)} pkts</span>
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
      operatorContainer.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">No data</div>';
    } else {
      const totalDevices = operators.reduce((sum, op) => sum + op.device_count, 0);
      operatorContainer.innerHTML = operators.map(op => {
        const pct = totalDevices > 0 ? ((op.device_count / totalDevices) * 100).toFixed(0) : 0;
        const opColor = getOperatorColor(op.operator);
        return `
          <div class="breakdown-row">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium" style="color: ${opColor}">${op.operator || 'Unknown'}</span>
              <span class="text-xs text-gray-400">${op.device_count} dev</span>
            </div>
            <div class="breakdown-bar">
              <div class="breakdown-bar-fill" style="width: ${pct}%; background: ${opColor}"></div>
            </div>
            <div class="text-xs text-gray-500 mt-1">${formatNumber(op.packet_count)} pkts · ${formatAirtime(op.airtime_ms)}</div>
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
        <div class="summary-title">Ownership</div>
        <div class="summary-row">
          <span class="text-blue-400">Mine</span>
          <span class="text-blue-400 font-bold">${myDevices.length}</span>
        </div>
        <div class="summary-row">
          <span class="text-gray-400">Unknown</span>
          <span class="text-gray-400 font-bold">${unknownDevices.length}</span>
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-title">Activity</div>
        <div class="summary-row">
          <span class="text-green-400">High (100+)</span>
          <span class="text-green-400 font-bold">${highActivity}</span>
        </div>
        <div class="summary-row">
          <span class="text-yellow-400">Med (10-99)</span>
          <span class="text-yellow-400 font-bold">${medActivity}</span>
        </div>
        <div class="summary-row">
          <span class="text-gray-500">Low (&lt;10)</span>
          <span class="text-gray-500 font-bold">${lowActivity}</span>
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-title">Totals</div>
        <div class="summary-row">
          <span>Devices</span>
          <span class="font-bold">${devices.length}</span>
        </div>
        <div class="summary-row">
          <span>Packets</span>
          <span class="font-bold">${formatNumber(totalPackets)}</span>
        </div>
      </div>
    `;

  } catch (e) {
    console.error('Device breakdown error:', e);
    deviceListContainer.innerHTML = '<div class="text-red-500 text-sm">Failed to load</div>';
    operatorContainer.innerHTML = '<div class="text-red-500 text-sm">Failed to load</div>';
    summaryContainer.innerHTML = '<div class="text-red-500 text-sm">Failed to load</div>';
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
      container.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">No join requests</div>';
      return;
    }

    container.innerHTML = joins.map(j => `
      <div class="join-item">
        <span class="eui">${j.dev_eui.slice(0, 12)}...</span>
        <span class="stats">${formatTime(j.timestamp)}</span>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div class="text-red-500 text-sm">Failed to load</div>';
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
  body.innerHTML = '<div class="text-gray-500 text-center py-8">Loading...</div>';
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
      body.innerHTML = '<div class="text-gray-500 text-center py-8">No data found</div>';
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
              <span class="stat-label">Operator</span>
              <span class="font-medium" style="color: ${opColor}">${profile.operator || 'Unknown'}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Packets</span>
              <span class="font-bold">${formatNumber(profile.packet_count)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Airtime</span>
              <span>${formatAirtime(profile.total_airtime_ms || 0)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Avg Interval</span>
              <span>${avgInterval > 0 ? formatInterval(avgInterval) : '—'}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">First Seen</span>
              <span class="text-xs">${formatDateTime(profile.first_seen)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Last Seen</span>
              <span class="text-xs">${formatDateTime(profile.last_seen)}</span>
            </div>
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">Signal Quality</div>
            <div class="stat-row">
              <span class="stat-label">Avg RSSI</span>
              <span class="${profile.avg_rssi > -100 ? 'good' : profile.avg_rssi > -115 ? 'medium' : 'bad'}">${profile.avg_rssi?.toFixed(1) || '?'} dBm</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Avg SNR</span>
              <span class="${profile.avg_snr > 5 ? 'good' : profile.avg_snr > 0 ? 'medium' : 'bad'}">${profile.avg_snr?.toFixed(1) || '?'} dB</span>
            </div>
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">Spreading Factors</div>
            ${(dist.spreadingFactors || []).map(sf => `
              <div class="stat-row">
                <span class="stat-label">SF${sf.spreading_factor}</span>
                <span>${sf.packet_count} (${sf.percentage?.toFixed(0) || 0}%)</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">No data</div>'}
          </div>

          <div class="modal-stat-card">
            <div class="stat-header">Frequencies</div>
            ${(dist.frequencies || []).slice(0, 5).map(f => `
              <div class="stat-row">
                <span class="stat-label">${(f.frequency / 1000000).toFixed(1)} MHz</span>
                <span>${f.packet_count} (${f.percentage?.toFixed(0) || 0}%)</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">No data</div>'}
          </div>
        </div>

        <!-- Right Column: Chart -->
        <div class="modal-chart-area">
          <div class="stat-header">Signal (per uplink)</div>
          <div class="modal-chart-container">
            <canvas id="device-signal-chart"></canvas>
          </div>

          <div class="stat-header mt-4">Uplinks over Time</div>
          <div class="modal-chart-container">
            <canvas id="device-uplink-chart"></canvas>
          </div>

          <div class="stat-header mt-4">Recent Activity</div>
          <div class="modal-activity-list">
            ${recentPackets.slice(-20).reverse().map(p => `
              <div class="activity-entry">
                <span class="activity-time">${formatDateTime(p.timestamp)}</span>
                <span class="activity-fcnt">f_cnt: ${p.f_cnt ?? '?'}</span>
                <span class="${p.rssi > -100 ? 'good' : p.rssi > -115 ? 'medium' : 'bad'}">${p.rssi} dBm</span>
                <span class="${p.snr > 5 ? 'good' : p.snr > 0 ? 'medium' : 'bad'}">${p.snr?.toFixed(1)} dB</span>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">No recent activity</div>'}
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
              label: 'RSSI',
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
              label: 'SNR',
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
              title: { display: true, text: 'RSSI (dBm)', color: '#3b82f6' }
            },
            y1: {
              type: 'linear',
              position: 'right',
              ticks: { color: '#22c55e' },
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'SNR (dB)', color: '#22c55e' }
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
            label: 'Uplink',
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
    body.innerHTML = '<div class="text-red-500 text-center py-8">Failed to load device data</div>';
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
