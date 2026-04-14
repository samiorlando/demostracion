/* ========================================
PCn 1600 NATIVE — JavaScript + Tauri
======================================== */
// ========== GLOBAL STATE ==========
const state = {
  eq: { low: 2, mid: -1.5, high: 3 },
  gate: { open: false },
  limiter: { reducing: false },
  corr: 0.85,
  loudness: { int: -16.2, short: -14.8, moment: -12.3, lra: 5.2, tp: -1.2 },
  monitor: { muted: false, dimmed: false, mono: false, volume: -20 },
  dither: { bitDepth: 24, type: 'tpdf', on: true, shaped: true, bypass: false },
  spectrum: { running: true },
  loudnessReset: false
};
// ========== TREE TOGGLE ==========
function toggleArrow(node) {
  const arrow = node.querySelector('.tree-arrow');
  const content = node.nextElementSibling;
  if (content && content.classList.contains('tree-indent1')) {
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.classList.add('open');
    } else {
      content.style.display = 'none';
      arrow.classList.remove('open');
    }
  }
}
// ========== BYPASS ==========
function toggleBypass(el, panelId) {
  el.classList.toggle('on');
  const panel = document.getElementById(panelId);
  if (!panel) return;
  let overlay = panel.querySelector('.bypass-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'bypass-overlay';
    overlay.innerHTML = '<div class="bypass-label">BYPASS</div>';
    panel.style.position = 'relative';
    panel.appendChild(overlay);
  }
  overlay.classList.toggle('show');
}
// ========== TABS ==========
document.querySelectorAll('.tab-item').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('[id^="panel-"]').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('panel-' + t.dataset.tab);
    if (panel) panel.style.display = '';
    if (t.dataset.tab === 'spectrum') initSpectrum();
    if (t.dataset.tab === 'loudness') initLoudnessCanvas();
    if (t.dataset.tab === 'correlation') initCorrelation();
    if (t.dataset.tab === 'dither') initDitherCurve();
  });
});
// ========== FADER / SLIDER CONTROLS ==========
let activeControl = null;
document.addEventListener('mousedown', e => {
  if (e.target.closest('.fader-track')) {
    e.preventDefault();
    const ch = e.target.closest('.fader-channel');
    const tr = e.target.closest('.fader-track');
    activeControl = { type: 'fader', channel: ch, track: tr, min: parseFloat(ch.dataset.min), max: parseFloat(ch.dataset.max), unit: ch.dataset.unit || '' };
    document.body.style.cursor = 'grabbing';
    handleMove(e);
  } else if (e.target.closest('.slider-track')) {
    e.preventDefault();
    const tr = e.target.closest('.slider-track');
    activeControl = { type: 'slider', track: tr, min: parseFloat(tr.dataset.min), max: parseFloat(tr.dataset.max), el: tr.parentElement.querySelector('input'), id: tr.id };
    document.body.style.cursor = 'grabbing';
    handleMove(e);
  }
});
document.addEventListener('touchstart', e => {
  if (e.target.closest('.fader-track') || e.target.closest('.slider-track')) {
    e.preventDefault();
    const faderTrack = e.target.closest('.fader-track');
    const sliderTrack = e.target.closest('.slider-track');
    if (faderTrack) {
      const ch = faderTrack.closest('.fader-channel');
      activeControl = { type: 'fader', channel: ch, track: faderTrack, min: parseFloat(ch.dataset.min), max: parseFloat(ch.dataset.max), unit: ch.dataset.unit || '' };
    } else {
      activeControl = { type: 'slider', track: sliderTrack, min: parseFloat(sliderTrack.dataset.min), max: parseFloat(sliderTrack.dataset.max), el: sliderTrack.parentElement.querySelector('input'), id: sliderTrack.id };
    }
    document.body.style.cursor = 'grabbing';
    handleMove(e);
  }
}, { passive: false });
function handleMove(e) {
  if (!activeControl) return;
  const cx = e.clientX || (e.touches && e.touches[0].clientX);
  const cy = e.clientY || (e.touches && e.touches[0].clientY);
  if (activeControl.type === 'fader') {
    const rect = activeControl.track.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (cy - rect.top) / rect.height));
    const val = activeControl.min + pct * (activeControl.max - activeControl.min);
    activeControl.channel.dataset.value = val;
    activeControl.track.querySelector('.fader-fill').style.height = `${pct * 100}%`;
    activeControl.track.querySelector('.fader-thumb').style.bottom = `${pct * 100}%`;
    let txt;
    if (activeControl.unit === ':1') txt = `${val.toFixed(1)}:1`;
    else if (activeControl.unit === '°') txt = `${Math.round(val)}°`;
    else if (activeControl.unit === '%') txt = `${Math.round(val)}%`;
    else if (activeControl.unit === 'ms') txt = `${Math.round(val)} ms`;
    else if (activeControl.unit === 'Hz') txt = `${Math.round(val)} Hz`;
    else txt = `${val >= 0 ? '+' : ''}${val.toFixed(1)} ${activeControl.unit}`;
    activeControl.channel.querySelector('.fader-value').textContent = txt;
    onFaderChange(activeControl.channel.id, val);
  } else {
    const rect = activeControl.track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
    const val = activeControl.min + pct * (activeControl.max - activeControl.min);
    activeControl.track.dataset.value = val;
    activeControl.track.querySelector('.slider-fill').style.width = `${pct * 100}%`;
    activeControl.track.querySelector('.slider-thumb').style.left = `${pct * 100}%`;
    if (activeControl.el) {
      if (activeControl.id.startsWith('s-xo')) activeControl.el.value = val > 999 ? (val / 1000).toFixed(1) + 'k' : Math.round(val);
      else if (activeControl.id === 's-la') activeControl.el.value = val.toFixed(1) + ' ms';
      else if (activeControl.id === 's-de-freq' || activeControl.id === 's-exc-freq') activeControl.el.value = val > 999 ? (val / 1000).toFixed(1) + 'k' : Math.round(val);
      else if (activeControl.id === 's-gate-hpf') activeControl.el.value = Math.round(val) + ' Hz';
      else if (activeControl.id === 's-gate-hyst') activeControl.el.value = val.toFixed(1) + ' dB';
      else if (activeControl.id === 's-corr-win') activeControl.el.value = (val / 1000).toFixed(1) + 's';
      else if (activeControl.id === 's-dith-trunc') activeControl.el.value = Math.round(val) + '%';
      else if (activeControl.id === 's-tb-gain') activeControl.el.value = val.toFixed(1) + ' dB';
      else if (activeControl.id === 's-cal-ref') activeControl.el.value = Math.round(val) + ' dB';
      else if (activeControl.id === 's-loudness') { activeControl.el.value = val.toFixed(1); const t = document.getElementById('loudTarget'); if (t) t.textContent = val.toFixed(1); }
      else activeControl.el.value = (val % 1 !== 0 || val < -9) ? val.toFixed(1) : val;
    }
    if (activeControl.id === 's-phase') {
      const hz = document.querySelector('.hz-display');
      if (hz) hz.innerHTML = `${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}<span class="hz-unit">Hz</span>`;
    }
    onSliderChange(activeControl.id, val);
  }
}
function handleEnd() {
  if (activeControl) { activeControl = null; document.body.style.cursor = ''; }
}
document.addEventListener('mousemove', handleMove);
document.addEventListener('touchmove', handleMove, { passive: false });
document.addEventListener('mouseup', handleEnd);
document.addEventListener('touchend', handleEnd);
document.querySelectorAll('.fader-channel').forEach(ch => {
  const pct = (parseFloat(ch.dataset.value) - parseFloat(ch.dataset.min)) / (parseFloat(ch.dataset.max) - parseFloat(ch.dataset.min));
  ch.querySelector('.fader-fill').style.height = `${pct * 100}%`;
  ch.querySelector('.fader-thumb').style.bottom = `${pct * 100}%`;
});
document.querySelectorAll('.slider-track').forEach(tr => {
  const pct = (parseFloat(tr.dataset.value) - parseFloat(tr.dataset.min)) / (parseFloat(tr.dataset.max) - parseFloat(tr.dataset.min));
  tr.querySelector('.slider-fill').style.width = `${pct * 100}%`;
  tr.querySelector('.slider-thumb').style.left = `${pct * 100}%`;
});
// ========== REACTIVE SYSTEM ==========
function onFaderChange(id, val) {
  if (id === 'f-eq-low') state.eq.low = val;
  if (id === 'f-eq-mid') state.eq.mid = val;
  if (id === 'f-eq-high') state.eq.high = val;
  if (id === 'f-mon-level') state.monitor.volume = val;
  // 👇 ENVIAR A TAURI BACKEND
  sendFaderToBackend(id, val);
}
function onSliderChange(id, val) {
  if (id === 's-loudness') state.loudness.int = val + (Math.random() * 0.5 - 0.25);
  // 👇 ENVIAR A TAURI BACKEND
  sendSliderToBackend(id, val);
}
// ========== EQ PRESETS ==========
function applyEQPreset(preset) {
  const presets = {
    flat: { low: 0, mid: 0, high: 0 },
    voice: { low: -2, mid: 3, high: 1 },
    bass: { low: 6, mid: 0, high: -2 },
    air: { low: 0, mid: -1, high: 6 }
  };
  const p = presets[preset] || presets.flat;
  state.eq = { ...p };
  ['f-eq-low', 'f-eq-mid', 'f-eq-high'].forEach((id, i) => {
    const ch = document.getElementById(id);
    if (!ch) return;
    const vals = [p.low, p.mid, p.high];
    const pct = (vals[i] - (-12)) / (12 - (-12));
    ch.dataset.value = vals[i];
    ch.querySelector('.fader-fill').style.height = `${pct * 100}%`;
    ch.querySelector('.fader-thumb').style.bottom = `${pct * 100}%`;
    ch.querySelector('.fader-value').textContent = `${vals[i] >= 0 ? '+' : ''}${vals[i].toFixed(1)} dB`;
  });
}
// ========== MATRIX ==========
function toggleMatrixCell(cell) {
  cell.classList.toggle('active');
  const input = cell.querySelector('input');
  input.value = cell.classList.contains('active') ? '0.0' : '-∞';
}
function routeMatrix(mode) {
  const cells = document.querySelectorAll('#panel-matrix .matrix-cell.value');
  cells.forEach(c => { c.classList.remove('active'); c.querySelector('input').value = '-∞'; });
  const routes = {
    stereo: [[0, 0], [1, 1]],
    dual: [[0, 0], [1, 1], [2, 2], [3, 3]],
    sum: [[0, 0], [0, 1], [1, 0], [1, 1]],
    cross: [[0, 1], [1, 0]],
    clear: []
  };
  (routes[mode] || []).forEach(([r, c]) => {
    const idx = r * 4 + c;
    if (cells[idx]) { cells[idx].classList.add('active'); cells[idx].querySelector('input').value = '0.0'; }
  });
  // 👇 ENVIAR A TAURI
  sendToTauri('route_matrix', { mode });
}
// ========== MONITOR ==========
function monitorToggle(el, type) {
  if (type === 'mute') {
    el.classList.toggle('mute');
    state.monitor.muted = el.classList.contains('mute');
  } else if (type === 'dim') {
    el.classList.toggle('dim');
    state.monitor.dimmed = el.classList.contains('dim');
  } else {
    el.classList.toggle('active');
    if (el.textContent === 'MONO') state.monitor.mono = el.classList.contains('active');
  }
}
// ========== METERS ==========
const meterGroups = [
  { id: 'input', label: 'Input', bars: [{ c: ['#00ff88', '#ffea00', '#ff2244'], l: 'L' }, { c: ['#00ff88', '#ffea00', '#ff2244'], l: 'R' }] },
  { id: 'agc', label: '2.0 AGC', bars: [{ c: ['#3388ff'], l: 'B' }, { c: ['#3388ff'], l: 'M' }, { c: ['#3388ff'], l: '+1' }, { c: ['#3388ff'], l: '+2' }], sub: 'AGC Gate' },
  { id: 'hf', label: 'HF Enh.', bars: [{ c: ['#ffea00'], l: '' }] },
  { id: 'stereo', label: 'Stereo', bars: [{ c: ['#00e5ff'], l: '' }] },
  { id: 'gr', label: 'Gain Red.', bars: [{ c: ['#3388ff'], l: '1' }, { c: ['#3388ff'], l: '2' }, { c: ['#3388ff'], l: '3' }, { c: ['#3388ff'], l: '4' }, { c: ['#3388ff'], l: '5' }], sub: 'Multi Gate' },
  { id: 'loudness-gr', label: 'Loud GR', bars: [{ c: ['#06b6d4'], l: '' }] },
  { id: 'limiter', label: 'Limiter', bars: [{ c: ['#ff2244'], l: '' }] },
  { id: 'bass-limiter', label: 'Bass Lim', bars: [{ c: ['#cc0033'], l: '' }] },
  { id: 'loudness-level', label: 'Loudness', bars: [{ c: ['#ffea00', '#ff8c00', '#ff2244'], l: 'dB' }, { c: ['#00ff66'], l: 'LU' }] },
  { id: 'output', label: 'Output', bars: [{ c: ['#00ff88', '#ffea00', '#ff2244'], l: 'L' }, { c: ['#00ff88', '#ffea00', '#ff2244'], l: 'R' }] }
];
const NUM_SEG = 42;
const meterRow = document.getElementById('meterRow');
const meters = [];
meterGroups.forEach(g => {
  const group = document.createElement('div');
  group.className = 'meter-group';
  const label = document.createElement('div');
  label.className = 'meter-label';
  label.textContent = g.label;
  group.appendChild(label);
  const barsEl = document.createElement('div');
  barsEl.className = 'meter-bars';
  g.bars.forEach(b => {
    const wrap = document.createElement('div');
    wrap.className = 'meter-bar-wrapper';
    const bar = document.createElement('div');
    bar.className = 'meter-bar';
    const segs = [];
    for (let i = 0; i < NUM_SEG; i++) {
      const s = document.createElement('div');
      s.className = 'led-segment';
      bar.appendChild(s);
      segs.push(s);
    }
    const peak = document.createElement('div');
    peak.className = 'peak-hold';
    bar.appendChild(peak);
    wrap.appendChild(bar);
    barsEl.appendChild(wrap);
    if (b.l) {
      const sl = document.createElement('div');
      sl.className = 'meter-sublabel';
      sl.textContent = b.l;
      wrap.appendChild(sl);
    }
    meters.push({ segs, peak, val: 0, tgt: 0, peakVal: 0, peakDecay: 0, colors: b.c });
  });
  group.appendChild(barsEl);
  if (g.sub) {
    const sl = document.createElement('div');
    sl.className = 'meter-sublabel';
    sl.textContent = g.sub;
    group.appendChild(sl);
  }
  meterRow.appendChild(group);
});
const scale = document.createElement('div');
scale.className = 'meter-scale';
[-36, -30, -24, -18, -12, -6, -3, -1.5, 0].forEach(db => {
  const s = document.createElement('span');
  s.textContent = db;
  scale.appendChild(s);
});
meterRow.appendChild(scale);
let time = 0;
function sim(idx) {
  const t = time, i = idx;
  const eqBoost = (state.eq.low + state.eq.mid + state.eq.high) / 3;
  const eqFactor = 1 + eqBoost / 30;
  const fns = [
    () => (0.45 + 0.3 * Math.sin(t * 1.1) + 0.12 * Math.sin(t * 3.5 + i) + 0.1 * (Math.random() - 0.5)) * eqFactor,
    () => (0.42 + 0.28 * Math.sin(t * 1.1 + 0.6) + 0.12 * Math.sin(t * 3.5 + i + 1) + 0.1 * (Math.random() - 0.5)) * eqFactor,
    () => {
      const th = parseFloat(document.getElementById('f-agc-th')?.dataset.value || -12);
      const ratio = parseFloat(document.getElementById('f-agc-ratio')?.dataset.value || 2.5);
      const raw = 0.55 + 0.2 * Math.sin(t * 0.8) + 0.1 * Math.sin(t * 2.5 + i);
      const over = Math.max(0, raw - Math.abs(th) / 24);
      return raw - over * (1 - 1 / ratio);
    },
    () => { const r = parseFloat(document.getElementById('f-agc-ratio')?.dataset.value || 2.5); return 0.5 + 0.22 * Math.sin(t * 0.9 + 0.3) + 0.1 * Math.sin(t * 2.5 + i) * (1 / r); },
    () => 0.45 + 0.18 * Math.sin(t * 0.7 + 0.6) + 0.08 * Math.sin(t * 2.1 + i) + 0.06 * (Math.random() - 0.5),
    () => 0.4 + 0.2 * Math.sin(t * 0.6 + 0.9) + 0.1 * Math.sin(t * 2.3 + i) + 0.05 * (Math.random() - 0.5),
    () => {
      const drive = parseFloat(document.getElementById('f-exc-drive')?.dataset.value || 35) / 100;
      const mix = parseFloat(document.getElementById('f-exc-mix')?.dataset.value || 50) / 100;
      return 0.3 + 0.25 * Math.sin(t * 1.5) + 0.15 * Math.sin(t * 4.2) + drive * mix * 0.3;
    },
    () => {
      const depth = parseFloat(document.getElementById('f-synth-depth')?.dataset.value || 30) / 100;
      const rate = parseFloat(document.getElementById('f-synth-rate')?.dataset.value || 2.5);
      return 0.35 + 0.2 * Math.sin(t * rate) + depth * 0.15 * Math.sin(t * rate * 2) + 0.1 * (Math.random() - 0.5);
    },
    () => 0.6 - 0.25 * Math.sin(t * 0.8 + i * 0.4) - 0.1 * Math.random() * (i < 2 ? 1 : 0.5),
    () => 0.55 - 0.2 * Math.sin(t * 0.9 + i * 0.3) - 0.08 * Math.random(),
    () => 0.5 - 0.18 * Math.sin(t * 0.7 + i * 0.5) - 0.07 * Math.random(),
    () => 0.45 - 0.15 * Math.sin(t * 0.6 + i * 0.2) - 0.06 * Math.random(),
    () => 0.4 - 0.12 * Math.sin(t * 0.5 + i * 0.6) - 0.05 * Math.random(),
    () => 0.25 + 0.15 * Math.sin(t * 0.5) + 0.08 * (Math.random() - 0.5),
    () => {
      const ceil = parseFloat(document.getElementById('f-lim-ceil')?.dataset.value || -0.1);
      const raw = 0.12 + 0.1 * Math.sin(t * 0.4) + (Math.sin(t * 2.1) > 0.85 ? 0.55 : 0) + 0.05 * Math.random();
      return Math.min(raw, Math.abs(ceil) / 10);
    },
    () => 0.18 + 0.15 * Math.sin(t * 0.3) + 0.08 * (Math.random() - 0.5),
    () => 0.5 + 0.2 * Math.sin(t * 0.6) + 0.1 * Math.sin(t * 1.8) + 0.08 * (Math.random() - 0.5),
    () => 0.45 + 0.15 * Math.sin(t * 0.4 + 1) + 0.08 * Math.sin(t * 1.2) + 0.05 * (Math.random() - 0.5),
    () => { let v = 0.6 + 0.15 * Math.sin(t * 1.0) + 0.1 * Math.sin(t * 3.2) + 0.08 * (Math.random() - 0.5); if (state.monitor.muted) v *= 0; if (state.monitor.dimmed) v *= 0.1; return Math.max(0, v); },
    () => { let v = 0.58 + 0.15 * Math.sin(t * 1.0 + 0.4) + 0.1 * Math.sin(t * 3.2 + 0.6) + 0.08 * (Math.random() - 0.5); if (state.monitor.muted) v *= 0; if (state.monitor.dimmed) v *= 0.1; return Math.max(0, v); }
  ];
  return Math.max(0, Math.min(1, fns[idx] ? fns[idx]() : 0.4));
}
function animateMeters() {
  time += 0.016;
  meters.forEach((m, i) => {
    m.tgt = sim(i);
    m.val += (m.tgt - m.val) * 0.16;
    if (m.val > m.peakVal) { m.peakVal = m.val; m.peakDecay = 0; }
    else { m.peakDecay += 0.025; if (m.peakDecay > 0.4) m.peakVal *= 0.98; }
    const lit = Math.floor(m.val * NUM_SEG);
    m.segs.forEach((s, si) => {
      if (si < lit) {
        const r = si / NUM_SEG;
        const col = r < 0.6 ? m.colors[0] : r < 0.8 ? (m.colors[1] || m.colors[0]) : (m.colors[2] || m.colors[0]);
        s.style.background = col;
        s.classList.add('lit');
        s.style.color = col;
        s.style.boxShadow = r > 0.75 && m.val > 0.7 ? `0 0 ${4 + (m.val - 0.7) / 0.3 * 8}px ${col}` : `0 0 3px ${col}`;
      } else {
        s.style.background = '#111122';
        s.classList.remove('lit');
        s.style.boxShadow = 'none';
      }
    });
    m.peak.style.bottom = `${m.peakVal * 100}%`;
  });
  requestAnimationFrame(animateMeters);
}
requestAnimationFrame(animateMeters);
// ========== SPECTRUM ==========
let specAnimId = null;
function initSpectrum() {
  const canvas = document.getElementById('spectrumCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = 240;
  state.spectrum.running = true;
  if (specAnimId) cancelAnimationFrame(specAnimId);
  drawSpectrum(ctx, canvas);
}
function toggleSpectrum(el) { el.classList.toggle('on'); state.spectrum.running = !el.classList.contains('on'); if (state.spectrum.running) { const c = document.getElementById('spectrumCanvas'); if (c) drawSpectrum(c.getContext('2d'), c); } }
function drawSpectrum(ctx, canvas) {
  if (!state.spectrum.running) return;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(58,58,92,0.3)'; ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let x = 0; x < w; x += w / 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  const bars = 64, barW = w / bars - 1;
  for (let i = 0; i < bars; i++) {
    const val = 0.2 + 0.6 * Math.sin(time * 1.5 + i * 0.15) + 0.2 * Math.sin(time * 3 + i * 0.3) + 0.15 * Math.random();
    const barH = val * h * 0.8;
    const g = ctx.createLinearGradient(0, h, 0, h - barH);
    g.addColorStop(0, '#3388ff'); g.addColorStop(0.4, '#00e5ff'); g.addColorStop(0.7, '#ffea00'); g.addColorStop(0.9, '#ff8c00'); g.addColorStop(1, '#ff2244');
    ctx.fillStyle = g;
    ctx.fillRect(i * (barW + 1), h - barH, barW, barH);
    ctx.fillStyle = 'rgba(0,229,255,0.3)';
    ctx.fillRect(i * (barW + 1), h - barH, barW, 2);
  }
  ctx.fillStyle = 'rgba(136,136,170,0.5)'; ctx.font = '16px JetBrains Mono';
  for (let db = 0; db >= -60; db -= 10) { const y = h - ((db + 60) / 60) * h * 0.8; ctx.fillText(`${db}dB`, 4, y + 4); }
  specAnimId = requestAnimationFrame(() => drawSpectrum(ctx, canvas));
}
// ========== LOUDNESS ==========
let loudAnimId = null;
let loudnessData = [];
function initLoudnessCanvas() {
  const canvas = document.getElementById('loudnessCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = 160;
  loudnessData = [];
  for (let i = 0; i < 200; i++) loudnessData.push(-16 + Math.random() * 4 - 2);
  drawLoudness(ctx, canvas);
}
function toggleLoudnessReset(el) { el.classList.toggle('on'); if (el.classList.contains('on')) { loudnessData = []; state.loudness.int = -16; state.loudness.short = -14.8; state.loudness.moment = -12.3; } }
function drawLoudness(ctx, canvas) {
  if (!document.getElementById('panel-loudness') || document.getElementById('panel-loudness').style.display === 'none') return;
  const w = canvas.width, h = canvas.height;
  loudnessData.push(-16 + Math.sin(time * 0.3) * 2 + Math.sin(time * 0.7) * 1.5 + Math.random() * 1.5);
  if (loudnessData.length > 200) loudnessData.shift();
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, w, h);
  const tv = parseFloat(document.getElementById('s-loudness')?.dataset.value || -16);
  const ty = h - ((tv + 40) / 40) * h;
  ctx.strokeStyle = 'rgba(255,215,0,0.4)'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,215,0,0.5)'; ctx.font = '14px JetBrains Mono';
  ctx.fillText(`${tv.toFixed(1)} LUFS`, 4, ty - 4);
  ctx.beginPath(); ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(168,85,247,0.5)'; ctx.shadowBlur = 4;
  for (let i = 0; i < loudnessData.length; i++) { const x = (i / 200) * w; const y = h - ((loudnessData[i] + 40) / 40) * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke(); ctx.shadowBlur = 0;
  state.loudness.moment = loudnessData[loudnessData.length - 1] || -16;
  state.loudness.short = loudnessData.slice(-20).reduce((a, b) => a + b, 0) / 20;
  state.loudness.int = loudnessData.reduce((a, b) => a + b, 0) / loudnessData.length;
  state.loudness.lra = Math.abs(state.loudness.moment - state.loudness.int) + 2;
  state.loudness.tp = state.loudness.moment + 2 + Math.random() * 0.5;
  ['loudInt', 'loudShort', 'loudMoment', 'loudLRA', 'loudTP'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = [state.loudness.int, state.loudness.short, state.loudness.moment, state.loudness.lra, state.loudness.tp][i].toFixed(1);
  });
  const re = document.getElementById('loudRange');
  if (re) { re.textContent = Math.abs(state.loudness.lra) < 15 ? 'PASS' : 'FAIL'; re.className = `val ${Math.abs(state.loudness.lra) < 15 ? 'pass' : 'danger'}`; }
  const elapsed = Math.floor(time);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const te = document.getElementById('loudnessTime');
  if (te) te.textContent = `${mm}:${ss}`;
  loudAnimId = requestAnimationFrame(() => drawLoudness(ctx, canvas));
}
// ========== CORRELATION ==========
let corrAnimId = null;
function initCorrelation() { corrAnimId = null; updateCorrelation(); initVectorScope(); }
function updateCorrelation() { 
  const mo = document.getElementById('monoCheck')?.classList.contains('on');
  const base = 0.7 + 0.25 * Math.sin(time * 0.5) + 0.1 * Math.sin(time * 1.2);
  state.corr = mo ? 1 : base; 
  const fill = document.getElementById('corrFill');
  const v = document.getElementById('corrValue');
  const st = document.getElementById('corrStatus');
  if (fill) { const p = (state.corr + 1) / 2; fill.style.left = `${(1 - p) * 50}%`; fill.style.width = `${p * 100}%`; }
  if (v) { v.textContent = (state.corr >= 0 ? '+' : '') + state.corr.toFixed(2); v.style.color = state.corr > 0.3 ? 'var(--led-green)' : state.corr > -0.3 ? 'var(--led-yellow)' : 'var(--led-red)'; }
  if (st) { const l = state.corr > 0.5 ? 'Good' : state.corr > 0 ? 'Caution' : 'Phase Issue'; st.textContent = `Corr: ${state.corr.toFixed(2)} (${l})`; }
  corrAnimId = requestAnimationFrame(updateCorrelation);
}
let vecAnimId = null;
function initVectorScope() {
  const canvas = document.getElementById('vectorscopeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = 200;
  if (vecAnimId) cancelAnimationFrame(vecAnimId);
  drawVectorScope(ctx, canvas);
}
function drawVectorScope(ctx, canvas) {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(58,58,92,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  ctx.strokeStyle = 'rgba(168,85,247,0.2)';
  ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.4, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 200; i++) {
    const x = Math.sin(time * 2 + i * 0.05) * 0.3 + (Math.random() - 0.5) * 0.05;
    const y = Math.cos(time * 2 + i * 0.05) * 0.3 + (Math.random() - 0.5) * 0.05;
    const px = cx + x * Math.min(w, h) * 0.4;
    const py = cy + y * Math.min(w, h) * 0.4;
    ctx.fillStyle = `rgba(0,229,255,${0.3 + Math.random() * 0.3})`;
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }
  vecAnimId = requestAnimationFrame(() => drawVectorScope(ctx, canvas));
}
// ========== DITHER ==========
let ditherAnimId = null;
function initDitherCurve() {
  const canvas = document.getElementById('ditherCurveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = 300;
  if (ditherAnimId) cancelAnimationFrame(ditherAnimId);
  drawDitherCurve(ctx, canvas);
}
function drawDitherCurve(ctx, canvas) {
  const w = canvas.width, h = canvas.height;
  const pad = { top: 30, bottom: 30, left: 60, right: 20 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(58,58,92,0.3)'; ctx.lineWidth = 1;
  for (let db = 20; db >= -100; db -= 20) { const y = pad.top + ((20 - db) / 120) * plotH; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); ctx.fillStyle = 'rgba(136,136,170,0.5)'; ctx.font = '14px JetBrains Mono'; ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 8, y + 4); }
  const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  freqs.forEach(f => { const x = pad.left + (Math.log10(f / 20) / Math.log10(1000)) * plotW; ctx.strokeStyle = 'rgba(58,58,92,0.2)'; ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, h - pad.bottom); ctx.stroke(); const l = f >= 1000 ? `${f / 1000}k` : `${f}`; ctx.fillStyle = 'rgba(136,136,170,0.5)'; ctx.font = '14px JetBrains Mono'; ctx.fillText(l, x - 8, h - pad.bottom + 16); });
  const st = document.getElementById('noiseShapeType')?.value || 'low';
  const do_ = document.getElementById('ditherToggle')?.classList.contains('on');
  const so = document.getElementById('shapeToggle')?.classList.contains('on');
  const bo = document.getElementById('ditherBypass')?.classList.contains('on');
  const bd = state.dither.bitDepth;
  const nf = bd === 16 ? -96 : bd === 24 ? -144 : -192;
  const df = do_ && !bo ? nf + 6 : nf;
  ctx.beginPath(); ctx.strokeStyle = 'rgba(255,34,68,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  const mp = [20, 50, 100, 200, 500, 1000, 2000, 4000, 5000, 8000, 10000, 16000, 20000];
  const mv = [60, 35, 22, 15, 8, 4, 2, 3, 6, 12, 20, 35, 50];
  mp.forEach((f, i) => { const x = pad.left + (Math.log10(f / 20) / Math.log10(1000)) * plotW; const y = pad.top + ((20 - (-mv[i])) / 120) * plotH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);
  if (do_ && !bo) { ctx.beginPath(); ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(168,85,247,0.4)'; ctx.shadowBlur = 4; const fy = pad.top + ((20 - df) / 120) * plotH; ctx.moveTo(pad.left, fy); ctx.lineTo(w - pad.right, fy); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#a855f7'; ctx.font = '13px JetBrains Mono'; ctx.fillText(`TPDF: ${df.toFixed(1)} dBFS`, w - pad.right - 160, fy - 8); }
  if (so && !bo && st !== 'none' && st !== 'flat') {
    const cc = { low: '#00e5ff', medium: '#00e5ff', high: '#00e5ff', shibata: '#ff69b4', mbm: '#ffd700', uv22: '#ffea00', idrc: '#ff2244' };
    const sc = { low: [0, 0, 0, 0, 0, -2, -4, -5, -3, 2, 8, 15, 20], medium: [0, 0, 0, -1, -2, -5, -8, -6, -2, 5, 12, 20, 25], high: [0, 0, -1, -3, -5, -8, -10, -5, 2, 10, 18, 28, 35], shibata: [0, 0, 0, -2, -4, -7, -10, -5, 3, 12, 20, 30, 38], mbm: [0, 0, -1, -3, -6, -10, -12, -6, 4, 14, 22, 32, 40], uv22: [0, 0, 0, -1, -3, -6, -9, -4, 5, 15, 24, 34, 42], idrc: [0, 0, -1, -3, -5, -9, -11, -5, 6, 16, 25, 35, 45] };
    const cu = sc[st] || sc.low;
    ctx.beginPath(); ctx.strokeStyle = cc[st] || '#00e5ff'; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 4;
    freqs.forEach((f, i) => { const x = pad.left + (Math.log10(f / 20) / Math.log10(1000)) * plotW; const sv = df + (cu[i] || 0); const y = pad.top + ((20 - sv) / 120) * plotH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  const stats = { low: { n: df, t: df + 3, p: 0.5, s: -df }, medium: { n: df + 2, t: df + 5, p: 0.6, s: -df - 2 }, high: { n: df + 5, t: df + 8, p: 0.8, s: -df - 5 }, shibata: { n: df + 4, t: df + 7, p: 0.7, s: -df - 4 }, mbm: { n: df + 3, t: df + 6, p: 0.65, s: -df - 3 }, uv22: { n: df + 3.5, t: df + 6.5, p: 0.65, s: -df - 3.5 }, idrc: { n: df + 6, t: df + 9, p: 0.9, s: -df - 6 }, none: { n: df, t: df + 3, p: 0.5, s: -df }, flat: { n: df, t: df + 3, p: 0.5, s: -df } };
  const s = stats[st] || stats.low;
  ['ditherNoise', 'ditherThd', 'ditherPeak', 'ditherSnr'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      if (i === 2) el.textContent = bo ? '±1.0' : `±${s.p.toFixed(1)}`;
      else el.textContent = (bo ? [nf, nf + 3, -nf][i] : [s.n, s.t, s.s][i]).toFixed(1);
    }
  });
  ditherAnimId = requestAnimationFrame(() => drawDitherCurve(ctx, canvas));
}
function updateDither() {
  const t = document.getElementById('ditherToggle'); if (t) t.classList.toggle('on');
  const do_ = document.getElementById('ditherToggle')?.classList.contains('on');
  const bo = document.getElementById('ditherBypass')?.classList.contains('on');
  const bd = state.dither.bitDepth;
  const nf = bd === 16 ? -96 : bd === 24 ? -144 : -192;
  const df = do_ && !bo ? nf + 6 : nf;
  const n = document.getElementById('ditherNoise'); if (n) n.textContent = df.toFixed(1);
  const th = document.getElementById('ditherThd'); if (th) th.textContent = (df + 3).toFixed(1);
  const p = document.getElementById('ditherPeak'); if (p) p.textContent = (do_ && !bo) ? '±0.5' : '±1.0';
  const s = document.getElementById('ditherSnr'); if (s) s.textContent = (-df).toFixed(1);
}
function updateNoiseCurve() { /* redraws in loop */ }
function setBitDepth(el, bits) {
  document.querySelectorAll('.output-format-row .format-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.dither.bitDepth = bits;
  updateDither();
  const fl = document.getElementById('ditherFormatLabel');
  if (fl) fl.textContent = `Format: ${bits === 32 ? '32-float / 96kHz' : `${bits}-bit / 96kHz`}`;
  // 👇 ENVIAR A TAURI
  sendToTauri('set_bit_depth', { bits });
}
// ========== GATE SIM ==========
setInterval(() => {
  const gt = parseFloat(document.getElementById('f-gate-th')?.dataset.value || -36);
  const il = -20 + Math.random() * 10;
  state.gate.open = il > gt;
}, 100);
// ================================================================
// 🦀 TAURI INTEGRATION LAYER
// ================================================================
function isTauri() {
  return typeof window !== 'undefined' && window.TAURI !== undefined;
}
async function sendToTauri(command, payload = {}) {
  if (!isTauri()) return;
  try {
    const result = await window.TAURI.core.invoke(command, payload);
    console.log(`[Tauri] ✅ ${command}:`, result);
    return result;
  } catch (error) {
    console.error(`[Tauri] ❌ ${command}:`, error);
  }
}
const FADER_PARAM_MAP = {
  'f-agc-th': 'agc_threshold', 'f-agc-ratio': 'agc_ratio', 'f-agc-att': 'agc_attack', 'f-agc-rel': 'agc_release',
  'f-agc-max': 'agc_max_gain', 'f-eq-low': 'eq_low', 'f-eq-mid': 'eq_mid', 'f-eq-high': 'eq_high',
  'f-comp-th': 'comp_threshold', 'f-comp-rat': 'comp_ratio', 'f-comp-att': 'comp_attack', 'f-comp-rel': 'comp_release',
  'f-lim-ceil': 'limiter_ceiling', 'f-lim-th': 'limiter_threshold', 'f-lim-rel': 'limiter_release',
  'f-de-th': 'deesser_threshold', 'f-de-range': 'deesser_range', 'f-de-att': 'deesser_attack', 'f-de-rel': 'deesser_release',
  'f-gate-th': 'gate_threshold', 'f-gate-range': 'gate_range', 'f-gate-att': 'gate_attack', 'f-gate-rel': 'gate_release',
  'f-gate-hold': 'gate_hold', 'f-exc-drive': 'exciter_drive', 'f-exc-mix': 'exciter_mix', 'f-exc-out': 'exciter_output',
  'f-mon-level': 'monitor_volume', 'f-ms-bal': 'ms_balance', 'f-synth-phase': 'synth_phase',
  'f-synth-depth': 'synth_depth', 'f-synth-rate': 'synth_rate',
};
const SLIDER_PARAM_MAP = {
  's-lessmore': 'lessmore_amount', 's-loudness': 'loudness_target', 's-trim': 'passthrough_trim',
  's-phase': 'phase_freq', 's-xo1': 'crossover_1', 's-xo2': 'crossover_2', 's-la': 'lookahead_delay',
  's-de-freq': 'deesser_freq', 's-gate-hpf': 'gate_hpf', 's-gate-hyst': 'gate_hysteresis',
  's-exc-freq': 'exciter_freq', 's-corr-win': 'corr_window', 's-dith-trunc': 'dither_truncation',
  's-tb-gain': 'talkback_gain', 's-cal-ref': 'cal_reference',
};
async function sendFaderToBackend(id, value) {
  const param = FADER_PARAM_MAP[id];
  if (!param) return;
  await sendToTauri('set_fader', { param, value });
}
async function sendSliderToBackend(id, value) {
  const param = SLIDER_PARAM_MAP[id];
  if (!param) return;
  await sendToTauri('set_slider', { param, value });
}
function startMeterPolling() {
  if (!isTauri()) { console.log('🌐 Running in browser mode — using simulated meters'); return; }
  console.log('🦀 Tauri detected — polling real meters');
  setInterval(async () => {
    try {
      const meters = await window.TAURI.core.invoke('get_meters');
      const normL = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(meters.input_l, 0.0001)) + 96) / 96));
      const normR = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(meters.input_r, 0.0001)) + 96) / 96));
      document.documentElement.style.setProperty('--meter-input-l', normL.toFixed(3));
      document.documentElement.style.setProperty('--meter-input-r', normR.toFixed(3));
      document.documentElement.style.setProperty('--meter-output-l', Math.max(0, Math.min(1, (20 * Math.log10(Math.max(meters.output_l, 0.0001)) + 96) / 96)).toFixed(3));
      document.documentElement.style.setProperty('--meter-output-r', Math.max(0, Math.min(1, (20 * Math.log10(Math.max(meters.output_r, 0.0001)) + 96) / 96)).toFixed(3));
    } catch (err) { /* silent */ }
  }, 30);
}
document.addEventListener('DOMContentLoaded', async () => {
  console.log('%c PCn 1600 NATIVE ', 'background: #a855f7; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  if (isTauri()) {
    try {
      const info = await sendToTauri('get_system_info');
      console.log('💻 System:', info);
      startMeterPolling();
      const loud = await sendToTauri('get_loudness');
      if (loud) console.log('🔊 Loudness:', loud);
    } catch (err) { console.warn('⚠️ Tauri init error:', err); }
  } else {
    console.log('🌐 Browser mode — simulated meters only');
  }
});
// ================================================================
// FIN DE TAURI INTEGRATION LAYER
// ================================================================

