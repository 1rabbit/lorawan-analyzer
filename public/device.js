// Get base path and device address from URL
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, '');
const params = new URLSearchParams(window.location.search);
const devAddr = params.get('addr');
const gatewayId = params.get('gateway') || null;

let selectedHours = parseInt(params.get('hours'), 10) || parseInt(localStorage.getItem('lorawanSelectedHours'), 10) || 24;
let filter = { prefixes: [] };
let operatorColors = {};

// Charts
let rssiChart = null;
let snrChart = null;
let sfChart = null;
let freqChart = null;
let gatewayChart = null;
let fcntChart = null;
let lossChart = null;
let intervalChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!devAddr) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error').textContent = t('device.no_addr');
    return;
  }

  document.getElementById('device-addr').textContent = devAddr;
  document.title = `${devAddr} - LoRaWAN Analyzer`;

  await Promise.all([loadMyDevicesConfig(), loadOperatorColors()]);

  // Init shared packet feed for recent packets section
  initPacketFeed('packets-container', {
    showGateway: true,
    showAddr: false,
    showOperator: false,
    clickable: false,
    hideTypes: ['join'],
    storagePrefix: 'device_',
    isMyDevice,
    getOperatorStyle: (operator) => {
      const color = operatorColors[operator];
      return color ? `style="color: ${color}"` : 'class="op-unknown"';
    },
  });

  loadDeviceData();
  initHelpTooltips();

  // Time range buttons - sync active state with selectedHours
  document.querySelectorAll('.time-btn').forEach(btn => {
    const hours = parseInt(btn.dataset.hours, 10);
    btn.classList.toggle('active', hours === selectedHours);
    btn.addEventListener('click', () => {
      selectedHours = hours;
      localStorage.setItem('lorawanSelectedHours', selectedHours.toString());
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadDeviceData();
    });
  });
});

// API Helper
async function api(path) {
  const res = await fetch(BASE_PATH + path);
  return res.json();
}

// Load my devices config
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
  return operatorColors[operator] || 'rgba(255, 255, 255, 0.4)';
}

function isMyDevice(addr) {
  if (!addr || filter.prefixes.length === 0) return false;
  const addrNum = parseInt(addr.replace(/[^0-9A-Fa-f]/g, ''), 16);
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

// Parse UTC timestamp from DB (comes without timezone info)
function parseUTCTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts);
  if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
}


