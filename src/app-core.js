/* Ladder Mate: board, saved progress, ratings, puzzle player, lesson player. */
const E = window.LMEngine, C = window.LMContent;
const { Position } = E;
const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LS_KEY = 'ladder-mate-v1';
const DATA_VERSION = 1;
const MATE_ZONE = E.MATE - 200;

/* ---------- DOM helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  add(e, kids);
  return e;
}
function add(e, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(e, k);
    else e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
const randInt = (n) => Math.floor(Math.random() * n);
const randOf = (a) => a[randInt(a.length)];
const halfFen = (f) => f.split(' ').slice(0, 4).join(' ');
const stripSuffix = (s) => s.replace(/[+#!?]/g, '');
const colorWord = (s) => (s > 0 ? 'White' : 'Black');

/* ---------- Puzzle data ---------- */
const PZ = (() => {
  const list = $('#puzzle-data').textContent.trim().split('\n').map((l) => {
    const a = l.split('|');
    return { id: a[0], fen: a[1], moves: a[2].split(' '), r: +a[3], t: a[4] || '' };
  });
  return { list, byId: new Map(list.map((p, i) => [p.id, i])) };
})();
const BL = $('#blunder-data').textContent.trim().split('\n').map((l) => {
  const a = l.split('|');
  return { pid: a[0], safe: a[1], loss: +a[2] };
}).filter((b) => PZ.byId.has(b.pid));
const themesOf = (p) => [...p.t].map((ch) => C.THEME_ORDER[CODE.indexOf(ch)]).filter(Boolean);
const NAMED = (t) => C.THEMES[t] && C.THEMES[t][1];

/* ---------- Saved progress ---------- */
const fresh = () => ({
  v: 1, dv: DATA_VERSION, createdAt: Date.now(), updatedAt: 0,
  placed: null, exempt: 0, cls: 0,
  tac: { r: 800, rd: 300, last: 0, n: 0, ok: 0 },
  play: { r: 700, n: 0 },
  lessons: {}, themes: {}, seen: '', srs: [], hist: [],
  streak: { cur: 0, best: 0, last: 0 }, rounds: 0, day: null,
  rush: { best: 0 }, vis: {}, bots: {}, games: [], real: 0,
  settings: { sound: true },
});
let S = (() => {
  try {
    const t = localStorage.getItem(LS_KEY);
    if (t) { const o = JSON.parse(t); if (o && o.v === 1) return { ...fresh(), ...o }; }
  } catch { /* private window or blocked storage: start fresh */ }
  return fresh();
})();

let seenBits = new Uint8Array(Math.ceil(PZ.list.length / 8));
function seenLoad() {
  seenBits = new Uint8Array(Math.ceil(PZ.list.length / 8));
  if (S.dv !== DATA_VERSION) { S.dv = DATA_VERSION; S.seen = ''; return; }
  try {
    const b = atob(S.seen || '');
    for (let i = 0; i < b.length && i < seenBits.length; i++) seenBits[i] = b.charCodeAt(i);
  } catch { /* unreadable: treat every puzzle as unseen */ }
}
const isSeen = (i) => (seenBits[i >> 3] >> (i & 7)) & 1;
const markSeen = (i) => { seenBits[i >> 3] |= 1 << (i & 7); };
function seenSave() {
  let s = '';
  for (let i = 0; i < seenBits.length; i++) s += String.fromCharCode(seenBits[i]);
  S.seen = btoa(s);
}
seenLoad();

const Sync = {
  ref: null, where: 'this browser', writing: false, dirty: false,
  async init() {
    if (!window.claude || !window.claude.use) return;
    try {
      const [user, db] = await Promise.all([window.claude.use('user'), window.claude.use('db')]);
      if (!user || !db) return;
      const id = await user.id();
      if (!id) return;
      this.ref = db.doc('data/users/' + id + '/progress');
      const snap = await this.ref.get();
      if (snap.exists) {
        const d = snap.data();
        if (d && d.v === 1 && (d.updatedAt || 0) > (S.updatedAt || 0)) {
          S = { ...fresh(), ...JSON.parse(JSON.stringify(d)) };
          seenLoad();
          if (UI.view) go(UI.view);
        }
      }
      this.where = 'your account';
      if (S.placed !== null && !snap.exists) this.write();
    } catch { this.ref = null; }
  },
  async write() {
    if (!this.ref) return;
    if (this.writing) { this.dirty = true; return; }
    this.writing = true;
    try {
      await this.ref.set(JSON.parse(JSON.stringify(S)));
    } catch (e) {
      // A view-only viewer cannot write. Keep playing with browser storage.
      if (e && e.code === 'invalid_argument') { this.ref = null; this.where = 'this browser'; }
    }
    this.writing = false;
    if (this.dirty) { this.dirty = false; this.write(); }
  },
};
let saveTimer = 0;
function save() {
  S.updatedAt = Date.now();
  seenSave();
  updateHistory();
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch { /* storage full or blocked */ }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => Sync.write(), 1800);
  renderRail();
}

/* ---------- Ratings and the ladder ---------- */
const lessonDone = (id) => !!(S.lessons[id] && S.lessons[id].pass);
const curClass = () => S.cls;

function gates(cls) {
  const c = C.CLASSES[cls];
  const ls = C.LESSONS.filter((l) => l.cls === cls);
  const count = (tracks) => {
    const a = ls.filter((l) => tracks.includes(l.track));
    return [a.filter((l) => lessonDone(l.id)).length, a.length];
  };
  const [td, tt] = count(['technique']);
  const [kd, kt] = count(['rules', 'motifs', 'strategy', 'openings']);
  const bot = C.BOTS.find((b) => b.cls === cls);
  const rec = (bot && S.bots[bot.id]) || {};
  const wins = bot ? (bot.wins === 2 ? (rec.wW ? 1 : 0) + (rec.wB ? 1 : 0) : Math.min(1, (rec.wW || 0) + (rec.wB || 0))) : 0;
  const out = [{ k: 'Tactics', ok: c.tac ? S.tac.r >= c.tac : true, val: c.tac ? `${Math.round(S.tac.r)}/${c.tac}` : '' }];
  if (tt) out.push({ k: 'Endgames', ok: td === tt, val: `${td}/${tt}` });
  out.push({ k: 'Lessons', ok: kd === kt, val: `${kd}/${kt}` });
  if (bot) out.push({ k: 'Beat ' + bot.name, ok: wins >= bot.wins, val: `${wins}/${bot.wins}` });
  return out;
}

