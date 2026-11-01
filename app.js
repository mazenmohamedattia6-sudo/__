// ══════════ الرسايل (اتفتح كل ما الرقم يوصل) ══════════
const MSGS = [
  { at: 5,  icon: '😊', text: 'ضحكتك لوحدها بتصلح يومي كله.' },
  { at: 10, icon: '🤍', text: 'إنتِ مصدر أماني ومصدر طمأنتي يا ملك.' },
  { at: 15, icon: '🌹', text: 'عيونك شبه الخمرة… كل ما أبص فيها أدوخ أكتر.' },
  { at: 20, icon: '✨', text: 'إنتِ زي النجم الساطع، ومفيش حد يقدر ياخد مكانه.' },
  { at: 25, icon: '🏠', text: 'بحب حضنك أكتر من أي حاجة… بحس إني راجع لبيتي.' },
  { at: 30, icon: '👑', final: true,
    text: 'كسبتِ يا ملك!\nبس الحقيقة إنك كسبتيني من زمان.\nبحبك أكتر من أي حاجة في حياتي. 💗\n\n— مازن، أبو ليلي 🌙' },
];
const WIN_AT = 30;
const START_LIVES = 3;

// ══════════ عناصر الصفحة ══════════
const frame   = document.getElementById('frame');
const canvas  = document.getElementById('game');
const ctx     = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const bestEl  = document.getElementById('best');
const bannerEl= document.getElementById('banner');
const colGrid = document.getElementById('col-grid');
const soundBtn= document.getElementById('sound-btn');
const OV = { start: document.getElementById('ov-start'), over: document.getElementById('ov-over'), win: document.getElementById('ov-win') };

function showOv(name) { Object.keys(OV).forEach(k => OV[k].classList.toggle('active', k === name)); }

// ══════════ تخزين ══════════
function load(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
let best = load('malak_catch_best', 0);
let unlocked = load('malak_catch_unlocked', []);
bestEl.textContent = best;

// ══════════ حالة اللعبة ══════════
let W = 0, H = 0, dpr = 1;
let state = 'ready';               // ready | playing | over | won
let score = 0, lives = START_LIVES;
let items = [], floaters = [], sparks = [];
let spawnT = 0, last = performance.now();
let runShown = new Set();
const basket = { x: 0, target: 0, w: 90, h: 34 };
const keys = { left: false, right: false };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = frame.getBoundingClientRect();
  const ratio = W ? basket.x / W : 0.5;
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  basket.w = clamp(W * 0.24, 76, 116);
  basket.x = basket.target = clamp(W * ratio, basket.w / 2, W - basket.w / 2);
}
window.addEventListener('resize', fit);

// ══════════ تحكم ══════════
function setTargetFromPointer(e) {
  const r = canvas.getBoundingClientRect();
  basket.target = clamp(e.clientX - r.left, basket.w / 2, W - basket.w / 2);
}
canvas.addEventListener('pointermove', setTargetFromPointer);
canvas.addEventListener('pointerdown', setTargetFromPointer);

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a')  { keys.left = true;  e.preventDefault(); }
  if (k === 'arrowright' || k === 'd') { keys.right = true; e.preventDefault(); }
  if ((k === 'enter' || k === ' ') && state !== 'playing') { e.preventDefault(); startGame(); }
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a')  keys.left = false;
  if (k === 'arrowright' || k === 'd') keys.right = false;
});

// ══════════ صوت بسيط ══════════
let actx = null, soundOn = true;
function initAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
}
function blip(freq, dur, type, vol, slideTo) {
  if (!soundOn || !actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.classList.toggle('off', !soundOn);
});

// ══════════ اللعبة ══════════
function renderLives() { livesEl.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, START_LIVES - lives)); }

function startGame() {
  initAudio();
  score = 0; lives = START_LIVES;
  items = []; floaters = []; sparks = [];
  spawnT = 0.5; runShown = new Set();
  basket.x = basket.target = W / 2;
  scoreEl.textContent = 0; renderLives();
  bannerEl.classList.remove('show');
  showOv(null);
  state = 'playing';
  last = performance.now();
}

