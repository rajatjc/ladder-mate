/* Ladder Mate: drills, sparring, game review, today's round and the full pages. */

/* ---------- Vision drills ---------- */
function visRecord(id, score) {
  const r = S.vis[id] || (S.vis[id] = { best: 0, plays: 0 });
  r.plays++;
  const isBest = score > r.best;
  if (isBest) r.best = score;
  save();
  return isBest;
}
function drillEnd(id, title, line, score, frac, onDone) {
  const isBest = visRecord(id, score);
  stageReset();
  panel({
    left: 'Drill', right: 'Finished', title,
    body: [
      h('div', { class: 'stat' }, h('b', null, score), isBest && h('span', { class: 'd up' }, 'new best')),
      h('p', { class: 'note' }, line),
      actions(
        btn(onDone ? 'Continue' : 'Back to drills', () => (onDone ? onDone(frac) : go('drills')), 'go'),
        btn('Go again', () => VIS[id].run(onDone), 'lite'),
      ),
    ],
  });
}

function drillSprint(onDone) {
  stageReset();
  const tok = UI.tok;
  const flip = Math.random() < 0.5 ? -1 : 1;
  board.setOrient(flip);
  board.coords(false);
  board.set(new Position('8/8/8/8/8/8/8/8 w - - 0 1'), { anim: false });
  let score = 0, misses = 0, left = 30, target = '';
  const big = h('div', { class: 'bigsq' }, '');
  const clock = h('p', { class: 'mono' }, '');
  const draw = () => { clock.textContent = `${left}s left. ${score} found, ${misses} missed. ${flip > 0 ? 'White' : 'Black'} sits at the bottom.`; };
  const nextSq = () => { target = 'abcdefgh'[randInt(8)] + (randInt(8) + 1); big.textContent = target; };
  panel({ left: 'Drill', right: 'Thirty seconds', title: 'Square Sprint', body: [h('p', { class: 'prompt' }, 'Click the named square. The board has no labels, the same as a real one.'), big, clock] });
  nextSq(); draw();
  board.onSquare = (sq) => {
    if (sq === target) { score++; board.mark({ good: [sq], bad: [] }); nextSq(); tock(); }
    else { misses++; board.mark({ bad: [sq], good: [] }); }
    draw();
  };
  UI.tick = setInterval(() => {
    if (tok !== UI.tok) return clearInterval(UI.tick);
    left--;
    draw();
    if (left <= 0) {
      clearInterval(UI.tick);
      drillEnd('sprint', 'Square Sprint', `${score} squares in 30 seconds, with ${misses} missed. Strong players are close to 40.`, score, clamp(score / 25, 0, 1), onDone);
    }
  }, 1000);
}

/* Enemy pieces you can take for free in a position. */
function freeCaptures(pos) {
  const out = new Set();
  for (const m of pos.legal()) {
    const to = (m >> 7) & 127;
    const v = pos.b[to];
    if (!v || Math.abs(v) === 6) continue;
    const me = pos.side;
    pos.make(m);
    const defended = pos.attacked(to, -me);
    pos.unmake();
    if (!defended) out.add(E.sqName(to));
  }
  return [...out];
}
function checkingPieces(pos) {
  const out = new Set();
  for (const m of pos.legal()) {
    pos.make(m);
    const check = pos.inCheck();
    pos.unmake();
    if (check) out.add(E.sqName(m & 127));
  }
  return [...out];
}
function samplePosition(test) {
  for (let k = 0; k < 300; k++) {
    const p = PZ.list[randInt(PZ.list.length)];
    if (!p.fen) continue;
    const pos = new Position(p.fen);
    pos.make(pos.parseUci(p.moves[0]));
    const ans = test(pos);
    if (ans) return { pos, ans };
  }
  return null;
}
function drillSelect(o, onDone) {
  let i = 0, right = 0, total = 0;
  const round = () => {
    if (i >= o.rounds) return drillEnd(o.id, o.title, `${right} correct out of ${total}. ${o.tip}`, right, total ? right / total : 0, onDone);
    stageReset();
    const sample = samplePosition(o.test);
    const { pos, ans } = sample;
    board.setOrient(pos.side);
    board.set(pos, { anim: false });
    const picked = new Set();
    const body = () => [
      h('p', { class: 'prompt' }, `${colorWord(pos.side)} to play. ${o.prompt}`),
      h('p', { class: 'mono' }, `Position ${i + 1} of ${o.rounds}. Selected: ${picked.size}.`),
      actions(btn('Check my answer', checkIt, 'go')),
    ];
    const draw = () => panel({ left: 'Drill', right: `${right}/${total}`, title: o.title, body: body() });
    board.onSquare = (sq) => {
      if (picked.has(sq)) picked.delete(sq); else picked.add(sq);
      board.mark({ hl: [...picked] });
      draw();
    };
    const checkIt = () => {
      board.onSquare = null;
      const good = ans.filter((s) => picked.has(s));
      const extra = [...picked].filter((s) => !ans.includes(s));
      const missed = ans.filter((s) => !picked.has(s));
      total += ans.length + extra.length;
      right += good.length;
      board.mark({ hl: [], good, bad: extra, target: missed });
      panel({
        left: 'Drill', right: `${right}/${total}`, title: o.title,
        body: [
          h('p', { class: 'verdict ' + (!extra.length && !missed.length ? 'good' : 'bad') }, !extra.length && !missed.length ? 'All of them.' : `Answer: ${ans.join(', ')}.`),
          missed.length ? h('p', { class: 'note' }, `Circled in red: ${missed.join(', ')}, the ones you missed.`) : null,
          extra.length ? h('p', { class: 'note' }, `${extra.join(', ')} ${extra.length > 1 ? 'do' : 'does'} not qualify.`) : null,
          actions(btn('Next position', () => { i++; round(); }, 'go')),
        ],
      });
    };
    draw();
  };
  round();
}
const drillFree = (onDone) => drillSelect({
  id: 'free', title: 'Free Pieces', rounds: 6,
  prompt: 'Click every enemy piece you can capture without being recaptured, then check your answer.',
  tip: 'Looking for loose pieces is the fastest way to find tactics.',
  test: (pos) => { const a = freeCaptures(pos); return a.length ? a : null; },
}, onDone);
const drillChecks = (onDone) => drillSelect({
  id: 'checks', title: 'All the Checks', rounds: 6,
  prompt: 'Click every one of your pieces that can give check next move, then check your answer.',
  tip: 'Include moves that uncover a check from a piece behind them.',
  test: (pos) => { const a = checkingPieces(pos); return a.length >= 2 ? a : null; },
}, onDone);

function drillRoute(onDone) {
  let round = 0, score = 0;
  const ROUNDS = 5;
  const play = () => {
    if (round >= ROUNDS) return drillEnd('route', 'Knight’s Route', `${score} of ${ROUNDS} routes were the shortest possible.`, score, score / ROUNDS, onDone);
    stageReset();
    board.setOrient(1);
    const pawns = new Set();
    while (pawns.size < 3) pawns.add('abcdefgh'[1 + randInt(6)] + (3 + randInt(4)));
    const blocked = new Set();
    for (const p of pawns) {
      const f = p.charCodeAt(0) - 97, r = +p[1];
      blocked.add(p);
      if (f > 0) blocked.add('abcdefgh'[f - 1] + (r - 1));
      if (f < 7) blocked.add('abcdefgh'[f + 1] + (r - 1));
    }
    const jumps = (s) => {
      const f = s.charCodeAt(0) - 97, r = +s[1] - 1, o = [];
      for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
        const nf = f + a, nr = r + b;
        if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) o.push('abcdefgh'[nf] + (nr + 1));
      }
      return o.filter((q) => !blocked.has(q));
    };
    const bfs = (a, b) => {
      const dist = new Map([[a, 0]]), q = [a];
      while (q.length) {
        const c = q.shift();
        if (c === b) return dist.get(c);
        for (const n of jumps(c)) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); }
      }
      return -1;
    };
    let from, to, best = -1;
    for (let k = 0; k < 200 && (best < 2 || best > 5); k++) {
      from = 'abcdefgh'[randInt(8)] + (1 + randInt(2));
      to = 'abcdefgh'[randInt(8)] + (7 + randInt(2));
      if (blocked.has(from) || blocked.has(to)) continue;
      best = bfs(from, to);
    }
    const rows = [];
    for (let r = 8; r >= 1; r--) {
      let row = '', e = 0;
      for (let f = 0; f < 8; f++) {
        const s = 'abcdefgh'[f] + r;
        if (pawns.has(s)) { if (e) { row += e; e = 0; } row += 'p'; }
        else e++;
      }
      if (e) row += e;
      rows.push(row);
    }
    const base = rows.join('/');
    const setKnight = (sq) => {
      const pos = new Position(`${base} w - - 0 1`);
      pos.put(2, E.sqParse(sq));
      return pos;
    };
    let cur = from, used = 0;
    board.set(setKnight(cur), { anim: false });
    board.mark({ target: [to], bad: [...blocked].filter((q) => !pawns.has(q)) });
    const draw = (msg) => panel({
      left: 'Drill', right: `Route ${round + 1} of ${ROUNDS}`, title: 'Knight’s Route',
      body: [
        h('p', { class: 'prompt' }, `Take the knight to the circled square, ${to}. Stay off the pawns and the red squares they attack. Click each square you land on.`),
        h('p', { class: 'mono' }, `Jumps: ${used}`),
        msg ? h('p', { class: 'verdict bad' }, msg) : null,
      ],
    });
    draw();
    board.onSquare = (sq) => {
      if (!jumps(cur).includes(sq)) { draw(`The knight cannot land on ${sq} from ${cur}.`); return; }
      cur = sq; used++;
      tock();
      board.set(setKnight(cur), { last: null });
      board.onSquare = board.onSquare || null;
      if (cur === to) {
        const shortest = used === best;
        if (shortest) score++;
        panel({
          left: 'Drill', right: `Route ${round + 1} of ${ROUNDS}`, title: 'Knight’s Route',
          body: [
            h('p', { class: 'verdict ' + (shortest ? 'good' : 'bad') }, shortest ? `Shortest route: ${used} jumps.` : `You took ${used} jumps. The shortest is ${best}.`),
            actions(btn('Next route', () => { round++; play(); }, 'go')),
          ],
        });
        return;
      }
      board.mark({ target: [to], bad: [...blocked].filter((q) => !pawns.has(q)) });
      board.onSquare = handler;
      draw();
    };
    const handler = board.onSquare;
  };
  play();
}

