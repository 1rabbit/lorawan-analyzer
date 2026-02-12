/**
 * Device Analysis Module
 * Provides device metrics analysis and visualization for ChirpStack Toolkit
 */
(function () {
  'use strict';

  // Module state
  var allDevices = [];
  var filteredDevices = [];
  var profileMap = {}; // deviceProfileId -> deviceProfileName
  var stats = null;
  var currentDevEui = null; // For metrics modal

  // DOM elements
  var btnAnalyze = document.getElementById('btn-analyze');
  var progressSection = document.getElementById('analyze-progress');
  var progressText = document.getElementById('analyze-progress-text');
  var progressPct = document.getElementById('analyze-progress-pct');
  var progressBar = document.getElementById('analyze-progress-bar');
  var statsSection = document.getElementById('analyze-stats');
  var tableSection = document.getElementById('analyze-table-section');
  var searchInput = document.getElementById('az-search');
  var statusFilter = document.getElementById('az-status-filter');
  var profileFilter = document.getElementById('az-profile-filter');
  var sortSelect = document.getElementById('az-sort');
  var deviceCount = document.getElementById('az-count');
  var exportBtn = document.getElementById('btn-az-export');
  var tableBody = document.getElementById('az-tbody');
  var metricsModal = document.getElementById('metrics-modal');
  var metricsPeriod = document.getElementById('metrics-period');

  /**
   * Proxy fetch helper - forwards requests to ChirpStack via our proxy
   */
  function proxyFetch(path) {
    var ctx = window.getConnectionContext();
    return fetch('/proxy' + path, {
      headers: {
        'X-ChirpStack-URL': ctx.url,
        'Grpc-Metadata-Authorization': 'Bearer ' + ctx.token,
      },
    }).then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return { error: res.statusText };
          })
          .then(function (err) {
            throw new Error(err.error || err.message || res.statusText);
          });
      }
      return res.json();
    });
  }

  /**
   * HTML escape helper
   */
  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML.replace(/"/g, '&quot;');
  }

  /**
   * Classify device status based on lastSeenAt
   */
  function getDeviceStatus(device) {
    if (!device.lastSeenAt) return 'never';

    var now = new Date();
    var lastSeen = new Date(device.lastSeenAt);
    var diffMs = now - lastSeen;
    var diffHours = diffMs / (1000 * 60 * 60);
    var diffDays = diffHours / 24;

    if (diffHours <= 24) return 'active';
    if (diffDays <= 7) return 'recent';
    if (diffDays <= 30) return 'inactive';
    return 'offline';
  }

  /**
   * Get status label and CSS classes
   */
  function getStatusInfo(status) {
    var statusMap = {
      active: {
        label: window.t('analyze.status_active'),
        classes: 'bg-green-500/20 text-green-400',
      },
      recent: {
        label: window.t('analyze.status_recent'),
        classes: 'bg-blue-500/20 text-blue-400',
      },
      inactive: {
        label: window.t('analyze.status_inactive'),
        classes: 'bg-amber-500/20 text-amber-400',
      },
      offline: {
        label: window.t('analyze.status_offline'),
        classes: 'bg-red-500/20 text-red-400',
      },
      never: {
        label: window.t('analyze.status_never'),
        classes: 'bg-white/10 text-white/40',
      },
    };
    return statusMap[status] || statusMap.never;
  }

  /**
   * Format relative time from date
   */
  function formatRelativeTime(dateStr) {
    if (!dateStr) return window.t('common.never');

    var now = new Date();
    var date = new Date(dateStr);
    var diffMs = now - date;
    var diffMin = Math.floor(diffMs / (1000 * 60));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var diffMonths = Math.floor(diffDays / 30);

    if (diffMin < 1) return '< 1min';
    if (diffMin < 60) return diffMin + 'min';
    if (diffHours < 24) return diffHours + 'h';
    if (diffDays < 30) return diffDays + 'd';
    return diffMonths + 'mo';
  }

  /**
   * Compute statistics from devices array
   */
  function computeStats(devices) {
    var result = {
      total: devices.length,
      active: 0,
      recent: 0,
      inactive: 0,
      offline: 0,
      never: 0,
      byProfile: {},
    };

    devices.forEach(function (device) {
      var status = getDeviceStatus(device);
      result[status]++;

      // Count by profile
      var profileName = profileMap[device.deviceProfileId] || window.t('common.unknown');
      if (!result.byProfile[profileName]) {
        result.byProfile[profileName] = 0;
      }
      result.byProfile[profileName]++;
    });

    return result;
  }

  /**
   * Render stats cards and profile distribution
   */
  function renderStats(statsData) {
    // Update stat cards
    document.getElementById('az-total').textContent = statsData.total || 0;
    document.getElementById('az-active').textContent = statsData.active || 0;
    document.getElementById('az-recent').textContent = statsData.recent || 0;
    document.getElementById('az-inactive').textContent = statsData.inactive || 0;
    document.getElementById('az-offline').textContent = statsData.offline || 0;
    document.getElementById('az-never').textContent = statsData.never || 0;

    // Render profile distribution bars
    var profileBars = document.getElementById('az-profile-bars');
    var profiles = Object.keys(statsData.byProfile).sort(function (a, b) {
      return statsData.byProfile[b] - statsData.byProfile[a];
    });

    var maxCount = Math.max.apply(
      null,
      profiles.map(function (p) {
        return statsData.byProfile[p];
      })
    );

    var html = profiles
      .map(function (profileName) {
        var count = statsData.byProfile[profileName];
        var pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return (
          '<div class="flex items-center gap-3 text-xs">' +
          '<span class="w-32 text-white/60 truncate" title="' +
          esc(profileName) +
          '">' +
          esc(profileName) +
          '</span>' +
          '<div class="flex-1 bg-white/10 rounded-full h-2">' +
          '<div class="h-2 rounded-full" style="width:' +
          pct +
          '%;background:var(--accent)"></div>' +
          '</div>' +
          '<span class="text-white/40 w-8 text-right">' +
          count +
          '</span>' +
          '</div>'
        );
      })
      .join('');

    profileBars.innerHTML = html || '<p class="text-white/40 text-sm">' + window.t('common.no_data') + '</p>';

    // Populate profile filter dropdown
    var filterHtml = '<option value="">' + window.t('analyze.all_profiles') + '</option>';
    profiles.forEach(function (profileName) {
      filterHtml += '<option value="' + esc(profileName) + '">' + esc(profileName) + '</option>';
    });
    profileFilter.innerHTML = filterHtml;

    // Show stats section
    statsSection.classList.remove('hidden');
  }

  /**
   * Apply filters and sort to allDevices -> filteredDevices
   */
  function applyFilters() {
    var searchTerm = searchInput.value.toLowerCase().trim();
    var statusValue = statusFilter.value;
    var profileValue = profileFilter.value;
    var sortValue = sortSelect.value;

    // Filter
    filteredDevices = allDevices.filter(function (device) {
      // Search filter
      if (searchTerm) {
        var nameMatch = device.name && device.name.toLowerCase().indexOf(searchTerm) !== -1;
        var euiMatch = device.devEui && device.devEui.toLowerCase().indexOf(searchTerm) !== -1;
        if (!nameMatch && !euiMatch) return false;
      }

      // Status filter
      if (statusValue) {
        var deviceStatus = getDeviceStatus(device);
        if (deviceStatus !== statusValue) return false;
      }

      // Profile filter
      if (profileValue) {
        var deviceProfileName = profileMap[device.deviceProfileId] || window.t('common.unknown');
        if (deviceProfileName !== profileValue) return false;
      }

      return true;
    });

    // Sort
    if (sortValue === 'last_seen_desc') {
      filteredDevices.sort(function (a, b) {
        var dateA = a.lastSeenAt ? new Date(a.lastSeenAt) : new Date(0);
        var dateB = b.lastSeenAt ? new Date(b.lastSeenAt) : new Date(0);
        return dateB - dateA;
      });
    } else if (sortValue === 'last_seen_asc') {
      filteredDevices.sort(function (a, b) {
        var dateA = a.lastSeenAt ? new Date(a.lastSeenAt) : new Date(0);
        var dateB = b.lastSeenAt ? new Date(b.lastSeenAt) : new Date(0);
        return dateA - dateB;
      });
    } else if (sortValue === 'name_asc') {
      filteredDevices.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    } else if (sortValue === 'name_desc') {
      filteredDevices.sort(function (a, b) {
        return (b.name || '').localeCompare(a.name || '');
      });
    }

    renderTable();
  }

  /**
   * Render filtered devices table
   */
  function renderTable() {
    // Update count
    deviceCount.textContent = filteredDevices.length + ' devices';

    // Render rows
    var html = filteredDevices
      .map(function (device) {
        var status = getDeviceStatus(device);
        var statusInfo = getStatusInfo(status);
        var profileName = profileMap[device.deviceProfileId] || window.t('common.unknown');
        var lastSeen = formatRelativeTime(device.lastSeenAt);

        // Tags
        var tagsHtml = '';
        if (device.tags && typeof device.tags === 'object') {
          tagsHtml = Object.keys(device.tags)
            .map(function (key) {
              var value = device.tags[key];
              return (
                '<span class="inline-block px-1.5 py-0.5 bg-white/10 rounded text-white/50 mr-1 mb-0.5 text-xs">' +
                esc(key + '=' + value) +
                '</span>'
              );
            })
            .join('');
        }
        if (!tagsHtml) {
          tagsHtml = '<span class="text-white/30 text-xs">—</span>';
        }

        return (
          '<tr class="border-b border-white/5 hover:bg-white/5">' +
          '<td class="px-4 py-3 text-sm">' +
          esc(device.name || '—') +
          '</td>' +
          '<td class="px-4 py-3 text-xs font-mono text-white/60">' +
          esc(device.devEui || '—') +
          '</td>' +
          '<td class="px-4 py-3 text-xs text-white/60">' +
          esc(profileName) +
          '</td>' +
          '<td class="px-4 py-3">' +
          tagsHtml +
          '</td>' +
          '<td class="px-4 py-3 text-xs text-white/60">' +
          lastSeen +
          '</td>' +
          '<td class="px-4 py-3">' +
          '<span class="inline-block px-2 py-1 rounded text-xs font-medium ' +
          statusInfo.classes +
          '">' +
          statusInfo.label +
          '</span>' +
          '</td>' +
          '<td class="px-4 py-3">' +
          '<button onclick="showDeviceMetrics(\'' +
          esc(device.devEui) +
          '\', \'' +
          esc(device.name) +
          '\')" class="text-xs text-[#00d4aa] hover:underline">' +
          window.t('analyze.metrics') +
          '</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    tableBody.innerHTML =
      html || '<tr><td colspan="7" class="px-4 py-8 text-center text-white/40">' + window.t('common.no_data') + '</td></tr>';

    // Show table section
    tableSection.classList.remove('hidden');
  }

  /**
   * Run device analysis
   */
  function runAnalysis() {
    var ctx = window.getConnectionContext();
    if (!ctx.tenantId) {
      alert(window.t('analyze.select_tenant'));
      return;
    }

    // Reset state
    allDevices = [];
    filteredDevices = [];
    profileMap = {};
    stats = null;

    // Show progress, hide stats/table
    progressSection.classList.remove('hidden');
    statsSection.classList.add('hidden');
    tableSection.classList.add('hidden');
    progressText.textContent = window.t('analyze.loading_apps');
    progressPct.textContent = '0%';
    progressBar.style.width = '0%';

    var appIds = [];

    // Step 1: Get application IDs
    var appPromise;
    if (ctx.applicationId) {
      // Single app mode
      appIds = [ctx.applicationId];
      appPromise = Promise.resolve();
    } else {
      // Load all apps for tenant
      appPromise = proxyFetch('/api/applications?tenantId=' + ctx.tenantId + '&limit=1000').then(function (data) {
        appIds = (data.result || []).map(function (app) {
          return app.id;
        });
        if (appIds.length === 0) {
          throw new Error(window.t('analyze.no_apps'));
        }
      });
    }

    appPromise
      .then(function () {
        // Step 2: Load all devices from all apps
        var totalDevices = 0;
        var loadedDevices = 0;

        return appIds
          .reduce(function (chain, appId) {
            return chain.then(function () {
              return loadDevicesForApp(appId, function (chunkSize, appTotal) {
                var pct = allDevices.length > 0 ? Math.min(90, Math.floor((allDevices.length / Math.max(allDevices.length, 1)) * 90)) : 0;
                progressText.textContent = window.t('analyze.loading') + ': ' + allDevices.length + ' devices';
                progressPct.textContent = pct + '%';
                progressBar.style.width = pct + '%';
              });
            });
          }, Promise.resolve())
          .then(function () {
            progressText.textContent = window.t('analyze.loading_profiles');
            return loadDeviceProfiles();
          });
      })
      .then(function () {
        // Step 3: Compute stats
        progressText.textContent = window.t('analyze.computing_stats');
        stats = computeStats(allDevices);

        // Step 4: Render stats
        renderStats(stats);

        // Step 5: Apply filters and render table
        applyFilters();

        // Hide progress
        progressSection.classList.add('hidden');
      })
      .catch(function (err) {
        console.error('Analysis error:', err);
        alert(window.t('analyze.error_analysis') + ': ' + err.message);
        progressSection.classList.add('hidden');
      });
  }

  /**
   * Load all devices for a single application (with pagination)
   */
  function loadDevicesForApp(appId, progressCallback) {
    var devices = [];
    var limit = 100;
    var offset = 0;

    function loadPage() {
      return proxyFetch('/api/devices?applicationId=' + appId + '&limit=' + limit + '&offset=' + offset).then(function (data) {
        var result = data.result || [];
        devices = devices.concat(result);
        allDevices = allDevices.concat(result);

        if (progressCallback) {
          progressCallback(result, data.totalCount || devices.length);
        }

        // Continue pagination if more devices exist
        if (result.length === limit && data.totalCount && offset + limit < data.totalCount) {
          offset += limit;
          return loadPage();
        }

        return devices;
      });
    }

    return loadPage();
  }

  /**
   * Load device profiles and build profileMap
   */
  function loadDeviceProfiles() {
    var ctx = window.getConnectionContext();
    return proxyFetch('/api/device-profiles?tenantId=' + ctx.tenantId + '&limit=1000')
      .then(function (data) {
        var profiles = data.result || [];
        profiles.forEach(function (profile) {
          profileMap[profile.id] = profile.name;
        });
      })
      .catch(function (err) {
        console.warn('Failed to load device profiles:', err);
        // Non-critical, continue with unknown profiles
      });
  }

  /**
   * Export filtered devices as CSV
   */
  function exportCSV() {
    if (filteredDevices.length === 0) {
      alert(window.t('analyze.no_devices_export'));
      return;
    }

    // CSV headers
    var headers = [
      window.t('analyze.col_name'),
      window.t('analyze.col_deveui'),
      window.t('analyze.col_profile'),
      window.t('analyze.col_tags'),
      window.t('analyze.col_last_seen'),
      window.t('analyze.col_status'),
    ];

    // CSV rows
    var rows = filteredDevices.map(function (device) {
      var status = getDeviceStatus(device);
      var statusInfo = getStatusInfo(status);
      var profileName = profileMap[device.deviceProfileId] || window.t('common.unknown');
      var lastSeen = device.lastSeenAt || '';

      // Tags as key=value pairs
      var tagsStr = '';
      if (device.tags && typeof device.tags === 'object') {
        tagsStr = Object.keys(device.tags)
          .map(function (key) {
            return key + '=' + device.tags[key];
          })
          .join('; ');
      }

      return [device.name || '', device.devEui || '', profileName, tagsStr, lastSeen, statusInfo.label];
    });

    // Build CSV content with BOM for Excel compatibility
    var csvContent = '\uFEFF'; // BOM
    csvContent += headers.join(',') + '\r\n';
    rows.forEach(function (row) {
      csvContent +=
        row
          .map(function (cell) {
            // Escape quotes and wrap in quotes
            var escaped = String(cell).replace(/"/g, '""');
            return '"' + escaped + '"';
          })
          .join(',') + '\r\n';
    });

    // Download
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    var date = new Date().toISOString().split('T')[0];
    link.download = 'device_analysis_' + date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Show device metrics modal
   */
  window.showDeviceMetrics = function (devEui, name) {
    currentDevEui = devEui;

    // Set modal title
    document.getElementById('metrics-device-name').textContent = name || devEui;
    document.getElementById('metrics-device-eui').textContent = devEui;

    // Show modal, show loading
    metricsModal.classList.remove('hidden');
    document.getElementById('metrics-loading').classList.remove('hidden');
    document.getElementById('metrics-content').classList.add('hidden');
    document.getElementById('metrics-error').classList.add('hidden');

    // Reset period
    metricsPeriod.value = '24h';

    // Load metrics
    loadMetrics(devEui, '24h');
  };

  /**
   * Close metrics modal
   */
  window.closeMetricsModal = function () {
    metricsModal.classList.add('hidden');
    currentDevEui = null;
  };

  /**
   * Load device metrics from ChirpStack API
   */
  function loadMetrics(devEui, period) {
    // Calculate date range
    var end = new Date();
    var start = new Date();
    var aggregation = 'HOUR';

    if (period === '24h') {
      start.setHours(start.getHours() - 24);
      aggregation = 'HOUR';
    } else if (period === '7d') {
      start.setDate(start.getDate() - 7);
      aggregation = 'HOUR';
    } else if (period === '30d') {
      start.setDate(start.getDate() - 30);
      aggregation = 'DAY';
    }

    var startIso = start.toISOString();
    var endIso = end.toISOString();

    proxyFetch('/api/devices/' + devEui + '/link-metrics?start=' + startIso + '&end=' + endIso + '&aggregation=' + aggregation)
      .then(function (data) {
        renderMetrics(data, period);
      })
      .catch(function (err) {
        console.error('Metrics error:', err);
        document.getElementById('metrics-loading').classList.add('hidden');
        document.getElementById('metrics-error').classList.remove('hidden');
        document.getElementById('metrics-error').textContent =
          window.t('analyze.metrics_error') + ': ' + err.message;
      });
  }

  /**
   * Parse ChirpStack metric dataset
   */
  function parseDataset(metric) {
    if (!metric || !metric.datasets || !metric.datasets[0] || !metric.timestamps) {
      return { values: [], timestamps: [] };
    }

    var data = metric.datasets[0].data;
    var timestamps = metric.timestamps;

    var values = timestamps.map(function (ts) {
      return data[ts] !== undefined ? parseFloat(data[ts]) : 0;
    });

    return { values: values, timestamps: timestamps };
  }

  /**
   * Render device metrics
   */
  function renderMetrics(data, period) {
    // Parse datasets
    var rxPackets = parseDataset(data.rxPackets);
    var gwRssi = parseDataset(data.gwRssi);
    var gwSnr = parseDataset(data.gwSnr);
    var errors = parseDataset(data.errors);

    // Calculate totals and averages
    var totalPackets = rxPackets.values.reduce(function (sum, val) {
      return sum + val;
    }, 0);
    var totalErrors = errors.values.reduce(function (sum, val) {
      return sum + val;
    }, 0);

    var rssiValues = gwRssi.values.filter(function (v) {
      return v !== 0;
    });
    var snrValues = gwSnr.values.filter(function (v) {
      return v !== 0;
    });

    var avgRssi =
      rssiValues.length > 0
        ? rssiValues.reduce(function (sum, val) {
            return sum + val;
          }, 0) / rssiValues.length
        : 0;

    var avgSnr =
      snrValues.length > 0
        ? snrValues.reduce(function (sum, val) {
            return sum + val;
          }, 0) / snrValues.length
        : 0;

    // Update metric values
    document.getElementById('mx-packets').textContent = Math.round(totalPackets);
    document.getElementById('mx-errors').textContent = Math.round(totalErrors);
    document.getElementById('mx-rssi').textContent = avgRssi ? avgRssi.toFixed(1) + ' dBm' : '—';
    document.getElementById('mx-snr').textContent = avgSnr ? avgSnr.toFixed(1) + ' dB' : '—';

    // Quality assessment
    var rssiQuality = document.getElementById('mx-rssi-quality');
    var snrQuality = document.getElementById('mx-snr-quality');

    if (avgRssi > -80) {
      rssiQuality.textContent = window.t('analyze.excellent');
      rssiQuality.className = 'text-xs text-green-400';
    } else if (avgRssi >= -110) {
      rssiQuality.textContent = window.t('analyze.fair');
      rssiQuality.className = 'text-xs text-yellow-400';
    } else if (avgRssi !== 0) {
      rssiQuality.textContent = window.t('analyze.poor');
      rssiQuality.className = 'text-xs text-red-400';
    } else {
      rssiQuality.textContent = '—';
      rssiQuality.className = 'text-xs text-white/40';
    }

    if (avgSnr > 5) {
      snrQuality.textContent = window.t('analyze.excellent');
      snrQuality.className = 'text-xs text-green-400';
    } else if (avgSnr >= 0) {
      snrQuality.textContent = window.t('analyze.fair');
      snrQuality.className = 'text-xs text-yellow-400';
    } else if (avgSnr !== 0) {
      snrQuality.textContent = window.t('analyze.poor');
      snrQuality.className = 'text-xs text-red-400';
    } else {
      snrQuality.textContent = '—';
      snrQuality.className = 'text-xs text-white/40';
    }

    // Render horizontal bar chart
    var chartContainer = document.getElementById('mx-chart');
    var maxValue = Math.max.apply(null, rxPackets.values);

    var chartHtml = rxPackets.timestamps
      .map(function (ts, idx) {
        var value = rxPackets.values[idx] || 0;
        var pct = maxValue > 0 ? (value / maxValue) * 100 : 0;

        // Format timestamp
        var date = new Date(ts);
        var formatted;
        if (period === '30d') {
          // DD/MM for 30-day view
          formatted = ('0' + date.getDate()).slice(-2) + '/' + ('0' + (date.getMonth() + 1)).slice(-2);
        } else {
          // HH:mm DD/MM for hourly view
          formatted =
            ('0' + date.getHours()).slice(-2) +
            ':' +
            ('0' + date.getMinutes()).slice(-2) +
            ' ' +
            ('0' + date.getDate()).slice(-2) +
            '/' +
            ('0' + (date.getMonth() + 1)).slice(-2);
        }

        return (
          '<div class="flex items-center gap-2 text-xs">' +
          '<span class="w-24 text-white/40 text-right shrink-0">' +
          formatted +
          '</span>' +
          '<div class="flex-1 bg-white/10 rounded h-3">' +
          '<div class="h-3 rounded" style="width:' +
          pct +
          '%;background:var(--accent);min-width:' +
          (value > 0 ? '2px' : '0') +
          '"></div>' +
          '</div>' +
          '<span class="w-6 text-white/50 text-right">' +
          Math.round(value) +
          '</span>' +
          '</div>'
        );
      })
      .join('');

    chartContainer.innerHTML = chartHtml || '<p class="text-white/40 text-sm">' + window.t('common.no_data') + '</p>';

    // Show content, hide loading
    document.getElementById('metrics-loading').classList.add('hidden');
    document.getElementById('metrics-content').classList.remove('hidden');
  }

  /**
   * Event bindings
   */
  function init() {
    // Analyze button
    btnAnalyze.addEventListener('click', runAnalysis);

    // Filter inputs
    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    profileFilter.addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    // Export button
    exportBtn.addEventListener('click', exportCSV);

    // Metrics period selector
    metricsPeriod.addEventListener('change', function () {
      if (currentDevEui) {
        document.getElementById('metrics-loading').classList.remove('hidden');
        document.getElementById('metrics-content').classList.add('hidden');
        loadMetrics(currentDevEui, metricsPeriod.value);
      }
    });

    // Language change listener - re-translate UI
    window.addEventListener('langchange', function () {
      // Re-render stats if available
      if (stats) {
        renderStats(stats);
      }
      // Re-render table if devices loaded
      if (filteredDevices.length > 0) {
        renderTable();
      }
      // Update progress text if visible
      if (!progressSection.classList.contains('hidden')) {
        progressText.textContent = window.t('analyze.loading_devices', { loaded: 0, total: 0 });
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