function spawn() {
  const brokenP = 0.14 + Math.min(0.1, score * 0.003);
  const r = Math.random();
  const type = r < brokenP ? 'broken' : (r < brokenP + 0.1 ? 'star' : 'heart');
  const emoji = type === 'broken' ? '💔' : type === 'star' ? '🌟' : '💗';
  const size = type === 'star' ? 32 : 30;
  const scale = H / 600;
  items.push({
    type, emoji, size,
    x: size / 2 + Math.random() * (W - size),
    y: -size,
    vy: (125 + score * 3.5 + Math.random() * 55) * Math.max(0.75, scale),
    rot: (Math.random() - 0.5) * 0.4,
    spin: (Math.random() - 0.5) * 0.9,
    t: Math.random() * 6,
  });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 110;
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.6 + Math.random() * 0.3, max: 0.9, color });
  }
}

function addScore(n, x, y) {
  score += n;
  scoreEl.textContent = score;
  floaters.push({ x, y, text: '+' + n, life: 0.9 });
  checkMessages();
}

function checkMessages() {
  let latest = null;
  MSGS.forEach(m => {
    if (runShown.has(m.at) || score < m.at) return;
    runShown.add(m.at);
    if (!unlocked.includes(m.at)) { unlocked.push(m.at); save('malak_catch_unlocked', unlocked); }
    if (!m.final) latest = m;
  });
  if (latest) { showBanner(latest.icon + '  ' + latest.text); blip(660, 0.35, 'triangle', 0.14, 990); renderCollection(); }
  if (score >= WIN_AT) winGame();
}

let bannerT;
function showBanner(txt) {
  bannerEl.textContent = txt;
  bannerEl.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => bannerEl.classList.remove('show'), 4200);
}

function hitBroken(x, y) {
  lives -= 1; renderLives();
  burst(x, y, '#ff6b8a', 14);
  blip(220, 0.3, 'sawtooth', 0.12, 90);
  frame.classList.remove('shake', 'flash'); void frame.offsetWidth; frame.classList.add('shake', 'flash');
  if (lives <= 0) endGame();
}

function finishRun() {
  if (score > best) { best = score; bestEl.textContent = best; save('malak_catch_best', best); }
  renderCollection();
}

function endGame() {
  state = 'over'; finishRun();
  bannerEl.classList.remove('show');
  const opened = MSGS.filter(m => runShown.has(m.at) && !m.final).length;
  document.getElementById('over-text').innerHTML =
    `جمعتِ <b>${score}</b> قلب` + (opened ? ` وفتحتِ <b>${opened}</b> رسالة 💌` : '') +
    `<br>لسه في رسايل مستنياكِ، حاولي تاني!`;
  setTimeout(() => showOv('over'), 450);
}

function winGame() {
  if (state === 'won') return;
  state = 'won'; finishRun();
  bannerEl.classList.remove('show');
  document.getElementById('win-text').textContent = MSGS.find(m => m.final).text;
  blip(523, 0.5, 'triangle', 0.16, 1046);
  setTimeout(() => { showOv('win'); celebrate(); }, 600);
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-retry').addEventListener('click', startGame);
document.getElementById('btn-again').addEventListener('click', startGame);

// ══════════ تحديث ورسم ══════════
function update(dt) {
  if (keys.left)  basket.target -= 560 * dt;
  if (keys.right) basket.target += 560 * dt;
  basket.target = clamp(basket.target, basket.w / 2, W - basket.w / 2);

  spawnT -= dt;
  if (spawnT <= 0) {
    spawn();
    spawnT = Math.max(0.34, 0.95 - score * 0.012) * (0.8 + Math.random() * 0.4);
  }

  const top = H - 58;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.y += it.vy * dt; it.rot += it.spin * dt; it.t += dt;
    const caught = it.y + it.size * 0.4 >= top && it.y <= top + 26 && Math.abs(it.x - basket.x) <= basket.w / 2 + 6;
    if (caught) {
      items.splice(i, 1);
      if (it.type === 'broken') hitBroken(it.x, top);
      else {
        burst(it.x, top, it.type === 'star' ? '#ffd86b' : '#f0aac4', 8);
        blip(it.type === 'star' ? 880 : 620, 0.16, 'sine', 0.13, it.type === 'star' ? 1320 : 780);
        addScore(it.type === 'star' ? 3 : 1, it.x, top - 10);
        if (state !== 'playing') return;
      }
    } else if (it.y > H + 40) items.splice(i, 1);
  }
}