function trackEq(tracks) {
  for (let i = S.exempt; i < 7; i++) {
    const a = C.LESSONS.filter((l) => l.cls === i && tracks.includes(l.track));
    if (!a.length) continue;
    const d = a.filter((l) => lessonDone(l.id)).length;
    if (d < a.length) {
      const floor = C.CLASSES[i].floor, top = C.CLASSES[i + 1].floor;
      return floor + (top - floor) * (d / a.length);
    }
  }
  return 2000;
}
const measures = () => ({
  // Lichess puzzle ratings run ahead of playing ratings, so this offset is a rough correction.
  tactics: clamp(S.tac.r - 150, 400, 2200),
  play: clamp(S.play.r, 400, 2200),
  endgames: Math.max(trackEq(['technique']), C.CLASSES[S.exempt].floor),
  lessons: Math.max(trackEq(['rules', 'motifs', 'strategy', 'openings']), C.CLASSES[S.exempt].floor),
});
function ladderRating() {
  const m = measures();
  const raw = 0.35 * m.tactics + 0.35 * m.play + 0.15 * m.endgames + 0.15 * m.lessons;
  const c = S.cls;
  const floor = C.CLASSES[c].floor;
  const cap = c < 7 ? C.CLASSES[c + 1].floor - 1 : 2200;
  return Math.round(clamp(raw, floor, cap));
}
function updateHistory() {
  if (S.placed === null) return;
  const d = today(), r = ladderRating();
  const last = S.hist[S.hist.length - 1];
  const row = [d, r, Math.round(S.tac.r), Math.round(S.play.r)];
  if (last && last[0] === d) S.hist[S.hist.length - 1] = row;
  else S.hist.push(row);
  if (S.hist.length > 700) S.hist.shift();
}
function checkPromotion() {
  let up = false;
  while (S.cls < 7 && gates(S.cls).every((g) => g.ok)) { S.cls++; up = true; }
  if (up) { save(); celebrate(S.cls); }
  return up;
}

/* Glicko-1 update of the player's puzzle rating. */
function glickoUpdate(pr, score) {
  const q = Math.log(10) / 400;
  const t = S.tac;
  const days = t.last ? Math.max(0, today() - t.last) : 0;
  let rd = Math.min(350, Math.sqrt(t.rd * t.rd + 14 * 14 * days));
  const rdj = 75;
  const g = 1 / Math.sqrt(1 + 3 * q * q * rdj * rdj / (Math.PI * Math.PI));
  const e = 1 / (1 + Math.pow(10, -g * (t.r - pr) / 400));
  const d2 = 1 / (q * q * g * g * e * (1 - e));
  const denom = 1 / (rd * rd) + 1 / d2;
  const before = t.r;
  t.r = clamp(t.r + (q / denom) * g * (score - e), 100, 3200);
  t.rd = Math.max(55, Math.sqrt(1 / denom));
  t.last = today();
  t.n++;
  if (score === 1) t.ok++;
  return Math.round(t.r) - Math.round(before);
}

function pickPuzzle(target, o) {
  o = o || {};
  const list = PZ.list;
  let lo = 0, hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].r < target) lo = mid + 1; else hi = mid;
  }
  const want = o.themes ? new Set(o.themes.map((t) => CODE[C.THEME_ORDER.indexOf(t)])) : null;
  const fits = (i) => {
    const p = list[i];
    if (o.minMoves && p.moves.length < o.minMoves) return false;
    if (want && ![...p.t].some((ch) => want.has(ch))) return false;
    if (o.filter && !o.filter(p)) return false;
    return true;
  };
  for (const w of [70, 140, 260, 450, 800, 1500, 3000]) {
    const pool = [];
    for (let i = lo; i < list.length && list[i].r <= target + w; i++) if (!isSeen(i) && fits(i)) pool.push(i);
    for (let i = lo - 1; i >= 0 && list[i].r >= target - w; i--) if (!isSeen(i) && fits(i)) pool.push(i);
    if (pool.length >= 3 || w === 3000) {
      if (pool.length) return list[randOf(pool)];
    }
  }
  // Every fitting puzzle has been seen: allow repeats instead of running dry.
  for (let k = 0; k < 400; k++) {
    const i = clamp(lo + randInt(1200) - 600, 0, list.length - 1);
    if (fits(i)) return list[i];
  }
  return list[lo];
}
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
const nextTarget = () => S.tac.r - 25 + gauss() * 95;

function themeRecord(p, ok) {
  for (const t of themesOf(p)) {
    if (['middlegame', 'endgame', 'opening', 'mate'].includes(t)) continue;
    const r = S.themes[t] || (S.themes[t] = [0, 0]);
    r[1]++;
    if (ok) r[0]++;
  }
}
function weakThemes() {
  return Object.entries(S.themes)
    .filter(([, r]) => r[1] >= 4)
    .map(([t, r]) => ({ t, ok: r[0], n: r[1], pct: r[0] / r[1] }))
    .sort((a, b) => a.pct - b.pct);
}

/* ---------- Spaced repetition ---------- */
const SRS_DAYS = [1, 2, 4, 9, 21, 50];
function srsAdd(k) {
  const d = today();
  const it = S.srs.find((x) => x.k === k);
  if (it) { it.box = 0; it.due = d + 1; return; }
  S.srs.push({ k, box: 0, due: d + 1 });
  if (S.srs.length > 400) S.srs.sort((a, b) => a.due - b.due).shift();
}
const srsDue = () => S.srs.filter((x) => x.due <= today());
function srsResult(k, ok) {
  const it = S.srs.find((x) => x.k === k);
  if (!it) return;
  if (ok) {
    it.box++;
    if (it.box >= SRS_DAYS.length) S.srs = S.srs.filter((x) => x !== it);
    else it.due = today() + SRS_DAYS[it.box];
  } else { it.box = 0; it.due = today() + 1; }
}

/* ---------- Engine in a Worker, with a main-thread fallback ---------- */
const Engine = {
  w: null, ok: false, seq: 0, wait: new Map(),
  init() {
    try {
      const src = $('#engine-src').textContent + '\nself.onmessage=function(e){var m=e.data;if(m.ping){postMessage({pong:1});return;}postMessage({id:m.id,res:LMEngine.runTask(m.task)});};';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = (e) => {
        const m = e.data;
        if (m.pong) { this.ok = true; return; }
        const f = this.wait.get(m.id);
        if (f) { this.wait.delete(m.id); f.resolve(m.res); }
      };
      w.onerror = () => this.fallback();
      w.postMessage({ ping: 1 });
      this.w = w;
      setTimeout(() => { if (!this.ok) this.fallback(); }, 2500);
    } catch { this.w = null; }
  },
  fallback() {
    this.w = null; this.ok = false;
    for (const [, f] of this.wait) setTimeout(() => f.resolve(E.runTask(f.task)), 10);
    this.wait.clear();
  },
  run(task) {
    return new Promise((resolve) => {
      if (this.w && this.ok) {
        const id = ++this.seq;
        this.wait.set(id, { resolve, task });
        this.w.postMessage({ id, task });
      } else {
        setTimeout(() => resolve(E.runTask(task)), 30);
      }
    });
  },
};

/* ---------- Sound: a short wooden tock, synthesised ---------- */
let audio = null;
function tock(cap) {
  if (!S.settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(cap ? 150 : 210, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.07);
    g.gain.setValueAtTime(cap ? 0.2 : 0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + 0.1);
  } catch { /* no audio available */ }
}

