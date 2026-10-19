(() => {
  'use strict';
  if (window.__komootMtbScaleBridgeInstalled) return;
  window.__komootMtbScaleBridgeInstalled = true;

  const SOURCE = 'userscript-mtb-scale-source';
  const PREFIX = 'userscript-mtb-scale-';
  const groups = [
    { id: 'S1', setting: 'S1', label: 'S1', color: '#2E8B57', prefixes: ['S1'], bare: ['1'] },
    { id: 'S2', setting: '2', label: 'S2', color: '#FF0000', prefixes: ['S2'], bare: ['2'] },
    { id: 'S3', setting: '3', label: 'S3', color: '#B22222', prefixes: ['S3'], bare: ['3'] },
    { id: 'S45', setting: '4-5', label: 'S4/S5', color: '#000000', prefixes: ['S4', 'S5'], bare: ['4', '5'] }
  ];
  let config = null;
  let activeMap = null;
  let retryTimer = null;
  let lastStatus = '';
  let updating = false;
  function safePath(url) {
    try { const u = new URL(String(url), location.href); return u.pathname; }
    catch (_) { return String(url || '').split('?')[0].slice(0, 180); }
  }
  function looksRouteRelated(url) {
    const path = safePath(url).toLowerCase();
    return path.includes('/api/') && /(routing|route|tour|coordinate|planned)/.test(path);
  }
  function isSameOriginApi(url) {
    try { const u = new URL(String(url || ''), location.href); return u.origin === location.origin && u.pathname.toLowerCase().includes('/api/'); }
    catch (_) { return false; }
  }
  // Komoot's routing response contains the complete planned-route geometry and altitude.
  // Capture only the public routing response; never inspect or forward request headers.
  let latestRouteData = null;
  const SLOPE_SOURCE = 'userscript-slope-source';
  const SLOPE_LAYER = 'userscript-slope-line';
  let slopeSignature = '';
  function isRoutingUrl(url) { return typeof url === 'string' && url.includes('/api/routing/tour'); }
  function publishRoutePayload(payload) {
    try {
      const items = payload && payload._embedded && payload._embedded.coordinates && payload._embedded.coordinates.items;
      if (!Array.isArray(items)) return;
      const valid = items.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.alt)).length;
      if (items.length < 2 || valid !== items.length) return;
      latestRouteData = payload;
      slopeSignature = '';
      const map = findMap();
      if (map) updateSlopeOverlay(map);
    } catch (e) { console.error('[Komoot slope overlay]', e); }
  }
  function installRoutingCapture() {
    if (window.__komootSlopeRoutingCaptureInstalled) return;
    window.__komootSlopeRoutingCaptureInstalled = true;
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const routeRelated = looksRouteRelated(requestUrl);
      const inspectApi = isSameOriginApi(requestUrl);
      const result = originalFetch.apply(this, args);
      if (inspectApi) result.then(response => {
        if (!response || !response.ok) return;
        response.clone().json().then(payload => {
          const items = payload && payload._embedded && payload._embedded.coordinates && payload._embedded.coordinates.items;
          if (isRoutingUrl(requestUrl) || (routeRelated && Array.isArray(items))) publishRoutePayload(payload);
        }).catch(() => {});
      }).catch(() => {});
      return result;
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__komootSlopeRoutingUrl = String(url || '');
      this.__komootSlopeRouteRelated = looksRouteRelated(url);
      this.__komootInspectApi = isSameOriginApi(url);
      return originalOpen.call(this, method, url, ...rest);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      if (this.__komootInspectApi) {
        this.addEventListener('load', function() {
          if (this.status < 200 || this.status >= 300) return;
          try {
            const payload = JSON.parse(this.responseText);
            const items = payload && payload._embedded && payload._embedded.coordinates && payload._embedded.coordinates.items;
            if (isRoutingUrl(this.__komootSlopeRoutingUrl) || (this.__komootSlopeRouteRelated && Array.isArray(items))) publishRoutePayload(payload);
          } catch (_) {}
        }, { once: true });
      }
      return originalSend.apply(this, args);
    };
  }
  function removeSlopeOverlay(map) {
    if (!map) return;
    try { if (map.getLayer(SLOPE_LAYER)) map.removeLayer(SLOPE_LAYER); } catch (_) {}
    try { if (map.getSource(SLOPE_SOURCE)) map.removeSource(SLOPE_SOURCE); } catch (_) {}
    slopeSignature = '';
  }
  function haversineMeters(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLng = (b.lng-a.lng)*rad;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));
  }
  function makeSlopeGeoJSON(payload) {
    const items = payload._embedded.coordinates.items;
    const features = [];
    // Use a centered ~60–90 m elevation window instead of adjacent-point grade to reduce noise.
    for (let i=0; i<items.length-1; i++) {
      let a = Math.max(0, i-1), b = Math.min(items.length-1, i+2);
      let distance = haversineMeters(items[a], items[b]);
      if (!Number.isFinite(distance) || distance < 1) { a=i; b=i+1; distance=haversineMeters(items[a],items[b]); }
      if (!Number.isFinite(distance) || distance < 1) continue;
      const slope = Math.max(-100, Math.min(100, ((items[b].alt-items[a].alt)/distance)*100));
      features.push({ type:'Feature', properties:{ slope }, geometry:{ type:'LineString', coordinates:[[items[i].lng,items[i].lat],[items[i+1].lng,items[i+1].lat]] } });
    }
    return { type:'FeatureCollection', features };
  }
  function updateSlopeOverlay(map) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    if (!config || config.slopeEnabled !== true) { removeSlopeOverlay(map); return; }
    if (!latestRouteData) return;
    try {
      const signature = String(latestRouteData.date || '') + ':' + latestRouteData._embedded.coordinates.items.length + ':' + String(latestRouteData.distance || '');
      if (signature === slopeSignature && map.getLayer(SLOPE_LAYER)) {
        try { map.moveLayer(SLOPE_LAYER); } catch (_) {}
        return;
      }
      const data = makeSlopeGeoJSON(latestRouteData);
      if (map.getLayer(SLOPE_LAYER)) map.removeLayer(SLOPE_LAYER);
      if (map.getSource(SLOPE_SOURCE)) map.removeSource(SLOPE_SOURCE);
      map.addSource(SLOPE_SOURCE, { type:'geojson', data, lineMetrics:true });
      map.addLayer({
        id:SLOPE_LAYER, type:'line', source:SLOPE_SOURCE,
        layout:{ 'line-cap':'round', 'line-join':'round', visibility:'visible' },
        paint:{
          'line-color':['interpolate',['linear'],['get','slope'],
            -100,'#000000', -70,'#24104F', -40,'#38206F', -20,'#2457D6', -8,'#28BCE8', -2,'#B9F1F8', 0,'#FFFFFF', 2,'#F2E85C', 8,'#FFA12B', 20,'#E53935', 50,'#9F1717', 100,'#650000'],
          'line-width':['interpolate',['linear'],['zoom'], 10,3.5, 14,5, 17,6.5],
          'line-opacity':0.98
        }
      });
      if (map.getLayer(SLOPE_LAYER)) map.moveLayer(SLOPE_LAYER);
      slopeSignature = signature;
    } catch (e) { console.error('[Komoot slope overlay]', e); }
  }
  installRoutingCapture();

  function report(status, error = false) {
    if (status === lastStatus) return;
    lastStatus = status;
    window.postMessage({ source: 'komoot-mtb-scale-bridge', type: 'STATUS', status, error }, '*');
  }
  function isMap(value) {
    return !!value && typeof value.getZoom === 'function' && typeof value.addSource === 'function' &&
      typeof value.addLayer === 'function' && typeof value.getLayer === 'function' && typeof value.getCanvas === 'function';
  }
  function findMap() {
    for (const canvas of document.querySelectorAll('canvas.maplibregl-canvas')) {
      let el = canvas;
      for (let depth = 0; el && depth < 10; depth++, el = el.parentElement) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) continue;
        let fiber = el[fiberKey];
        for (let level = 0; fiber && level < 35; level++, fiber = fiber.return) {
          const props = fiber.memoizedProps;
          if (!props || typeof props !== 'object') continue;
          const candidates = [props.mapGl && props.mapGl.map, props.value && props.value.map, props.map];
          for (const candidate of candidates) if (isMap(candidate)) return candidate;
        }
      }
    }
    return null;
  }
  function gradeFilter(group) {
    const scale = ['to-string', ['get', 'scale']];
    const tests = [];
    for (const prefix of group.prefixes) tests.push(['==', ['slice', scale, 0, prefix.length], prefix]);
    for (const bare of group.bare) {
      tests.push(['==', scale, bare]);
      tests.push(['==', ['slice', scale, 0, 1], bare]);
    }
    return ['any', ...tests];
  }
  function removeOverlay(map) {
    if (!map) return;
    for (const group of groups) {
      const id = PREFIX + group.id + '-line';
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
    }
    try { if (map.getSource(SOURCE)) map.removeSource(SOURCE); } catch (_) {}
  }
  function addOverlay(map) {
    if (!config || updating) return;
    if (!config.enabled) { removeOverlay(map); report('overlay disabled'); return; }
    if (!config.mapTilerKey) { report('Add your MapTiler API key in extension settings', true); return; }
    if (!map || !map.getStyle || !map.isStyleLoaded || !map.isStyleLoaded()) {
      report('Komoot map found; waiting for map style…'); return;
    }
    updating = true;
    try {
      removeOverlay(map);
      map.addSource(SOURCE, {
        type: 'vector',
        url: `https://api.maptiler.com/tiles/outdoor/tiles.json?key=${encodeURIComponent(config.mapTilerKey)}`
      });
      const width = Number(config.lineWidth || 2.5);
      const colors = { S1: '#2E8B57', '2': '#FF0000', '3': '#B22222', '4-5': '#000000', ...(config.colors || {}) };
      for (const group of groups) {
        if (config.grades && config.grades[group.setting] === false) continue;
        const filter = gradeFilter(group);
        map.addLayer({
          id: PREFIX + group.id + '-line', type: 'line', source: SOURCE, 'source-layer': 'trail', filter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': colors[group.setting] || group.color,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, width * 0.9, 14, width * 1.6, 17, width * 2.2],
            'line-opacity': 1
          }
        });
      }
      // Keep the overlay above native trail linework but below text labels.
      // MapLibre renders layers in style order: later layers are visually on top.
      // Use the first text-bearing symbol layer as the insertion point so place
      // and trail labels remain readable while our lines sit above base linework.
      const style = map.getStyle();
      const labelLayer = style && style.layers && style.layers.find(layer =>
        layer.type === 'symbol' && layer.layout && layer.layout['text-field'] !== undefined
      );
      const beforeId = labelLayer && labelLayer.id;
      for (const group of groups) {
        const id = PREFIX + group.id + '-line';
        if (map.getLayer(id)) {
          if (beforeId) map.moveLayer(id, beforeId);
          else map.moveLayer(id);
        }
      }
      report(beforeId
        ? 'active — solid grade-colored lines (below labels, above base linework)'
        : 'active — solid grade-colored lines (label layer not found; top layer)',
        false);
      if (map !== activeMap) {
        activeMap = map;
        map.on('styledata', () => {
          if (activeMap !== map || !config || !config.enabled || !map.isStyleLoaded()) return;
          const hasLayer = groups.some(group => { try { return !!map.getLayer(PREFIX + group.id + '-line'); } catch (_) { return false; } });
          if (!hasLayer) addOverlay(map);
        });
      }
    } catch (error) {
      console.error('[Komoot MTB scale bridge]', error);
      report('Overlay error: ' + (error && error.message ? error.message : String(error)), true);
    } finally { updating = false; }
  }
  function scan() {
    if (!config) return;
    const map = findMap();
    if (!map) { report('waiting for Komoot map…'); return; }
    if (map !== activeMap) {
      activeMap = map;
      if (map.isStyleLoaded && map.isStyleLoaded()) addOverlay(map);
      else { report('Komoot map found; waiting for map style…'); map.once('load', () => addOverlay(map)); }
    } else if (config.enabled) {
      const hasLayer = groups.some(group => { try { return !!map.getLayer(PREFIX + group.id + '-line'); } catch (_) { return false; } });
      if (map.isStyleLoaded && map.isStyleLoaded() && !hasLayer) addOverlay(map);
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) updateSlopeOverlay(map);
  }
  window.addEventListener('message', event => {
    if (event.source !== window || !event.data || event.data.source !== 'komoot-mtb-scale-extension') return;
    if (event.data.type === 'CONFIG') {
      config = event.data.config;
      const map = findMap();
      if (map) { activeMap = map; addOverlay(map); updateSlopeOverlay(map); } else report('waiting for Komoot map…');
      if (!retryTimer) retryTimer = window.setInterval(scan, 1500);
    }
  });
  report('page bridge ready; waiting for settings…');
})();