function drillBlunder(onDone) {
  let i = 0, right = 0;
  const ROUNDS = 8;
  const used = new Set();
  const near = () => {
    const target = S.tac.r - 100;
    const pool = BL.map((b) => ({ b, p: PZ.list[PZ.byId.get(b.pid)] }))
      .filter((x) => !used.has(x.b.pid))
      .sort((a, c) => Math.abs(a.p.r - target) - Math.abs(c.p.r - target))
      .slice(0, 120);
    return randOf(pool);
  };
  const play = () => {
    if (i >= ROUNDS) return drillEnd('blunder', 'Blunder Check', `${right} of ${ROUNDS} right. Run this same check before every move you play.`, right, right / ROUNDS, onDone);
    stageReset();
    const tok = UI.tok;
    const { b, p } = near();
    used.add(b.pid);
    const pos = new Position(p.fen);
    board.setOrient(pos.side);
    board.set(pos, { anim: false });
    const isBlunder = Math.random() < 0.5;
    const uci = isBlunder ? p.moves[0] : b.safe;
    const m = pos.parseUci(uci);
    const san = pos.san(m);
    board.mark({}, [[uci.slice(0, 2), uci.slice(2, 4), 'pen']]);
    const answer = (saidBlunder) => {
      const ok = saidBlunder === isBlunder;
      if (ok) right++;
      const finish = (txt) => panel({
        left: 'Drill', right: `${right}/${i + 1}`, title: 'Blunder Check',
        body: [
          h('p', { class: 'verdict ' + (ok ? 'good' : 'bad') }, ok ? 'Correct.' : 'Not quite.'),
          h('p', { class: 'why' }, txt),
          actions(btn(i + 1 < ROUNDS ? 'Next position' : 'Finish', () => { i++; play(); }, 'go')),
        ],
      });
      if (isBlunder) {
        // Replay the real refutation from the puzzle.
        const view = new Position(p.fen);
        const line = [];
        let delay = 300;
        p.moves.forEach((u, j) => {
          const mv = view.parseUci(u);
          line.push(view.san(mv));
          view.make(mv);
          const snap = view.fen(), last = lastOf(mv);
          setTimeout(() => { if (tok === UI.tok) { board.set(new Position(snap), { last }); tock(); } }, delay);
          delay += j ? 750 : 450;
        });
        finish(`${san} is a blunder. The game went ${line.join(' ')}. It costs about ${(b.loss / 100).toFixed(1)} pawns or more.`);
      } else {
        finish(`${san} is sound. The engine rates it within a third of a pawn of the best move here.`);
      }
    };
    panel({
      left: 'Drill', right: `Position ${i + 1} of ${ROUNDS}`, title: 'Blunder Check',
      body: [
        h('p', { class: 'prompt' }, `${colorWord(pos.side)} is about to play ${san}. Look at every check, capture and threat for your opponent after it. Is the move safe?`),
        actions(btn('Safe', () => answer(false), 'go'), btn('Blunder', () => answer(true), 'go')),
      ],
    });
  };
  play();
}

function drillMind(onDone) {
  let i = 0, right = 0;
  const ROUNDS = 6;
  const play = () => {
    if (i >= ROUNDS) return drillEnd('mind', 'Mind’s Eye', `${right} of ${ROUNDS} found without moving the pieces. This is how calculation grows.`, right, right / ROUNDS, onDone);
    stageReset();
    const tok = UI.tok;
    const p = pickPuzzle(clamp(S.tac.r - 250, 500, 2400), { minMoves: 4, filter: (x) => x.moves.length <= 6 });
    const pos = new Position(p.fen);
    board.setOrient(-pos.side);
    board.set(pos, { anim: false });
    const walk = new Position(p.fen);
    const lastIdx = p.moves.length - 1;
    const said = [];
    for (let k = 0; k < lastIdx; k++) {
      const mv = walk.parseUci(p.moves[k]);
      said.push(walk.san(mv));
      walk.make(mv);
    }
    const answerUci = p.moves[lastIdx];
    const answerMove = walk.parseUci(answerUci);
    const answerSan = walk.san(answerMove);
    let from = null;
    const body = (msg) => [
      h('p', { class: 'prompt' }, 'The pieces on the board have not moved. Play these moves in your head:'),
      h('p', { class: 'penned' }, said.join('   ')),
      h('p', { class: 'prompt' }, `${colorWord(walk.side)} now has a strong move. Click the square its piece stands on after that sequence, then the square it goes to.`),
      msg ? h('p', { class: 'note' }, msg) : null,
      actions(btn('I do not see it', () => reveal(false), 'lite')),
    ];
    const draw = (msg) => panel({ left: 'Drill', right: `Position ${i + 1} of ${ROUNDS}`, title: 'Mind’s Eye', body: body(msg) });
    const reveal = (ok) => {
      if (ok) right++;
      board.onSquare = null;
      panel({
        left: 'Drill', right: `${right}/${i + 1}`, title: 'Mind’s Eye',
        body: [
          h('p', { class: 'verdict ' + (ok ? 'good' : 'bad') }, ok ? `Yes, ${answerSan}.` : `The move was ${answerSan}.`),
          actions(btn(i + 1 < ROUNDS ? 'Next position' : 'Finish', () => { i++; play(); }, 'go')),
        ],
      });
      const view = new Position(p.fen);
      let delay = 200;
      p.moves.forEach((u) => {
        const mv = view.parseUci(u);
        view.make(mv);
        const snap = view.fen(), last = lastOf(mv);
        setTimeout(() => { if (tok === UI.tok) { board.set(new Position(snap), { last }); tock(); } }, delay);
        delay += 700;
      });
    };
    board.onSquare = (sq) => {
      if (!from) { from = sq; board.mark({ hl: [sq] }); draw(`From ${sq}. Now click where it goes.`); return; }
      const guess = from + sq;
      from = null;
      board.mark({ hl: [] });
      if (guess === answerUci.slice(0, 4)) reveal(true);
      else { draw(`${guess.slice(0, 2)} to ${guess.slice(2)} is not the move. Try again, or give up and see it.`); }
    };
    draw();
  };
  play();
}

const VIS = {
  blunder: { name: 'Blunder Check', blurb: 'Is the move on the board safe? Trains the habit that saves the most rating points.', run: drillBlunder, unit: 'of 8' },
  free: { name: 'Free Pieces', blurb: 'Spot every enemy piece you can win for nothing.', run: drillFree, unit: 'squares' },
  checks: { name: 'All the Checks', blurb: 'Find every checking move at a glance, so you never miss a forcing line.', run: drillChecks, unit: 'squares' },
  sprint: { name: 'Square Sprint', blurb: 'Name a square, find a square. Unlabelled board, thirty seconds.', run: drillSprint, unit: 'squares' },
  route: { name: 'Knight’s Route', blurb: 'Find the shortest knight path around attacked squares.', run: drillRoute, unit: 'of 5' },
  mind: { name: 'Mind’s Eye', blurb: 'Read a line of moves and find the finish without touching the pieces.', run: drillMind, unit: 'of 6' },
};