/* ---------- The board: an SVG diagram printed like a chess book ---------- */
const NS = 'http://www.w3.org/2000/svg';
const sv = (t, a, ...k) => {
  const e = document.createElementNS(NS, t);
  if (a) for (const x in a) e.setAttribute(x, a[x]);
  k.forEach((c) => e.append(c));
  return e;
};
const PIECES = JSON.parse($('#piece-data').textContent);

class Board {
  constructor(el) {
    this.orient = 1; this.showCoords = true; this.input = null; this.onSquare = null;
    this.sel = null; this.els = []; this.m = {}; this.arr = []; this.cursor = null; this.promo = null; this.drag = null; this.pos = null;
    this.svg = sv('svg', { viewBox: '-30 -4 834 834', class: 'bd', role: 'application', tabindex: '0', 'aria-label': 'Chess board. Use the arrow keys to move the cursor and Enter to select a square.' });
    const defs = sv('defs');
    const pat = sv('pattern', { id: 'lm-hatch', width: '9', height: '9', patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.append(sv('line', { x1: '0', y1: '0', x2: '0', y2: '9', class: 'hatch-line' }));
    defs.append(pat);
    this.svg.append(defs);
    const gS = sv('g');
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const dark = (r + f) % 2 === 1;
      gS.append(sv('rect', { x: f * 100, y: r * 100, width: 100, height: 100, class: dark ? 'sq-d' : 'sq-l' }));
      if (dark) gS.append(sv('rect', { x: f * 100, y: r * 100, width: 100, height: 100, fill: 'url(#lm-hatch)' }));
    }
    this.gMk = sv('g'); this.gCo = sv('g'); this.gPc = sv('g'); this.gAr = sv('g'); this.gOv = sv('g');
    this.svg.append(gS, this.gMk, sv('rect', { x: 0, y: 0, width: 800, height: 800, class: 'frame' }), this.gCo, this.gPc, this.gAr, this.gOv);
    el.append(this.svg);
    this.drawCoords();
    this.svg.addEventListener('pointerdown', (e) => this.down(e));
    this.svg.addEventListener('pointermove', (e) => this.move(e));
    this.svg.addEventListener('pointerup', (e) => this.up(e));
    this.svg.addEventListener('pointercancel', () => this.cancelDrag());
    this.svg.addEventListener('keydown', (e) => this.key(e));
    this.svg.addEventListener('blur', () => { this.cursor = null; this.renderMarks(); });
  }
  xy(n) {
    const f = n.charCodeAt(0) - 97, r = n.charCodeAt(1) - 49;
    return this.orient > 0 ? [f * 100, (7 - r) * 100] : [(7 - f) * 100, r * 100];
  }
  at(e) {
    const pt = this.svgPoint(e);
    if (pt.x < 0 || pt.y < 0 || pt.x >= 800 || pt.y >= 800) return null;
    const cx = Math.floor(pt.x / 100), cy = Math.floor(pt.y / 100);
    const f = this.orient > 0 ? cx : 7 - cx, r = this.orient > 0 ? 7 - cy : cy;
    return 'abcdefgh'[f] + (r + 1);
  }
  svgPoint(e) {
    const m = this.svg.getScreenCTM();
    const p = this.svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return m ? p.matrixTransform(m.inverse()) : { x: -1, y: -1 };
  }
  drawCoords() {
    this.gCo.replaceChildren();
    if (!this.showCoords) return;
    for (let i = 0; i < 8; i++) {
      const file = 'abcdefgh'[this.orient > 0 ? i : 7 - i];
      const rank = this.orient > 0 ? 8 - i : i + 1;
      const a = sv('text', { x: i * 100 + 50, y: 824, class: 'coord', 'text-anchor': 'middle' }); a.textContent = file;
      const b = sv('text', { x: -15, y: i * 100 + 57, class: 'coord', 'text-anchor': 'middle' }); b.textContent = rank;
      this.gCo.append(a, b);
    }
  }
  setOrient(o) {
    if (o === this.orient) return;
    this.orient = o;
    this.drawCoords();
    for (const p of this.els) this.place(p, p.sq);
    this.renderMarks(); this.renderArrows();
  }
  coords(on) { this.showCoords = on; this.drawCoords(); }
  place(p, sq) {
    p.sq = sq;
    const [x, y] = this.xy(sq);
    p.el.style.transform = `translate(${x}px, ${y}px)`;
  }
  makePiece(k, sq) {
    const d = PIECES[k];
    const el = sv('g', { class: 'pc' });
    el.append(sv('path', { class: 'sil', d: d.sil }), sv('path', { class: 'ink', d: d.ink }));
    const p = { k, sq, el };
    this.place(p, sq);
    this.gPc.append(el);
    return p;
  }
  /* Show a position. Pieces that moved slide to their new squares. */
  set(pos, o) {
    o = o || {};
    this.pos = pos;
    this.clearInput();
    const want = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const v = pos.b[r << 4 | f];
      if (v) want.push({ k: (v > 0 ? 'w' : 'b') + 'PNBRQK'[Math.abs(v) - 1], sq: 'abcdefgh'[f] + (r + 1) });
    }
    const left = [...this.els];
    const keep = [];
    const unplaced = [];
    for (const t of want) {
      const i = left.findIndex((p) => p.k === t.k && p.sq === t.sq);
      if (i >= 0) keep.push(left.splice(i, 1)[0]); else unplaced.push(t);
    }
    const noAnim = o.anim === false;
    for (const t of unplaced) {
      let best = -1, bd = 99;
      left.forEach((p, i) => {
        if (p.k !== t.k) return;
        const d = Math.abs(p.sq.charCodeAt(0) - t.sq.charCodeAt(0)) + Math.abs(p.sq.charCodeAt(1) - t.sq.charCodeAt(1));
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) {
        const p = left.splice(best, 1)[0];
        if (noAnim) { p.el.style.transition = 'none'; this.place(p, t.sq); requestAnimationFrame(() => { p.el.style.transition = ''; }); }
        else this.place(p, t.sq);
        keep.push(p);
      } else keep.push(this.makePiece(t.k, t.sq));
    }
    for (const p of left) p.el.remove();
    this.els = keep;
    // Whatever moved last paints on top, so captures look right mid-slide.
    this.m = { last: o.last || null };
    if (pos.inCheck()) {
      const ks = pos.side > 0 ? pos.k1 : pos.k2;
      if (ks >= 0) this.m.check = E.sqName(ks);
    }
    this.arr = [];
    this.renderMarks(); this.renderArrows();
    this.gOv.replaceChildren();
    this.promo = null;
  }
  /* Set marks: {last, check, good, bad, hl, target} plus any arrows. */
  mark(m, arrows) {
    this.m = { ...this.m, ...m };
    if (arrows) this.arr = arrows;
    this.renderMarks(); this.renderArrows();
  }
  clearMarks() { this.m = {}; this.arr = []; this.renderMarks(); this.renderArrows(); }
  renderMarks() {
    const g = this.gMk;
    g.replaceChildren();
    const rect = (n, cls) => { const [x, y] = this.xy(n); g.append(sv('rect', { x, y, width: 100, height: 100, class: cls })); };
    const m = this.m;
    if (m.last) m.last.forEach((n) => rect(n, 'mk-last'));
    if (m.check) rect(m.check, 'mk-check');
    (m.good || []).forEach((n) => rect(n, 'mk-good'));
    (m.bad || []).forEach((n) => rect(n, 'mk-bad'));
    (m.hl || []).forEach((n) => { const [x, y] = this.xy(n); g.append(sv('rect', { x: x + 5, y: y + 5, width: 90, height: 90, class: 'mk-hl' })); });
    (m.target || []).forEach((n) => { const [x, y] = this.xy(n); g.append(sv('circle', { cx: x + 50, cy: y + 50, r: 30, class: 'mk-target' })); });
    if (this.sel) {
      const [x, y] = this.xy(this.sel);
      g.append(sv('rect', { x: x + 4, y: y + 4, width: 92, height: 92, class: 'mk-sel' }));
      for (const mv of this.legalFrom(this.sel)) {
        const to = E.sqName((mv >> 7) & 127);
        const [tx, ty] = this.xy(to);
        const occupied = this.input.pos.pieceAt(to);
        g.append(occupied ? sv('circle', { cx: tx + 50, cy: ty + 50, r: 44, class: 'mk-cap' }) : sv('circle', { cx: tx + 50, cy: ty + 50, r: 13, class: 'mk-dot' }));
      }
    }
    if (this.cursor) { const [x, y] = this.xy(this.cursor); g.append(sv('rect', { x: x + 2, y: y + 2, width: 96, height: 96, class: 'mk-cursor' })); }
  }
  renderArrows() {
    this.gAr.replaceChildren();
    for (const [a, b, kind] of this.arr) {
      const [ax, ay] = this.xy(a), [bx, by] = this.xy(b);
      const x1 = ax + 50, y1 = ay + 50, x2 = bx + 50, y2 = by + 50;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const sx = x1 + ux * 22, sy = y1 + uy * 22, ex = x2 - ux * 30, ey = y2 - uy * 30;
      const cls = 'arrow-' + (kind || 'pen');
      const g = sv('g', { class: cls, opacity: '0.82' });
      g.append(sv('line', { x1: sx, y1: sy, x2: ex, y2: ey, 'stroke-width': 13, 'stroke-linecap': 'butt' }));
      const px = -uy, py = ux;
      g.append(sv('polygon', { points: `${x2 - ux * 8},${y2 - uy * 8} ${ex + px * 21},${ey + py * 21} ${ex - px * 21},${ey - py * 21}`, stroke: 'none' }));
      this.gAr.append(g);
    }
  }
  /* Let the player move. onMove receives the engine's move int. */
  enable(pos, onMove, color) {
    this.input = { pos, onMove, color: color === undefined ? pos.side : color, legal: pos.legal() };
    this.sel = null;
    this.renderMarks();
  }
  clearInput() {
    this.input = null; this.sel = null; this.onSquare = null; this.cancelDrag();
  }
  legalFrom(sq) {
    if (!this.input) return [];
    const s = E.sqParse(sq);
    return this.input.legal.filter((m) => (m & 127) === s);
  }
  own(sq) {
    if (!this.input) return false;
    const v = this.input.pos.pieceAt(sq);
    return v && (v > 0) === (this.input.color > 0);
  }
  down(e) {
    const sq = this.at(e);
    if (e.button) return;
    if (this.promo) { this.choosePromo(sq); return; }
    if (!sq) return;
    if (this.onSquare) { this.onSquare(sq); return; }
    if (!this.input) return;
    if (this.sel && this.sel !== sq) {
      const legal = this.legalFrom(this.sel).filter((m) => E.sqName((m >> 7) & 127) === sq);
      if (legal.length) { this.finish(legal); return; }
    }
    if (this.own(sq) && this.legalFrom(sq).length) {
      const wasSel = this.sel === sq;
      this.sel = sq;
      this.renderMarks();
      const p = this.els.find((x) => x.sq === sq);
      if (p) {
        this.drag = { p, from: sq, moved: false, wasSel, x: e.clientX, y: e.clientY, id: e.pointerId };
        try { this.svg.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
      }
      e.preventDefault();
    } else { this.sel = null; this.renderMarks(); }
  }
  move(e) {
    if (!this.drag) return;
    const d = this.drag;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    if (!d.moved) { d.moved = true; d.p.el.classList.add('drag'); this.gPc.append(d.p.el); }
    const pt = this.svgPoint(e);
    d.p.el.style.transform = `translate(${pt.x - 50}px, ${pt.y - 62}px)`;
  }
  up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try { this.svg.releasePointerCapture(d.id); } catch { /* already released */ }
    d.p.el.classList.remove('drag');
    if (!d.moved) {
      if (d.wasSel) { this.sel = null; this.renderMarks(); }
      return;
    }
    const sq = this.at(e);
    const legal = sq ? this.legalFrom(d.from).filter((m) => E.sqName((m >> 7) & 127) === sq) : [];
    if (legal.length) {
      // Drop without the slide animation.
      d.p.el.style.transition = 'none';
      this.place(d.p, sq);
      requestAnimationFrame(() => { d.p.el.style.transition = ''; });
      this.finish(legal);
    } else {
      this.place(d.p, d.from);
      this.sel = null;
      this.renderMarks();
    }
  }
  cancelDrag() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    d.p.el.classList.remove('drag');
    this.place(d.p, d.from);
  }
  finish(moves) {
    if (moves.length > 1) { this.showPromo(moves); return; }
    const fn = this.input.onMove;
    this.sel = null;
    this.renderMarks();
    fn(moves[0]);
  }
  showPromo(moves) {
    const to = E.sqName((moves[0] >> 7) & 127);
    const color = this.input.color > 0 ? 'w' : 'b';
    const [x, y] = this.xy(to);
    const down = y === 0;
    const options = [[5, 'Q'], [2, 'N'], [4, 'R'], [3, 'B']];
    this.promo = { moves, map: {} };
    this.gOv.replaceChildren();
    options.forEach(([pr, l], i) => {
      const yy = down ? y + i * 100 : y - i * 100;
      this.gOv.append(sv('rect', { x, y: yy, width: 100, height: 100, class: 'ovl' }));
      const d = PIECES[color + l];
      const g = sv('g', { transform: `translate(${x} ${yy})`, class: 'pc' });
      g.append(sv('path', { class: 'sil', d: d.sil }), sv('path', { class: 'ink', d: d.ink }));
      this.gOv.append(g);
      this.promo.map[`${x / 100},${yy / 100}`] = moves.find((m) => ((m >> 14) & 7) === pr);
    });
  }
  choosePromo(sq) {
    let chosen = null;
    if (sq) { const [x, y] = this.xy(sq); chosen = this.promo.map[`${x / 100},${y / 100}`]; }
    const fn = this.input && this.input.onMove;
    this.promo = null;
    this.gOv.replaceChildren();
    this.sel = null;
    this.renderMarks();
    if (chosen && fn) fn(chosen);
    else if (this.pos) this.set(this.pos, { last: this.m.last });
  }
  key(e) {
    const dirs = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      const c = this.cursor || (this.orient > 0 ? 'e2' : 'e7');
      const f = clamp(c.charCodeAt(0) - 97 + dx * this.orient, 0, 7);
      const r = clamp(c.charCodeAt(1) - 49 + dy * this.orient, 0, 7);
      this.cursor = 'abcdefgh'[f] + (r + 1);
      this.renderMarks();
    } else if ((e.key === 'Enter' || e.key === ' ') && this.cursor) {
      e.preventDefault();
      e.stopPropagation();
      if (this.onSquare) { this.onSquare(this.cursor); return; }
      if (!this.input) return;
      const sq = this.cursor;
      if (this.sel && this.sel !== sq) {
        const legal = this.legalFrom(this.sel).filter((m) => E.sqName((m >> 7) & 127) === sq);
        if (legal.length) { this.finish(legal); return; }
      }
      this.sel = this.own(sq) && this.legalFrom(sq).length ? sq : null;
      this.renderMarks();
    }
  }
}
const lastOf = (m) => [E.sqName(m & 127), E.sqName((m >> 7) & 127)];