// Load all device data
async function loadDeviceData() {
  const gwParam = gatewayId ? `&gateway_id=${gatewayId}` : '';

  try {
    const [profileRes, distRes, trendsRes, activityRes, fcntRes, intervalsRes, lossRes] = await Promise.all([
      api(`/api/devices/${devAddr}/profile?hours=${selectedHours}${gwParam}`),
      api(`/api/devices/${devAddr}/distributions?hours=${selectedHours}${gwParam}`),
      api(`/api/devices/${devAddr}/signal-trends?hours=${selectedHours}${gwParam}`),
      api(`/api/devices/${devAddr}?hours=${selectedHours}${gwParam}`),
      api(`/api/devices/${devAddr}/fcnt-timeline?hours=${selectedHours}`),
      api(`/api/devices/${devAddr}/intervals?hours=${selectedHours}`),
      api(`/api/devices/${devAddr}/packet-loss?hours=${selectedHours}${gwParam}`)
    ]);

    const profile = profileRes.profile;
    const lastPayload = profileRes.last_payload;
    if (!profile) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('error').classList.remove('hidden');
      return;
    }

    const dist = distRes.distributions || {};
    const trends = trendsRes.trends || [];
    const activity = activityRes.activity || [];
    const fcntTimeline = fcntRes.timeline || [];
    const intervals = intervalsRes.intervals || [];
    const loss = lossRes.loss || { total_received: 0, total_missed: 0, loss_percent: 0, per_gateway: [] };

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');

    // Update header
    const isOwned = isMyDevice(devAddr);
    const opEl = document.getElementById('device-operator');
    opEl.textContent = profile.operator || t('common.unknown');
    opEl.className = 'text-sm px-2 py-0.5 rounded';
    opEl.style.color = getOperatorColor(profile.operator);
    document.getElementById('device-ownership').textContent = isOwned ? t('device.my_device') : '';

    // Display device metadata if available
    if (profile.device_name) {
      document.getElementById('device-name').textContent = profile.device_name;
    }
    if (profile.dev_eui) {
      document.getElementById('device-deveui').textContent = profile.dev_eui;
    }
    if (profile.application_name) {
      document.getElementById('device-app').textContent = profile.application_name;
    }
    if (profile.device_profile_name) {
      document.getElementById('device-profile-type').textContent = profile.device_profile_name;
    }

    // Display last frame if available
    if (lastPayload) {
      const section = document.getElementById('last-frame-section');
      section.classList.remove('hidden');
      document.getElementById('lf-fcnt').textContent = lastPayload.f_cnt ?? '-';
      document.getElementById('lf-fport').textContent = lastPayload.f_port ?? '-';
      document.getElementById('lf-time').textContent = lastPayload.timestamp ? formatDateTime(lastPayload.timestamp) : '-';

      // Convert base64 to hex
      if (lastPayload.raw_base64) {
        try {
          const raw = atob(lastPayload.raw_base64);
          const hex = Array.from(raw, c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
          document.getElementById('lf-raw').textContent = hex;
        } catch {
          document.getElementById('lf-raw').textContent = lastPayload.raw_base64;
        }
      }

      // Show decoded JSON if available
      if (lastPayload.decoded && Object.keys(lastPayload.decoded).length > 0) {
        document.getElementById('lf-decoded-section').classList.remove('hidden');
        document.getElementById('lf-decoded').textContent = JSON.stringify(lastPayload.decoded, null, 2);
      }
    }

    // Calculate stats - use fcnt timeline for accurate interval (accounts for lost packets)
    const avgInterval = calculateAvgIntervalFromFCnt(fcntTimeline);
    const uniqueGateways = [...new Set(activity.map(p => p.gateway_id))];

    // Update stats
    document.getElementById('stat-packets').textContent = formatNumber(profile.packet_count);
    document.getElementById('stat-airtime').textContent = formatAirtime(profile.total_airtime_ms || 0);

    // Calculate duty cycle: airtime / time window
    const timeWindowMs = selectedHours * 3600 * 1000;
    const dutyCyclePercent = timeWindowMs > 0 ? ((profile.total_airtime_ms || 0) / timeWindowMs) * 100 : 0;
    const dutyClass = dutyCyclePercent >= 1 ? 'duty-high' : dutyCyclePercent >= 0.1 ? 'duty-medium' : 'duty-low';
    document.getElementById('stat-duty').innerHTML = `<span class="${dutyClass}">${formatPercent(dutyCyclePercent)}</span>`;

    document.getElementById('stat-interval').textContent = avgInterval > 0 ? formatInterval(avgInterval) : '-';

    const rssiEl = document.getElementById('stat-rssi');
    rssiEl.textContent = `${profile.avg_rssi?.toFixed(1) || '?'}`;
    rssiEl.className = `value ${profile.avg_rssi > -100 ? 'good' : profile.avg_rssi > -115 ? 'medium' : 'bad'}`;

    const snrEl = document.getElementById('stat-snr');
    snrEl.textContent = `${profile.avg_snr?.toFixed(1) || '?'}`;
    snrEl.className = `value ${profile.avg_snr > 5 ? 'good' : profile.avg_snr > 0 ? 'medium' : 'bad'}`;

    document.getElementById('stat-first').textContent = formatDateTime(profile.first_seen);
    document.getElementById('stat-last').textContent = formatDateTime(profile.last_seen);
    document.getElementById('stat-gateways').textContent = uniqueGateways.length;

    // Render charts
    renderRSSIChart(trends);
    renderSNRChart(trends);
    renderSFChart(dist.sf || []);
    renderFreqChart(dist.frequency || []);
    renderGatewayChart(activity, loss.per_gateway);
    renderFCntChart(fcntTimeline);
    renderLossChart(fcntTimeline);
    renderIntervalChart(intervals);
    loadRecentPacketsForDevice();

    // Packet loss stats
    document.getElementById('stat-loss').textContent = `${loss.loss_percent.toFixed(1)}%`;
    document.getElementById('stat-loss').className = `value ${loss.loss_percent < 1 ? 'good' : loss.loss_percent < 5 ? 'medium' : 'bad'}`;
    document.getElementById('stat-missed').textContent = formatNumber(loss.total_missed);

  } catch (e) {
    console.error('Failed to load device data:', e);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('error').textContent = t('device.failed_load');
  }
}

