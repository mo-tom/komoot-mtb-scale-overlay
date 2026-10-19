(() => {
  'use strict';
  const LEGEND = 'userscript-mtb-scale-legend';
  const defaults = { enabled: true, mapTilerKey: '', showLegend: true, lineWidth: 2.5, grades: { S1: true, '2': true, '3': true, '4-5': true }, colors: { S1: '#2E8B57', '2': '#FF0000', '3': '#B22222', '4-5': '#000000' }, legendPosition: null, slopeEnabled: false };
  const groups = [
    { id: 'S1', color: '#2E8B57', label: 'S1', setting: 'S1' },
    { id: 'S2', color: '#FF0000', label: 'S2', setting: '2' },
    { id: 'S3', color: '#B22222', label: 'S3', setting: '3' },
    { id: 'S45', color: '#000000', label: 'S4/5', setting: '4-5' }
  ];
  let settings = { ...defaults, grades: { ...defaults.grades } };
  // page-bridge.js is declared as a MAIN-world document_start content script
  // in manifest.json so it can intercept the initial route request before the
  // Komoot application starts. This script remains in the isolated world.
  function status(msg, error = false) {
    if (error) console.error('[Komoot MTB scale]', msg);
  }

  function sendConfig() {
    window.postMessage({ source: 'komoot-mtb-scale-extension', type: 'CONFIG', config: settings }, '*');
  }

  function injectBridge() { sendConfig(); }

  function savePosition(legend) {
    const r = legend.getBoundingClientRect();
    chrome.storage.local.set({ legendPosition: { left: Math.round(r.left), top: Math.round(r.top) } });
  }
  function makeDraggable(legend, heading) {
    let dragging = false, sx = 0, sy = 0, left = 0, top = 0;
    const p = settings.legendPosition;
    if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) { legend.style.left = p.left + 'px'; legend.style.top = p.top + 'px'; legend.style.right = 'auto'; legend.style.bottom = 'auto'; }
    heading.style.cursor = 'grab'; heading.style.userSelect = 'none'; heading.title = 'Drag to move the legend';
    heading.addEventListener('pointerdown', e => { if (e.button !== 0) return; const r = legend.getBoundingClientRect(); dragging = true; sx = e.clientX; sy = e.clientY; left = r.left; top = r.top; legend.style.left = left + 'px'; legend.style.top = top + 'px'; legend.style.right = 'auto'; legend.style.bottom = 'auto'; heading.style.cursor = 'grabbing'; heading.setPointerCapture(e.pointerId); e.preventDefault(); });
    heading.addEventListener('pointermove', e => { if (!dragging) return; const r = legend.getBoundingClientRect(); legend.style.left = Math.min(Math.max(0, left + e.clientX - sx), Math.max(0, innerWidth - r.width)) + 'px'; legend.style.top = Math.min(Math.max(0, top + e.clientY - sy), Math.max(0, innerHeight - r.height)) + 'px'; });
    function stop() { if (!dragging) return; dragging = false; heading.style.cursor = 'grab'; savePosition(legend); }
    heading.addEventListener('pointerup', stop); heading.addEventListener('pointercancel', stop);
  }
  function createLegend() {
    let legend = document.getElementById(LEGEND);
    if (!settings.showLegend) { if (legend) legend.remove(); return; }
    if (legend) legend.remove();
    legend = document.createElement('div'); legend.id = LEGEND;
    Object.assign(legend.style, { position: 'fixed', right: '12px', bottom: '58px', zIndex: '2147483646', padding: '10px 12px', borderRadius: '7px', background: 'rgba(255,255,255,.94)', color: '#222', boxShadow: '0 2px 8px rgba(0,0,0,.22)', font: '14px/1.6 sans-serif', minWidth: '140px', pointerEvents: 'auto' });
    const heading = document.createElement('label');
    Object.assign(heading.style, { display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '700', fontSize: '16px', marginBottom: '4px', cursor: 'pointer', whiteSpace: 'nowrap' });
    const masterCheck = document.createElement('input');
    masterCheck.type = 'checkbox';
    masterCheck.checked = settings.enabled !== false;
    masterCheck.setAttribute('aria-label', 'Enable MTB Scale overlay');
    Object.assign(masterCheck.style, { width: '14px', height: '14px', margin: '0', cursor: 'pointer', flexShrink: '0' });
    masterCheck.addEventListener('change', async () => {
      settings.enabled = masterCheck.checked;
      await chrome.storage.local.set({ enabled: settings.enabled });
    });
    const headingText = document.createElement('span');
    headingText.textContent = 'MTB Scale';
    heading.append(masterCheck, headingText);
    legend.appendChild(heading);
    for (const g of groups) {
      const row = document.createElement('label');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', cursor: 'pointer', margin: '3px 0', fontWeight: '400' });
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !(settings.grades && settings.grades[g.setting] === false);
      check.setAttribute('aria-label', `Show ${g.label}`);
      Object.assign(check.style, { width: '14px', height: '14px', margin: '0', cursor: 'pointer', flexShrink: '0' });
      check.addEventListener('change', async () => {
        settings.grades = { ...defaults.grades, ...(settings.grades || {}), [g.setting]: check.checked };
        await chrome.storage.local.set({ grades: settings.grades });
      });
      const swatch = document.createElement('span');
      Object.assign(swatch.style, { display: 'inline-block', width: '28px', height: '4px', borderRadius: '2px', background: (settings.colors || {})[g.setting] || g.color, flexShrink: '0' });
      const label = document.createElement('span');
      label.textContent = g.label;
      row.append(check, swatch, label);
      legend.appendChild(row);
    }
    const slopeRow = document.createElement('label');
    Object.assign(slopeRow.style, { display:'flex', alignItems:'center', gap:'7px', whiteSpace:'nowrap', cursor:'pointer', margin:'8px 0 2px', paddingTop:'7px', borderTop:'1px solid rgba(0,0,0,.15)', fontWeight:'400' });
    const slopeCheck = document.createElement('input');
    slopeCheck.type = 'checkbox'; slopeCheck.checked = settings.slopeEnabled === true;
    slopeCheck.setAttribute('aria-label', 'Enable planned route slope overlay');
    Object.assign(slopeCheck.style, { width:'14px', height:'14px', margin:'0', cursor:'pointer', flexShrink:'0' });
    slopeCheck.addEventListener('change', async () => {
      settings.slopeEnabled = slopeCheck.checked;
      await chrome.storage.local.set({ slopeEnabled: settings.slopeEnabled });
    });
    const slopeDetails = document.createElement('span');
    Object.assign(slopeDetails.style, { display:'flex', flexDirection:'column', gap:'2px', minWidth:'0', flex:'1' });
    const slopeTitle = document.createElement('span'); slopeTitle.textContent = 'Route slope';
    const gradient = document.createElement('span');
    Object.assign(gradient.style, { display:'block', height:'7px', width:'100%', minWidth:'90px', borderRadius:'4px', background:'linear-gradient(to right,#000000 0%,#24104F 12%,#38206F 25%,#2457D6 37%,#28BCE8 44%,#FFFFFF 50%,#F2E85C 56%,#FFA12B 68%,#E53935 82%,#650000 100%)', border:'1px solid rgba(0,0,0,.25)' });
    const slopeScale = document.createElement('span'); slopeScale.textContent = '−100%     0%     +100%';
    Object.assign(slopeScale.style, { display:'flex', justifyContent:'space-between', fontSize:'10px', lineHeight:'1.2', color:'#555' });
    slopeDetails.append(slopeTitle, gradient, slopeScale); slopeRow.append(slopeCheck, slopeDetails); legend.appendChild(slopeRow);
    document.documentElement.appendChild(legend); makeDraggable(legend, heading);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || !event.data || event.data.source !== 'komoot-mtb-scale-bridge') return;
    if (event.data.type === 'STATUS') status(event.data.status, event.data.error);
  });

  async function init() {
    const stored = await chrome.storage.local.get(defaults);
    settings = { ...defaults, ...stored, grades: { ...defaults.grades, ...(stored.grades || {}) }, colors: { ...defaults.colors, ...(stored.colors || {}) } };
    createLegend();
    status('starting page bridge…');
    injectBridge();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const key of Object.keys(changes)) settings[key] = changes[key].newValue;
      settings.grades = { ...defaults.grades, ...(settings.grades || {}) };
      settings.colors = { ...defaults.colors, ...(settings.colors || {}) };
      createLegend(); sendConfig();
    });
  }
  init().catch(error => { console.error('[Komoot MTB scale]', error); status('Initialization error: ' + error.message, true); });
})();