/* ---------- Views and the panel ---------- */
const UI = { tok: 0, view: null };
let board;
const later = (ms, fn) => {
  const t = UI.tok;
  setTimeout(() => { if (t === UI.tok) fn(); }, ms);
};
function stageReset() {
  UI.tok++;
  clearInterval(UI.tick);
  $('#stage').hidden = false;
  $('#page').hidden = true;
  board.clearInput();
  board.coords(true);
  say('');
  under([]);
}
function pageReset() {
  UI.tok++;
  clearInterval(UI.tick);
  $('#stage').hidden = true;
  const p = $('#page');
  p.hidden = false;
  p.replaceChildren();
  return p;
}
function say(text) { $('#say').textContent = text; }
function under(buttons) {
  const box = $('#underbtns');
  box.replaceChildren(...buttons.map(([label, fn]) => h('button', { type: 'button', onclick: fn }, label)));
}
function panel(o) {
  const side = $('#side');
  side.replaceChildren(
    h('div', { class: 'formhead' }, h('span', null, o.left || ''), h('span', null, o.right || '')),
    h('div', { class: 'formbody' },
      o.steps ? stepTicks(o.steps[0], o.steps[1]) : null,
      o.title ? h('h2', null, o.title) : null,
      o.body || null),
  );
}
function stepTicks(i, n) {
  const box = h('div', { class: 'steps', 'aria-label': `Step ${i + 1} of ${n}` });
  for (let k = 0; k < n; k++) box.append(h('i', { class: k < i ? 'done' : k === i ? 'at' : '' }));
  return box;
}
const btn = (label, fn, cls) => h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: fn }, label);
const actions = (...b) => h('div', { class: 'actions' }, b);
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- The puzzle player ---------- */
/* o: rated, left, right, title, text, foot, nextLabel, fast, onDone({ok}), srsKey */
function playPuzzle(p, o) {
  stageReset();
  UI.current = p;
  const tok = UI.tok;
  const pos = new Position(p.fen);
  const solver = -pos.side;
  const idx = PZ.byId.get(p.id);
  board.setOrient(solver);
  board.set(pos, { anim: false });
  let step = 1, failed = false, hinted = false, settled = false, delta = null, revealed = false;
  const expected = () => p.moves[step];
  const sideName = colorWord(solver);
  under([['Flip board', () => board.setOrient(-board.orient)]]);

  const header = { left: o.left || 'Tactics', right: o.right || `Puzzle ${p.r}`, steps: o.steps, title: o.title };

  function draw(state, extra) {
    if (tok !== UI.tok) return;
    if (o.quiet) return;
    const body = [];
    if (state === 'wait') body.push(h('p', { class: 'prompt' }, o.text || `Your opponent moves first. Then find the best reply for ${sideName}.`));
    if (state === 'turn') {
      body.push(h('p', { class: 'prompt' }, o.text || `${sideName} to play. Checks, captures and threats: what can you force?`));
      if (extra) body.push(extra);
      body.push(actions(
        !hinted && btn('Hint: which piece', hint, 'lite'),
        btn('Show solution', () => reveal(), 'lite'),
      ));
    }
    if (state === 'wrong') {
      body.push(h('p', { class: 'verdict bad' }, 'Not this one.'));
      if (extra) body.push(h('p', { class: 'why' }, extra));
      body.push(actions(btn('Try again', retry, 'go'), btn('Show solution', () => reveal(), 'lite')));
    }
    if (state === 'done') {
      const solved = !failed;
      body.push(h('p', { class: 'verdict ' + (solved ? 'good' : 'bad') }, solved ? (hinted ? 'Solved, with a hint.' : 'Solved.') : (revealed ? 'Here is the solution.' : 'Solved, after a miss.')));
      if (delta !== null) {
        body.push(h('div', { class: 'stat' }, h('b', null, Math.round(S.tac.r)), h('span', { class: 'd ' + (delta >= 0 ? 'up' : 'down') }, (delta >= 0 ? '+' : '') + delta)));
      }
      const shown = themesOf(p).filter((t) => NAMED(t));
      if (shown.length) {
        body.push(h('div', { class: 'themes' }, shown.slice(0, 3).map((t) => h('span', null, h('b', null, C.THEMES[t][0] + '. '), C.THEMES[t][1]))));
      }
      if (!solved) body.push(h('p', { class: 'note' }, 'This position comes back in your review queue tomorrow.'));
      body.push(actions(btn(o.nextLabel || 'Next puzzle', () => o.onDone({ ok: solved && !hinted, half: solved && hinted }), 'go')));
      body.push(h('a', { class: 'mono', href: 'https://lichess.org/training/' + p.id, target: '_blank', rel: 'noopener' }, 'See this puzzle on Lichess'));
    }
    if (o.foot) body.push(o.foot());
    panel({ ...header, body });
  }

  function settle(score) {
    if (settled) return;
    settled = true;
    if (idx !== undefined) markSeen(idx);
    if (o.rated) delta = glickoUpdate(p.r, score);
    themeRecord(p, score === 1);
    if (score < 1 && o.rated) srsAdd('p:' + p.id);
    save();
  }

  function hint() {
    if (!hinted && !failed) hinted = true;
    board.mark({ hl: [expected().slice(0, 2)] });
    draw('turn');
    turn(true);
  }

  function turn(keepMarks) {
    if (tok !== UI.tok) return;
    board.enable(pos, onMove);
    if (!keepMarks) draw('turn');
    say(`${sideName} to play`);
  }

  function onMove(m) {
    const uci = pos.uci(m);
    pos.make(m);
    const mate = !pos.legal().length && pos.inCheck();
    pos.unmake();
    if (uci === expected() || mate) {
      const cap = !!pos.b[(m >> 7) & 127];
      pos.make(m);
      tock(cap);
      board.set(pos, { last: lastOf(m) });
      board.mark({ good: [uci.slice(2, 4)] });
      step += 1;
      if (step >= p.moves.length || mate) return finish();
      later(o.fast ? 180 : 420, () => {
        const r = pos.parseUci(p.moves[step]);
        pos.make(r);
        tock(false);
        board.set(pos, { last: lastOf(r) });
        step += 1;
        turn();
      });
    } else {
      wrong(m);
    }
  }

  async function wrong(m) {
    if (!failed && !settled) {
      failed = true;
      if (!o.rushMode) settle(hinted ? 0.25 : 0);
    }
    if (o.rushMode) { o.onDone({ ok: false }); return; }
    const preview = new Position(pos.fen());
    const san = preview.san(m);
    preview.make(m);
    say('');
    board.set(preview, { last: lastOf(m) });
    board.mark({ bad: [lastOf(m)[1]] });
    draw('wrong', `You played ${san}.`);
    const st = preview.status();
    if (st.over) { draw('wrong', `${san} ends the game by ${st.reason}, and that gives away the win.`); return; }
    const r = await Engine.run({ fen: preview.fen(), opts: { timeMs: 220, depth: 12 } });
    if (tok !== UI.tok || !r.lines.length) return;
    const l = r.lines[0];
    const you = -l.score;
    let text;
    if (Math.abs(l.score) >= MATE_ZONE) text = l.score > 0 ? `${san} allows ${l.san}, and your opponent has a forced mate.` : `${san} keeps a forced mate, but there is a faster or cleaner one here.`;
    else if (you >= 150) text = `${san} keeps some advantage, but this position has something stronger.`;
    else text = `${san} lets your opponent reply ${l.san}. Find a move that keeps the initiative.`;
    board.mark({}, [[l.uci.slice(0, 2), l.uci.slice(2, 4), 'flag']]);
    draw('wrong', text);
  }

  function retry() {
    board.set(pos, {});
    turn();
  }

  function finish() {
    settle(failed ? 0 : hinted ? 0.5 : 1);
    if (o.rushMode) { o.onDone({ ok: !failed }); return; }
    say('');
    draw('done');
  }

  function reveal() {
    if (!failed && !settled) { failed = true; revealed = true; settle(0); }
    revealed = true;
    board.clearInput();
    board.set(pos, {});
    panel({ ...header, body: [h('p', { class: 'note' }, 'Playing the solution.')] });
    const stepOn = () => {
      if (tok !== UI.tok) return;
      if (step >= p.moves.length) { draw('done'); return; }
      const m = pos.parseUci(p.moves[step]);
      pos.make(m);
      tock(false);
      board.set(pos, { last: lastOf(m) });
      step++;
      setTimeout(stepOn, 850);
    };
    setTimeout(stepOn, 500);
  }

  draw('wait');
  say('');
  later(o.fast ? 240 : 650, () => {
    const m = pos.parseUci(p.moves[0]);
    pos.make(m);
    tock(false);
    board.set(pos, { last: lastOf(m) });
    turn();
  });
}

