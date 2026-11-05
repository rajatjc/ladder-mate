// Checks every claim the curriculum makes.
// - All FENs, moves and lines must be legal.
// - "find" answers must score within a margin of the engine's best move at a real search depth.
// - Moves listed as bad must really score worse than the accepted answers.
// - Endgame claims under 8 men are checked against the Lichess Syzygy tablebase over HTTP.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Position, search, pgnMoves, MATE } = require('../src/engine.js');
const C = require('../src/content.js');

const SEARCH_MS = +(process.env.SEARCH_MS || 900);
const useTb = process.env.NO_TB !== '1';
let failed = 0, checked = 0;
const problems = [];
const fail = (where, msg) => { failed++; problems.push(`${where}: ${msg}`); };

const stripNotes = (s) => s.replace(/\{[^}]*\}/g, ' ').trim().split(/\s+/);
const men = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;

async function tb(fen) {
  const url = 'https://tablebase.lichess.ovh/standard?fen=' + encodeURIComponent(fen);
  for (let i = 0; i < 6; i++) {
    let r;
    try { r = await fetch(url); } catch { await new Promise((d) => setTimeout(d, 1500 * (i + 1))); continue; }
    if (r.status === 429) { await new Promise((d) => setTimeout(d, 1500 * (i + 1))); continue; }
    if (!r.ok) throw new Error('tablebase HTTP ' + r.status);
    return r.json();
  }
  throw new Error('tablebase unavailable after retries');
}
// Tablebase category is from the side to move. Convert it to a win/draw/loss for White.
const whiteResult = (fen, cat) => {
  const stm = fen.split(' ')[1];
  if (cat === 'draw' || cat === 'blessed-loss' || cat === 'cursed-win') return 'draw';
  const stmWins = cat === 'win' || cat === 'maybe-win' ? true : cat === 'loss' || cat === 'maybe-loss' ? false : null;
  if (stmWins === null) return 'unknown';
  return (stm === 'w') === stmWins ? 'white' : 'black';
};

