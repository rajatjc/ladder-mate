// Measure each sparring bot on a human scale: run it through human-rated Lichess puzzles
// and fit the rating at which its success rate is explained by the Elo curve.
// This measures tactical skill only, which is one part of playing strength.
// Usage: node calibrate_bots.js <puzzles.txt> [puzzlesPerBot]
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { Position, pickMove } = require('../src/engine.js');
const { BOTS } = require('../src/content.js');

function solve(line, cfg) {
  const [, fen, moves] = line.split('|');
  const list = moves.split(' ');
  const p = new Position(fen);
  p.make(p.parseUci(list[0]));
  for (let i = 1; i < list.length; i += 2) {
    const r = pickMove(p, cfg);
    if (!r.move) return false;
    const uci = p.uci(r.move);
    if (uci !== list[i]) {
      // Any other mate also solves a puzzle.
      p.make(r.move);
      const mate = !p.legal().length && p.inCheck();
      p.unmake();
      return mate;
    }
    p.make(r.move);
    if (i + 1 < list.length) p.make(p.parseUci(list[i + 1]));
  }
  return true;
}

function fit(results) {
  let best = 0, bestLL = -Infinity;
  for (let r = 200; r <= 3200; r += 10) {
    let ll = 0;
    for (const [pr, ok] of results) {
      const e = 1 / (1 + Math.pow(10, (pr - r) / 400));
      ll += Math.log(ok ? e : 1 - e);
    }
    if (ll > bestLL) { bestLL = ll; best = r; }
  }
  return best;
}

if (isMainThread) {
  const [src, n = '320'] = process.argv.slice(2);
  const lines = fs.readFileSync(src, 'utf8').trim().split('\n');
  const step = Math.floor(lines.length / +n);
  const sample = lines.filter((_, i) => i % step === 3);
  let open = BOTS.length;
  const out = [];
  for (const bot of BOTS) {
    const w = new Worker(__filename, { workerData: { bot, sample } });
    w.on('message', (m) => out.push(m));
    w.on('exit', () => {
      if (--open) return;
      out.sort((a, b) => a.nominal - b.nominal);
      for (const m of out) console.log(`${m.name.padEnd(18)} nominal ${m.nominal}  puzzle-fit ${m.fit}  solved ${m.solved}/${m.total}`);
      fs.writeFileSync(__dirname + '/../data/calibration.json', JSON.stringify(out, null, 1));
    });
  }
} else {
  const { bot, sample } = workerData;
  const results = [];
  for (const line of sample) {
    const rating = +line.split('|')[3];
    results.push([rating, solve(line, bot.cfg)]);
  }
  parentPort.postMessage({ id: bot.id, name: bot.name, nominal: bot.rating, fit: fit(results), solved: results.filter((x) => x[1]).length, total: results.length });
}
