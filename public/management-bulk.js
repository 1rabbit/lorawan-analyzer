// Management page - Export & Bulk operations logic
(function () {
  // ---- Helpers ----

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;');
  }

  function proxyFetch(path) {
    var ctx = window.getConnectionContext();
    return fetch('/proxy' + path, {
      headers: {
        'X-ChirpStack-URL': ctx.url,
        'Grpc-Metadata-Authorization': 'Bearer ' + ctx.token,
      },
    }).then(async function (res) {
      if (!res.ok) {
        var err = await res.json().catch(function () { return { error: res.statusText }; });
        throw new Error(err.error || err.message || res.statusText);
      }
      return res.json();
    });
  }

  function bulkApi(path, options) {
    var ctx = window.getConnectionContext();
    return fetch(path, {
      ...options,
      headers: {
        ...(options && options.headers ? options.headers : {}),
        'Content-Type': 'application/json',
        'X-ChirpStack-URL': ctx.url,
        'Authorization': 'Bearer ' + ctx.token,
      },
    }).then(async function (res) {
      if (!res.ok) {
        var err = await res.json().catch(function () { return { error: res.statusText }; });
        throw new Error(err.error || err.message || res.statusText);
      }
      return res.json();
    });
  }

  // ---- State ----

  var exportDevicesList = [];
  var deleteDevices = [];
  var migrateDevicesList = [];
  var dpDevices = [];
  var tagsFile = null;

  // ---- Tab Switching ----

  function initTabs() {
    var tabs = document.querySelectorAll('.bulk-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('bg-white/10', 'text-white');
          t.classList.add('text-white/50');
        });
        tab.classList.add('bg-white/10', 'text-white');
        tab.classList.remove('text-white/50');

        document.querySelectorAll('.bulk-tab-content').forEach(function (c) {
          c.classList.add('hidden');
        });
        var target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.remove('hidden');
      });
    });
  }

  // ---- Bulk app selector helper ----

  function getBulkAppId() {
    return document.getElementById('bulk-app-select').value;
  }

  // ---- Shared: Load all devices from selected app ----

  async function loadAppDevices() {
    var appId = getBulkAppId();
    if (!appId) {
      throw new Error(t('bulk.select_app_required'));
    }

    var allDevices = [];
    var offset = 0;
    var limit = 100;

    while (true) {
      var data = await proxyFetch(
        '/api/devices?applicationId=' + encodeURIComponent(appId) +
        '&limit=' + limit + '&offset=' + offset
      );
      var devices = data.result || [];
      allDevices = allDevices.concat(devices);
      if (devices.length < limit || allDevices.length >= Number(data.totalCount || 0)) break;
      offset += limit;
    }

    return allDevices;
  }

  // ---- Shared: Render device list with checkboxes ----

  function renderDeviceList(devices, containerId, filterText) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';

    var filtered = devices;
    if (filterText) {
      var lower = filterText.toLowerCase();
      filtered = devices.filter(function (d) {
        return (d.devEui || '').toLowerCase().includes(lower) ||
               (d.name || '').toLowerCase().includes(lower);
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-xs text-white/30 py-2">' + t('bulk.no_devices') + '</div>';
      return;
    }

    filtered.forEach(function (d) {
      var div = document.createElement('div');
      div.className = 'flex items-center gap-2 bg-white/5 rounded px-3 py-1.5 text-xs';
      div.innerHTML =
        '<input type="checkbox" value="' + esc(d.devEui) + '" class="device-cb rounded">' +
        '<span class="font-mono text-white/80">' + esc(d.devEui) + '</span>' +
        '<span class="text-white/40 truncate">' + esc(d.name || '') + '</span>' +
        (d.deviceProfileName ? '<span class="text-white/20 ml-auto text-[10px]">' + esc(d.deviceProfileName) + '</span>' : '');
      container.appendChild(div);
    });
  }

  function getSelectedDevEuis(containerId) {
    var checkboxes = document.querySelectorAll('#' + containerId + ' input.device-cb:checked');
    return Array.from(checkboxes).map(function (cb) { return cb.value; });
  }

  function selectAllInContainer(containerId) {
    document.querySelectorAll('#' + containerId + ' input.device-cb').forEach(function (cb) { cb.checked = true; });
  }

  function deselectAllInContainer(containerId) {
    document.querySelectorAll('#' + containerId + ' input.device-cb').forEach(function (cb) { cb.checked = false; });
  }

  function updateSelectedCount(containerId, countId) {
    var count = getSelectedDevEuis(containerId).length;
    document.getElementById(countId).textContent = t('bulk.selected', { count: count });
  }

  // ==================================================
  // EXPORT
  // ==================================================

  async function loadExportDevices() {
    var statusEl = document.getElementById('export-status');
    statusEl.textContent = 'Loading...';
    statusEl.className = 'text-xs text-white/50';

    try {
      exportDevicesList = await loadAppDevices();
      document.getElementById('export-device-count').textContent = t('export.devices_loaded', { count: exportDevicesList.length });

      // Populate DP filter
      var dps = {};
      exportDevicesList.forEach(function (d) {
        if (d.deviceProfileName) dps[d.deviceProfileId || ''] = d.deviceProfileName;
      });
      var dpSelect = document.getElementById('export-filter-dp');
      dpSelect.innerHTML = '<option value="">-- All --</option>';
      Object.keys(dps).forEach(function (id) {
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = dps[id];
        dpSelect.appendChild(opt);
      });

      buildExportPreview();
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'text-xs text-red-400';
    }
  }

  function buildExportPreview() {
    var preview = document.getElementById('export-preview');
    var thead = document.getElementById('export-preview-thead');
    var tbody = document.getElementById('export-preview-tbody');

    if (exportDevicesList.length === 0) {
      preview.classList.add('hidden');
      return;
    }

    preview.classList.remove('hidden');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    var headerRow = document.createElement('tr');
    [t('export.preview_deveui'), t('export.preview_name'), t('export.preview_dp'), t('export.preview_last_seen')].forEach(function (h) {
      var th = document.createElement('th');
      th.className = 'text-left px-2 py-1 text-white/50 border-b border-white/10 whitespace-nowrap';
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    exportDevicesList.slice(0, 5).forEach(function (d, idx) {
      var tr = document.createElement('tr');
      tr.className = idx % 2 === 0 ? 'bg-white/3' : '';
      var lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never';
      [d.devEui, d.name || '', d.deviceProfileName || '', lastSeen].forEach(function (val) {
        var td = document.createElement('td');
        td.className = 'px-2 py-1 text-white/70 whitespace-nowrap';
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function downloadExport() {
    var appId = getBulkAppId();
    var ctx = window.getConnectionContext();
    if (!appId) {
      document.getElementById('export-status').textContent = t('export.select_app');
      document.getElementById('export-status').className = 'text-xs text-red-400';
      return;
    }

    var format = document.getElementById('export-format').value;
    var includeKeys = document.getElementById('export-include-keys').checked;
    var filterDp = document.getElementById('export-filter-dp').value;
    var filterActivity = document.getElementById('export-filter-activity').value;
    var filterTag = document.getElementById('export-filter-tag').value.trim();

    var params = new URLSearchParams();
    params.set('applicationId', appId);
    params.set('includeKeys', String(includeKeys));
    params.set('format', format);
    if (filterDp) params.set('filterDp', filterDp);
    if (filterActivity) params.set('filterActivity', filterActivity);
    if (filterTag) params.set('filterTag', filterTag);

    var statusEl = document.getElementById('export-status');
    statusEl.textContent = t('export.downloading');
    statusEl.className = 'text-xs text-white/50';

    fetch('/api/export/devices?' + params.toString(), {
      headers: {
        'X-ChirpStack-URL': ctx.url,
        'Authorization': 'Bearer ' + ctx.token,
      },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Error ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'devices.' + format;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusEl.textContent = t('export.downloaded');
        statusEl.className = 'text-xs text-green-400';
      })
      .catch(function (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.className = 'text-xs text-red-400';
      });
  }

  // ==================================================
  // BULK DELETE
  // ==================================================

  async function loadDeleteDevices() {
    var statusEl = document.getElementById('delete-status');
    statusEl.textContent = 'Loading...';
    statusEl.className = 'text-xs text-white/50';

    try {
      deleteDevices = await loadAppDevices();
      renderDeviceList(deleteDevices, 'delete-devices-list', '');
      statusEl.textContent = deleteDevices.length + ' devices loaded';
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'text-xs text-red-400';
    }
  }

  async function executeBulkDelete() {
    var devEuis = getSelectedDevEuis('delete-devices-list');
    if (devEuis.length === 0) {
      document.getElementById('delete-status').textContent = t('delete.select_one');
      document.getElementById('delete-status').className = 'text-xs text-red-400';
      return;
    }

    var confirmed = await window.showModal({
      type: 'danger',
      title: t('delete.bulk_title'),
      message: t('delete.bulk_confirm', { count: devEuis.length }),
      inputLabel: t('delete.type_confirm', { count: devEuis.length }),
      expectedValue: String(devEuis.length),
      confirmText: 'Delete',
    });
    if (!confirmed) {
      document.getElementById('delete-status').textContent = t('delete.cancelled');
      document.getElementById('delete-status').className = 'text-xs text-white/50';
      return;
    }

    document.getElementById('delete-status').textContent = t('delete.deleting');
    document.getElementById('delete-status').className = 'text-xs text-white/50';
    document.getElementById('delete-result').classList.add('hidden');

    try {
      var result = await bulkApi('/api/bulk/delete', {
        method: 'POST',
        body: JSON.stringify({ devEuis: devEuis }),
      });

      document.getElementById('del-deleted').textContent = String(result.deleted || 0);
      document.getElementById('del-errors').textContent = String(result.errors ? result.errors.length : 0);

      var errorList = document.getElementById('del-error-list');
      errorList.innerHTML = '';
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(function (err) {
          var div = document.createElement('div');
          div.className = 'text-xs text-red-400 bg-red-400/5 rounded px-2 py-1';
          div.textContent = err.devEui + ' \u2014 ' + err.message;
          errorList.appendChild(div);
        });
      }

      document.getElementById('delete-result').classList.remove('hidden');
      document.getElementById('delete-status').textContent = t('delete.deleted');
      document.getElementById('delete-status').className = 'text-xs text-green-400';

      // Reload device list
      await loadDeleteDevices();
    } catch (err) {
      document.getElementById('delete-status').textContent = 'Error: ' + err.message;
      document.getElementById('delete-status').className = 'text-xs text-red-400';
    }
  }

  // ==================================================
  // MIGRATION
  // ==================================================

  async function loadMigrateDevices() {
    var statusEl = document.getElementById('migrate-status');
    statusEl.textContent = 'Loading...';
    statusEl.className = 'text-xs text-white/50';

    try {
      migrateDevicesList = await loadAppDevices();
      renderDeviceList(migrateDevicesList, 'migrate-devices-list', '');
      statusEl.textContent = migrateDevicesList.length + ' devices loaded';
      loadDestinationApps();
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'text-xs text-red-400';
    }
  }

  async function loadDestinationApps() {
    var ctx = window.getConnectionContext();
    try {
      var data = await proxyFetch('/api/applications?tenantId=' + encodeURIComponent(ctx.tenantId) + '&limit=100');
      var select = document.getElementById('migrate-dest-app');
      select.innerHTML = '<option value="">-- Select --</option>';
      (data.result || []).forEach(function (app) {
        if (app.id !== ctx.applicationId) {
          var opt = document.createElement('option');
          opt.value = app.id;
          opt.textContent = esc(app.name);
          select.appendChild(opt);
        }
      });
    } catch (err) {
      console.error('Error loading destination apps:', err);
    }
  }

  async function executeMigration() {
    var devEuis = getSelectedDevEuis('migrate-devices-list');
    var destAppId = document.getElementById('migrate-dest-app').value;
    var sourceAppId = getBulkAppId();

    if (devEuis.length === 0) {
      document.getElementById('migrate-status').textContent = t('migrate.select_one');
      document.getElementById('migrate-status').className = 'text-xs text-red-400';
      return;
    }
    if (!sourceAppId) {
      document.getElementById('migrate-status').textContent = t('migrate.select_source');
      document.getElementById('migrate-status').className = 'text-xs text-red-400';
      return;
    }
    if (!destAppId) {
      document.getElementById('migrate-status').textContent = t('migrate.select_dest');
      document.getElementById('migrate-status').className = 'text-xs text-red-400';
      return;
    }

    var confirmed = await window.showModal({
      type: 'confirm',
      title: t('migrate.title'),
      message: t('migrate.confirm', { count: devEuis.length }),
      confirmText: 'Migrate',
    });
    if (!confirmed) return;

    document.getElementById('migrate-status').textContent = t('migrate.migrating');
    document.getElementById('migrate-status').className = 'text-xs text-white/50';
    document.getElementById('migrate-result').classList.add('hidden');

    try {
      var result = await bulkApi('/api/bulk/migrate', {
        method: 'POST',
        body: JSON.stringify({
          devEuis: devEuis,
          sourceAppId: sourceAppId,
          destAppId: destAppId,
        }),
      });

      document.getElementById('mig-migrated').textContent = String(result.migrated || 0);
      document.getElementById('mig-errors').textContent = String(result.errors ? result.errors.length : 0);

      var errorList = document.getElementById('mig-error-list');
      errorList.innerHTML = '';
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(function (err) {
          var div = document.createElement('div');
          div.className = 'text-xs text-red-400 bg-red-400/5 rounded px-2 py-1';
          div.textContent = err.devEui + ' \u2014 ' + err.message;
          errorList.appendChild(div);
        });
      }

      document.getElementById('migrate-result').classList.remove('hidden');
      document.getElementById('migrate-status').textContent = t('migrate.migrated');
      document.getElementById('migrate-status').className = 'text-xs text-green-400';
    } catch (err) {
      document.getElementById('migrate-status').textContent = 'Error: ' + err.message;
      document.getElementById('migrate-status').className = 'text-xs text-red-400';
    }
  }

  // ==================================================
  // CHANGE DEVICE PROFILE
  // ==================================================

  async function loadDpDevices() {
    var statusEl = document.getElementById('dp-status');
    statusEl.textContent = 'Loading...';
    statusEl.className = 'text-xs text-white/50';

    try {
      dpDevices = await loadAppDevices();
      renderDeviceList(dpDevices, 'dp-devices-list', '');
      statusEl.textContent = dpDevices.length + ' devices loaded';
      loadDpOptions();
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'text-xs text-red-400';
    }
  }

  async function loadDpOptions() {
    var ctx = window.getConnectionContext();
    try {
      var data = await proxyFetch('/api/device-profiles?tenantId=' + encodeURIComponent(ctx.tenantId) + '&limit=100');
      var select = document.getElementById('dp-new-profile');
      select.innerHTML = '<option value="">-- Select --</option>';
      (data.result || []).forEach(function (dp) {
        var opt = document.createElement('option');
        opt.value = dp.id;
        opt.textContent = esc(dp.name);
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading device profiles:', err);
    }
  }

  async function executeDpChange() {
    var devEuis = getSelectedDevEuis('dp-devices-list');
    var newDpId = document.getElementById('dp-new-profile').value;

    if (devEuis.length === 0) {
      document.getElementById('dp-status').textContent = t('dp.select_one');
      document.getElementById('dp-status').className = 'text-xs text-red-400';
      return;
    }
    if (!newDpId) {
      document.getElementById('dp-status').textContent = t('dp.select_profile');
      document.getElementById('dp-status').className = 'text-xs text-red-400';
      return;
    }

    var confirmed = await window.showModal({
      type: 'confirm',
      title: t('dp.title'),
      message: t('dp.confirm', { count: devEuis.length }),
      confirmText: 'Apply',
    });
    if (!confirmed) return;

    document.getElementById('dp-status').textContent = t('dp.updating');
    document.getElementById('dp-status').className = 'text-xs text-white/50';
    document.getElementById('dp-result').classList.add('hidden');

    try {
      var result = await bulkApi('/api/bulk/change-profile', {
        method: 'POST',
        body: JSON.stringify({
          devEuis: devEuis,
          newDeviceProfileId: newDpId,
        }),
      });

      document.getElementById('dpchg-updated').textContent = String(result.updated || 0);
      document.getElementById('dpchg-errors').textContent = String(result.errors ? result.errors.length : 0);

      var errorList = document.getElementById('dpchg-error-list');
      errorList.innerHTML = '';
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(function (err) {
          var div = document.createElement('div');
          div.className = 'text-xs text-red-400 bg-red-400/5 rounded px-2 py-1';
          div.textContent = err.devEui + ' \u2014 ' + err.message;
          errorList.appendChild(div);
        });
      }

      document.getElementById('dp-result').classList.remove('hidden');
      document.getElementById('dp-status').textContent = t('dp.updated');
      document.getElementById('dp-status').className = 'text-xs text-green-400';
    } catch (err) {
      document.getElementById('dp-status').textContent = 'Error: ' + err.message;
      document.getElementById('dp-status').className = 'text-xs text-red-400';
    }
  }

  // ==================================================
  // UPDATE TAGS
  // ==================================================

  function handleTagsDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('tags-drop-zone').classList.remove('border-white/40');
    var files = e.dataTransfer ? e.dataTransfer.files : e.target.files;
    if (files && files.length > 0) {
      tagsFile = files[0];
      showTagsFileInfo();
    }
  }

  function showTagsFileInfo() {
    var info = document.getElementById('tags-file-info');
    info.textContent = tagsFile.name + ' (' + (tagsFile.size / 1024).toFixed(1) + ' Ko)';
    info.classList.remove('hidden');

    // Preview CSV client-side
    var ext = tagsFile.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var text = ev.target.result;
        var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (lines.length < 2) return;

        var sep = ';';
        var commas = (lines[0].match(/,/g) || []).length;
        var semicolons = (lines[0].match(/;/g) || []).length;
        var tabs = (lines[0].match(/\t/g) || []).length;
        if (commas > semicolons && commas > tabs) sep = ',';
        if (tabs > semicolons && tabs > commas) sep = '\t';

        var cols = lines[0].split(sep).map(function (c) { return c.trim(); });

        var area = document.getElementById('tags-preview-area');
        var thead = document.getElementById('tags-preview-thead');
        var tbody = document.getElementById('tags-preview-tbody');
        area.classList.remove('hidden');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        var headerRow = document.createElement('tr');
        cols.forEach(function (c) {
          var th = document.createElement('th');
          th.className = 'text-left px-2 py-1 text-white/50 border-b border-white/10 whitespace-nowrap';
          th.textContent = c;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        lines.slice(1, 6).forEach(function (line, idx) {
          var vals = line.split(sep);
          var tr = document.createElement('tr');
          tr.className = idx % 2 === 0 ? 'bg-white/3' : '';
          cols.forEach(function (_, i) {
            var td = document.createElement('td');
            td.className = 'px-2 py-1 text-white/70 whitespace-nowrap';
            td.textContent = (vals[i] || '').trim();
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      };
      reader.readAsText(tagsFile, 'UTF-8');
    } else {
      // XLSX — no client-side preview
      document.getElementById('tags-preview-area').classList.add('hidden');
    }
  }

  async function executeTagUpdate() {
    if (!tagsFile) {
      document.getElementById('tags-status').textContent = t('tags.select_file');
      document.getElementById('tags-status').className = 'text-xs text-red-400';
      return;
    }

    var modeEl = document.querySelector('input[name="tags-mode"]:checked');
    var mode = modeEl ? modeEl.value : 'merge';
    var ctx = window.getConnectionContext();

    document.getElementById('tags-status').textContent = t('tags.updating');
    document.getElementById('tags-status').className = 'text-xs text-white/50';
    document.getElementById('tags-result').classList.add('hidden');

    try {
      var formData = new FormData();
      formData.append('file', tagsFile);
      formData.append('mode', mode);

      // multipart: do NOT set Content-Type manually
      var res = await fetch('/api/bulk/update-tags', {
        method: 'POST',
        headers: {
          'X-ChirpStack-URL': ctx.url,
          'Authorization': 'Bearer ' + ctx.token,
        },
        body: formData,
      });

      if (!res.ok) {
        var errBody = await res.json().catch(function () { return { error: res.statusText }; });
        throw new Error(errBody.error || res.statusText);
      }

      var result = await res.json();

      document.getElementById('tags-updated').textContent = String(result.updated || 0);
      document.getElementById('tags-errors').textContent = String(result.errors ? result.errors.length : 0);

      var errorList = document.getElementById('tags-error-list');
      errorList.innerHTML = '';
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(function (err) {
          var div = document.createElement('div');
          div.className = 'text-xs text-red-400 bg-red-400/5 rounded px-2 py-1';
          div.textContent = err.devEui + ' \u2014 ' + err.message;
          errorList.appendChild(div);
        });
      }

      document.getElementById('tags-result').classList.remove('hidden');
      document.getElementById('tags-status').textContent = t('tags.updated');
      document.getElementById('tags-status').className = 'text-xs text-green-400';
    } catch (err) {
      document.getElementById('tags-status').textContent = 'Error: ' + err.message;
      document.getElementById('tags-status').className = 'text-xs text-red-400';
    }
  }

  // ==================================================
  // CROSS-APP SEARCH
  // ==================================================

  async function searchCrossApp() {
    var query = document.getElementById('search-deveui').value.trim();
    if (!query) {
      document.getElementById('search-status').textContent = t('cross_search.enter_deveui');
      document.getElementById('search-status').className = 'text-xs text-red-400';
      return;
    }

    var ctx = window.getConnectionContext();
    if (!ctx.url || !ctx.token || !ctx.tenantId) {
      document.getElementById('search-status').textContent = t('cross_search.connection_required');
      document.getElementById('search-status').className = 'text-xs text-red-400';
      return;
    }

    document.getElementById('search-status').textContent = t('cross_search.searching');
    document.getElementById('search-status').className = 'text-xs text-white/50';
    document.getElementById('search-results').classList.add('hidden');

    try {
      var appsData = await proxyFetch('/api/applications?tenantId=' + encodeURIComponent(ctx.tenantId) + '&limit=100');
      var apps = appsData.result || [];
      var results = [];
      var lower = query.toLowerCase();

      for (var i = 0; i < apps.length; i++) {
        var app = apps[i];
        try {
          // Load all devices from this app (paginated)
          var allDevices = [];
          var offset = 0;
          var limit = 100;
          while (true) {
            var data = await proxyFetch(
              '/api/devices?applicationId=' + encodeURIComponent(app.id) +
              '&limit=' + limit + '&offset=' + offset
            );
            var devs = data.result || [];
            allDevices = allDevices.concat(devs);
            if (devs.length < limit || allDevices.length >= Number(data.totalCount || 0)) break;
            offset += limit;
          }

          // Filter client-side: match DevEUI, name, or any tag value
          allDevices.forEach(function (d) {
            var devEui = (d.devEui || '').toLowerCase();
            var name = (d.name || '').toLowerCase();
            var tagMatch = false;
            var tags = d.tags || {};
            for (var key in tags) {
              if (key.toLowerCase().includes(lower) || (tags[key] || '').toLowerCase().includes(lower)) {
                tagMatch = true;
                break;
              }
            }

            if (devEui.includes(lower) || name.includes(lower) || tagMatch) {
              results.push({
                devEui: d.devEui,
                name: d.name || '',
                application: app.name,
                deviceProfileName: d.deviceProfileName || '',
                lastSeenAt: d.lastSeenAt || '',
                tags: tags,
              });
            }
          });
        } catch (e) {
          // skip app on error
        }
      }

      if (results.length === 0) {
        document.getElementById('search-status').textContent = t('cross_search.no_results');
        document.getElementById('search-status').className = 'text-xs text-white/50';
        return;
      }

      document.getElementById('search-status').textContent = t('cross_search.results', { count: results.length });
      document.getElementById('search-status').className = 'text-xs text-green-400';

      // Build results table
      var resultsArea = document.getElementById('search-results');
      var thead = document.getElementById('search-results-thead');
      var tbody = document.getElementById('search-results-tbody');
      resultsArea.classList.remove('hidden');
      thead.innerHTML = '';
      tbody.innerHTML = '';

      var headerRow = document.createElement('tr');
      [t('cross_search.col_deveui'), t('cross_search.col_name'), t('cross_search.col_application'), t('cross_search.col_profile'), t('cross_search.col_tags'), t('cross_search.col_last_seen')].forEach(function (h) {
        var th = document.createElement('th');
        th.className = 'text-left px-2 py-1 text-white/50 border-b border-white/10 whitespace-nowrap';
        th.textContent = h;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      results.forEach(function (r, idx) {
        var tr = document.createElement('tr');
        tr.className = idx % 2 === 0 ? 'bg-white/3' : '';
        var lastSeen = r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : 'Never';
        var tagsStr = Object.entries(r.tags || {}).map(function (e) { return e[0] + '=' + e[1]; }).join(', ');
        [r.devEui, r.name, r.application, r.deviceProfileName, tagsStr, lastSeen].forEach(function (val) {
          var td = document.createElement('td');
          td.className = 'px-2 py-1 text-white/70 whitespace-nowrap';
          td.textContent = val;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    } catch (err) {
      document.getElementById('search-status').textContent = 'Error: ' + err.message;
      document.getElementById('search-status').className = 'text-xs text-red-400';
    }
  }

  // ==================================================
  // EVENT BINDINGS
  // ==================================================

  // Tabs
  initTabs();

  // Export
  document.getElementById('btn-load-export').addEventListener('click', loadExportDevices);
  document.getElementById('btn-download-export').addEventListener('click', downloadExport);

  // Delete
  document.getElementById('btn-load-delete').addEventListener('click', loadDeleteDevices);
  document.getElementById('btn-select-all-delete').addEventListener('click', function () {
    selectAllInContainer('delete-devices-list');
    updateSelectedCount('delete-devices-list', 'delete-selected-count');
  });
  document.getElementById('btn-deselect-all-delete').addEventListener('click', function () {
    deselectAllInContainer('delete-devices-list');
    updateSelectedCount('delete-devices-list', 'delete-selected-count');
  });
  document.getElementById('btn-bulk-delete').addEventListener('click', executeBulkDelete);
  document.getElementById('delete-search').addEventListener('input', function () {
    renderDeviceList(deleteDevices, 'delete-devices-list', this.value);
  });
  document.getElementById('delete-devices-list').addEventListener('change', function () {
    updateSelectedCount('delete-devices-list', 'delete-selected-count');
  });

  // Migrate
  document.getElementById('btn-load-migrate').addEventListener('click', loadMigrateDevices);
  document.getElementById('btn-select-all-migrate').addEventListener('click', function () {
    selectAllInContainer('migrate-devices-list');
    updateSelectedCount('migrate-devices-list', 'migrate-selected-count');
  });
  document.getElementById('btn-deselect-all-migrate').addEventListener('click', function () {
    deselectAllInContainer('migrate-devices-list');
    updateSelectedCount('migrate-devices-list', 'migrate-selected-count');
  });
  document.getElementById('btn-bulk-migrate').addEventListener('click', executeMigration);
  document.getElementById('migrate-search').addEventListener('input', function () {
    renderDeviceList(migrateDevicesList, 'migrate-devices-list', this.value);
  });
  document.getElementById('migrate-devices-list').addEventListener('change', function () {
    updateSelectedCount('migrate-devices-list', 'migrate-selected-count');
  });

  // Change DP
  document.getElementById('btn-load-dp-change').addEventListener('click', loadDpDevices);
  document.getElementById('btn-select-all-dp').addEventListener('click', function () {
    selectAllInContainer('dp-devices-list');
    updateSelectedCount('dp-devices-list', 'dp-selected-count');
  });
  document.getElementById('btn-deselect-all-dp').addEventListener('click', function () {
    deselectAllInContainer('dp-devices-list');
    updateSelectedCount('dp-devices-list', 'dp-selected-count');
  });
  document.getElementById('btn-bulk-change-dp').addEventListener('click', executeDpChange);
  document.getElementById('dp-search').addEventListener('input', function () {
    renderDeviceList(dpDevices, 'dp-devices-list', this.value);
  });
  document.getElementById('dp-devices-list').addEventListener('change', function () {
    updateSelectedCount('dp-devices-list', 'dp-selected-count');
  });

  // Update Tags
  var tagsDropZone = document.getElementById('tags-drop-zone');
  tagsDropZone.addEventListener('click', function () {
    document.getElementById('tags-file-input').click();
  });
  tagsDropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    tagsDropZone.classList.add('border-white/40');
  });
  tagsDropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    tagsDropZone.classList.remove('border-white/40');
  });
  tagsDropZone.addEventListener('drop', handleTagsDrop);
  document.getElementById('tags-file-input').addEventListener('change', function (e) {
    if (e.target.files && e.target.files.length > 0) {
      tagsFile = e.target.files[0];
      showTagsFileInfo();
    }
  });
  document.getElementById('btn-execute-tags').addEventListener('click', executeTagUpdate);

  // Cross-app Search
  document.getElementById('btn-search-cross').addEventListener('click', searchCrossApp);
  document.getElementById('search-deveui').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchCrossApp();
  });

  // Populate bulk app selector from connection events
  window.addEventListener('cs-apps-loaded', function (e) {
    var select = document.getElementById('bulk-app-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select --</option>';
    (e.detail || []).forEach(function (app) {
      var opt = document.createElement('option');
      opt.value = app.id;
      opt.textContent = esc(app.name);
      select.appendChild(opt);
    });
  });
})();
