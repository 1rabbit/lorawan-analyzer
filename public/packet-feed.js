// Shared packet feed module used by live.html and device.html
// Usage:
//   initPacketFeed(containerId, options) — sets up header + filter bar + scrollable rows
//   setPacketFeedData(packets) — updates packet list and re-renders with current filters

(function () {
  let feedContainer = null;
  let feedEl = null;
  let headerEl = null;
  let countEl = null;
  let searchInput = null;

  let packets = [];
  let typeFilter = { up: true, join: true, down: true, ack: true };
  let searchText = '';
  let autoScroll = true;

  // Sort state
  let sortKey = null;   // column key or null (no sort = newest first)
  let sortDir = 'desc'; // 'asc' | 'desc'

  // Column definitions for sort (key → packet property accessor)
  const SORT_COLUMNS = {
    time:     { prop: 'timestamp', type: 'number' },
    type:     { prop: 'type', type: 'string' },
    operator: { prop: 'operator', type: 'string' },
    addr:     { prop: 'dev_addr', type: 'string' },
    dev_eui:  { prop: 'dev_eui', type: 'string' },
    fcnt:     { prop: 'f_cnt', type: 'number' },
    fport:    { prop: 'f_port', type: 'number' },
    dr:       { prop: 'data_rate', type: 'dr' },
    freq:     { prop: 'frequency', type: 'number' },
    rssi:     { prop: 'rssi', type: 'number' },
    snr:      { prop: 'snr', type: 'number' },
    size:     { prop: 'payload_size', type: 'number' },
    airtime:  { prop: 'airtime_ms', type: 'number' },
    gateway:  { prop: 'gateway_id', type: 'string' },
  };

  // Options set by initPacketFeed
  let opts = {
    showGateway: true,
    showAddr: true,
    showOperator: true,
    showDevEui: false,
    clickable: true,
    onFilter: null,       // callback: called when type filters change, receives typeFilter
    isMyDevice: null,     // callback: (devAddr) => bool
    getOperatorStyle: null, // callback: (operator) => style string
    getGatewayName: null,  // callback: (gatewayId) => string|null
    hideTypes: [],         // type keys to hide from filter bar (e.g. ['join', 'ack'])
    noFilterBar: false,    // skip generating filter bar (page provides its own)
    countEl: null,         // external element for packet count
    searchEl: null,        // external input element for search
    storagePrefix: '',     // prefix for localStorage keys
  };

  // Parse UTC timestamp from DB
  function parseUTCTimestamp(ts) {
    if (!ts) return null;
    if (typeof ts === 'number') return new Date(ts);
    if (ts.includes('Z') || ts.includes('+')) return new Date(ts);
    return new Date(ts.replace(' ', 'T') + 'Z');
  }

  function formatAirtime(ms) {
    if (ms == null || ms === 0) return '-';
    if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Signal bar helpers
  function rssiPercent(rssi) {
    if (rssi == null) return 0;
    return Math.max(0, Math.min(100, ((rssi + 140) / 110) * 100));
  }

  function snrPercent(snr) {
    if (snr == null) return 0;
    return Math.max(0, Math.min(100, ((snr + 20) / 35) * 100));
  }

  function signalCell(value, unit, cls, pct, colCls) {
    return `<span class="${colCls} signal-cell ${cls}"><span class="signal-val">${value} ${unit}</span><span class="signal-bar"><span class="signal-fill" style="width:${pct}%"></span></span></span>`;
  }

  // Build a set of downlink IDs whose device matches the search text
  function getMatchingDownlinkIds() {
    if (!searchText) return null;
    const ids = new Set();
    for (const p of packets) {
      if (p.type === 'downlink' && p.f_cnt != null && p.dev_addr) {
        if (p.dev_addr.toLowerCase().includes(searchText)) {
          ids.add(p.f_cnt);
        }
      }
    }
    return ids;
  }

  function matchesSearch(p, matchingDownlinkIds) {
    if (!searchText) return true;
    if (p.type === 'tx_ack' && p.f_cnt != null && matchingDownlinkIds?.has(p.f_cnt)) {
      return true;
    }
    const searchable = [
      p.dev_addr,
      p.dev_eui,
      p.device_name,
      p.join_eui,
      p.operator,
      p.gateway_id,
      p.tx_status,
      p.f_cnt?.toString(),
      p.data_rate,
      p.frequency?.toFixed(1),
    ].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(searchText);
  }

  // Extract SF number from data_rate string like "SF7BW125"
  function parseSF(dr) {
    if (!dr || dr === '-') return 999;
    var m = dr.match(/SF(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
  }

  function loadSortState() {
    try {
      var key = opts.storagePrefix + 'packetFeedSort';
      var saved = localStorage.getItem(key);
      if (saved) {
        var s = JSON.parse(saved);
        if (s.key && SORT_COLUMNS[s.key]) {
          sortKey = s.key;
          sortDir = s.dir === 'asc' ? 'asc' : 'desc';
        }
      }
    } catch (e) { /* ignore */ }
  }

  function saveSortState() {
    try {
      var key = opts.storagePrefix + 'packetFeedSort';
      localStorage.setItem(key, JSON.stringify({ key: sortKey, dir: sortDir }));
    } catch (e) { /* ignore */ }
  }

  function toggleSort(colKey) {
    if (sortKey === colKey) {
      // Cycle: desc → asc → none
      if (sortDir === 'desc') {
        sortDir = 'asc';
      } else {
        sortKey = null;
        sortDir = 'desc';
      }
    } else {
      sortKey = colKey;
      sortDir = 'desc';
    }
    saveSortState();
    renderHeader();
    renderFeed();
  }

  function sortPackets(list) {
    if (!sortKey || !SORT_COLUMNS[sortKey]) return list;
    var col = SORT_COLUMNS[sortKey];
    var dir = sortDir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var va, vb;
      if (col.type === 'dr') {
        va = parseSF(a[col.prop]);
        vb = parseSF(b[col.prop]);
      } else if (col.type === 'number') {
        va = a[col.prop] ?? -Infinity;
        vb = b[col.prop] ?? -Infinity;
      } else {
        va = (a[col.prop] || '').toLowerCase();
        vb = (b[col.prop] || '').toLowerCase();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function loadTypeFilter() {
    try {
      const key = opts.storagePrefix + 'lorawanTypeFilter';
      const saved = localStorage.getItem(key);
      if (saved) {
        const types = JSON.parse(saved);
        typeFilter.up = types.up ?? true;
        typeFilter.join = types.join ?? true;
        typeFilter.down = types.down ?? true;
        typeFilter.ack = types.ack ?? true;
      }
    } catch (e) {
      // ignore
    }
  }

  function saveTypeFilter() {
    try {
      const key = opts.storagePrefix + 'lorawanTypeFilter';
      localStorage.setItem(key, JSON.stringify(typeFilter));
    } catch (e) {
      // ignore
    }
  }

  function sortArrow(colKey) {
    if (sortKey !== colKey) return '';
    var arrow = sortDir === 'asc' ? '&#9650;' : '&#9660;';
    return '<span class="sort-arrow">' + arrow + '</span>';
  }

  function sortableCol(colKey, label, width, extraClass) {
    var cls = 'sort-col' + (sortKey === colKey ? ' sort-active' : '') + (extraClass ? ' ' + extraClass : '');
    return '<span class="' + cls + '" style="width:' + width + '" data-sort="' + colKey + '">' + label + sortArrow(colKey) + '</span>';
  }

  function renderHeader() {
    var gwCol = opts.showGateway ? sortableCol('gateway', t('feed.gateway'), '130px', 'gateway-col') : '';
    var addrCol = opts.showAddr ? sortableCol('addr', t('feed.addr'), '160px') : '';
    var operatorCol = opts.showOperator ? sortableCol('operator', t('feed.operator'), '120px') : '';
    var devEuiCol = opts.showDevEui ? sortableCol('dev_eui', t('feed.dev_eui') || 'DevEUI', '150px') : '';

    headerEl.innerHTML =
      sortableCol('time', t('feed.time'), '140px') +
      sortableCol('type', t('feed.type'), '150px') +
      operatorCol +
      addrCol +
      devEuiCol +
      sortableCol('fcnt', t('feed.fcnt'), '170px') +
      sortableCol('fport', t('feed.fport'), '48px') +
      sortableCol('dr', t('feed.dr'), '80px') +
      sortableCol('freq', t('feed.freq'), '56px') +
      sortableCol('rssi', t('feed.rssi'), '72px') +
      sortableCol('snr', t('feed.snr'), '64px') +
      sortableCol('size', t('feed.size'), '40px') +
      sortableCol('airtime', t('feed.airtime'), '64px') +
      gwCol;

    // Attach click handlers
    headerEl.querySelectorAll('.sort-col').forEach(function (el) {
      el.addEventListener('click', function () {
        toggleSort(el.dataset.sort);
      });
    });
  }

  function renderFeed() {
    const matchingDownlinkIds = getMatchingDownlinkIds();

    let filtered = packets.filter(p => {
      // Type filter
      if (p.type === 'data' && !typeFilter.up) return false;
      if (p.type === 'join_request' && !typeFilter.join) return false;
      if (p.type === 'downlink' && !typeFilter.down) return false;
      if (p.type === 'tx_ack' && !typeFilter.ack) return false;
      return matchesSearch(p, matchingDownlinkIds);
    });

    // Apply sort
    filtered = sortPackets(filtered);

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      feedEl.innerHTML = `<div class="text-gray-500 p-4 text-center">${t('live.waiting')}</div>`;
      return;
    }

    feedEl.innerHTML = filtered.map(p => renderRow(p)).join('');
    if (autoScroll) feedEl.scrollTop = 0;
  }

  function renderRow(p) {
    const dt = new Date(p.timestamp);
    const date = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const datetime = `${date} ${time}`;
    const isJoin = p.type === 'join_request';
    const isTxAck = p.type === 'tx_ack';
    const isDown = p.type === 'downlink';
    const isMine = !isJoin && !isTxAck && opts.isMyDevice ? opts.isMyDevice(p.dev_addr) : false;

    const rssiClass = p.rssi >= -70 ? 'good' : p.rssi >= -100 ? 'medium' : 'bad';
    const snrClass = p.snr >= 7 ? 'good' : p.snr >= 0 ? 'medium' : 'bad';

    // New packet flash tracking
    const isNew = !p._seen;
    if (isNew) p._seen = true;
    const newCls = isNew ? ' new-packet' : '';

    let typeLabel;
    if (isJoin) {
      typeLabel = t('feed.join');
    } else if (isTxAck) {
      typeLabel = t('feed.ack');
    } else if (isDown) {
      typeLabel = p.confirmed === true ? t('feed.downlink_confirmed') : p.confirmed === false ? t('feed.downlink_unconfirmed') : t('feed.downlink');
    } else {
      typeLabel = p.confirmed === true ? t('feed.uplink_confirmed') : p.confirmed === false ? t('feed.uplink_unconfirmed') : t('feed.uplink');
    }
    const typeClass = isJoin ? 'join' : isDown ? 'downlink' : isTxAck ? 'ack' : 'up';
    const typeBadge = `<span class="type"><span class="type-badge ${typeClass}">${typeLabel}</span></span>`;

    // Signal cells with mini bars
    const rssiCell = (p.rssi != null)
      ? signalCell(p.rssi, 'dBm', rssiClass, rssiPercent(p.rssi), 'rssi')
      : '<span class="rssi">-</span>';
    const snrCell = (p.snr != null)
      ? signalCell(p.snr.toFixed(1), 'dB', snrClass, snrPercent(p.snr), 'snr')
      : '<span class="snr">-</span>';

    const gwName = opts.getGatewayName ? opts.getGatewayName(p.gateway_id) : null;
    const gwLabel = gwName || p.gateway_id || '';
    const gwCol = opts.showGateway ? `<span class="gw gateway-col" title="${p.gateway_id || ''}">${gwLabel}</span>` : '';
    const operatorStyle = opts.getOperatorStyle ? opts.getOperatorStyle(p.operator) : 'class="op-unknown"';

    // Helper: build address cell with optional device_name below
    function buildAddrCell(addr, extraClass, deviceName) {
      if (!opts.showAddr) return '';
      const name = deviceName ? `<span class="addr-name">${deviceName}</span>` : '';
      return `<span class="addr-cell"><span class="addr ${extraClass || ''}">${addr || '?'}</span>${name}</span>`;
    }

    // Helper: build DevEUI cell
    const devEuiCol = opts.showDevEui ? `<span class="dev-eui">${p.dev_eui || '-'}</span>` : '';

    if (isTxAck) {
      const statusClass = p.tx_status === 'OK' ? 'good' : 'bad';
      const operatorCol = opts.showOperator ? `<span class="operator ${statusClass}">${p.tx_status || p.operator}</span>` : '';
      const addrCol = buildAddrCell('-', '', '');
      const euiCol = opts.showDevEui ? '<span class="dev-eui">-</span>' : '';
      return `
        <div class="live-entry tx_ack${newCls}">
          <span class="time">${datetime}</span>
          ${typeBadge}
          ${operatorCol}
          ${addrCol}
          ${euiCol}
          <span class="fcnt">${p.f_cnt ?? '-'}</span>
          <span class="fport">-</span>
          <span class="dr">-</span>
          <span class="freq">-</span>
          <span class="rssi">-</span>
          <span class="snr">-</span>
          <span class="size">-</span>
          <span class="airtime">-</span>
          ${gwCol}
        </div>
      `;
    }

    if (isJoin) {
      const devEui = p.dev_eui || '?';
      const joinEui = p.join_eui || '?';
      const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
      const addrCol = buildAddrCell(devEui, 'join', '');
      const euiCol = opts.showDevEui ? `<span class="dev-eui join-eui">${devEui}</span>` : '';
      return `
        <div class="live-entry join_request${newCls}">
          <span class="time">${datetime}</span>
          ${typeBadge}
          ${operatorCol}
          ${addrCol}
          ${euiCol}
          <span class="fcnt join-eui">${joinEui}</span>
          <span class="fport">-</span>
          <span class="dr">${p.data_rate}</span>
          <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
          ${rssiCell}
          ${snrCell}
          <span class="size"></span>
          <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
          ${gwCol}
        </div>
      `;
    }

    if (isDown) {
      const clickAttr = opts.clickable && p.dev_addr ? `onclick="window.location.href='device.html?addr=${p.dev_addr}'" style="cursor:pointer"` : '';
      const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
      const addrCol = buildAddrCell(p.dev_addr, '', p.device_name);
      return `
        <div class="live-entry downlink${newCls}" ${clickAttr}>
          <span class="time">${datetime}</span>
          ${typeBadge}
          ${operatorCol}
          ${addrCol}
          ${devEuiCol}
          <span class="fcnt">${p.f_cnt ?? '-'}</span>
          <span class="fport">${p.f_port ?? '-'}</span>
          <span class="dr">${p.data_rate}</span>
          <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
          <span class="rssi">-</span>
          <span class="snr">-</span>
          <span class="size">${p.payload_size}B</span>
          <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
          ${gwCol}
        </div>
      `;
    }

    // Uplink
    const clickAttr = opts.clickable && p.dev_addr ? `onclick="window.location.href='device.html?addr=${p.dev_addr}'" style="cursor:pointer"` : '';
    const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
    const addrCol = buildAddrCell(p.dev_addr, isMine ? 'mine' : '', p.device_name);
    return `
      <div class="live-entry data ${isMine ? 'my-device' : ''}${newCls}" ${clickAttr}>
        <span class="time">${datetime}</span>
        ${typeBadge}
        ${operatorCol}
        ${addrCol}
        ${devEuiCol}
        <span class="fcnt">${p.f_cnt ?? '-'}</span>
        <span class="fport">${p.f_port ?? '-'}</span>
        <span class="dr">${p.data_rate}</span>
        <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
        ${rssiCell}
        ${snrCell}
        <span class="size">${p.payload_size}B</span>
        <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
        ${gwCol}
      </div>
    `;
  }

  function buildFilterBar() {
    const bar = document.createElement('div');
    bar.className = 'flex items-center gap-2 px-2 py-1';

    // Packet count
    const countWrap = document.createElement('div');
    countWrap.className = 'flex items-center gap-2 text-xs text-white/60';
    countWrap.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>';
    countEl = document.createElement('span');
    countEl.textContent = '0';
    countWrap.appendChild(countEl);
    const pLabel = document.createElement('span');
    pLabel.textContent = ` ${t('live.packets')}`;
    pLabel.className = 'packet-label';
    countWrap.appendChild(pLabel);
    bar.appendChild(countWrap);

    // Search
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = t('live.filter_packets');
    searchInput.className = 'bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder-white/40 w-32 focus:outline-none focus:border-white/40';
    searchInput.addEventListener('input', (e) => {
      searchText = e.target.value.toLowerCase();
      renderFeed();
    });
    bar.appendChild(searchInput);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Type filter buttons
    const hidden = opts.hideTypes || [];
    const types = [
      { key: 'up', label: 'UP', titleKey: 'feed.uplinks' },
      { key: 'join', label: 'JOIN', titleKey: 'feed.join_requests' },
      { key: 'down', label: 'DOWN', titleKey: 'feed.downlinks' },
      { key: 'ack', label: 'ACK', titleKey: 'feed.tx_ack' },
    ].filter(t => !hidden.includes(t.key));
    const btnWrap = document.createElement('div');
    btnWrap.className = 'flex items-center gap-1';
    for (const typ of types) {
      const btn = document.createElement('button');
      btn.className = 'toggle-btn px-2 py-1 rounded text-xs' + (typeFilter[typ.key] ? ' active' : '');
      btn.textContent = typ.label;
      btn.title = t(typ.titleKey);
      btn.dataset.titleKey = typ.titleKey;
      btn.addEventListener('click', () => {
        typeFilter[typ.key] = !typeFilter[typ.key];
        btn.classList.toggle('active', typeFilter[typ.key]);
        saveTypeFilter();
        if (opts.onFilter) opts.onFilter(typeFilter);
        renderFeed();
      });
      btnWrap.appendChild(btn);
    }
    bar.appendChild(btnWrap);

    return bar;
  }

  // Public API
  window.initPacketFeed = function (containerId, options) {
    opts = Object.assign(opts, options || {});

    feedContainer = document.getElementById(containerId);
    if (!feedContainer) return;

    loadTypeFilter();
    loadSortState();

    // Force hidden types off
    for (const key of (opts.hideTypes || [])) {
      typeFilter[key] = false;
    }

    // Filter bar (or wire up external elements)
    if (opts.noFilterBar) {
      if (opts.countEl) countEl = opts.countEl;
      if (opts.searchEl) {
        searchInput = opts.searchEl;
        searchInput.addEventListener('input', (e) => {
          searchText = e.target.value.toLowerCase();
          renderFeed();
        });
      }
    } else {
      const filterBar = buildFilterBar();
      filterBar.className += ' bg-white/5 border-b border-white/10 flex-shrink-0';
      feedContainer.appendChild(filterBar);
    }

    // Column header
    const headerWrap = document.createElement('div');
    headerWrap.className = 'bg-white/5 border-b border-white/10 px-2 py-1 flex-shrink-0';
    headerEl = document.createElement('div');
    headerEl.className = 'live-header flex items-center gap-2 font-mono text-xs text-white/40 px-2';
    headerWrap.appendChild(headerEl);
    feedContainer.appendChild(headerWrap);
    renderHeader();

    // Scrollable feed area
    feedEl = document.createElement('div');
    feedEl.className = 'flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs';
    feedEl.innerHTML = '<div class="text-white/40 p-4 text-center">Waiting for packets...</div>';
    feedContainer.appendChild(feedEl);

    // Auto-scroll detection
    feedEl.addEventListener('scroll', () => {
      autoScroll = feedEl.scrollTop <= 10;
    });

    // Re-translate on language change
    window.addEventListener('langchange', () => {
      renderHeader();
      renderFeed();
      // Update filter button titles
      feedContainer.querySelectorAll('.toggle-btn[data-title-key]').forEach(btn => {
        const key = btn.dataset.titleKey;
        if (key) btn.title = t(key);
      });
      // Update packet label
      const pLabel = feedContainer.querySelector('.packet-label');
      if (pLabel) pLabel.textContent = ` ${t('live.packets')}`;
    });

    return { getTypeFilter: () => ({ ...typeFilter }) };
  };

  window.setPacketFeedData = function (newPackets, markSeen) {
    if (markSeen) {
      for (const p of newPackets) p._seen = true;
    }
    packets = newPackets;
    renderFeed();
  };

  window.renderPacketFeed = function () {
    renderFeed();
  };
})();
