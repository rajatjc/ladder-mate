// Engine checks: perft against published node counts, notation round trips, and tactical sanity.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/engine.js');
const { Position, search, perft, pgnMoves, MATE } = E;

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

// Published perft results (chessprogramming.org/Perft_Results).
const PERFT = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];
for (const [fen, want] of PERFT) {
  const p = new Position(fen);
  want.forEach((n, i) => {
    const got = perft(p, i + 1);
    check(`perft ${i + 1} ${fen.slice(0, 24)}…`, got === n, got === n ? '' : `got ${got}, want ${n}`);
  });
  check('fen survives perft', p.fen() === new Position(fen).fen());
}

// Notation.
{
  const p = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const round = p.legal().every((m) => p.parseSan(p.san(m)) === m);
  check('SAN round trip on Kiwipete', round);
  const q = new Position('7k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  check('castling SAN', q.san(q.parseSan('O-O')).startsWith('O-O'));
  const d = new Position('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  check('rook disambiguation', d.san(d.parseUci('a1d1')) === 'Rad1', d.san(d.parseUci('a1d1')));
  const pr = new Position('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  check('promotion SAN', pr.san(pr.parseUci('a7a8q')) === 'a8=Q');
  const ep = new Position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  check('en passant SAN', ep.san(ep.parseUci('e5d6')) === 'exd6');
  const mate = new Position('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  check('mate suffix', mate.san(mate.parseUci('a1a8')) === 'Ra8#');
}

// Game status.
{
  check('stalemate', new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason === 'stalemate');
  check('checkmate', new Position('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1').status().reason === 'checkmate');
  check('K+B insufficient', new Position('7k/8/8/8/8/8/8/5B1K w - - 0 1').status().reason === 'insufficient material');
  check('K+R not insufficient', !new Position('7k/8/8/8/8/8/8/5R1K w - - 0 1').status().over);
  const p = new Position('7k/8/8/8/8/8/8/R6K w - - 0 1');
  for (const s of ['Rb1', 'Kg7', 'Ra1', 'Kh8', 'Rb1', 'Kg7', 'Ra1', 'Kh8']) p.make(p.parseSan(s));
  check('threefold repetition', p.status().reason === 'threefold repetition', p.status().reason);
  const bare = new Position('8/8/8/8/8/8/R7/8 w - - 0 1');
  check('kingless teaching boards generate moves', bare.legal().length === 14);
}

// PGN parsing.
{
  const m = pgnMoves('[Event "x"]\n1. e4 {best} e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 3... a6 1-0');
  check('pgn strip', m.join(' ') === 'e4 e5 Nf3 Nc6 a6', m.join(' '));
}

// Tactics the search must find.
const TACTICS = [
  ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd8#', 'back rank mate in 1'],
  ['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'Qxf7#', 'scholar mate'],
  ['r1b1k2r/ppppqppp/2n5/8/1b1Pn3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 8', null, 'search returns a move'],
  ['2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', 'Qg6', 'WAC.001'],
  ['8/7p/5k2/5p2/p1p2P2/Pr1pPK2/1P1R3P/8 b - - 0 1', 'Rxb2', 'WAC.002'],
  ['5rk1/1ppb3p/p1pb4/6q1/3P1p1r/2P1R2P/PP1BQ1P1/5RKN w - - 0 1', 'Rg3', 'WAC.003'],
  ['r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1', 'Qxh7+', 'WAC.004'],
  ['5k2/6pp/p1qN4/1p1p4/3P4/2PKP2Q/PP3r2/3R4 b - - 0 1', 'Qc4+', 'WAC.005'],
  ['7k/p7/1R5K/6r1/6p1/6P1/8/8 w - - 0 1', 'Rb7', 'WAC.006'],
  ['rnbqkb1r/pppp1ppp/8/4P3/6n1/7P/PPPNPPP1/R1BQKBNR b KQkq - 0 1', 'Ne3', 'WAC.007'],
];
for (const [fen, want, label] of TACTICS) {
  const p = new Position(fen);
  const r = search(p, { timeMs: 3000 });
  const san = p.san(r.lines[0].move);
  check(`tactic ${label}`, !want || san.replace(/[+#]/g, '') === want.replace(/[+#]/g, ''), `${san} d${r.depth} ${r.nodes} nodes`);
}

// Mate reporting and multi-line output.
{
  const p = new Position('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  const r = search(p, { timeMs: 500 });
  check('mate score', r.lines[0].score === MATE - 1, String(r.lines[0].score));
  const m = search(new Position(), { depth: 6, timeMs: 3000, multipv: 3 });
  check('multipv returns three distinct lines', m.lines.length === 3 && new Set(m.lines.map((l) => l.move)).size === 3);
  const speed = search(new Position('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), { timeMs: 2000 });
  console.log(`info speed ${Math.round(speed.nodes / speed.ms)} knps, depth ${speed.depth} in ${speed.ms} ms`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
