// Settings page logic
(function () {
  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  // ---- MQTT ----

  async function loadSettings() {
    try {
      const data = await api('/api/settings');

      if (data.mqtt) {
        document.getElementById('mqtt-server').value = data.mqtt.server || '';
        document.getElementById('mqtt-topic').value = data.mqtt.topic || '';
        document.getElementById('mqtt-username').value = data.mqtt.username || '';
        document.getElementById('mqtt-password').value = data.mqtt.password || '';
        document.getElementById('mqtt-format').value = data.mqtt.format || 'protobuf';
        document.getElementById('mqtt-app-topic').value = data.mqtt.application_topic || '';
      }

      if (data.chirpstack_api) {
        document.getElementById('cs-url').value = data.chirpstack_api.url || '';
        document.getElementById('cs-api-key').value = data.chirpstack_api.api_key || '';
      }

      updateMqttStatus(data.mqtt_status);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  function updateMqttStatus(status) {
    const dot = document.getElementById('mqtt-status-dot');
    const text = document.getElementById('mqtt-status-text');
    if (!status) {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
      text.textContent = t('settings.mqtt_status_unknown');
      return;
    }
    if (status.connected) {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-green-500';
      text.textContent = t('settings.mqtt_connected', { server: status.server || 'broker' });
    } else if (status.server) {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse';
      text.textContent = t('settings.mqtt_connecting', { server: status.server });
    } else {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-gray-500';
      text.textContent = t('settings.mqtt_not_configured');
    }
  }

  async function refreshStatus() {
    try {
      const status = await api('/api/settings/status');
      updateMqttStatus(status);
    } catch { /* ignore */ }
  }

  function showSaveStatus(elId, message, isError) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.className = 'text-xs ' + (isError ? 'text-red-400' : 'text-green-400');
    setTimeout(() => { el.textContent = ''; }, 4000);
  }

  document.getElementById('save-mqtt').addEventListener('click', async () => {
    const server = document.getElementById('mqtt-server').value.trim();
    if (!server) {
      showSaveStatus('mqtt-save-status', t('settings.server_url_required'), true);
      return;
    }

    try {
      await api('/api/settings/mqtt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server,
          topic: document.getElementById('mqtt-topic').value.trim() || undefined,
          username: document.getElementById('mqtt-username').value || undefined,
          password: document.getElementById('mqtt-password').value || undefined,
          format: document.getElementById('mqtt-format').value,
          application_topic: document.getElementById('mqtt-app-topic').value.trim() || undefined,
        }),
      });
      showSaveStatus('mqtt-save-status', t('settings.saved_connecting'), false);
      // Refresh status after a delay to let MQTT connect
      setTimeout(refreshStatus, 2000);
      setTimeout(refreshStatus, 5000);
    } catch (err) {
      showSaveStatus('mqtt-save-status', err.message, true);
    }
  });

  // ---- ChirpStack API ----

  document.getElementById('save-cs').addEventListener('click', async () => {
    const url = document.getElementById('cs-url').value.trim();
    const apiKey = document.getElementById('cs-api-key').value.trim();

    if (!url || !apiKey) {
      showSaveStatus('cs-save-status', t('settings.url_apikey_required'), true);
      return;
    }

    try {
      await api('/api/settings/chirpstack-api', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, api_key: apiKey }),
      });
      showSaveStatus('cs-save-status', t('settings.saved_sync'), false);
    } catch (err) {
      showSaveStatus('cs-save-status', err.message, true);
    }
  });

  document.getElementById('delete-cs').addEventListener('click', async () => {
    try {
      await api('/api/settings/chirpstack-api', { method: 'DELETE' });
      document.getElementById('cs-url').value = '';
      document.getElementById('cs-api-key').value = '';
      showSaveStatus('cs-save-status', t('common.disabled'), false);
    } catch (err) {
      showSaveStatus('cs-save-status', err.message, true);
    }
  });

  // ---- Operators ----

  async function loadOperators() {
    try {
      const data = await api('/api/operators');
      const list = document.getElementById('operators-list');
      if (!data.operators || data.operators.length === 0) {
        list.innerHTML = `<div class="text-xs text-white/30 py-2">${t('settings.no_operators')}</div>`;
        return;
      }
      list.innerHTML = data.operators.map(op =>
        `<div class="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-sm">
          <div class="flex items-center gap-4">
            <span class="font-mono text-white/80">${esc(op.prefix)}</span>
            <span class="text-white/60">${esc(op.name)}</span>
            <span class="text-xs text-white/30">priority: ${op.priority ?? 0}</span>
          </div>
          <button onclick="deleteOperator(${op.id})" class="text-red-400 hover:text-red-300 text-xs px-2">${t('common.delete')}</button>
        </div>`
      ).join('');
    } catch (err) {
      console.error('Failed to load operators:', err);
    }
  }

  window.deleteOperator = async function (id) {
    try {
      await api('/api/operators/' + id, { method: 'DELETE' });
      loadOperators();
    } catch (err) {
      console.error('Failed to delete operator:', err);
    }
  };

  document.getElementById('add-operator').addEventListener('click', async () => {
    const prefix = document.getElementById('op-prefix').value.trim();
    const name = document.getElementById('op-name').value.trim();
    const priority = parseInt(document.getElementById('op-priority').value, 10) || 0;

    if (!prefix || !name) return;

    try {
      await api('/api/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, name, priority }),
      });
      document.getElementById('op-prefix').value = '';
      document.getElementById('op-name').value = '';
      document.getElementById('op-priority').value = '10';
      loadOperators();
    } catch (err) {
      console.error('Failed to add operator:', err);
    }
  });

  // ---- Hide Rules ----

  async function loadHideRules() {
    try {
      const data = await api('/api/hide-rules');
      const list = document.getElementById('hide-rules-list');
      if (!data.rules || data.rules.length === 0) {
        list.innerHTML = `<div class="text-xs text-white/30 py-2">${t('settings.no_hide_rules')}</div>`;
        return;
      }
      list.innerHTML = data.rules.map(rule =>
        `<div class="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-sm">
          <div class="flex items-center gap-4">
            <span class="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">${esc(rule.rule_type || rule.type)}</span>
            <span class="font-mono text-white/80">${esc(rule.prefix)}</span>
            <span class="text-white/40 text-xs">${esc(rule.description || '')}</span>
          </div>
          <button onclick="deleteHideRule(${rule.id})" class="text-red-400 hover:text-red-300 text-xs px-2">${t('common.delete')}</button>
        </div>`
      ).join('');
    } catch (err) {
      console.error('Failed to load hide rules:', err);
    }
  }

  window.deleteHideRule = async function (id) {
    try {
      await api('/api/hide-rules/' + id, { method: 'DELETE' });
      loadHideRules();
    } catch (err) {
      console.error('Failed to delete hide rule:', err);
    }
  };

  document.getElementById('add-hide-rule').addEventListener('click', async () => {
    const type = document.getElementById('hr-type').value;
    const prefix = document.getElementById('hr-prefix').value.trim();
    const description = document.getElementById('hr-desc').value.trim();

    if (!prefix) return;

    try {
      await api('/api/hide-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prefix, description: description || undefined }),
      });
      document.getElementById('hr-prefix').value = '';
      document.getElementById('hr-desc').value = '';
      loadHideRules();
    } catch (err) {
      console.error('Failed to add hide rule:', err);
    }
  });

  // ---- Helpers ----

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---- Init ----

  loadSettings();
  loadOperators();
  loadHideRules();

  // Auto-refresh MQTT status
  setInterval(refreshStatus, 5000);

  // Re-translate on language change
  window.addEventListener('langchange', () => {
    // Re-render MQTT status with current data
    refreshStatus();
    // Re-render lists
    loadOperators();
    loadHideRules();
  });
})();