function calculateAvgIntervalFromFCnt(fcntTimeline) {
  // Filter to only entries with valid f_cnt
  const valid = fcntTimeline.filter(t => t.f_cnt !== null && t.f_cnt !== undefined);
  if (valid.length < 2) return 0;

  // Sort by timestamp
  valid.sort((a, b) => parseUTCTimestamp(a.timestamp) - parseUTCTimestamp(b.timestamp));

  const first = valid[0];
  const last = valid[valid.length - 1];

  const timeDiffMs = parseUTCTimestamp(last.timestamp) - parseUTCTimestamp(first.timestamp);
  const fcntDiff = last.f_cnt - first.f_cnt;

  // fcntDiff represents total packets sent (including lost ones)
  if (fcntDiff <= 0) return 0;

  return (timeDiffMs / 1000) / fcntDiff;
}

// Chart rendering functions
function renderRSSIChart(trends) {
  const ctx = document.getElementById('rssi-chart').getContext('2d');
  if (rssiChart) rssiChart.destroy();

  const data = trends.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.avg_rssi }));

  rssiChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'RSSI (dBm)',
        data: data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 1,
        tension: 0,
        fill: true
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
          ticks: { color: '#3b82f6' },
          grid: { color: '#374151' },
          title: { display: true, text: 'dBm', color: '#3b82f6' }
        }
      }
    }
  });
}

function renderSNRChart(trends) {
  const ctx = document.getElementById('snr-chart').getContext('2d');
  if (snrChart) snrChart.destroy();

  const data = trends.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.avg_snr }));

  snrChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'SNR (dB)',
        data: data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 1,
        tension: 0,
        fill: true
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
          ticks: { color: '#22c55e' },
          grid: { color: '#374151' },
          title: { display: true, text: 'dB', color: '#22c55e' }
        }
      }
    }
  });
}

function renderSFChart(sfData) {
  const ctx = document.getElementById('sf-chart').getContext('2d');
  if (sfChart) sfChart.destroy();

  sfChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sfData.map(s => `SF${s.value}`),
      datasets: [{
        label: 'Packets',
        data: sfData.map(s => s.count),
        backgroundColor: sfData.map(s => {
          const sf = s.value;
          if (sf <= 7) return '#22c55e';
          if (sf === 8) return '#84cc16';
          if (sf === 9) return '#eab308';
          if (sf === 10) return '#f97316';
          if (sf === 11) return '#ef4444';
          return '#dc2626';
        }),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280' }, grid: { color: '#374151' } },
        y: { ticks: { color: '#6b7280' }, grid: { color: '#374151' }, beginAtZero: true }
      }
    }
  });
}

function renderFreqChart(freqData) {
  const ctx = document.getElementById('freq-chart').getContext('2d');
  if (freqChart) freqChart.destroy();

  // Color by usage - calculate percentages
  const total = freqData.reduce((sum, f) => sum + f.count, 0);

  freqChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: freqData.map(f => `${(f.value / 1000000).toFixed(1)}`),
      datasets: [{
        label: 'Packets',
        data: freqData.map(f => f.count),
        backgroundColor: freqData.map(f => {
          const pct = total > 0 ? (f.count / total) * 100 : 0;
          return pct > 30 ? '#ef4444' : pct > 15 ? '#eab308' : '#22c55e';
        }),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280' }, grid: { color: '#374151' } },
        y: { ticks: { color: '#6b7280' }, grid: { color: '#374151' }, beginAtZero: true }
      }
    }
  });
}