/* A short run of puzzles, used by lessons and by today's round. */
function runPuzzleSet(o) {
  let i = 0, ok = 0;
  const nextP = () => {
    if (i >= o.n) return o.onDone(ok / o.n, ok);
    const p = pickPuzzle(nextTarget(), { themes: o.themes });
    playPuzzle(p, {
      rated: o.rated !== false,
      left: o.left || 'Tactics',
      right: `Puzzle ${i + 1} of ${o.n}`,
      steps: o.steps,
      title: o.title,
      text: o.text ? `${o.text} ${colorWord(-new Position(p.fen).side)} to play.` : null,
      nextLabel: i + 1 < o.n ? 'Next puzzle' : 'Finish',
      onDone: (r) => { ok += r.ok ? 1 : r.half ? 0.5 : 0; i++; nextP(); },
    });
  };
  nextP();
}

/* ---------- The lesson player ---------- */
function parseLine(str) {
  const out = [];
  const re = /\{([^}]*)\}|(\S+)/g;
  let m;
  while ((m = re.exec(str))) {
    if (m[1] !== undefined) { if (out.length) out[out.length - 1].note = m[1]; }
    else out.push({ san: m[2] });
  }
  return out;
}

const STEPS = {
  show(s, ctx, done) {
    const pos = new Position(s.fen);
    board.setOrient(s.orient || 1);
    board.set(pos, { anim: false });
    board.mark({ hl: s.marks || [] }, (s.arrows || []).map(([a, b]) => [a, b, 'pen']));
    ctx.panel([h('p', { class: 'prompt' }, s.text), actions(btn('Continue', () => done(null), 'go'))]);
  },

  find(s, ctx, done) {
    const pos = new Position(s.fen);
    const norm = s.ok.map(stripSuffix);
    let misses = 0;
    board.setOrient(pos.side);
    board.set(pos, { anim: false });
    const draw = (extra) => ctx.panel([h('p', { class: 'prompt' }, s.text), extra || null,
      actions(misses >= 1 && btn('Show me', showIt, 'lite'))]);
    const showIt = () => {
      const m = pos.parseSan(s.ok[0]);
      board.mark({}, [[...lastOf(m), 'pen']]);
      misses = Math.max(misses, 2);
    };
    const onMove = (m) => {
      const san = pos.san(m);
      if (norm.includes(stripSuffix(san))) {
        pos.make(m);
        tock();
        board.set(pos, { last: lastOf(m) });
        board.mark({ good: [lastOf(m)[1]] });
        say('');
        ctx.panel([
          h('p', { class: 'verdict good' }, misses ? 'That’s it.' : 'Correct.'),
          h('p', { class: 'why' }, s.why),
          actions(btn('Continue', () => done(misses === 0 ? 1 : misses === 1 ? 0.5 : 0), 'go')),
        ]);
      } else {
        misses++;
        const why = (s.bad && s.bad[stripSuffix(san)]) || 'That move is legal, but it misses the point here. Try again.';
        board.set(pos, {});
        board.mark({ bad: [lastOf(m)[1]] });
        board.enable(pos, onMove);
        draw(h('p', { class: 'verdict bad' }, san + ': ', h('span', { class: 'note' }, why)));
      }
    };
    board.enable(pos, onMove);
    say(`${colorWord(pos.side)} to play`);
    draw();
  },

  pick(s, ctx, done) {
    const pos = new Position(s.fen);
    board.setOrient(pos.side);
    board.set(pos, { anim: false });
    let misses = 0;
    const list = h('div', { class: 'opts' });
    const feedback = h('div');
    s.options.forEach((o) => {
      const b = h('button', { type: 'button', class: 'opt', onclick: () => {
        if (o.ok) {
          b.classList.add('right');
          list.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          feedback.replaceChildren(h('p', { class: 'why' }, o.why), actions(btn('Continue', () => done(misses === 0 ? 1 : 0.4), 'go')));
        } else {
          misses++;
          b.classList.add('wrong');
          b.disabled = true;
          feedback.replaceChildren(h('p', { class: 'why' }, o.why));
        }
      } }, o.x);
      list.append(b);
    });
    ctx.panel([h('p', { class: 'prompt' }, s.text), list, feedback]);
  },

  squares(s, ctx, done) {
    const pos = new Position(s.fen);
    board.setOrient(s.orient || 1);
    board.set(pos, { anim: false });
    let misses = 0;
    const hit = new Set();
    const need = s.any ? 1 : s.ans.length;
    const feedback = h('div');
    board.onSquare = (sq) => {
      if (s.ans.includes(sq)) {
        hit.add(sq);
        board.mark({ good: [...hit], bad: [] });
        if (hit.size >= need) {
          board.onSquare = null;
          feedback.replaceChildren(h('p', { class: 'why' }, s.why), actions(btn('Continue', () => done(misses === 0 ? 1 : 0.5), 'go')));
        }
      } else {
        misses++;
        board.mark({ bad: [sq] });
        feedback.replaceChildren(h('p', { class: 'verdict bad' }, `Not ${sq}. Try again.`));
      }
    };
    ctx.panel([h('p', { class: 'prompt' }, s.text), feedback]);
  },

  walk(s, ctx, done) {
    let pos = new Position(s.fen);
    const me = pos.side;
    let count = 0;
    board.setOrient(me);
    board.set(pos, { anim: false });
    const targets = () => {
      const out = [];
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const v = pos.b[r << 4 | f];
        if (v && (v > 0) !== (me > 0)) out.push('abcdefgh'[f] + (r + 1));
      }
      return out;
    };
    const draw = () => ctx.panel([h('p', { class: 'prompt' }, s.text), h('p', { class: 'mono' }, `Moves: ${count}. Pawns left: ${targets().length}.`)]);
    const onMove = (m) => {
      const cap = !!pos.b[(m >> 7) & 127];
      pos.make(m);
      tock(cap);
      count++;
      // Hand the move straight back: the targets never reply.
      const parts = pos.fen().split(' ');
      parts[1] = me > 0 ? 'w' : 'b'; parts[3] = '-';
      const moved = lastOf(m);
      pos = new Position(parts.join(' '));
      board.set(pos, { last: moved });
      draw();
      if (!targets().length) {
        ctx.panel([h('p', { class: 'verdict good' }, `All taken in ${count} moves.`), actions(btn('Continue', () => done(null), 'go'))]);
        return;
      }
      board.enable(pos, onMove);
    };
    board.enable(pos, onMove);
    draw();
  },

  demo(s, ctx, done) {
    const moves = parseLine(s.moves);
    const pos = new Position(s.fen);
    let i = 0;
    board.setOrient(s.orient || (s.fen.includes(' b ') ? -1 : 1));
    board.set(pos, { anim: false });
    const draw = (note) => {
      const list = [h('p', { class: 'prompt' }, s.text)];
      if (note) list.push(h('p', { class: 'penned' }, note));
      list.push(actions(
        i < moves.length && btn(i ? `Next: ${moves[i].san}` : `Start: ${moves[0].san}`, step, 'go'),
        i >= moves.length && btn('Continue', () => done(null), 'go'),
        i > 0 && i < moves.length && btn('Skip to the end', skip, 'lite'),
      ));
      ctx.panel(list);
    };
    const play = () => {
      const m = pos.parseSan(moves[i].san);
      pos.make(m);
      board.set(pos, { last: lastOf(m) });
      i++;
      return m;
    };
    const step = () => { play(); tock(); draw(moves[i - 1].note); };
    const skip = () => { let n = ''; while (i < moves.length) { play(); n = moves[i - 1].note || n; } draw(n); };
    draw();
  },

  line(s, ctx, done) {
    const moves = parseLine(s.moves);
    const me = s.as === 'w' ? 1 : -1;
    const pos = new Position(s.fen || C.START);
    let i = 0, misses = 0, wrongHere = 0, total = 0;
    board.setOrient(me);
    board.set(pos, { anim: false });
    let note = '';
    const draw = (extra) => {
      const list = [h('p', { class: 'prompt' }, s.text)];
      if (note) list.push(h('p', { class: 'penned' }, note));
      if (extra) list.push(extra);
      if (i < moves.length && pos.side === me) list.push(actions(btn('Show the move', reveal, 'lite')));
      ctx.panel(list);
    };
    const reveal = () => {
      const m = pos.parseSan(moves[i].san);
      misses++;
      wrongHere = 2;
      board.mark({}, [[...lastOf(m), 'pen']]);
    };
    const advance = () => {
      if (i >= moves.length) {
        say('');
        const score = total ? clamp(1 - misses / total, 0, 1) : 1;
        const list = [h('p', { class: 'verdict good' }, misses ? `Line finished, with ${misses} slip${misses > 1 ? 's' : ''}.` : 'Line finished without a slip.')];
        if (note) list.push(h('p', { class: 'penned' }, note));
        list.push(actions(btn('Continue', () => done(score), 'go')));
        ctx.panel(list);
        return;
      }
      if (pos.side === me) {
        total++;
        wrongHere = 0;
        board.enable(pos, onMine);
        say('Your move');
        draw();
      } else {
        draw();
        later(480, () => {
          const m = pos.parseSan(moves[i].san);
          pos.make(m);
          tock();
          board.set(pos, { last: lastOf(m) });
          if (moves[i].note) note = moves[i].note;
          i++;
          advance();
        });
      }
    };
    const onMine = (m) => {
      const want = pos.parseSan(moves[i].san);
      if (m === want) {
        pos.make(m);
        tock();
        board.set(pos, { last: lastOf(m) });
        note = moves[i].note || '';
        i++;
        advance();
      } else {
        wrongHere++;
        if (wrongHere === 1) misses++;
        board.set(pos, { last: board.m.last });
        board.mark({ bad: [lastOf(m)[1]] });
        board.enable(pos, onMine);
        draw(h('p', { class: 'verdict bad' }, 'That is not the repertoire move. Try again.'));
      }
    };
    advance();
  },

  trial(s, ctx, done) {
    runTrial(s, ctx, done);
  },

  drill(s, ctx, done) {
    runPuzzleSet({
      n: s.n, themes: s.themes, rated: true, left: ctx.left, title: ctx.title, steps: ctx.steps, text: s.text,
      onDone: (score) => done(score),
    });
  },
};