/* ---------- Rush: Time Scramble ---------- */
function clockFace(frac) {
  const svg = sv('svg', { viewBox: '0 0 62 62', role: 'img', 'aria-label': 'Chess clock' });
  svg.append(sv('circle', { cx: 31, cy: 31, r: 28, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 3 }));
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    svg.append(sv('line', { x1: 31 + Math.sin(a) * 23, y1: 31 - Math.cos(a) * 23, x2: 31 + Math.sin(a) * 27, y2: 31 - Math.cos(a) * 27, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
  }
  const a = -frac * Math.PI * 2;
  svg.append(sv('line', { x1: 31, y1: 31, x2: 31 + Math.sin(a) * 22, y2: 31 - Math.cos(a) * 22, stroke: 'var(--ink)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  // The flag hangs at twelve until the hand lifts it, then it drops.
  const fall = frac <= 0;
  svg.append(sv('polygon', { points: fall ? '31,5 35,14 28,13' : '31,3 41,5 31,9', fill: 'var(--flag)' }));
  return svg;
}
function runRush(onDone) {
  stageReset();
  const tok = UI.tok;
  let left = 180, score = 0, strikes = 0, level = clamp(S.tac.r - 350, 450, 2600), ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(UI.tick);
    const best = score > S.rush.best;
    if (best) S.rush.best = score;
    save();
    stageReset();
    panel({
      left: 'Time Scramble', right: strikes >= 3 ? 'Three strikes' : 'Flag fell', title: 'Time Scramble',
      body: [
        h('div', { class: 'stat' }, h('b', null, score), best && h('span', { class: 'd up' }, 'new best')),
        h('p', { class: 'note' }, 'Speed builds pattern recognition, but slow calculation builds strength. Spend most of your time on rated puzzles.'),
        actions(btn('Go again', () => runRush(onDone), 'go'), btn(onDone ? 'Continue' : 'Back to tactics', () => (onDone ? onDone(1) : go('tactics')), 'lite')),
      ],
    });
  };
  const drawClock = () => {
    const box = $('#rushbox');
    if (!box) return;
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    box.replaceChildren(
      h('div', { class: 'clock' }, clockFace(left / 180), h('span', { class: 't' }, `${mm}:${ss}`)),
      h('div', { class: 'stat' }, h('b', null, score), h('span', { class: 'note' }, 'solved')),
      h('div', { class: 'strikes', 'aria-label': `${strikes} strikes` }, '✗'.repeat(strikes) || ' '),
    );
  };
  const nextP = () => {
    if (ended) return;
    const p = pickPuzzle(level, {});
    playPuzzle(p, {
      quiet: true, rushMode: true, fast: true,
      onDone: (r) => {
        if (ended) return;
        if (r.ok) { score++; level = Math.min(2800, level + 28); }
        else { strikes++; if (strikes >= 3) return finish(); }
        drawClock();
        nextP();
      },
    });
    panel({
      left: 'Time Scramble', right: `Puzzle ${p.r}`,
      title: null,
      body: [h('div', { id: 'rushbox', class: 'formbody', style: 'padding:0' }), h('p', { class: 'note' }, 'Three minutes, three strikes. Puzzles get harder as you solve them. One wrong move is a strike.')],
    });
    drawClock();
    const t = UI.tok;
    clearInterval(UI.tick);
    UI.tick = setInterval(() => {
      if (ended) return clearInterval(UI.tick);
      left--;
      drawClock();
      if (left <= 0) finish();
      void t;
    }, 1000);
  };
  void tok;
  nextP();
}

/* ---------- Review queue ---------- */
function runSrs(n, onDone) {
  const queue = srsDue().sort((a, b) => a.box - b.box || a.due - b.due).slice(0, n);
  let i = 0, ok = 0;
  const after = (k, good) => { srsResult(k, good); if (good) ok++; save(); i++; nextI(); };
  const nextI = () => {
    if (i >= queue.length) { stageReset(); return onDone(queue.length ? ok / queue.length : 1); }
    const it = queue[i];
    const left = 'Review';
    const right = `${i + 1} of ${queue.length}`;
    if (it.k.startsWith('p:')) {
      const idx = PZ.byId.get(it.k.slice(2));
      if (idx === undefined) { srsResult(it.k, true); i++; return nextI(); }
      playPuzzle(PZ.list[idx], { rated: false, left, right, title: 'From your misses', nextLabel: 'Continue', onDone: (r) => after(it.k, !!r.ok) });
    } else if (it.k.startsWith('l:')) {
      const [, id, si] = it.k.split(':');
      const lesson = C.LESSONS.find((l) => l.id === id);
      const step = lesson && lesson.steps[+si];
      if (!step) { srsResult(it.k, true); i++; return nextI(); }
      stageReset();
      const ctx = { left, title: lesson.title, panel: (body) => panel({ left, right, title: lesson.title, body }) };
      STEPS[step.t](step, ctx, (score) => after(it.k, score === null || score >= 0.99));
    } else {
      retryPosition(it.k, { left, right, onDone: (good) => after(it.k, good) });
    }
  };
  nextI();
}

/* Positions from your own games. Key format: g|fen|bestUci|bestSan|playedSan */
function retryPosition(key, o) {
  const [, fen, bestUci, bestSan, played] = key.split('|');
  stageReset();
  const tok = UI.tok;
  const pos = new Position(fen);
  let misses = 0, busy = false;
  board.setOrient(pos.side);
  board.set(pos, { anim: false });
  const draw = (msg) => panel({
    left: o.left, right: o.right, title: 'From your own game',
    body: [
      h('p', { class: 'prompt' }, `You played ${played} here, and it lost ground. ${colorWord(pos.side)} to play. Find something better.`),
      msg ? h('p', { class: 'note' }, msg) : null,
      actions(misses > 0 && btn('Show the best move', showBest, 'lite')),
    ],
  });
  const finish = (good, text, m) => {
    pos.make(m);
    tock();
    board.set(pos, { last: lastOf(m) });
    panel({
      left: o.left, right: o.right, title: 'From your own game',
      body: [h('p', { class: 'verdict ' + (good ? 'good' : 'bad') }, text), actions(btn('Continue', () => o.onDone(good), 'go'))],
    });
  };
  const showBest = () => {
    board.clearInput();
    const m = pos.parseUci(bestUci);
    if (m) finish(false, `The engine prefers ${bestSan}.`, m);
    else o.onDone(false);
  };
  const onMove = async (m) => {
    if (busy) return;
    busy = true;
    const uci = pos.uci(m), san = pos.san(m);
    draw('Checking your move.');
    board.clearInput();
    const [you, top] = await Promise.all([
      Engine.run({ fen, only: [uci], opts: { timeMs: 450, depth: 14 } }),
      Engine.run({ fen, opts: { timeMs: 450, depth: 14 } }),
    ]);
    if (tok !== UI.tok) return;
    busy = false;
    const diff = top.lines[0].score - you.lines[0].score;
    if (diff <= 45) { finish(misses === 0, `${san} works. The engine agrees.`, m); return; }
    misses++;
    board.set(pos, {});
    board.mark({ bad: [uci.slice(2, 4)] });
    board.enable(pos, onMove);
    draw(`${san} is still about ${(diff / 100).toFixed(1)} pawns short of the best move. Try again.`);
  };
  board.enable(pos, onMove);
  say(`${colorWord(pos.side)} to play`);
  draw();
}

/* ---------- Sparring ---------- */
let BOOK_MAP = null;
function bookMap() {
  if (BOOK_MAP) return BOOK_MAP;
  BOOK_MAP = new Map();
  const addLine = (sans) => {
    const pos = new Position();
    for (const san of sans) {
      const m = pos.parseSan(san);
      if (!m) break;
      const k = halfFen(pos.fen());
      if (!BOOK_MAP.has(k)) BOOK_MAP.set(k, new Set());
      BOOK_MAP.get(k).add(pos.uci(m));
      pos.make(m);
    }
  };
  C.BOOK.forEach((b) => addLine(b.split(' ')));
  C.LESSONS.forEach((l) => l.steps.forEach((s) => {
    if (s.t === 'line' && !s.fen) addLine(parseLine(s.moves).map((x) => x.san));
  }));
  return BOOK_MAP;
}

function scoresheet(sans, cur, onPick, flags) {
  const table = h('table', { class: 'sheet' },
    h('thead', null, h('tr', null, h('th', null, 'No.'), h('th', null, 'White'), h('th', null, 'Black'))));
  const body = h('tbody');
  const rows = Math.max(Math.ceil(sans.length / 2), 6);
  const cell = (i) => {
    if (i >= sans.length) return h('td');
    return h('td', null, h('button', { type: 'button', class: i + 1 === cur ? 'now' : '', onclick: onPick ? () => onPick(i + 1) : null },
      sans[i], flags && flags[i] ? h('span', { class: 'glyph' }, flags[i]) : null));
  };
  for (let r = 0; r < rows; r++) body.append(h('tr', null, h('td', { class: 'no' }, r + 1), cell(r * 2), cell(r * 2 + 1)));
  table.append(body);
  const wrap = h('div', { class: 'sheetwrap' }, table);
  requestAnimationFrame(() => { const n = wrap.querySelector('.now'); if (n) n.scrollIntoView({ block: 'nearest' }); else wrap.scrollTop = wrap.scrollHeight; });
  return wrap;
}

function startGame(bot, colorPref, onDone) {
  stageReset();
  const tok = UI.tok;
  const me = colorPref === 'w' ? 1 : colorPref === 'b' ? -1 : Math.random() < 0.5 ? 1 : -1;
  const G = { pos: new Position(), moves: [], sans: [], over: null, viewing: null, takebacks: 0, thinking: false };
  board.setOrient(me);
  board.set(G.pos, { anim: false });
  under([['Flip board', () => board.setOrient(-board.orient)]]);

  const posAt = (n) => {
    const p = new Position();
    for (let i = 0; i < n; i++) p.make(p.parseUci(G.moves[i]));
    return p;
  };
  const view = (n) => {
    if (n >= G.moves.length) {
      G.viewing = null;
      const lastUci = G.moves[G.moves.length - 1];
      board.set(G.pos, { anim: false, last: lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : null });
      if (!G.over && G.pos.side === me && !G.thinking) board.enable(G.pos, mine);
    } else {
      G.viewing = n;
      const u = G.moves[n - 1];
      board.set(posAt(n), { anim: false, last: u ? [u.slice(0, 2), u.slice(2, 4)] : null });
    }
    draw();
  };
  const draw = () => {
    if (tok !== UI.tok) return;
    const cur = G.viewing === null ? G.sans.length : G.viewing;
    const body = [
      h('p', { class: 'note' }, bot.bio),
      scoresheet(G.sans, cur, view),
    ];
    if (G.over) {
      body.push(h('p', { class: 'verdict ' + (G.score === 1 ? 'good' : G.score === 0 ? 'bad' : '') }, G.over));
      if (G.ratedNote) body.push(h('p', { class: 'note' }, G.ratedNote));
      body.push(actions(
        btn('Review this game', () => go('review', S.games[0]), 'go'),
        btn('Play again', () => startGame(bot, colorPref, onDone), 'lite'),
        onDone && btn('Back to the round', () => onDone(G.score), 'lite'),
      ));
    } else {
      body.push(h('p', { class: 'mono' }, G.thinking ? `${bot.name} is thinking` : `You play ${colorWord(me)}. Before you move, run the blunder check.`));
      body.push(actions(
        btn('Take back', takeBack, 'lite'),
        btn('Resign', () => end(me > 0 ? '0-1' : '1-0', 'You resigned.'), 'lite'),
      ));
      if (G.takebacks) body.push(h('p', { class: 'note' }, 'You took a move back, so this game is practice and does not count toward your rating or the gate.'));
    }
    panel({ left: 'Sparring', right: `${bot.name} · about ${bot.rating}`, title: null, body });
  };
  const takeBack = () => {
    if (G.thinking || !G.moves.length || G.over) return;
    const n = G.pos.side === me ? 2 : 1;
    for (let i = 0; i < n && G.moves.length; i++) { G.pos.unmake(); G.moves.pop(); G.sans.pop(); }
    G.takebacks++;
    G.viewing = null;
    const u = G.moves[G.moves.length - 1];
    board.set(G.pos, { anim: false, last: u ? [u.slice(0, 2), u.slice(2, 4)] : null });
    board.enable(G.pos, mine);
    draw();
  };
  const end = (result, text) => {
    const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (me > 0) ? 1 : 0;
    G.over = text;
    G.score = score;
    board.clearInput();
    say('');
    const rec = S.bots[bot.id] || (S.bots[bot.id] = { w: 0, d: 0, l: 0, wW: 0, wB: 0 });
    if (!G.takebacks && G.moves.length >= 2) {
      const ex = 1 / (1 + Math.pow(10, (bot.rating - S.play.r) / 400));
      const k = S.play.n < 12 ? 48 : 24;
      const before = Math.round(S.play.r);
      S.play.r = clamp(S.play.r + k * (score - ex), 200, 2600);
      S.play.n++;
      if (score === 1) { rec.w++; if (me > 0) rec.wW++; else rec.wB++; } else if (score === 0) rec.l++; else rec.d++;
      const diff = Math.round(S.play.r) - before;
      G.ratedNote = `Play rating ${Math.round(S.play.r)} (${diff >= 0 ? '+' : ''}${diff}).`;
    } else if (G.takebacks) {
      G.ratedNote = 'Practice game: not rated.';
    } else {
      G.ratedNote = 'Too short to count.';
    }
    S.games.unshift({ bot: bot.name, me: me > 0 ? 'w' : 'b', res: result, san: G.sans.join(' '), day: today(), ev: null, flags: null });
    S.games = S.games.slice(0, 12);
    save();
    draw();
    checkPromotion();
  };
  const checkOver = () => {
    const st = G.pos.status();
    if (!st.over) return false;
    const text = st.reason === 'checkmate' ? (st.result === (me > 0 ? '1-0' : '0-1') ? 'Checkmate. You win.' : `Checkmate. ${bot.name} wins.`) : `Draw by ${st.reason}.`;
    end(st.result, text);
    return true;
  };
  const apply = (uci, san) => {
    const m = G.pos.parseUci(uci);
    const cap = !!G.pos.b[(m >> 7) & 127];
    const s = san || G.pos.san(m);
    G.pos.make(m);
    G.moves.push(uci);
    G.sans.push(s);
    tock(cap);
    if (G.viewing === null) board.set(G.pos, { last: lastOf(m) });
  };
  const botTurn = async () => {
    G.thinking = true;
    draw();
    const t0 = Date.now();
    let uci = null;
    if (G.moves.length < bot.book) {
      const opts = bookMap().get(halfFen(G.pos.fen()));
      if (opts && opts.size) uci = randOf([...opts]);
    }
    if (!uci) {
      const r = await Engine.run({ op: 'pick', fen: E.START_FEN, moves: [...G.moves], cfg: bot.cfg });
      uci = r.uci;
    }
    const wait = Math.max(0, 450 - (Date.now() - t0));
    setTimeout(() => {
      if (tok !== UI.tok || G.over) return;
      G.thinking = false;
      if (!uci) return;
      apply(uci);
      if (checkOver()) return;
      if (G.viewing === null) board.enable(G.pos, mine);
      say(`${colorWord(me)} to play`);
      draw();
    }, wait);
  };
  const mine = (m) => {
    if (G.over || G.thinking || G.pos.side !== me) return;
    apply(G.pos.uci(m));
    if (checkOver()) return;
    botTurn();
  };
  draw();
  if (me > 0) { board.enable(G.pos, mine); say('White to play'); }
  else botTurn();
}

/* ---------- Game review ---------- */
function evalChart(ev, flags, onPick, cur) {
  const w = 600, hgt = 110, mid = hgt / 2;
  const svg = sv('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img', 'aria-label': 'Evaluation through the game. Above the line favours White.' });
  const n = Math.max(ev.length - 1, 1);
  const x = (i) => (i / n) * w;
  const y = (v) => mid - (clamp(v, -600, 600) / 600) * (mid - 6);
  svg.append(sv('line', { x1: 0, x2: w, y1: mid, y2: mid, class: 'zero' }));
  let d = `M0 ${mid}`;
  ev.forEach((v, i) => { d += `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`; });
  d += `L${w} ${mid}Z`;
  svg.append(sv('path', { d, class: 'evalbar' }));
  (flags || []).forEach((f, i) => {
    if (f === '??' || f === '?') svg.append(sv('circle', { cx: x(i + 1), cy: y(ev[i + 1]), r: f === '??' ? 5.5 : 4, class: 'blunder' }));
  });
  if (cur !== undefined) svg.append(sv('line', { x1: x(cur), x2: x(cur), y1: 0, y2: hgt, class: 'cross' }));
  if (onPick) {
    svg.style.cursor = 'pointer';
    svg.addEventListener('click', (e) => {
      const r = svg.getBoundingClientRect();
      onPick(clamp(Math.round(((e.clientX - r.left) / r.width) * n), 0, n));
    });
  }
  return svg;
}

function runReview(game) {
  stageReset();
  const tok = UI.tok;
  const sans = game.san.split(' ').filter(Boolean);
  const me = game.me === 'w' ? 1 : -1;
  const pos = new Position();
  const uci = [];
  for (const s of sans) {
    const m = pos.parseSan(s);
    if (!m) break;
    uci.push(pos.uci(m));
    pos.make(m);
  }
  board.setOrient(me);
  const posAt = (n) => {
    const p = new Position();
    for (let i = 0; i < n; i++) p.make(p.parseUci(uci[i]));
    return p;
  };
  board.set(posAt(uci.length), { anim: false });
  let at = uci.length;
  const show = (n) => {
    at = n;
    const u = uci[n - 1];
    if (game.best && game.best[n] && u) {
      // Show the moment of decision: red is what was played, green is what was better.
      const b = game.best[n];
      board.set(posAt(n - 1), { anim: false });
      board.mark({}, [[u.slice(0, 2), u.slice(2, 4), 'flag'], [b.slice(0, 2), b.slice(2, 4), 'good']]);
    } else {
      board.set(posAt(n), { anim: false, last: u ? [u.slice(0, 2), u.slice(2, 4)] : null });
    }
    draw();
  };
  under([['Flip board', () => board.setOrient(-board.orient)], ['Previous move', () => show(Math.max(0, at - 1))], ['Next move', () => show(Math.min(uci.length, at + 1))]]);

  function results() {
    const body = [];
    if (game.ev) {
      const mine = game.flags.map((f, i) => ({ f, i })).filter((x) => x.f && ((x.i % 2 === 0) === (me > 0)));
      const blunders = mine.filter((x) => x.f === '??').length, mistakes = mine.filter((x) => x.f === '?').length;
      body.push(h('div', { class: 'stat' }, h('b', null, game.acpl), h('span', { class: 'note' }, 'average centipawns lost per move')));
      body.push(h('p', { class: 'note' }, `${blunders} blunder${blunders === 1 ? '' : 's'} and ${mistakes} mistake${mistakes === 1 ? '' : 's'}. Under 50 is club strength, and under 25 is very strong. Your errors are now in your review queue.`));
      body.push(evalChart(game.ev, game.flags, show, at));
      const here = game.flags[at - 1];
      if (here && at > 0) {
        const b = game.bestSan && game.bestSan[at];
        body.push(h('p', { class: 'why' }, `${sans[at - 1]}${here}${b ? ` Red shows the move played. Green shows ${b}, the better move.` : ''}`));
      }
    } else {
      body.push(h('p', { class: 'prompt' }, 'Run the engine over this game to find where it turned. This takes about half a minute for a long game.'), actions(btn('Analyse the game', analyse, 'go')));
    }
    return body;
  }
  function draw() {
    if (tok !== UI.tok) return;
    panel({
      left: 'Review', right: [game.bot || 'Your game', game.res].filter(Boolean).join(' · '), title: null,
      body: [...results(), scoresheet(sans.slice(0, uci.length), at, show, game.flags)],
    });
  }
  async function analyse() {
    const ev = [], best = [], bestSan = [];
    for (let i = 0; i <= uci.length; i++) {
      if (tok !== UI.tok) return;
      panel({ left: 'Review', right: `${i} of ${uci.length}`, title: null, body: [h('p', { class: 'prompt' }, 'Analysing your game.'), h('p', { class: 'mono' }, `Move ${Math.ceil(i / 2)} of ${Math.ceil(uci.length / 2)}`), scoresheet(sans.slice(0, uci.length), i, null)] });
      const r = await Engine.run({ fen: E.START_FEN, moves: uci.slice(0, i), opts: { timeMs: 130, depth: 14 } });
      const stm = i % 2 === 0 ? 1 : -1;
      if (!r.lines.length) {
        const st = posAt(i).status();
        ev.push(st.reason === 'checkmate' ? (stm > 0 ? -1500 : 1500) : 0);
        best.push(null); bestSan.push(null);
      } else {
        const l = r.lines[0];
        const v = Math.abs(l.score) >= MATE_ZONE ? Math.sign(l.score) * 1500 : l.score;
        ev.push(clamp(stm * v, -1500, 1500));
        best.push(l.uci); bestSan.push(l.san);
      }
    }
    const flags = [];
    let lost = 0, counted = 0;
    for (let i = 0; i < uci.length; i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const before = sign * ev[i], after = sign * ev[i + 1];
      const loss = Math.max(0, before - after);
      let f = '';
      const stillWinning = before > 800 && after > 500;
      const alreadyLost = before < -800;
      if (!stillWinning && !alreadyLost) {
        if (loss >= 250) f = '??';
        else if (loss >= 120) f = '?';
        else if (loss >= 60) f = '?!';
      }
      flags.push(f);
      if ((i % 2 === 0) === (me > 0)) { lost += Math.min(loss, 500); counted++; }
      if (f === '??' || f === '?') {
        if ((i % 2 === 0) === (me > 0) && best[i]) {
          srsAdd(['g', halfFen(posAt(i).fen()) + ' 0 1', best[i], bestSan[i], sans[i]].join('|'));
        }
      }
    }
    game.ev = ev; game.flags = flags;
    // The arrow shown at move n is the better move for the side that just moved there.
    game.best = {}; game.bestSan = {};
    flags.forEach((f, i) => { if (f) { game.best[i + 1] = best[i]; game.bestSan[i + 1] = bestSan[i]; } });
    game.acpl = counted ? Math.round(lost / counted) : 0;
    save();
    show(uci.length);
  }
  draw();
}

/* ---------- Today's round ---------- */
function buildRound() {
  const items = [];
  const due = srsDue();
  if (due.length) items.push({ k: 'srs', n: Math.min(6, due.length) });
  items.push({ k: 'tac', n: 8 });
  const cls = S.cls;
  const open = C.LESSONS.filter((l) => l.cls === cls && !lessonDone(l.id));
  if (open.length) {
    const order = ['rules', 'motifs', 'technique', 'strategy', 'openings'];
    const d = today();
    const rot = order.slice(d % order.length).concat(order.slice(0, d % order.length));
    open.sort((a, b) => rot.indexOf(a.track) - rot.indexOf(b.track));
    items.push({ k: 'lesson', id: open[0].id });
    const other = open.find((l) => l.track !== open[0].track);
    if (other) items.push({ k: 'lesson', id: other.id });
  }
  const visIds = Object.keys(VIS);
  items.push({ k: 'vis', id: visIds[today() % visIds.length] });
  const bot = C.BOTS.find((b) => b.cls === cls) || C.BOTS[C.BOTS.length - 1];
  if (today() % 3 === 0) items.push({ k: 'real' });
  else items.push({ k: 'spar', id: bot.id });
  S.rounds++;
  S.day = { no: today(), round: S.rounds, items };
  save();
}
function itemLabel(it) {
  if (it.k === 'srs') return ['Review your misses', `${it.n} positions from earlier sessions`];
  if (it.k === 'tac') return ['Rated tactics', `${it.n} puzzles near your level`];
  if (it.k === 'lesson') {
    const l = C.LESSONS.find((x) => x.id === it.id);
    return l ? [l.title, `${C.TRACKS[l.track].name}. ${l.summary}`] : ['Lesson', ''];
  }
  if (it.k === 'vis') return [VIS[it.id].name, VIS[it.id].blurb];
  if (it.k === 'spar') {
    const b = C.BOTS.find((x) => x.id === it.id);
    return [`Play ${b.name}`, 'A full game, then review it'];
  }
  return ['Play a long game elsewhere', 'At least 15 minutes a side, against a person'];
}
const resultMark = (r) => (r === null || r === undefined ? '' : r >= 0.75 ? '1' : r >= 0.4 ? '½' : '0');

function runItem(i) {
  const it = S.day.items[i];
  const done = (score) => {
    it.res = score === undefined ? 1 : score;
    const finished = S.day.items.every((x) => x.res !== undefined && x.res !== null);
    if (finished && S.streak.last !== today()) {
      S.streak.cur = S.streak.last === today() - 1 ? S.streak.cur + 1 : 1;
      S.streak.best = Math.max(S.streak.best, S.streak.cur);
      S.streak.last = today();
    }
    save();
    go('today');
    checkPromotion();
  };
  if (it.k === 'srs') runSrs(it.n, done);
  else if (it.k === 'tac') runPuzzleSet({ n: it.n, left: `Round ${S.day.round}, board ${i + 1}`, onDone: (s) => done(s) });
  else if (it.k === 'lesson') runLesson(C.LESSONS.find((x) => x.id === it.id), done);
  else if (it.k === 'vis') VIS[it.id].run(done);
  else if (it.k === 'spar') startGame(C.BOTS.find((x) => x.id === it.id), 'r', done);
  else {
    stageReset();
    idleBoard();
    panel({
      left: `Round ${S.day.round}`, right: `Board ${i + 1}`, title: 'Play a real game',
      body: [
        h('p', { class: 'prompt' }, 'Nothing here replaces this. Play one long game against a person on Lichess, Chess.com or at a club. Use at least 15 minutes a side, so you have time to run the blunder check on every move.'),
        h('p', { class: 'note' }, 'Afterwards, paste the game under Review. Its mistakes become your own training positions.'),
        actions(btn('I played a game', () => { S.real++; done(1); }, 'go'), btn('Not today', () => done(0), 'lite'), btn('Paste a game', () => go('review'), 'lite')),
      ],
    });
  }
}
function idleBoard() {
  const pos = new Position('8/8/8/3k4/8/8/R7/1R2K3 w - - 0 1');
  board.setOrient(1);
  board.set(pos, { anim: false });
  board.mark({}, [['a2', 'a5', 'pen'], ['b1', 'b4', 'pen']]);
}

const PLACEMENT = [
  { x: 'I am new to chess', sub: 'Start with how the pieces move', exempt: 0, tac: 600, play: 500 },
  { x: 'I know the rules', sub: 'I play now and then, and I lose pieces', exempt: 1, tac: 950, play: 800 },
  { x: 'I play online, around 1000 to 1300', sub: 'Start at Class D', exempt: 3, tac: 1400, play: 1200 },
  { x: 'I play online, around 1400 to 1700', sub: 'Start at Class C', exempt: 4, tac: 1750, play: 1500 },
];
function viewToday() {
  stageReset();
  if (S.placed === null) {
    idleBoard();
    panel({
      left: 'Ladder Mate', right: 'Entry form', title: null,
      body: [
        h('h2', { class: 'hero' }, 'Climb from your first move to 2000.'),
        h('p', { class: 'prompt' }, 'Each day is one tournament round: rated tactics, one or two lessons, a board-vision drill, and a game. The arrows show the ladder mate, the first checkmate everyone learns.'),
        h('p', { class: 'mono' }, 'Where do you start?'),
        h('div', { class: 'opts' }, PLACEMENT.map((o, i) => h('button', {
          type: 'button', class: 'opt', id: `place-${i}`, onclick: () => {
            S.placed = i; S.exempt = o.exempt; S.cls = o.exempt;
            S.tac.r = o.tac; S.tac.rd = 190; S.play.r = o.play;
            buildRound();
            viewToday();
          },
        }, h('b', null, o.x), h('small', null, o.sub)))),
      ],
    });
    return;
  }
  if (!S.day || S.day.no !== today()) buildRound();
  idleBoard();
  const items = S.day.items;
  const nextIdx = items.findIndex((x) => x.res === undefined || x.res === null);
  const points = items.reduce((a, x) => a + (x.res === undefined || x.res === null ? 0 : x.res >= 0.75 ? 1 : x.res >= 0.4 ? 0.5 : 0), 0);
  const fmt = (v) => (v % 1 ? `${Math.floor(v) || ''}½` : String(v));
  const table = h('table', { class: 'pairing' }, h('tbody', null, items.map((it, i) => {
    const [a, b] = itemLabel(it);
    return h('tr', { class: i === nextIdx ? 'at' : '' },
      h('td', { class: 'no' }, i + 1),
      h('td', null, h('button', { type: 'button', onclick: () => runItem(i) }, h('span', { class: 'it' }, a), h('span', { class: 'sub' }, b))),
      h('td', { class: 'res', 'aria-label': 'Result' }, resultMark(it.res)));
  })));
  const body = [
    h('h2', null, nextIdx < 0 ? 'Round complete.' : `Round ${S.day.round}`),
    table,
    h('div', { class: 'stat' }, h('b', null, fmt(points) || '0'), h('span', { class: 'note' }, `of ${items.length} points. Streak: ${S.streak.cur} day${S.streak.cur === 1 ? '' : 's'}.`)),
  ];
  if (nextIdx >= 0) body.push(actions(btn(`Start board ${nextIdx + 1}`, () => runItem(nextIdx), 'go')));
  else body.push(h('p', { class: 'note' }, 'Stop here for today. Improvement comes from sleeping on it and coming back tomorrow. The tabs above stay open if you want more.'));
  panel({ left: `Round ${S.day.round}`, right: `${items.length} boards`, title: null, body });
}

/* ---------- Tactics view ---------- */
function themePicker() {
  const sel = h('select', { id: 'theme-select', onchange: (e) => { UI.tacTheme = e.target.value; viewTactics(); } });
  const list = [['', 'Everything, near my rating'], ['__weak', 'My weakest themes']];
  const names = Object.keys(C.THEMES).filter((t) => NAMED(t)).sort((a, b) => C.THEMES[a][0].localeCompare(C.THEMES[b][0]));
  for (const t of names) list.push([t, C.THEMES[t][0]]);
  for (const [v, l] of list) {
    const o = h('option', { value: v }, l);
    if ((UI.tacTheme || '') === v) o.selected = true;
    sel.append(o);
  }
  return h('div', { class: 'formbody', style: 'padding:0' },
    h('label', { class: 'field', for: 'theme-select' }, 'Theme', sel),
    actions(btn('Time Scramble: 3 minutes', () => runRush(), 'lite')));
}
function viewTactics() {
  let themes = null;
  const sel = UI.tacTheme;
  if (sel === '__weak') {
    const weak = weakThemes().slice(0, 4).map((x) => x.t);
    themes = weak.length ? weak : null;
  } else if (sel) themes = [sel];
  const p = pickPuzzle(nextTarget(), { themes });
  playPuzzle(p, { rated: true, foot: themePicker, onDone: () => { viewTactics(); checkPromotion(); } });
}

/* ---------- Full pages ---------- */
function viewLessons(focusCls) {
  const page = pageReset();
  page.append(h('div', { class: 'blurb' },
    h('h1', null, 'Syllabus'),
    h('p', { class: 'lede' }, 'Every position here has been checked by an engine, and every ending with up to 7 pieces has been checked against a tablebase. Finish a class to clear its Lessons and Endgames gates.')));
  const order = ['rules', 'motifs', 'technique', 'strategy', 'openings'];
  for (let i = 0; i < 7; i++) {
    const c = C.CLASSES[i];
    const ls = C.LESSONS.filter((l) => l.cls === i);
    const done = ls.filter((l) => lessonDone(l.id)).length;
    const block = h('section', { class: 'classblock', id: 'class-' + i },
      h('div', { class: 'classhead' }, h('h2', null, c.name), h('span', { class: 'm' }, c.motto),
        h('span', { class: 'f' }, i < S.exempt ? 'Placed above this' : `${done}/${ls.length} done · ${c.floor}+`)));
    const grid = h('div', { class: 'lessons' });
    for (const tr of order) {
      const sub = ls.filter((l) => l.track === tr);
      if (!sub.length) continue;
      grid.append(h('div', { class: 'tracklabel' }, C.TRACKS[tr].name));
      for (const l of sub) {
        grid.append(h('button', { type: 'button', class: 'lesson', onclick: () => { UI.view = 'lessons'; runLesson(l, () => go('lessons', i)); } },
          h('span', { class: 'tick' + (lessonDone(l.id) ? ' on' : ''), 'aria-label': lessonDone(l.id) ? 'Done' : 'Not done' }),
          h('span', null, h('span', { class: 'lt' }, l.title), h('span', { class: 'ls' }, l.summary))));
      }
    }
    block.append(grid);
    page.append(block);
  }
  const target = focusCls === undefined ? S.cls : focusCls;
  requestAnimationFrame(() => {
    if (target > 0) { const el = $('#class-' + Math.min(target, 6)); if (el) el.scrollIntoView({ block: 'start' }); }
  });
}
function viewDrills() {
  const page = pageReset();
  page.append(h('div', { class: 'blurb' }, h('h1', null, 'Board vision'),
    h('p', { class: 'lede' }, 'Short drills for the skills that sit under every tactic: seeing the board, spotting what is loose, and holding moves in your head.')));
  page.append(h('div', { class: 'cards' }, Object.entries(VIS).map(([id, v]) => {
    const r = S.vis[id];
    return h('div', { class: 'card' }, h('h3', null, v.name), h('p', null, v.blurb),
      h('span', { class: 'mono' }, r ? `Best: ${r.best} ${v.unit}. Played ${r.plays}.` : 'Not played yet'),
      btn('Start', () => { UI.view = 'drills'; v.run(); }, 'go'));
  })));
}
function viewSpar() {
  const page = pageReset();
  page.append(h('div', { class: 'blurb' }, h('h1', null, 'Sparring'),
    h('p', { class: 'lede' }, 'Seven regulars from the club, weakest to strongest. Beating the one marked as your gate is a condition for promotion. Their ratings are rough labels, so treat them as a guide.')));
  const colorSel = h('select', { id: 'spar-colour', onchange: (e) => { UI.sparColor = e.target.value; } },
    [['r', 'Random colour'], ['w', 'White'], ['b', 'Black']].map(([v, l]) => {
      const o = h('option', { value: v }, l);
      if ((UI.sparColor || 'r') === v) o.selected = true;
      return o;
    }));
  page.append(h('label', { class: 'field', for: 'spar-colour', style: 'max-width:220px' }, 'You play', colorSel));
  page.append(h('div', { class: 'cards' }, C.BOTS.map((b) => {
    const rec = S.bots[b.id];
    const boss = b.cls === S.cls;
    return h('div', { class: 'card bot' + (boss ? ' boss' : '') }, h('h3', null, b.name),
      boss ? h('span', { class: 'bossmark' }, `Your gate${b.wins === 2 ? ': win with each colour' : ''}`) : null,
      h('span', { class: 'rating' }, `About ${b.rating}`),
      h('p', null, b.bio),
      h('span', { class: 'mono' }, rec ? `You: ${rec.w} won, ${rec.d} drawn, ${rec.l} lost` : 'Not played yet'),
      btn('Play', () => { UI.view = 'spar'; startGame(b, UI.sparColor || 'r'); }, 'go'));
  })));
}
function viewReview(game) {
  if (game) { UI.view = 'review'; runReview(game); return; }
  const page = pageReset();
  page.append(h('div', { class: 'blurb' }, h('h1', null, 'Review'),
    h('p', { class: 'lede' }, 'Your own games are your best material. Paste a game from any site, and the engine marks where it turned. Your mistakes then come back as training positions on a spaced schedule.')));
  const box = h('textarea', { id: 'pgn-input', rows: 7, placeholder: '1. e4 e5 2. Nf3 Nc6 3. Bc4 ...' });
  const col = h('select', { id: 'pgn-colour' }, h('option', { value: 'w' }, 'White'), h('option', { value: 'b' }, 'Black'));
  const err = h('p', { class: 'verdict bad', hidden: true });
  const submit = () => {
    const tokens = E.pgnMoves(box.value);
    const pos = new Position();
    const sans = [];
    for (const t of tokens) {
      const m = pos.parseSan(t);
      if (!m) {
        err.textContent = `Move ${Math.ceil((sans.length + 1) / 2)}, "${t}", is not legal here. Check that the text is one complete game from the starting position.`;
        err.hidden = false;
        return;
      }
      sans.push(pos.san(m));
      pos.make(m);
    }
    if (sans.length < 2) { err.textContent = 'Paste a game with at least one full move, such as "1. e4 e5".'; err.hidden = false; return; }
    const game2 = { bot: 'Pasted game', me: col.value, res: '', san: sans.join(' '), day: today(), ev: null, flags: null };
    S.games.unshift(game2);
    S.games = S.games.slice(0, 12);
    save();
    UI.view = 'review';
    runReview(game2);
  };
  page.append(h('div', { class: 'grid2' },
    h('div', { class: 'card' }, h('h3', null, 'Paste a game'),
      h('label', { class: 'field', for: 'pgn-input', style: 'width:100%' }, 'PGN or moves', box),
      h('label', { class: 'field', for: 'pgn-colour', style: 'width:100%' }, 'You played', col),
      err,
      btn('Analyse', submit, 'go')),
    h('div', { class: 'card' }, h('h3', null, 'Recent games'),
      S.games.length
        ? h('table', { class: 'pairing' }, h('tbody', null, S.games.map((g) => h('tr', null,
            h('td', null, h('button', { type: 'button', onclick: () => { UI.view = 'review'; runReview(g); } },
              h('span', { class: 'it' }, `${g.bot || 'Game'} ${g.res ? '· ' + g.res : ''}`),
              h('span', { class: 'sub' }, `${g.me === 'w' ? 'White' : 'Black'}, ${Math.ceil(g.san.split(' ').length / 2)} moves${g.acpl !== undefined && g.ev ? `, ${g.acpl} centipawns lost per move` : ''}`)))))))
        : h('p', { class: 'note' }, 'Games you play under Sparring land here.'))));
}

function ratingChart() {
  const hist = S.hist;
  const box = h('div', { class: 'chartbox' });
  const W = 720, H = 240, L = 92, R = 14, T = 12, B = 26;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Ladder rating over time' });
  const vals = hist.map((x) => x[1]);
  const lo = Math.max(400, Math.floor((Math.min(...vals, ladderRating()) - 100) / 200) * 200);
  const hi = Math.min(2200, Math.ceil((Math.max(...vals, ladderRating()) + 100) / 200) * 200);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const n = hist.length;
  const firstDay = n ? hist[0][0] : today();
  const span = Math.max(1, (n ? hist[n - 1][0] : today()) - firstDay);
  const x = (d) => L + ((d - firstDay) / span) * (W - L - R);
  for (const c of C.CLASSES) {
    if (c.floor < lo || c.floor > hi) continue;
    svg.append(sv('line', { x1: L, x2: W - R, y1: y(c.floor), y2: y(c.floor), class: 'grid' }));
    const t = sv('text', { x: L - 7, y: y(c.floor) + 4, 'text-anchor': 'end' });
    t.textContent = `${c.name} ${c.floor}`;
    svg.append(t);
  }
  if (n >= 2) {
    const pts = hist.map((r) => `${x(r[0]).toFixed(1)} ${y(r[1]).toFixed(1)}`);
    svg.append(sv('path', { d: `M${x(hist[0][0])} ${H - B}L${pts.join('L')}L${x(hist[n - 1][0])} ${H - B}Z`, class: 'area' }));
    svg.append(sv('path', { d: 'M' + pts.join('L'), class: 'line' }));
  }
  if (n >= 1) {
    const last = hist[n - 1];
    svg.append(sv('circle', { cx: n >= 2 ? x(last[0]) : L + 6, cy: y(last[1]), r: 5, class: 'dot' }));
  }
  const fmtDay = (d) => new Date(d * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const tl = sv('text', { x: L, y: H - 8 }); tl.textContent = fmtDay(firstDay); svg.append(tl);
  if (n >= 2) { const tr = sv('text', { x: W - R, y: H - 8, 'text-anchor': 'end' }); tr.textContent = fmtDay(hist[n - 1][0]); svg.append(tr); }
  const cross = sv('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' });
  svg.append(cross);
  box.append(svg);
  const tip = h('div', { class: 'tip', hidden: true });
  box.append(tip);
  if (n >= 2) {
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      let best = hist[0], bd = 1e9;
      for (const row of hist) { const d = Math.abs(x(row[0]) - px); if (d < bd) { bd = d; best = row; } }
      cross.setAttribute('x1', x(best[0])); cross.setAttribute('x2', x(best[0])); cross.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.textContent = `${fmtDay(best[0])}: ${best[1]}`;
      tip.style.left = (x(best[0]) / W) * 100 + '%';
      tip.style.top = (y(best[1]) / H) * 100 + '%';
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  }
  return box;
}

function viewLadder() {
  const page = pageReset();
  const m = measures();
  const cls = S.cls, c = C.CLASSES[cls];
  page.append(h('div', { class: 'blurb' }, h('h1', null, `${ladderRating()}, ${c.name}`), h('p', { class: 'lede' }, c.motto + '.')));
  const scale = (v) => clamp((v - 400) / 1600, 0, 1) * 100;
  const needs = cls < 7 ? C.CLASSES[cls + 1].floor : 2000;
  const gauge = (label, v) => h('div', { class: 'gauge' }, h('span', null, label),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${scale(v)}%` }), h('div', { class: 'need', style: `left:${scale(needs)}%`, title: `Next class at ${needs}` })),
    h('span', { class: 'v' }, Math.round(v)));
  const weak = weakThemes();
  page.append(h('div', { class: 'grid2' },
    h('section', { class: 'card' }, h('h3', null, 'Four measures'),
      h('p', { class: 'note' }, `Each runs from 400 to 2000. The blue tick marks ${needs}, the next class. Your weakest measure is your fastest gain.`),
      h('div', { class: 'gauges', style: 'width:100%' }, gauge('Tactics', m.tactics), gauge('Play', m.play), gauge('Endgames', m.endgames), gauge('Lessons', m.lessons))),
    h('section', { class: 'card' }, h('h3', null, cls < 7 ? `Gates to leave ${c.name}` : 'All gates cleared'),
      cls < 7 ? h('ul', { class: 'gates', style: 'font-size:14px;width:100%' }, gates(cls).map((g) => h('li', null, h('span', { class: 'tick' + (g.ok ? ' on' : '') }), h('span', null, g.k), h('span', { class: 'val' }, g.val)))) : h('p', null, 'You have cleared every gate on the ladder.'),
      h('p', { class: 'mono' }, `Puzzles solved: ${S.tac.ok} of ${S.tac.n}. Best Time Scramble: ${S.rush.best}. Long games logged: ${S.real}. Review queue: ${S.srs.length}.`))));
  page.append(h('section', { class: 'classblock' }, h('div', { class: 'classhead' }, h('h2', null, 'Ladder rating')),
    S.hist.length >= 2 ? null : h('p', { class: 'note' }, 'Your line starts here. Come back tomorrow and it begins to draw.'),
    ratingChart(),
    h('details', null, h('summary', null, 'Show as a table'), h('div', { class: 'tablewrap' }, h('table', { class: 'datatable' },
      h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Ladder'), h('th', null, 'Puzzle'), h('th', null, 'Play'))),
      h('tbody', null, S.hist.slice(-60).reverse().map((r) => h('tr', null,
        h('td', null, new Date(r[0] * 864e5).toISOString().slice(0, 10)), h('td', null, r[1]), h('td', null, r[2]), h('td', null, r[3])))))))));
  page.append(h('section', { class: 'classblock' }, h('div', { class: 'classhead' }, h('h2', null, 'Weakest themes')),
    weak.length
      ? h('div', { class: 'gauges' }, weak.slice(0, 10).map((x) => h('div', { class: 'thm' },
          h('span', null, C.THEMES[x.t][0]),
          h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${x.pct * 100}%` })),
          h('span', { class: 'v' }, `${Math.round(x.pct * 100)}% of ${x.n}`))))
      : h('p', { class: 'note' }, 'This fills in once you have tried a theme at least four times.')));
  const resetBox = h('div', { class: 'actions' });
  const armReset = () => resetBox.replaceChildren(btn('Erase my progress', () => {
    resetBox.replaceChildren(h('span', { class: 'note' }, 'This erases everything, and it cannot be undone.'),
      btn('Erase everything', () => {
        const sound = S.settings.sound;
        S = fresh(); S.settings.sound = sound; seenLoad(); save(); go('today'); toast('Progress erased');
      }), btn('Keep it', armReset, 'go'));
  }, 'lite'));
  armReset();
  page.append(h('section', { class: 'classblock' }, h('div', { class: 'classhead' }, h('h2', null, 'Settings')),
    h('div', { class: 'actions' }, btn(`Sound: ${S.settings.sound ? 'on' : 'off'}`, () => { S.settings.sound = !S.settings.sound; save(); viewLadder(); }, 'lite')), resetBox,
    h('p', { class: 'mono' }, `Progress saves to ${Sync.where}.`)));
  page.append(h('div', { class: 'foot' },
    h('p', null, 'What this number means. Your Ladder rating is a training estimate built from the four measures above. It is not a FIDE, US Chess or online rating. You earn those only by playing rated games, which is why one long game against a person belongs in your week. Tactics gates use the Lichess puzzle scale, which runs ahead of playing strength, and the bots’ ratings are approximate.'),
    h('p', { style: 'margin-top:8px' }, 'Puzzles come from the Lichess puzzle database (CC0). Endings are checked against Syzygy tablebases through the Lichess API. Piece shapes come from DejaVu Sans. Evaluation tables are PeSTO by Ronald Friederich.')));
}

