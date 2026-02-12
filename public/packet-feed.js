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
  let onResumeCallback = null;

  // Options set by initPacketFeed
  let opts = {
    showGateway: true,
    showAddr: true,
    showOperator: true,
    clickable: true,
    onFilter: null,       // callback: called when type filters change, receives typeFilter
    isMyDevice: null,     // callback: (devAddr) => bool
    getOperatorStyle: null, // callback: (operator) => style string
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
      p.join_eui,
      p.operator,
      p.gateway_id,
      p.gateway_name,
      p.tx_status,
      p.f_cnt?.toString(),
      p.data_rate,
      p.frequency?.toFixed(1),
    ].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(searchText);
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

  function renderHeader() {
    const gwCol = opts.showGateway ? '<span class="gateway-col" style="width:130px">Gateway</span>' : '';
    const gwNameCol = opts.showGateway ? '<span class="gateway-col" style="width:140px">Name</span>' : '';
    const addrCol = opts.showAddr ? '<span style="width:130px">Addr / DevEUI</span>' : '';
    const operatorCol = opts.showOperator ? '<span style="width:120px">Operator</span>' : '';

    headerEl.innerHTML = `
      <span style="width:140px">Time</span>
      <span style="width:150px">Type</span>
      ${operatorCol}
      ${addrCol}
      <span style="width:170px">FCnt / JoinEUI / DLID</span>
      <span style="width:48px">FPort</span>
      <span style="width:80px">DR</span>
      <span style="width:56px">Freq</span>
      <span style="width:72px">RSSI</span>
      <span style="width:64px">SNR</span>
      <span style="width:40px">Size</span>
      <span style="width:64px">Airtime</span>
      ${gwCol}
      ${gwNameCol}
    `;
  }

  function renderFeed() {
    const matchingDownlinkIds = getMatchingDownlinkIds();

    const filtered = packets.filter(p => {
      // Type filter
      if (p.type === 'data' && !typeFilter.up) return false;
      if (p.type === 'join_request' && !typeFilter.join) return false;
      if (p.type === 'downlink' && !typeFilter.down) return false;
      if (p.type === 'tx_ack' && !typeFilter.ack) return false;
      return matchesSearch(p, matchingDownlinkIds);
    });

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      feedEl.innerHTML = '<div class="text-gray-500 p-4 text-center">Waiting for packets...</div>';
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

    let typeLabel;
    if (isJoin) {
      typeLabel = 'Join';
    } else if (isTxAck) {
      typeLabel = 'Ack';
    } else if (isDown) {
      typeLabel = p.confirmed === true ? 'Downlink Confirmed' : p.confirmed === false ? 'Downlink Unconfirmed' : 'Downlink';
    } else {
      typeLabel = p.confirmed === true ? 'Uplink Confirmed' : p.confirmed === false ? 'Uplink Unconfirmed' : 'Uplink';
    }
    const typeClass = isJoin ? 'join' : isDown ? 'downlink' : isTxAck ? 'ack' : 'up';

    const gwCol = opts.showGateway ? `<span class="gw gateway-col" style="width:130px">${p.gateway_id || ''}</span>` : '';
    const gwNameCol = opts.showGateway ? `<span class="gw gateway-col" style="width:140px">${p.gateway_name || '-'}</span>` : '';
    const operatorStyle = opts.getOperatorStyle ? opts.getOperatorStyle(p.operator) : 'class="op-unknown"';

    if (isTxAck) {
      const statusClass = p.tx_status === 'OK' ? 'good' : 'bad';
      const operatorCol = opts.showOperator ? `<span class="operator ${statusClass}">${p.tx_status || p.operator}</span>` : '';
      const addrCol = opts.showAddr ? '<span class="addr">-</span>' : '';
      return `
        <div class="live-entry tx_ack">
          <span class="time">${datetime}</span>
          <span class="type ${typeClass}">${typeLabel}</span>
          ${operatorCol}
          ${addrCol}
          <span class="fcnt">${p.f_cnt ?? '-'}</span>
          <span class="fport">-</span>
          <span class="dr">-</span>
          <span class="freq">-</span>
          <span class="rssi">-</span>
          <span class="snr">-</span>
          <span class="size">-</span>
          <span class="airtime">-</span>
          ${gwCol}
          ${gwNameCol}
        </div>
      `;
    }

    if (isJoin) {
      const devEui = p.dev_eui || '?';
      const joinEui = p.join_eui || '?';
      const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
      const addrCol = opts.showAddr ? `<span class="addr join">${devEui}</span>` : '';
      return `
        <div class="live-entry join_request">
          <span class="time">${datetime}</span>
          <span class="type ${typeClass}">${typeLabel}</span>
          ${operatorCol}
          ${addrCol}
          <span class="fcnt join-eui">${joinEui}</span>
          <span class="fport">-</span>
          <span class="dr">${p.data_rate}</span>
          <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
          <span class="rssi ${rssiClass}">${p.rssi} dBm</span>
          <span class="snr ${snrClass}">${p.snr?.toFixed(1)} dB</span>
          <span class="size"></span>
          <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
          ${gwCol}
          ${gwNameCol}
        </div>
      `;
    }

    if (isDown) {
      const clickAttr = opts.clickable && p.dev_addr ? `onclick="window.location.href='device.html?addr=${p.dev_addr}'" style="cursor:pointer"` : '';
      const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
      const addrCol = opts.showAddr ? `<span class="addr">${p.dev_addr || '?'}</span>` : '';
      return `
        <div class="live-entry downlink" ${clickAttr}>
          <span class="time">${datetime}</span>
          <span class="type ${typeClass}">${typeLabel}</span>
          ${operatorCol}
          ${addrCol}
          <span class="fcnt">${p.f_cnt ?? '-'}</span>
          <span class="fport">${p.f_port ?? '-'}</span>
          <span class="dr">${p.data_rate}</span>
          <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
          <span class="rssi">-</span>
          <span class="snr">-</span>
          <span class="size">${p.payload_size}B</span>
          <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
          ${gwCol}
          ${gwNameCol}
        </div>
      `;
    }

    // Uplink
    const clickAttr = opts.clickable && p.dev_addr ? `onclick="window.location.href='device.html?addr=${p.dev_addr}'" style="cursor:pointer"` : '';
    const operatorCol = opts.showOperator ? `<span class="operator" ${operatorStyle}>${p.operator}</span>` : '';
    const addrCol = opts.showAddr ? `<span class="addr ${isMine ? 'mine' : ''}">${p.dev_addr}</span>` : '';
    return `
      <div class="live-entry data ${isMine ? 'my-device' : ''}" ${clickAttr}>
        <span class="time">${datetime}</span>
        <span class="type ${typeClass}">${typeLabel}</span>
        ${operatorCol}
        ${addrCol}
        <span class="fcnt">${p.f_cnt ?? '-'}</span>
        <span class="fport">${p.f_port ?? '-'}</span>
        <span class="dr">${p.data_rate}</span>
        <span class="freq">${p.frequency?.toFixed(1) ?? '-'}</span>
        <span class="rssi ${rssiClass}">${p.rssi} dBm</span>
        <span class="snr ${snrClass}">${p.snr?.toFixed(1)} dB</span>
        <span class="size">${p.payload_size}B</span>
        <span class="airtime">${formatAirtime(p.airtime_ms)}</span>
        ${gwCol}
        ${gwNameCol}
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
    const pLabel = document.createTextNode(' packets');
    countWrap.appendChild(pLabel);
    bar.appendChild(countWrap);

    // Search
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
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
      { key: 'up', label: 'UP', title: 'Uplinks' },
      { key: 'join', label: 'JOIN', title: 'Join Requests' },
      { key: 'down', label: 'DOWN', title: 'Downlinks' },
      { key: 'ack', label: 'ACK', title: 'TX Acknowledgements' },
    ].filter(t => !hidden.includes(t.key));
    const btnWrap = document.createElement('div');
    btnWrap.className = 'flex items-center gap-1';
    for (const t of types) {
      const btn = document.createElement('button');
      btn.className = 'toggle-btn px-2 py-1 rounded text-xs' + (typeFilter[t.key] ? ' active' : '');
      btn.textContent = t.label;
      btn.title = t.title;
      btn.addEventListener('click', () => {
        typeFilter[t.key] = !typeFilter[t.key];
        btn.classList.toggle('active', typeFilter[t.key]);
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
      const wasScrolled = !autoScroll;
      autoScroll = feedEl.scrollTop <= 10;
      if (wasScrolled && autoScroll && onResumeCallback) {
        onResumeCallback();
      }
    });

    return { getTypeFilter: () => ({ ...typeFilter }) };
  };

  window.setPacketFeedData = function (newPackets) {
    packets = newPackets;
    renderFeed();
  };

  window.renderPacketFeed = function () {
    renderFeed();
  };

  window.isPacketFeedScrolled = function () {
    return !autoScroll;
  };

  window.onPacketFeedResume = function (cb) {
    onResumeCallback = cb;
  };
})();