const GOAL_TEXT = { mate: 'Moves to deliver mate', promote: 'Moves to promote', hold: 'Moves to hold', bare: 'Moves to win the pawn' };

function runTrial(s, ctx, done) {
  stageReset();
  let attempts = 0;
  function start() {
    stageReset();
    attempts++;
    const tok = UI.tok;
    const pos = new Position(s.fen);
    const me = pos.side;
    const moves = [];
    let count = 0, over = false;
    board.setOrient(me);
    board.set(pos, { anim: false });

    const countMaterial = (side) => {
      let n = 0;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const v = pos.b[r << 4 | f];
        if (v && (v > 0) === (side > 0) && Math.abs(v) !== 6) n++;
      }
      return n;
    };
    const hasQueen = (side) => {
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (pos.b[r << 4 | f] === side * 5) return true;
      return false;
    };
    const draw = (msg) => {
      if (tok !== UI.tok) return;
      ctx.panel([
        h('p', { class: 'prompt' }, s.text),
        h('p', { class: 'mono' }, `${GOAL_TEXT[s.goal]}: ${count} of ${s.par}`),
        msg ? h('p', { class: 'note' }, msg) : null,
        actions(btn('Start over', start, 'lite')),
      ]);
    };
    const pass = (msg) => {
      over = true;
      board.clearInput();
      say('');
      ctx.panel([
        h('p', { class: 'verdict good' }, msg),
        h('p', { class: 'why' }, s.why),
        actions(btn('Continue', () => done(attempts === 1 ? 1 : 0.7), 'go')),
      ]);
    };
    const fail = (msg) => {
      over = true;
      board.clearInput();
      say('');
      ctx.panel([
        h('p', { class: 'verdict bad' }, msg),
        h('p', { class: 'prompt' }, s.text),
        actions(btn('Try again', start, 'go'), btn('Skip for now', () => done(0), 'lite')),
      ]);
    };
    const judgeAfterMine = (m) => {
      const st = pos.status();
      const promo = (m >> 14) & 7;
      const to = (m >> 7) & 127;
      if (s.goal === 'hold') {
        if (st.over) {
          if (st.reason === 'checkmate') return fail('You checkmated your opponent, which is more than holding. Well played.');
          return pass(`Draw by ${st.reason}. You held it.`);
        }
        if (count >= s.par) return pass(`You held for ${s.par} moves.`);
        return null;
      }
      if (st.reason === 'checkmate') return pass(`Checkmate in ${count} moves.`);
      if (st.over) return fail(`Draw by ${st.reason}. That threw away the win.`);
      if (s.goal === 'promote' && promo) {
        const safe = !pos.attacked(to, -me) || pos.attacked(to, me);
        if (safe) return pass(`Promoted in ${count} moves.`);
      }
      if (s.goal === 'bare' && countMaterial(-me) === 0 && hasQueen(me)) return pass(`Pawn won in ${count} moves. Your queen will mate from here.`);
      if (count >= s.par) return fail(`You used all ${s.par} moves. Try a more direct route.`);
      return null;
    };
    const judgeAfterTheirs = (m) => {
      const st = pos.status();
      if (st.over) {
        if (st.reason === 'checkmate') return fail('You got checkmated.');
        if (s.goal === 'hold') return pass(`Draw by ${st.reason}. You held it.`);
        return fail(`Draw by ${st.reason}. That threw away the win.`);
      }
      const promo = (m >> 14) & 7;
      if (promo) {
        const to = (m >> 7) & 127;
        const canTake = pos.legal().some((x) => ((x >> 7) & 127) === to);
        if (!canTake && !hasQueen(me)) return fail('Your opponent made a new queen. The ending is lost.');
      }
      if (s.goal === 'hold' && countMaterial(me) === 0 && countMaterial(-me) > 0) return fail('You ran out of material, so the draw is gone.');
      if (s.goal !== 'hold' && countMaterial(me) === 0) return fail('You have nothing left to win with.');
      return null;
    };
    const mine = (m) => {
      if (over) return;
      const uci = pos.uci(m);
      const cap = !!pos.b[(m >> 7) & 127];
      pos.make(m);
      moves.push(uci);
      count++;
      tock(cap);
      board.set(pos, { last: lastOf(m) });
      if (judgeAfterMine(m) || over) return;
      draw();
      say('Your opponent is thinking');
      Engine.run({ fen: s.fen, moves: [...moves], opts: { timeMs: 260, depth: 26 } }).then((r) => {
        if (tok !== UI.tok || over || !r.lines.length) return;
        const reply = pos.parseUci(r.lines[0].uci);
        const c2 = !!pos.b[(reply >> 7) & 127];
        pos.make(reply);
        moves.push(r.lines[0].uci);
        tock(c2);
        board.set(pos, { last: lastOf(reply) });
        if (judgeAfterTheirs(reply) || over) return;
        board.enable(pos, mine);
        say(`${colorWord(me)} to play`);
      });
    };
    board.enable(pos, mine);
    say(`${colorWord(me)} to play`);
    draw();
  }
  start();
}

