'use strict';

// ================= Veri =================
const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Pazartesi'den başla
const LATE_LIMIT_MS = 60 * 60 * 1000;   // gecikmeli de olsa 1 saate kadar çal

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let alarms = load('alarms', []);            // [{id, h, m, days:[0-6], on}]
let settings = load('settings', { snooze: 5, ramp: true, dim: 0.35 });
let snooze = load('snooze', null);          // {ts, label}
let nextFire = {};                          // id -> zaman damgası

const pad = n => String(n).padStart(2, '0');
const fmt = (h, m) => pad(h) + ':' + pad(m);
const $ = id => document.getElementById(id);

function daysText(days) {
  if (!days.length) return 'Bir kez';
  if (days.length === 7) return 'Her gün';
  const s = [...days].sort().join();
  if (s === '1,2,3,4,5') return 'Hafta içi';
  if (s === '0,6') return 'Hafta sonu';
  return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_NAMES[d]).join(' ');
}

// Bir alarmın "after" zamanından sonraki ilk çalma anı
function nextOccurrence(a, after) {
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setHours(a.h, a.m);
  for (let i = 0; i < 8; i++) {
    if (d.getTime() > after && (!a.days.length || a.days.includes(d.getDay()))) return d.getTime();
    d.setDate(d.getDate() + 1);
    d.setHours(a.h, a.m, 0, 0);
  }
  return null;
}

function reschedule() {
  const now = Date.now();
  nextFire = {};
  for (const a of alarms) {
    if (a.on) nextFire[a.id] = nextOccurrence(a, now);
  }
}

function upcoming() {
  let best = null;
  for (const a of alarms) {
    const ts = nextFire[a.id];
    if (a.on && ts && (!best || ts < best.ts)) best = { ts, a };
  }
  if (snooze && (!best || snooze.ts < best.ts)) best = { ts: snooze.ts, snooze: true };
  return best;
}

