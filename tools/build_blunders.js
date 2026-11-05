// Build the Blunder Check drill data with our own engine.
// Usage: node build_blunders.js <puzzles.txt> <out.txt> [count]
//
// Each Lichess puzzle starts with a real blunder, the move that allowed the tactic.
// For a sample of those, find a quiet, sound move from the same position, so the drill
// can ask "safe or blunder?" about moves that look equally ordinary. Only positions where
// the engine agrees on both verdicts survive. Line format: id|safeUci|lossCp
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { Position, search, MATE } = require('../src/engine.js');

function judge(line) {
  const [id, fen, moves] = line.split('|');
  const blunderUci = moves.split(' ')[0];
  const pos = new Position(fen);
  const blunder = pos.parseUci(blunderUci);
  if (!blunder) return null;
  // Skip captures and checks: "is this capture safe" is a different question, and the
  // drill should not be solvable by noticing only the forcing moves.
  if (pos.b[(blunder >> 7) & 127]) return null;
  const res = search(pos, { depth: 10, timeMs: 700, multipv: 6 });
  if (!res.lines.length || res.depth < 7) return null;
  const best = res.lines[0].score;
  if (Math.abs(best) > 250) return null; // lopsided positions make every move look safe
  const after = search(pos, { depth: 10, timeMs: 500, only: [blunder] });
  const blunderScore = after.lines[0].score;
  const loss = best - blunderScore;
  if (loss < 180 && blunderScore > -MATE + 200) return null;
  for (const l of res.lines) {
    if (l.move === blunder) continue;
    const to = (l.move >> 7) & 127;
    if (pos.b[to]) continue;
    pos.make(l.move);
    const check = pos.inCheck();
    pos.unmake();
    if (check) continue;
    if (best - l.score > 35) continue;
    return `${id}|${pos.uci(l.move)}|${Math.min(loss, 999)}`;
  }
  return null;
}

if (isMainThread) {
  const [src, out, count = '1400'] = process.argv.slice(2);
  const lines = fs.readFileSync(src, 'utf8').trim().split('\n');
  // Spread the sample evenly over the rating range.
  const want = +count * 3; // roughly a third of candidates survive the filters
  const step = Math.max(1, Math.floor(lines.length / want));
  const sample = lines.filter((_, i) => i % step === 0);
  const THREADS = 10;
  let done = 0;
  const results = [];
  for (let t = 0; t < THREADS; t++) {
    const w = new Worker(__filename, { workerData: sample.filter((_, i) => i % THREADS === t) });
    w.on('message', (m) => results.push(...m));
    w.on('exit', () => {
      if (++done === THREADS) {
        fs.writeFileSync(out, results.join('\n') + '\n');
        console.log(`checked ${sample.length}, kept ${results.length}`);
      }
    });
  }
} else {
  const kept = [];
  for (const line of workerData) {
    const r = judge(line);
    if (r) kept.push(r);
  }
  parentPort.postMessage(kept);
}
