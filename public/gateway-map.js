// Gateway Map module using OpenLayers
let gwMap = null;
let gwVectorSource = null;
let gwPopupOverlay = null;
let gwPopupEl = null;
let isMapExpanded = false;

function initGatewayMap() {
  gwPopupEl = document.getElementById('gateway-map-popup');

  gwVectorSource = new ol.source.Vector();

  const vectorLayer = new ol.layer.Vector({
    source: gwVectorSource,
    style: function (feature) {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 11,
          fill: new ol.style.Fill({ color: 'rgba(249, 115, 22, 0.8)' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 1 }),
        }),
        text: new ol.style.Text({
          text: '\u{1F4E1}',
          font: '14px sans-serif',
          textAlign: 'center',
          textBaseline: 'middle',
          offsetY: 1,
        }),
      });
    },
  });

  gwPopupOverlay = new ol.Overlay({
    element: gwPopupEl,
    autoPan: { animation: { duration: 250 } },
    positioning: 'bottom-center',
    offset: [0, -15],
  });

  const expandIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const collapseIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

  const expandButton = document.createElement('button');
  expandButton.innerHTML = expandIcon;
  expandButton.type = 'button';
  expandButton.title = 'Toggle Fullscreen';
  
  const expandElement = document.createElement('div');
  expandElement.className = 'ol-expand ol-unselectable ol-control';
  expandElement.appendChild(expandButton);

  const expandControl = new ol.control.Control({
    element: expandElement,
  });

  expandButton.addEventListener('click', function() {
    toggleMapFullscreen(expandButton, expandIcon, collapseIcon);
  });

  gwMap = new ol.Map({
    target: 'gateway-map',
    layers: [
      new ol.layer.Tile({
        source: new ol.source.OSM(),
      }),
      vectorLayer,
    ],
    overlays: [gwPopupOverlay],
    view: new ol.View({
      center: ol.proj.fromLonLat([0, 0]),
      zoom: 2,
      enableRotation: false,
    }),
    controls: ol.control.defaults.defaults({ attribution: false }).extend([
      expandControl,
    ]),
  });

  // Click handler for popups
  gwMap.on('click', function (evt) {
    const feature = gwMap.forEachFeatureAtPixel(evt.pixel, function (f) { return f; });
    if (feature) {
      const gw = feature.get('gatewayData');
      const coord = feature.getGeometry().getCoordinates();
      showGatewayPopup(gw, coord);
    } else {
      closeGatewayPopup();
    }
  });

  // Pointer cursor on hover
  gwMap.on('pointermove', function (evt) {
    const hit = gwMap.hasFeatureAtPixel(evt.pixel);
    gwMap.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });
}

function showGatewayPopup(gw, coord) {
  const lastSeen = gw.last_seen ? formatPopupTime(gw.last_seen) : '?';
  const airtime = gw.total_airtime_ms ? formatPopupAirtime(gw.total_airtime_ms) : '0ms';

  gwPopupEl.innerHTML = `
    <div class="ol-popup-content">
      <button class="ol-popup-close" onclick="closeGatewayPopup()">&times;</button>
      <div class="ol-popup-title">${gw.name || gw.gateway_id}</div>
      ${gw.name ? `<div class="ol-popup-id">${gw.gateway_id}</div>` : ''}
      <div class="ol-popup-stats">
        <div class="ol-popup-stat">
          <span class="ol-popup-stat-label">Packets</span>
          <span class="ol-popup-stat-value">${formatNumber(gw.packet_count || 0)}</span>
        </div>
        <div class="ol-popup-stat">
          <span class="ol-popup-stat-label">Devices</span>
          <span class="ol-popup-stat-value">${formatNumber(gw.unique_devices || 0)}</span>
        </div>
        <div class="ol-popup-stat">
          <span class="ol-popup-stat-label">Airtime</span>
          <span class="ol-popup-stat-value">${airtime}</span>
        </div>
        <div class="ol-popup-stat">
          <span class="ol-popup-stat-label">Last Seen</span>
          <span class="ol-popup-stat-value">${lastSeen}</span>
        </div>
      </div>
      <button class="ol-popup-switch-btn" onclick="switchToGateway('${gw.gateway_id}')">Switch to Gateway</button>
    </div>
  `;
  gwPopupOverlay.setPosition(coord);
}

function closeGatewayPopup() {
  gwPopupOverlay.setPosition(undefined);
}

function switchToGateway(gatewayId) {
  closeGatewayPopup();
  selectGateway(gatewayId);
}

function updateGatewayMap(gatewayList) {
  if (!gwVectorSource) return;

  gwVectorSource.clear();

  const features = [];
  for (const gw of gatewayList) {
    if (gw.latitude == null || gw.longitude == null) continue;
    if (gw.latitude === 0 && gw.longitude === 0) continue;

    const feature = new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([gw.longitude, gw.latitude])),
    });
    feature.set('gatewayData', gw);
    features.push(feature);
  }

  if (features.length === 0) {
    gwVectorSource.clear(); // Ensure it is cleared
    showGatewayMapCard(true);
    gwMap.getView().setCenter(ol.proj.fromLonLat([0, 30]));
    gwMap.getView().setZoom(1);
    return;
  }

  gwVectorSource.addFeatures(features);
  showGatewayMapCard(true);

  // Fit view to extent after map is visible and resized
  setTimeout(() => {
    gwMap.updateSize();
    const extent = gwVectorSource.getExtent();
    gwMap.getView().fit(extent, {
      padding: [50, 50, 50, 50],
      maxZoom: 12,
      duration: 300,
    });
  }, 100);
}

function showGatewayMapCard(visible) {
  const card = document.getElementById('gateway-map-card');
  if (!card) return;
  card.style.display = visible ? '' : 'none';
  if (visible && gwMap) {
    // Trigger map resize after becoming visible
    setTimeout(() => gwMap.updateSize(), 50);
  }
}

function formatPopupTime(timestamp) {
  if (!timestamp) return '?';
  let d;
  if (typeof timestamp === 'number') {
    d = new Date(timestamp);
  } else if (timestamp.includes('Z') || timestamp.includes('+')) {
    d = new Date(timestamp);
  } else {
    d = new Date(timestamp.replace(' ', 'T') + 'Z');
  }
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPopupAirtime(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function toggleMapFullscreen(btn, expandIcon, collapseIcon) {
  isMapExpanded = !isMapExpanded;
  const card = document.getElementById('gateway-map-card');

  if (isMapExpanded) {
    document.body.classList.add('map-expanded');
    card.classList.add('expanded');
    btn.innerHTML = collapseIcon;
  } else {
    document.body.classList.remove('map-expanded');
    card.classList.remove('expanded');
    btn.innerHTML = expandIcon;
  }
  
  // Wait for transition or just update
  setTimeout(() => {
    if (gwMap) gwMap.updateSize();
  }, 100);
}