function untilText(ts) {
  const mins = Math.max(0, Math.round((ts - Date.now()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h} sa ${m} dk sonra`;
  if (h) return `${h} saat sonra`;
  return `${m} dk sonra`;
}

// ================= Liste ekranı =================
function renderList() {
  const list = $('list');
  list.innerHTML = '';
  const sorted = [...alarms].sort((x, y) => (x.h * 60 + x.m) - (y.h * 60 + y.m));
  if (!sorted.length) {
    list.innerHTML = '<div class="empty">Henüz alarm yok.<br>Eklemek için + düğmesine dokun.</div>';
  }
  for (const a of sorted) {
    const row = document.createElement('div');
    row.className = 'alarm' + (a.on ? '' : ' off');
    const info = document.createElement('button');
    info.className = 'info';
    let sub = daysText(a.days);
    if (a.on && nextFire[a.id]) sub += ' · ' + untilText(nextFire[a.id]);
    info.innerHTML = `<div class="t">${fmt(a.h, a.m)}</div><div class="d">${sub}</div>`;
    info.onclick = () => openEditor(a);
    const sw = document.createElement('button');
    sw.className = 'switch' + (a.on ? ' on' : '');
    sw.setAttribute('aria-label', 'Aç/Kapat');
    sw.onclick = () => { a.on = !a.on; persist(); };
    row.append(info, sw);
    list.append(row);
  }
  $('s-snooze').value = String(settings.snooze);
  $('s-ramp').classList.toggle('on', settings.ramp);
}

function persist() {
  save('alarms', alarms);
  save('settings', settings);
  save('snooze', snooze);
  reschedule();
  renderList();
}

// ================= Düzenleyici =================
let editing = null, editDays = [];

function renderDays() {
  const box = $('e-days');
  box.innerHTML = '';
  for (const d of DAY_ORDER) {
    const b = document.createElement('button');
    b.textContent = DAY_NAMES[d];
    b.className = editDays.includes(d) ? 'sel' : '';
    b.onclick = () => {
      editDays = editDays.includes(d) ? editDays.filter(x => x !== d) : [...editDays, d];
      renderDays();
    };
    box.append(b);
  }
}

function openEditor(a) {
  editing = a || null;
  $('e-title').textContent = a ? 'Alarmı Düzenle' : 'Yeni Alarm';
  $('e-time').value = a ? fmt(a.h, a.m) : '07:00';
  editDays = a ? [...a.days] : [];
  $('e-del').classList.toggle('hidden', !a);
  renderDays();
  $('editor').classList.remove('hidden');
}

$('add').onclick = () => openEditor(null);
$('e-cancel').onclick = () => $('editor').classList.add('hidden');
$('editor').onclick = e => { if (e.target.id === 'editor') $('editor').classList.add('hidden'); };
document.querySelectorAll('.quick button').forEach(b => b.onclick = () => {
  editDays = b.dataset.q === 'week' ? [1, 2, 3, 4, 5] : b.dataset.q === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [];
  renderDays();
});
$('e-save').onclick = () => {
  const [h, m] = ($('e-time').value || '07:00').split(':').map(Number);
  if (editing) Object.assign(editing, { h, m, days: editDays, on: true });
  else alarms.push({ id: Date.now().toString(36), h, m, days: editDays, on: true });
  $('editor').classList.add('hidden');
  persist();
};
$('e-del').onclick = () => {
  if (editing && confirm('Bu alarm silinsin mi?')) {
    alarms = alarms.filter(a => a !== editing);
    $('editor').classList.add('hidden');
    persist();
  }
};
$('s-snooze').onchange = e => { settings.snooze = Number(e.target.value); persist(); };
$('s-ramp').onclick = () => { settings.ramp = !settings.ramp; persist(); };

// ================= Ses =================
let ctx = null, buffer = null, keepAlive = null, source = null, gain = null;
const fallbackAudio = new Audio('alarm.m4a');
fallbackAudio.loop = true;
fallbackAudio.preload = 'auto';

async function unlockAudio() {
  // iOS 17+: sessiz düğmesi açıkken bile çalabilsin
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  try { await ctx.resume(); } catch {}
  if (!buffer) {
    try {
      const res = await fetch('alarm.m4a');
      const data = await res.arrayBuffer();
      buffer = await new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));
    } catch (e) { console.warn('Ses yüklenemedi', e); }
  }
  // Ses bağlamını uyanık tutmak için duyulmayan sürekli bir ses
  if (!keepAlive) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.frequency.value = 20;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    keepAlive = osc;
  }
  // HTML ses öğesini de bir kez kullanıcı dokunuşuyla "aç"
  try {
    fallbackAudio.muted = true;
    await fallbackAudio.play();
    fallbackAudio.pause();
    fallbackAudio.currentTime = 0;
    fallbackAudio.muted = false;
  } catch {}
}

function startSound() {
  stopSound();
  let ok = false;
  if (ctx && buffer) {
    try {
      if (ctx.state !== 'running') ctx.resume();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      gain = ctx.createGain();
      const t = ctx.currentTime;
      if (settings.ramp) {
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(1, t + 45);
      } else {
        gain.gain.setValueAtTime(1, t);
      }
      source.connect(gain).connect(ctx.destination);
      source.start();
      ok = ctx.state === 'running';
    } catch (e) { console.warn(e); }
  }
  // Web Audio çalışmıyorsa yedek yol
  if (!ok) {
    fallbackAudio.currentTime = 0;
    fallbackAudio.volume = 1;
    fallbackAudio.play().catch(() => {});
  }
}

function stopSound() {
  if (source) { try { source.stop(); } catch {} source.disconnect(); source = null; }
  fallbackAudio.pause();
}

let testing = false;
$('test').onclick = async () => {
  if (testing) { stopSound(); testing = false; $('test').textContent = '▶︎ Çal'; return; }
  await unlockAudio();
  startSound();
  testing = true;
  $('test').textContent = '■ Durdur';
  setTimeout(() => { if (testing) $('test').click(); }, 6000);
};

// ================= Ekranı açık tutma =================
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
  updateWarn();
}
function updateWarn() {
  const w = $('n-warn');
  if (!('wakeLock' in navigator) || !wakeLock) {
    w.textContent = 'Ekran kilitlenirse alarm çalmaz. Otomatik Kilit ayarını "Hiçbir Zaman" yap.';
  } else w.textContent = '';
}

// ================= Gece modu =================
let nightOn = false, barTimer = null, needsResume = false;

async function startNight() {
  if (testing) $('test').click();
  needsResume = false;
  await unlockAudio();
  await requestWakeLock();
  nightOn = true;
  save('night', true);
  $('night').classList.remove('hidden');
  $('n-dim').value = settings.dim;
  applyDim();
  showBar();
  tick();
}

function exitNight() {
  nightOn = false;
  save('night', false);
  $('night').classList.add('hidden');
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  renderList();
}

function applyDim() {
  $('clock-wrap').style.opacity = settings.dim;
}

function showBar() {
  $('n-bar').classList.remove('faded');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => $('n-bar').classList.add('faded'), 5000);
}

$('start').onclick = startNight;
$('n-exit').onclick = e => { e.stopPropagation(); exitNight(); };
$('night').onclick = () => showBar();
$('n-dim').oninput = e => { settings.dim = Number(e.target.value); applyDim(); save('settings', settings); showBar(); };

// Saati her dakika hafifçe kaydır (ekranda iz kalmasın)
function nudgeClock() {
  const x = 50 + (Math.random() * 10 - 5);
  const y = 50 + (Math.random() * 16 - 8);
  $('clock-wrap').style.left = x + '%';
  $('clock-wrap').style.top = y + '%';
}

// ================= Çalma =================
let ringing = null;

function ring(info) {
  ringing = info;
  $('r-label').textContent = info.label;
  $('r-snooze').textContent = `Ertele (${settings.snooze} dk)`;
  $('ring').classList.remove('hidden');
  startSound();
  tick();
}

function endRing() {
  stopSound();
  ringing = null;
  $('ring').classList.add('hidden');
  persist();
  tick();
}

$('r-snooze').onclick = () => {
  snooze = { ts: Date.now() + settings.snooze * 60000, label: 'Ertelendi' };
  endRing();
};
$('r-stop').onclick = () => {
  snooze = null;
  endRing();
};

// ================= Zamanlayıcı =================
let lastMinute = -1;

function tick() {
  const now = new Date();
  const ts = now.getTime();
  const hm = fmt(now.getHours(), now.getMinutes());

  if (!ringing) {
    // Ertelenen alarm
    if (snooze && ts >= snooze.ts) {
      const late = ts - snooze.ts;
      const label = snooze.label;
      snooze = null;
      save('snooze', snooze);
      if (late < LATE_LIMIT_MS) ring({ label });
    }
    // Normal alarmlar
    for (const a of alarms) {
      const f = nextFire[a.id];
      if (!a.on || !f || ts < f || ringing) continue;
      const late = ts - f;
      if (!a.days.length) a.on = false;      // bir kerelik alarm kapanır
      save('alarms', alarms);
      nextFire[a.id] = a.on ? nextOccurrence(a, ts) : null;
      if (late < LATE_LIMIT_MS) ring({ label: 'Alarm · ' + fmt(a.h, a.m) });
    }
  }

  $('n-clock').textContent = hm;
  $('r-clock').textContent = hm;
  const up = upcoming();
  $('n-next').textContent = needsResume ? 'Gece modunu sürdürmek için ekrana dokun' : up
    ? (up.snooze ? '💤 Ertelendi · ' : '⏰ ') + fmt(new Date(up.ts).getHours(), new Date(up.ts).getMinutes()) + ' · ' + untilText(up.ts)
    : 'Kurulu alarm yok';

  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    if (nightOn) nudgeClock();
    if (!nightOn && $('editor').classList.contains('hidden')) renderList();
  }

  // iOS ses bağlamını bazen askıya alır; tekrar uyandır
  if (ctx && ctx.state !== 'running' && nightOn) ctx.resume().catch(() => {});
}

setInterval(tick, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (nightOn) requestWakeLock();
    tick();
  }
});

// ================= Başlangıç =================
const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) $('install-hint').classList.remove('hidden');

reschedule();
renderList();
tick();

// Uygulama gece yeniden yüklendiyse: ses için bir dokunuş gerekir
if (load('night', false)) {
  $('night').classList.remove('hidden');
  needsResume = true;
  tick();
  $('clock-wrap').style.opacity = 0.6;
  $('night').addEventListener('click', function resume() {
    $('night').removeEventListener('click', resume);
    startNight();
  }, { once: true });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