function drawBasket() {
  const top = H - 58, x = basket.x, w = basket.w, h = basket.h;
  ctx.save();
  ctx.shadowColor = 'rgba(232,208,138,.45)'; ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, '#e8d08a'); g.addColorStop(1, '#a8802c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top);
  ctx.lineTo(x + w / 2, top);
  ctx.quadraticCurveTo(x + w / 2 - 4, top + h, x, top + h);
  ctx.quadraticCurveTo(x - w / 2 + 4, top + h, x - w / 2, top);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,248,220,.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - w / 2, top); ctx.lineTo(x + w / 2, top); ctx.stroke();
  ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('💗', x, top + h * 0.5);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  items.forEach(it => {
    ctx.save();
    ctx.translate(it.x + Math.sin(it.t * 2) * 4, it.y);
    ctx.rotate(it.rot);
    ctx.shadowColor = it.type === 'broken' ? 'rgba(255,80,110,.6)' : it.type === 'star' ? 'rgba(255,216,107,.8)' : 'rgba(240,170,196,.7)';
    ctx.shadowBlur = 14;
    ctx.font = it.size + 'px serif';
    ctx.fillText(it.emoji, 0, 0);
    ctx.restore();
  });

  sparks.forEach(s => {
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  floaters.forEach(f => {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = '#e8d08a';
    ctx.font = 'italic 700 20px "Playfair Display", serif';
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;

  drawBasket();
}

function stepFx(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt; s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 38 * dt; f.life -= dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  basket.x += (basket.target - basket.x) * Math.min(1, dt * 16);
  if (state === 'playing') update(dt);
  stepFx(dt);
  draw();
  requestAnimationFrame(loop);
}

// ══════════ الرسايل المتجمعة ══════════
function renderCollection() {
  colGrid.innerHTML = '';
  MSGS.forEach(m => {
    const open = unlocked.includes(m.at);
    const d = document.createElement('div');
    d.className = 'col-item ' + (open ? 'open' : 'locked');
    const ico = document.createElement('span'); ico.className = 'ci'; ico.textContent = open ? m.icon : '🔒';
    const txt = document.createElement('span');
    txt.textContent = open ? (m.final ? 'الرسالة الأخيرة: ' + m.text.split('\n')[0] + '…' : m.text) : 'رسالة مقفولة';
    d.appendChild(ico); d.appendChild(txt);
    if (!open) { const n = document.createElement('span'); n.className = 'need'; n.textContent = 'عند ' + m.at + ' قلب'; d.appendChild(n); }
    colGrid.appendChild(d);
  });
}

// ══════════ احتفال + خلفية ══════════
function celebrate() {
  const s = ['💗', '👑', '✨', '🌙', '💌'];
  for (let k = 0; k < 28; k++) {
    setTimeout(() => {
      const h = document.createElement('div');
      h.className = 'float-p';
      h.textContent = s[Math.floor(Math.random() * s.length)];
      h.style.cssText += `left:${10 + Math.random() * 80}vw;font-size:${.9 + Math.random() * 1.2}rem;animation-duration:${2.4 + Math.random() * 2.4}s;`;
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 5500);
    }, k * 120);
  }
}

const bgC = document.getElementById('bg-canvas'), bgX = bgC.getContext('2d');
function resizeBg() { bgC.width = innerWidth; bgC.height = innerHeight; }
resizeBg(); window.addEventListener('resize', resizeBg);
const pts = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * .7 + .15, vx: (Math.random() - .5) * .1, vy: (Math.random() - .5) * .1, a: Math.random(), da: (Math.random() - .5) * .005, c: Math.random() > .5 ? '201,168,76' : '201,107,138' }));
function drawBg() {
  const w = bgC.width, h = bgC.height; bgX.clearRect(0, 0, w, h);
  pts.forEach(p => {
    p.x += p.vx / w; p.y += p.vy / h; p.a += p.da;
    if (p.a < .05 || p.a > .82) p.da *= -1;
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0; if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
    const px = p.x * w, py = p.y * h, g = bgX.createRadialGradient(px, py, 0, px, py, p.r * 6);
    g.addColorStop(0, `rgba(${p.c},${p.a})`); g.addColorStop(1, `rgba(${p.c},0)`);
    bgX.beginPath(); bgX.arc(px, py, p.r * 6, 0, Math.PI * 2); bgX.fillStyle = g; bgX.fill();
  });
  requestAnimationFrame(drawBg);
}
drawBg();

// ══════════ تشغيل ══════════
fit();
basket.x = basket.target = W / 2;
renderLives();
renderCollection();
requestAnimationFrame(t => { last = t; loop(t); });