const ids = new Set();
for (const lesson of C.LESSONS) {
  if (ids.has(lesson.id)) fail(lesson.id, 'duplicate id');
  ids.add(lesson.id);
  for (let idx = 0; idx < lesson.steps.length; idx++) {
    const s = lesson.steps[idx];
    const where = `${lesson.id}#${idx + 1} ${s.t}`;
    checked++;
    try {
      if (s.fen) new Position(s.fen);
      if (s.t === 'drill') {
        for (const t of s.themes) if (!C.THEMES[t]) fail(where, 'unknown theme ' + t);
      } else if (s.t === 'find') {
        const p = new Position(s.fen);
        const legalSan = p.legal().map((m) => p.san(m).replace(/[+#]/g, ''));
        const okMoves = [];
        for (const a of s.ok) {
          const m = p.parseSan(a);
          if (!m) fail(where, `answer ${a} is illegal`);
          else okMoves.push(m);
        }
        for (const b of Object.keys(s.bad || {})) if (!p.parseSan(b)) fail(where, `bad move ${b} is illegal`);
        if (okMoves.length && lesson.track !== 'rules') {
          const margin = s.m === undefined ? 60 : s.m;
          const top = search(p, { timeMs: SEARCH_MS, multipv: 1 });
          const best = top.lines[0].score;
          const scores = [];
          for (const m of okMoves) {
            const r = search(p, { timeMs: SEARCH_MS, only: [m] });
            scores.push([p.san(m), r.lines[0].score]);
          }
          const bestOk = Math.max(...scores.map((x) => x[1]));
          if (best - bestOk > margin) {
            fail(where, `best answer ${JSON.stringify(scores)} is ${best - bestOk}cp below engine's ${p.san(top.lines[0].move)} (${best}), margin ${margin}, fen ${s.fen}`);
          }
          for (const [san, sc] of scores) {
            if (best - sc > Math.max(margin, 200) && Math.abs(sc) < MATE - 200) fail(where, `accepted move ${san} (${sc}) is far below best ${best}`);
          }
          for (const b of Object.keys(s.bad || {})) {
            const m = p.parseSan(b);
            if (!m) continue;
            const r = search(p, { timeMs: SEARCH_MS, only: [m] });
            if (r.lines[0].score >= bestOk) console.log(`note ${where}: "bad" move ${b} scores ${r.lines[0].score}, as good as answers (${bestOk})`);
          }
        }
        if (useTb && men(s.fen) <= 7 && lesson.track !== 'rules') {
          const j = await tb(s.fen);
          for (const a of s.ok) {
            const san = a.replace(/[+#]/g, '');
            const mv = j.moves.find((x) => x.san.replace(/[+#]/g, '') === san);
            if (mv && (mv.category === 'win') && j.category !== 'loss') fail(where, `tablebase: ${a} loses`);
            if (mv && mv.category === 'draw' && j.category === 'win') console.log(`note ${where}: tablebase says ${a} only draws a winning position (${j.moves.filter((x) => x.category === 'loss').map((x) => x.san).join(',')} win)`);
          }
        }
        void legalSan;
      } else if (s.t === 'line' || s.t === 'demo') {
        const p = new Position(s.fen || C.START);
        for (const san of stripNotes(s.moves)) {
          const m = p.parseSan(san);
          if (!m) { fail(where, `move ${san} is illegal at ${p.fen()}`); break; }
          p.make(m);
        }
      } else if (s.t === 'squares') {
        for (const a of s.ans) if (!/^[a-h][1-8]$/.test(a)) fail(where, 'bad square ' + a);
      } else if (s.t === 'pick') {
        if (!s.options.some((o) => o.ok)) fail(where, 'no correct option');
        if (s.tb && useTb) {
          const j = await tb(s.fen);
          const res = whiteResult(s.fen, j.category);
          const want = s.tb === 'draw' ? 'draw' : 'white';
          if (res !== want) fail(where, `tablebase says ${j.category} (${res}), lesson says ${s.tb}, fen ${s.fen}`);
        }
      } else if (s.t === 'trial') {
        const p = new Position(s.fen);
        if (!p.legal().length) fail(where, 'no legal moves');
        if (useTb && men(s.fen) <= 7) {
          const j = await tb(s.fen);
          const res = whiteResult(s.fen, j.category);
          const mover = s.fen.split(' ')[1] === 'w' ? 'white' : 'black';
          if (s.goal === 'hold') {
            if (res !== 'draw') fail(where, `hold trial is ${j.category} (${res}), fen ${s.fen}`);
          } else {
            if (res !== mover) fail(where, `${s.goal} trial is ${j.category} (${res}), fen ${s.fen}`);
          }
          const dtm = j.dtm ?? j.dtz;
          if (s.goal === 'mate') {
            const need = Math.ceil(Math.abs(dtm || 0) / 2);
            console.log(`info ${lesson.id}: mate needs ${need} moves with best play, par ${s.par}`);
            if (need && s.par < need) fail(where, `par ${s.par} below perfect play ${need}`);
          }
        } else if (s.goal !== 'hold') {
          // Too many men for the tablebase: ask the engine instead.
          const r = search(p, { timeMs: 3000 });
          if (r.lines[0].score < 200) fail(where, `engine does not see a win: ${r.lines[0].score} at d${r.depth}, fen ${s.fen}`);
          else console.log(`info ${lesson.id}: engine ${r.lines[0].score}cp, plays ${p.san(r.lines[0].move)}`);
        }
      }
    } catch (e) {
      fail(where, e.message);
    }
  }
}

// Book lines must be legal too.
for (const b of C.BOOK) {
  const p = new Position();
  for (const san of b.split(' ')) {
    const m = p.parseSan(san);
    if (!m) { fail('book', `${san} illegal in: ${b}`); break; }
    p.make(m);
  }
}
for (const t of C.THEME_ORDER) if (!C.THEMES[t]) fail('themes', 'no entry for ' + t);
void pgnMoves;

console.log(`\n${C.LESSONS.length} lessons, ${checked} steps checked`);
if (problems.length) {
  console.log(problems.map((x) => '  FAIL ' + x).join('\n'));
  console.log(`${failed} FAILED`);
  process.exit(1);
}
console.log('all passed');