function renderGatewayChart(activity, perGatewayLoss) {
  const ctx = document.getElementById('gateway-chart').getContext('2d');
  if (gatewayChart) gatewayChart.destroy();

  // Count packets per gateway
  const gwCounts = {};
  activity.forEach(p => {
    gwCounts[p.gateway_id] = (gwCounts[p.gateway_id] || 0) + 1;
  });

  // Create loss lookup
  const lossMap = {};
  (perGatewayLoss || []).forEach(g => {
    lossMap[g.gateway_id] = g;
  });

  const sorted = Object.entries(gwCounts).sort((a, b) => b[1] - a[1]);
  const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#eab308', '#ef4444', '#14b8a6', '#6b7280'];

  gatewayChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(([gw]) => gw),
      datasets: [{
        data: sorted.map(([, count]) => count),
        backgroundColor: colors.slice(0, sorted.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 12 } } }
    }
  });

  // Stats breakdown with packet loss
  const total = activity.length;
  document.getElementById('gateway-stats').innerHTML = sorted.slice(0, 5).map(([gw, count], i) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    const gwLoss = lossMap[gw];
    const lossStr = gwLoss ? `, loss ${gwLoss.loss_percent.toFixed(1)}%` : '';
    const lossClass = gwLoss && gwLoss.loss_percent >= 5 ? 'bad' : gwLoss && gwLoss.loss_percent >= 1 ? 'medium' : '';
    return `<div class="flex justify-between text-xs">
      <span style="color: ${colors[i]}" class="truncate max-w-[100px]" title="${gw}">${gw}</span>
      <span class="text-white/50">${count} (${pct}%)<span class="${lossClass}">${lossStr}</span></span>
    </div>`;
  }).join('');
}

function renderFCntChart(timeline) {
  const ctx = document.getElementById('fcnt-chart').getContext('2d');
  if (fcntChart) fcntChart.destroy();

  const data = timeline.map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.f_cnt }));
  const gaps = timeline.filter(t => t.gap).map(t => ({ x: parseUTCTimestamp(t.timestamp), y: t.f_cnt }));

  fcntChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'FCnt',
          data: data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          pointRadius: 1,
          borderWidth: 1,
          tension: 0,
          fill: true
        },
        {
          label: 'Gaps',
          data: gaps,
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          pointRadius: 5,
          pointStyle: 'triangle',
          showLine: false
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
          ticks: { color: '#6b7280' },
          grid: { color: '#374151' },
          title: { display: true, text: 'Frame Counter', color: '#9ca3af' }
        }
      }
    }
  });
}

function renderLossChart(timeline) {
  const ctx = document.getElementById('loss-chart').getContext('2d');
  if (lossChart) lossChart.destroy();

  // Calculate missed packets per time bucket (hourly)
  const buckets = {};
  for (let i = 1; i < timeline.length; i++) {
    const curr = timeline[i];
    const prev = timeline[i - 1];
    if (curr.f_cnt !== null && prev.f_cnt !== null && curr.f_cnt > prev.f_cnt) {
      const missed = curr.f_cnt - prev.f_cnt - 1;
      if (missed > 0) {
        const d = parseUTCTimestamp(curr.timestamp);
        d.setMinutes(0, 0, 0);
        const key = d.toISOString();
        buckets[key] = (buckets[key] || 0) + missed;
      }
    }
  }

  // Also add zeros for hours with no loss to show complete timeline
  if (timeline.length > 0) {
    const start = parseUTCTimestamp(timeline[0].timestamp);
    const end = parseUTCTimestamp(timeline[timeline.length - 1].timestamp);
    start.setMinutes(0, 0, 0);
    end.setMinutes(0, 0, 0);
    for (let t = start.getTime(); t <= end.getTime(); t += 3600000) {
      const key = new Date(t).toISOString();
      if (!(key in buckets)) buckets[key] = 0;
    }
  }

  const sortedKeys = Object.keys(buckets).sort();
  const lossData = sortedKeys.map(k => ({ x: new Date(k), y: buckets[k] }));

  lossChart = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [{
        label: 'Missed Packets',
        data: lossData,
        backgroundColor: lossData.map(d => d.y > 10 ? '#ef4444' : d.y > 0 ? '#fbbf24' : '#22c55e'),
        borderRadius: 2
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
          time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
          ticks: { color: '#6b7280', maxTicksLimit: 8 },
          grid: { color: '#374151' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6b7280' },
          grid: { color: '#374151' },
          title: { display: true, text: 'Missed', color: '#9ca3af' }
        }
      }
    }
  });
}