function runLesson(lesson, onDone) {
  const cls = C.CLASSES[lesson.cls];
  const left = `${C.TRACKS[lesson.track].name} · ${cls.name}`;
  let i = 0, sum = 0, max = 0;
  const finish = () => {
    stageReset();
    const pct = max ? sum / max : 1;
    const pass = pct >= 0.7;
    const prev = S.lessons[lesson.id] || { best: 0, tries: 0 };
    S.lessons[lesson.id] = { best: Math.max(prev.best, pct), tries: prev.tries + 1, pass: prev.pass || pass, at: today() };
    save();
    const shown = Math.round(pct * 100);
    panel({
      left, right: max ? `${shown}%` : 'Done', title: lesson.title,
      body: [
        h('p', { class: 'verdict ' + (pass ? 'good' : 'bad') }, pass ? (max ? `Passed with ${shown}%.` : 'Lesson finished.') : `${shown}%. You need 70% to pass.`),
        !pass && h('p', { class: 'note' }, 'Read the explanations again, then retake it. Anything you missed also comes back in your review queue.'),
        actions(
          btn(pass ? 'Continue' : 'Retake lesson', () => { if (pass) onDone(pct); else runLesson(lesson, onDone); }, 'go'),
          !pass && btn('Leave for now', () => onDone(pct), 'lite'),
        ),
      ],
    });
    checkPromotion();
  };
  const next = () => {
    if (i >= lesson.steps.length) return finish();
    stageReset();
    const s = lesson.steps[i];
    const ctx = {
      left,
      title: lesson.title,
      steps: [i, lesson.steps.length],
      panel: (body) => panel({ left, right: `Step ${i + 1} of ${lesson.steps.length}`, steps: [i, lesson.steps.length], title: lesson.title, body }),
    };
    STEPS[s.t](s, ctx, (score) => {
      if (score !== null && score !== undefined) {
        sum += score; max += 1;
        if (score < 1 && (s.t === 'find' || s.t === 'line')) srsAdd(`l:${lesson.id}:${i}`);
      }
      i++;
      next();
    });
  };
  next();
}