/* ---------- Promotion moment ---------- */
function celebrate(cls) {
  const c = C.CLASSES[cls];
  const box = $('#promo');
  const isTop = cls === 7;
  box.replaceChildren(h('div', { class: 'promocard', role: 'dialog', 'aria-label': 'Promoted' },
    h('div', { class: 'stamp' }, 'PROMOTED'),
    h('div', { class: 'num' }, c.floor),
    h('h2', { style: 'font-family:var(--f-display);font-size:30px;line-height:1.05' }, c.name),
    h('p', { class: 'prompt' }, isTop
      ? 'You cleared every gate on the ladder. Now go and prove it in rated games, because that is where the real number lives.'
      : `${c.motto}. New lessons and a stronger gatekeeper are waiting.`),
    btn('Continue', () => { box.hidden = true; renderRail(); if (UI.view === 'today') viewToday(); }, 'go')));
  box.hidden = false;
}

/* ---------- Rail and navigation ---------- */
const TABS = [['today', 'Today'], ['tactics', 'Tactics'], ['lessons', 'Lessons'], ['drills', 'Drills'], ['spar', 'Sparring'], ['review', 'Review'], ['ladder', 'Ladder']];
const VIEWS = { today: viewToday, tactics: viewTactics, lessons: viewLessons, drills: viewDrills, spar: viewSpar, review: viewReview, ladder: viewLadder };
function go(view, ...args) {
  UI.view = view;
  renderTabs();
  VIEWS[view](...args);
  renderRail();
}
function renderTabs() {
  $('#tabs').replaceChildren(...TABS.map(([v, l]) => h('button', {
    type: 'button', 'aria-current': UI.view === v ? 'page' : null, onclick: () => go(v),
  }, l)));
}
function renderRail() {
  const rail = $('#rail');
  const cls = S.cls, c = C.CLASSES[cls];
  const open = rail.classList.contains('open');
  const rungs = h('ol', { class: 'rungs', 'aria-label': 'The rating ladder' });
  for (let i = 7; i >= 0; i--) {
    const k = C.CLASSES[i];
    const state = i < cls ? 'past' : i === cls ? 'cur' : '';
    rungs.append(h('li', { class: `rung ${state} ${i === 7 ? 'top' : ''}` },
      h('button', { type: 'button', onclick: () => go('lessons', Math.min(i, 6)) },
        h('span', { class: 'fl' }, k.floor),
        h('span', { class: 'nm' }, k.name, i === cls ? h('span', { class: 'you' }, 'you') : null))));
  }
  const g = cls < 7 ? gates(cls) : [];
  rail.replaceChildren(
    h('div', { class: 'wordmark' }, 'Ladder Mate'),
    h('div', { class: 'now' },
      h('span', { class: 'num' }, S.placed === null ? '–' : ladderRating()),
      h('span', { class: 'cls' }, S.placed === null ? 'Not started' : c.name),
      S.placed !== null && h('span', { class: 'motto' }, c.motto)),
    h('button', { type: 'button', class: 'railtoggle', 'aria-expanded': open ? 'true' : 'false', onclick: () => { rail.classList.toggle('open'); renderRail(); } }, open ? 'Hide ladder' : 'Show ladder'),
    h('div', { class: 'railmore' },
      S.placed !== null && g.length ? h('ul', { class: 'gates', 'aria-label': 'Gates to the next class' }, g.map((x) => h('li', null,
        h('span', { class: 'tick' + (x.ok ? ' on' : '') }), h('span', null, x.k), h('span', { class: 'val' }, x.val)))) : null,
      rungs));
}

/* ---------- Boot ---------- */
function start(snapshot) {
  board = new Board($('#board'));
  if (location.hash === '#e2e') window.LM_TEST = { get S() { return S; }, UI, get board() { return board; }, go, E, C, checkPromotion, save, Engine };
  Engine.init();
  renderTabs();
  go(snapshot && VIEWS[snapshot.view] && !['review'].includes(snapshot.view) ? snapshot.view : 'today');
  Sync.init();
  const flush = () => { if (S.updatedAt) { clearTimeout(saveTimer); Sync.write(); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const t = e.target;
    if (t && /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const go1 = $('#side .btn.go');
    if (go1 && !$('#stage').hidden) go1.click();
  });
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    window.claude.hot.snapshot(() => ({ view: UI.view }));
  }
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