// ================================================================
// 🎛️ WEB AUDIO API + TAURI BRIDGE (NUEVO)
// ================================================================
let audioCtx = null;
const audioNodes = {};
let audioInitialized = false;
let meterAnimFrame = null;

/**
 * Inicializa el motor Web Audio. 
 * Se puede usar micrófono real o un oscilador de prueba.
 */
async function initWebAudioEngine(useMic = false) {
  if (audioInitialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // Crear nodos de procesamiento
    audioNodes.inputGain = audioCtx.createGain();
    audioNodes.eqLow = audioCtx.createBiquadFilter(); 
    audioNodes.eqLow.type = 'lowshelf'; audioNodes.eqLow.frequency.value = 250;
    
    audioNodes.eqMid = audioCtx.createBiquadFilter(); 
    audioNodes.eqMid.type = 'peaking'; audioNodes.eqMid.frequency.value = 1000; audioNodes.eqMid.Q.value = 1;
    
    audioNodes.eqHigh = audioCtx.createBiquadFilter(); 
    audioNodes.eqHigh.type = 'highshelf'; audioNodes.eqHigh.frequency.value = 4000;

    audioNodes.compressor = audioCtx.createDynamicsCompressor();
    audioNodes.limiter = audioCtx.createDynamicsCompressor(); // Limiter = compresor rápido
    audioNodes.limiter.threshold.value = -0.5; 
    audioNodes.limiter.ratio.value = 20; 
    audioNodes.limiter.attack.value = 0.001;

    audioNodes.analyserIn = audioCtx.createAnalyser(); audioNodes.analyserIn.fftSize = 2048;
    audioNodes.analyserOut = audioCtx.createAnalyser(); audioNodes.analyserOut.fftSize = 2048;

    // Cadena de señal: Source -> Gain -> EQ -> Comp -> Lim -> Analyser -> Dest
    audioNodes.inputGain.connect(audioNodes.analyserIn);
    audioNodes.analyserIn.connect(audioNodes.eqLow);
    audioNodes.eqLow.connect(audioNodes.eqMid);
    audioNodes.eqMid.connect(audioNodes.eqHigh);
    audioNodes.eqHigh.connect(audioNodes.compressor);
    audioNodes.compressor.connect(audioNodes.limiter);
    audioNodes.limiter.connect(audioNodes.analyserOut);
    audioNodes.analyserOut.connect(audioCtx.destination);

    // Fuente de audio
    if (useMic) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioNodes.source = audioCtx.createMediaStreamSource(stream);
    } else {
      audioNodes.source = audioCtx.createOscillator();
      audioNodes.source.frequency.value = 440;
      audioNodes.source.type = 'sine';
      audioNodes.source.start();
    }
    audioNodes.source.connect(audioNodes.inputGain);

    audioInitialized = true;
    console.log('✅ Web Audio Engine running');
    
    // Patcheamos los handlers existentes para que envíen a Web Audio Y a Tauri
    bindControlsToAudioParams();
    startRealtimeMeters();
    
    // Ocultar botón de inicio
    const btn = document.getElementById('initAudioBtn');
    if (btn) btn.style.display = 'none';
    
  } catch (err) {
    console.error('❌ Error iniciando Web Audio:', err);
    alert('No se pudo acceder al motor de audio. Verifica permisos de micrófono o usa un navegador moderno.');
  }
}