function renderIntervalChart(intervals) {
  const ctx = document.getElementById('interval-chart').getContext('2d');
  if (intervalChart) intervalChart.destroy();

  // Group into buckets
  const buckets = {};
  intervals.forEach(i => {
    const bucket = i.interval_seconds;
    buckets[bucket] = (buckets[bucket] || 0) + i.count;
  });

  const sorted = Object.entries(buckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  intervalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([sec]) => formatInterval(parseInt(sec))),
      datasets: [{
        label: 'Count',
        data: sorted.map(([, count]) => count),
        backgroundColor: '#8b5cf6',
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#6b7280', maxRotation: 45, minRotation: 45 },
          grid: { color: '#374151' }
        },
        y: {
          ticks: { color: '#6b7280' },
          grid: { color: '#374151' },
          title: { display: true, text: 'Packets', color: '#9ca3af' }
        }
      }
    }
  });
}

async function loadRecentPacketsForDevice() {
  try {
    const gwParam = gatewayId ? `&gateway_id=${gatewayId}` : '';
    const data = await api(`/api/packets/recent?dev_addr=${devAddr}&hours=${selectedHours}&limit=200${gwParam}`);
    const packets = (data.packets || []).map(p => {
      const freqMhz = p.frequency > 1000000 ? p.frequency / 1000000 : p.frequency;
      const dataRate = p.spreading_factor
        ? `SF${p.spreading_factor}BW${(p.bandwidth || 125000) / 1000}`
        : '-';
      return {
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
      };
    });
    setPacketFeedData(packets, true);
  } catch (e) {
    console.error('Failed to load recent packets for device:', e);
  }
}

// Formatters
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

function formatAirtime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatInterval(seconds) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return '?';
  const d = parseUTCTimestamp(timestamp);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Update chart labels when language changes
window.addEventListener('langchange', function() {
  // Update RSSI chart
  if (rssiChart) {
    rssiChart.options.scales.y.title.text = 'dBm';
    rssiChart.data.datasets[0].label = t('chart.rssi_dbm');
    rssiChart.update('none');
  }

  // Update SNR chart
  if (snrChart) {
    snrChart.options.scales.y.title.text = 'dB';
    snrChart.data.datasets[0].label = t('chart.snr_db');
    snrChart.update('none');
  }

  // Update SF chart
  if (sfChart) {
    sfChart.data.datasets[0].label = t('device.packets');
    sfChart.update('none');
  }

  // Update Frequency chart
  if (freqChart) {
    freqChart.data.datasets[0].label = t('device.packets');
    freqChart.update('none');
  }

  // Update FCnt chart
  if (fcntChart) {
    fcntChart.options.scales.y.title.text = t('device.frame_counter');
    fcntChart.data.datasets[0].label = t('chart.fcnt');
    fcntChart.data.datasets[1].label = t('chart.gaps');
    fcntChart.update('none');
  }

  // Update Loss chart
  if (lossChart) {
    lossChart.options.scales.y.title.text = t('device.missed_label');
    lossChart.data.datasets[0].label = t('chart.missed_packets');
    lossChart.update('none');
  }

  // Update Interval chart
  if (intervalChart) {
    intervalChart.options.scales.y.title.text = t('device.packets');
    intervalChart.data.datasets[0].label = t('chart.count');
    intervalChart.update('none');
  }

  // Reload device data to update all text labels
  if (devAddr) {
    loadDeviceData();
  }
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

      const rect = btn.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;

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

