// Management page - ChirpStack connection logic
(function () {
  // ---- Helpers ----

  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;');
  }

  function proxyFetch(path, token) {
    const url = document.getElementById('cs-url').value.trim();
    return fetch('/proxy' + path, {
      headers: {
        'X-ChirpStack-URL': url,
        'Grpc-Metadata-Authorization': 'Bearer ' + token,
      },
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || err.message || res.statusText);
      }
      return res.json();
    });
  }

  // ---- State ----

  let connectionState = {
    connected: false,
    url: '',
    token: '',
    tenantId: '',
    applicationId: '',
    deviceProfileId: '',
    keyType: '', // 'admin' | 'tenant'
  };

  // ---- UI Helpers ----

  function showTestStatus(message, isError) {
    const el = document.getElementById('cs-test-status');
    el.textContent = message;
    el.className = 'text-xs ' + (isError ? 'text-red-400' : 'text-green-400');
  }

  function updateConnectionDot(connected) {
    const dot = document.getElementById('cs-status-dot');
    const text = document.getElementById('cs-status-text');
    const tiles = document.getElementById('tool-tiles');
    if (connected) {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-green-500';
      text.textContent = t('mgmt.connected');
      // Reveal tool tiles when connected
      if (tiles) tiles.classList.remove('hidden');
    } else {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
      text.textContent = t('mgmt.disconnected');
      // Hide tool tiles and sections when disconnected
      if (tiles) tiles.classList.add('hidden');
      var sectionImport = document.getElementById('section-import');
      var sectionBulk = document.getElementById('section-bulk');
      var sectionAnalyze = document.getElementById('section-analyze');
      if (sectionImport) sectionImport.classList.add('hidden');
      if (sectionBulk) sectionBulk.classList.add('hidden');
      if (sectionAnalyze) sectionAnalyze.classList.add('hidden');
    }
  }

  function resetConnectionResult() {
    document.getElementById('connection-result').classList.add('hidden');
    document.getElementById('tenant-select').innerHTML = '<option value="">-- Select --</option>';
    document.getElementById('app-select').innerHTML = '<option value="">-- Select --</option>';
    document.getElementById('dp-select').innerHTML = '<option value="">-- Select --</option>';
    document.getElementById('key-type-display').textContent = '-';
    document.getElementById('stat-total-devices').textContent = '-';
    document.getElementById('stat-active-devices').textContent = '-';
    document.getElementById('stat-inactive-devices').textContent = '-';
    document.getElementById('stat-never-seen').textContent = '-';
    document.getElementById('tenant-id-manual-wrap').classList.add('hidden');
    connectionState.connected = false;
    connectionState.keyType = '';
    connectionState.tenantId = '';
    connectionState.applicationId = '';
    connectionState.deviceProfileId = '';
    updateConnectionDot(false);
  }

  // ---- Saved Servers ----

  async function loadSavedServers() {
    try {
      const data = await api('/api/chirpstack-servers');
      const select = document.getElementById('server-select');
      // Keep the default option
      select.innerHTML = '<option value="">' + t('mgmt.select_server') + '</option>';
      if (data.servers && data.servers.length > 0) {
        data.servers.forEach(function (srv) {
          const opt = document.createElement('option');
          opt.value = srv.id;
          opt.textContent = srv.name + ' (' + srv.url + ')';
          opt.dataset.url = srv.url;
          opt.dataset.name = srv.name;
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Error loading servers:', err);
    }
  }

  function loadServer() {
    const select = document.getElementById('server-select');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.url) {
      document.getElementById('cs-url').value = selectedOption.dataset.url;
      resetConnectionResult();
    }
  }

  async function saveServer() {
    const url = document.getElementById('cs-url').value.trim();
    if (!url) {
      showTestStatus(t('mgmt.url_required_save'), true);
      return;
    }

    const name = await window.showModal({
      type: 'prompt',
      title: t('mgmt.save_server'),
      inputLabel: t('mgmt.server_name'),
      inputPlaceholder: 'My ChirpStack server',
      confirmText: 'Save',
    });
    if (!name) return;

    try {
      await api('/api/chirpstack-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, url: url }),
      });
      showTestStatus(t('mgmt.server_saved'), false);
      await loadSavedServers();
    } catch (err) {
      showTestStatus(err.message, true);
    }
  }

  async function deleteServer() {
    const select = document.getElementById('server-select');
    const id = select.value;
    if (!id) {
      showTestStatus(t('mgmt.select_to_delete'), true);
      return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const serverName = selectedOption.dataset.name || id;

    const confirmed = await window.showModal({
      type: 'danger',
      title: t('mgmt.delete_server'),
      message: t('mgmt.delete_server_confirm', { name: serverName }),
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    try {
      await api('/api/chirpstack-servers/' + id, { method: 'DELETE' });
      showTestStatus(t('mgmt.server_deleted'), false);
      await loadSavedServers();
    } catch (err) {
      showTestStatus(err.message, true);
    }
  }

  // ---- Connection ----

  async function testConnection() {
    const url = document.getElementById('cs-url').value.trim();
    const token = document.getElementById('cs-token').value.trim();

    // Validate inputs
    if (!url) {
      showTestStatus(t('mgmt.url_required'), true);
      return;
    }
    if (!token) {
      showTestStatus(t('mgmt.token_required'), true);
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showTestStatus(t('mgmt.url_invalid'), true);
      return;
    }

    showTestStatus(t('mgmt.connecting'), false);
    resetConnectionResult();

    connectionState.url = url;
    connectionState.token = token;

    try {
      // Try listing tenants (admin key check)
      const tenantsResult = await proxyFetch('/api/tenants?limit=1', token);

      if (tenantsResult.totalCount !== undefined && Number(tenantsResult.totalCount) > 0) {
        // Admin key
        connectionState.keyType = 'admin';
        connectionState.connected = true;
        document.getElementById('key-type-display').textContent = t('mgmt.admin');
        document.getElementById('tenant-id-manual-wrap').classList.add('hidden');
        updateConnectionDot(true);
        showTestStatus(t('mgmt.connected_admin'), false);

        // Show result area
        document.getElementById('connection-result').classList.remove('hidden');

        // Load tenants
        await loadTenants(token);
      } else {
        // Success but 0 tenants - still admin but empty
        connectionState.keyType = 'admin';
        connectionState.connected = true;
        document.getElementById('key-type-display').textContent = t('mgmt.admin_no_tenants');
        updateConnectionDot(true);
        showTestStatus(t('mgmt.connected_admin_no_tenants'), false);
        document.getElementById('connection-result').classList.remove('hidden');
      }
    } catch (err) {
      // Check if it's a 403 (tenant key)
      if (err.message && (err.message.includes('403') || err.message.toLowerCase().includes('forbidden'))) {
        connectionState.keyType = 'tenant';
        connectionState.connected = true;
        document.getElementById('key-type-display').textContent = t('mgmt.tenant');
        document.getElementById('tenant-id-manual-wrap').classList.remove('hidden');
        // Hide tenant dropdown since tenant keys can't list tenants
        document.getElementById('tenant-select').parentElement.classList.add('hidden');
        updateConnectionDot(true);
        showTestStatus(t('mgmt.connected_tenant'), false);
        document.getElementById('connection-result').classList.remove('hidden');
      } else {
        connectionState.connected = false;
        updateConnectionDot(false);
        showTestStatus(t('mgmt.failed', { message: err.message }), true);
      }
    }
  }

  async function loadTenants(token) {
    try {
      const data = await proxyFetch('/api/tenants?limit=100', token);
      const select = document.getElementById('tenant-select');
      select.innerHTML = '<option value="">-- Select --</option>';

      if (data.result && data.result.length > 0) {
        data.result.forEach(function (tenant) {
          const opt = document.createElement('option');
          opt.value = tenant.id;
          opt.textContent = esc(tenant.name);
          select.appendChild(opt);
        });

        // Auto-select if only one tenant
        if (data.result.length === 1) {
          select.value = data.result[0].id;
          onTenantChange();
        }
      }
    } catch (err) {
      console.error('Error loading tenants:', err);
    }
  }

  async function loadApplications(tenantId) {
    const token = connectionState.token;
    const select = document.getElementById('app-select');
    select.innerHTML = '<option value="">' + t('mgmt.loading_select') + '</option>';

    try {
      const data = await proxyFetch('/api/applications?tenantId=' + encodeURIComponent(tenantId) + '&limit=100', token);
      select.innerHTML = '<option value="">' + t('mgmt.all_applications') + '</option>';

      if (data.result && data.result.length > 0) {
        data.result.forEach(function (app) {
          const opt = document.createElement('option');
          opt.value = app.id;
          opt.textContent = esc(app.name);
          select.appendChild(opt);
        });
      }
      // Notify other modules that apps are loaded
      window.dispatchEvent(new CustomEvent('cs-apps-loaded', { detail: data.result || [] }));
    } catch (err) {
      console.error('Error loading applications:', err);
      select.innerHTML = '<option value="">' + t('mgmt.error_select') + '</option>';
    }
  }

  async function loadDeviceProfiles(tenantId) {
    const token = connectionState.token;
    const select = document.getElementById('dp-select');
    select.innerHTML = '<option value="">' + t('mgmt.loading_select') + '</option>';

    try {
      const data = await proxyFetch('/api/device-profiles?tenantId=' + encodeURIComponent(tenantId) + '&limit=100', token);
      select.innerHTML = '<option value="">' + t('mgmt.all_profiles') + '</option>';

      if (data.result && data.result.length > 0) {
        data.result.forEach(function (dp) {
          const opt = document.createElement('option');
          opt.value = dp.id;
          opt.textContent = esc(dp.name);
          select.appendChild(opt);
        });
      }
      // Notify other modules that device profiles are loaded
      window.dispatchEvent(new CustomEvent('cs-dps-loaded', { detail: data.result || [] }));
    } catch (err) {
      console.error('Error loading device profiles:', err);
      select.innerHTML = '<option value="">' + t('mgmt.error_select') + '</option>';
    }
  }

  // Fetch all devices for an app, paginating if needed
  async function fetchAllDevices(appId, token) {
    var allDevices = [];
    var offset = 0;
    var limit = 100;
    var total = null;
    do {
      var data = await proxyFetch('/api/devices?applicationId=' + encodeURIComponent(appId) + '&limit=' + limit + '&offset=' + offset, token);
      var devices = data.result || [];
      allDevices = allDevices.concat(devices);
      if (total === null) total = Number(data.totalCount || 0);
      offset += devices.length;
    } while (offset < total && allDevices.length < total);
    return allDevices;
  }

  async function loadTenantDashboard(tenantId) {
    const token = connectionState.token;
    const dpFilter = connectionState.deviceProfileId;

    // Reset stats
    document.getElementById('stat-total-devices').textContent = '...';
    document.getElementById('stat-active-devices').textContent = '...';
    document.getElementById('stat-inactive-devices').textContent = '...';
    document.getElementById('stat-never-seen').textContent = '...';

    try {
      // Load all applications for tenant
      const appsData = await proxyFetch('/api/applications?tenantId=' + encodeURIComponent(tenantId) + '&limit=100', token);
      const apps = (appsData.result || []);

      // If a specific app is selected, only use that one
      const selectedAppId = document.getElementById('app-select').value;
      const targetApps = selectedAppId ? apps.filter(function (a) { return a.id === selectedAppId; }) : apps;

      if (targetApps.length === 0) {
        document.getElementById('stat-total-devices').textContent = '0';
        document.getElementById('stat-active-devices').textContent = '0';
        document.getElementById('stat-inactive-devices').textContent = '0';
        document.getElementById('stat-never-seen').textContent = '0';
        return;
      }

      // Fetch all devices from all target apps
      var allDevicePromises = targetApps.map(function (app) {
        return fetchAllDevices(app.id, token).catch(function () { return []; });
      });
      var deviceArrays = await Promise.all(allDevicePromises);
      var allDevices = [].concat.apply([], deviceArrays);

      // Filter by device profile if selected
      if (dpFilter) {
        allDevices = allDevices.filter(function (dev) {
          return dev.deviceProfileId === dpFilter;
        });
      }

      // Compute stats
      var now = new Date();
      var oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      var active = 0;
      var inactive = 0;
      var neverSeen = 0;

      allDevices.forEach(function (dev) {
        if (!dev.lastSeenAt) {
          neverSeen++;
        } else {
          var lastSeen = new Date(dev.lastSeenAt);
          if (lastSeen >= oneDayAgo) {
            active++;
          } else {
            inactive++;
          }
        }
      });

      document.getElementById('stat-total-devices').textContent = String(allDevices.length);
      document.getElementById('stat-active-devices').textContent = String(active);
      document.getElementById('stat-inactive-devices').textContent = String(inactive);
      document.getElementById('stat-never-seen').textContent = String(neverSeen);
    } catch (err) {
      console.error('Error loading tenant dashboard:', err);
      document.getElementById('stat-total-devices').textContent = '-';
      document.getElementById('stat-active-devices').textContent = '-';
      document.getElementById('stat-inactive-devices').textContent = '-';
      document.getElementById('stat-never-seen').textContent = '-';
    }
  }

  // ---- Event Handlers ----

  function onTenantChange() {
    var tenantId = document.getElementById('tenant-select').value;
    if (!tenantId) {
      connectionState.tenantId = '';
      connectionState.applicationId = '';
      connectionState.deviceProfileId = '';
      return;
    }
    connectionState.tenantId = tenantId;
    loadApplications(tenantId);
    loadDeviceProfiles(tenantId);
    loadTenantDashboard(tenantId);
  }

  function onAppChange() {
    connectionState.applicationId = document.getElementById('app-select').value;
    // Refresh dashboard with selected app's activity stats
    if (connectionState.tenantId) {
      loadTenantDashboard(connectionState.tenantId);
    }
  }

  function onDpChange() {
    connectionState.deviceProfileId = document.getElementById('dp-select').value;
    // Refresh dashboard with device profile filter
    if (connectionState.tenantId) {
      loadTenantDashboard(connectionState.tenantId);
    }
  }

  function onTenantIdManualChange() {
    var tenantId = document.getElementById('tenant-id-manual').value.trim();
    if (!tenantId) return;
    connectionState.tenantId = tenantId;
    loadApplications(tenantId);
    loadDeviceProfiles(tenantId);
    loadTenantDashboard(tenantId);
  }

  // ---- Global context function ----

  window.getConnectionContext = function () {
    return {
      url: connectionState.url || document.getElementById('cs-url').value.trim(),
      token: connectionState.token || document.getElementById('cs-token').value.trim(),
      tenantId: connectionState.tenantId,
      applicationId: connectionState.applicationId,
      deviceProfileId: connectionState.deviceProfileId,
    };
  };

  // ---- Bind Events ----

  document.getElementById('btn-load-server').addEventListener('click', loadServer);
  document.getElementById('btn-save-server').addEventListener('click', saveServer);
  document.getElementById('btn-delete-server').addEventListener('click', deleteServer);
  document.getElementById('btn-test-connection').addEventListener('click', testConnection);
  document.getElementById('tenant-select').addEventListener('change', onTenantChange);
  document.getElementById('app-select').addEventListener('change', onAppChange);
  document.getElementById('dp-select').addEventListener('change', onDpChange);

  // Tenant ID manual input (for tenant keys) - debounce
  var tenantIdManualTimeout = null;
  var tenantIdManualEl = document.getElementById('tenant-id-manual');
  if (tenantIdManualEl) {
    tenantIdManualEl.addEventListener('input', function () {
      clearTimeout(tenantIdManualTimeout);
      tenantIdManualTimeout = setTimeout(onTenantIdManualChange, 600);
    });
  }

  // ---- Init ----

  loadSavedServers();

  // Pre-fill from Analyzer settings if ChirpStack API is configured
  (async function () {
    try {
      var res = await fetch('/api/settings');
      if (!res.ok) return;
      var data = await res.json();
      if (data.chirpstack_api && data.chirpstack_api.url) {
        var urlEl = document.getElementById('cs-url');
        var tokenEl = document.getElementById('cs-token');
        if (!urlEl.value) urlEl.value = data.chirpstack_api.url;
        if (!tokenEl.value && data.chirpstack_api.api_key) tokenEl.value = data.chirpstack_api.api_key;
      }
    } catch (e) { /* ignore */ }
  })();
})();