/**
 * Enlaza faders/sliders existentes a AudioParams en tiempo real
 */
function bindControlsToAudioParams() {
  // Guardar referencias originales
  const origFader = window.onFaderChange;
  const origSlider = window.onSliderChange;

  // Patchear onFaderChange
  window.onFaderChange = function(id, val) {
    if (audioInitialized && audioCtx) {
      const t = audioCtx.currentTime;
      switch(id) {
        case 'f-eq-low': setParamSmooth(audioNodes.eqLow.gain, val, t); break;
        case 'f-eq-mid': setParamSmooth(audioNodes.eqMid.gain, val, t); break;
        case 'f-eq-high': setParamSmooth(audioNodes.eqHigh.gain, val, t); break;
        case 'f-mon-level': setParamSmooth(audioNodes.inputGain.gain, Math.pow(10, val/20), t); break;
      }
    }
    // Llamar a la función original para mantener compatibilidad con Tauri
    if (origFader) origFader(id, val);
  };

  // Patchear onSliderChange
  window.onSliderChange = function(id, val) {
    if (audioInitialized && audioCtx) {
      const t = audioCtx.currentTime;
      switch(id) {
        case 'f-agc-th': setParamSmooth(audioNodes.compressor.threshold, val, t); break;
        case 'f-agc-rat': setParamSmooth(audioNodes.compressor.ratio, val, t); break;
        case 'f-comp-att': setParamSmooth(audioNodes.compressor.attack, val/1000, t); break;
        case 'f-comp-rel': setParamSmooth(audioNodes.compressor.release, val/1000, t); break;
      }
    }
    // Llamar a la función original para mantener compatibilidad con Tauri
    if (origSlider) origSlider(id, val);
  };
}

/** Actualización suave de parámetros sin clicks */
function setParamSmooth(param, val, time) {
  if (!param) return;
  param.cancelScheduledValues(time);
  param.setValueAtTime(param.value, time);
  param.linearRampToValueAtTime(val, time + 0.016);
}

/**
 * Reemplaza/aumenta la simulación de medidores con RMS real del AnalyserNode
 */
function startRealtimeMeters() {
  if (!audioNodes.analyserIn) return;
  const buf = new Uint8Array(audioNodes.analyserIn.fftSize);
  
  function loop() {
    meterAnimFrame = requestAnimationFrame(loop);
    audioNodes.analyserIn.getByteTimeDomainData(buf);
    
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    
    // Actualizar CSS vars para que el loop de medidores existente los use si se desea
    document.documentElement.style.setProperty('--wa-meter-input', Math.min(1, rms * 3).toFixed(3));
    
    // Opcional: Sobrescribir valores simulados si prefieres audio 100% real
    if (meters.length > 0) {
      meters[0].tgt = Math.min(1, rms * 2.5);
      meters[1].tgt = Math.min(1, rms * 2.2); // Ligera diferencia estéreo
    }
  }
  loop();
}

// Inicialización desde UI - botón agregado en index.html
document.getElementById('initAudioBtn')?.addEventListener('click', () => {
  initWebAudioEngine(false); // false = oscilador de prueba. true = micrófono
});

// Limpieza al cerrar
window.addEventListener('beforeunload', () => {
  if (meterAnimFrame) cancelAnimationFrame(meterAnimFrame);
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
});