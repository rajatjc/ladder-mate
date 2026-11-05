/* Ladder Mate engine: rules, notation and search. No dependencies.
 * Runs in the page, in a Worker, and in Node for the test suite.
 * Board: 0x88 (sq = rank << 4 | file, a1 = 0). White pieces positive, black negative.
 * Move int: from | to << 7 | promo << 14 | flag << 17. Flags: 1 double push, 2 en passant, 3 castle.
 * Evaluation uses the public-domain PeSTO tables plus a few classical terms. */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  root.LMEngine = E;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const FL_DOUBLE = 1, FL_EP = 2, FL_CASTLE = 3;
  const KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
  const KING = [16, 17, 15, 1, -1, -16, -17, -15];
  const DIAG = [17, 15, -17, -15];
  const LINE = [16, 1, -1, -16];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  const VALUE = [0, 100, 320, 330, 500, 900, 20000];

  const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  const sqParse = (n) => (n.charCodeAt(1) - 49) << 4 | (n.charCodeAt(0) - 97);
  const LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

  /* ---------- PeSTO tables, listed from a8 to h1 ---------- */
  const MGV = [0, 82, 337, 365, 477, 1025, 0], EGV = [0, 94, 281, 297, 512, 936, 0];
  const T = {
    mg: [null,
      [0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0],
      [-167,-89,-34,-49,61,-97,-15,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23],
      [-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21],
      [32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26],
      [-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50],
      [-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14]],
    eg: [null,
      [0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,10,13,0,2,-7,0,0,0,0,0,0,0,0],
      [-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64],
      [-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17],
      [13,10,18,15,12,12,8,5,11,13,13,11,-3,3,8,3,7,7,7,5,4,-3,-5,-3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20],
      [-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41],
      [-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43]],
  };
  // PST[pc + 6][sq]: signed from White's point of view, with material included.
  const PST_MG = new Int16Array(13 * 128), PST_EG = new Int16Array(13 * 128);
  for (let t = 1; t <= 6; t++) {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const sq = r << 4 | f;
      const wi = (7 - r) * 8 + f, bi = r * 8 + f;
      PST_MG[(6 + t) * 128 + sq] = MGV[t] + T.mg[t][wi];
      PST_EG[(6 + t) * 128 + sq] = EGV[t] + T.eg[t][wi];
      PST_MG[(6 - t) * 128 + sq] = -(MGV[t] + T.mg[t][bi]);
      PST_EG[(6 - t) * 128 + sq] = -(EGV[t] + T.eg[t][bi]);
    }
  }

  /* ---------- Zobrist keys from a fixed seed, so hashes repeat between runs ---------- */
  let seed = 0x2F6E2B1;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const ZL = new Int32Array(13 * 128), ZH = new Int32Array(13 * 128);
  for (let i = 0; i < ZL.length; i++) { ZL[i] = rnd(); ZH[i] = rnd(); }
  const ZC_L = new Int32Array(16), ZC_H = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZC_L[i] = rnd(); ZC_H[i] = rnd(); }
  const ZE_L = new Int32Array(8), ZE_H = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZE_L[i] = rnd(); ZE_H[i] = rnd(); }
  const ZS_L = rnd(), ZS_H = rnd();

  const CR = new Uint8Array(128).fill(15);
  CR[0] = 15 & ~2; CR[7] = 15 & ~1; CR[4] = 15 & ~3;
  CR[112] = 15 & ~8; CR[119] = 15 & ~4; CR[116] = 15 & ~12;

  const STK = 12; // fields per undo record
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  class Position {
    constructor(fen) {
      this.b = new Int8Array(128);
      this.stack = new Int32Array(STK * 4096);
      this.sp = 0;
      this.setFen(fen || START_FEN);
    }

    setFen(fen) {
      const parts = fen.trim().split(/\s+/);
      const b = this.b; b.fill(0);
      this.mg = 0; this.eg = 0; this.phase = 0; this.lo = 0; this.hi = 0;
      this.k1 = -1; this.k2 = -1; this.sp = 0;
      let r = 7, f = 0;
      for (const c of parts[0]) {
        if (c === '/') { r--; f = 0; continue; }
        if (c >= '1' && c <= '8') { f += +c; continue; }
        const t = 'pnbrqk'.indexOf(c.toLowerCase()) + 1;
        if (t === 0 || r < 0 || f > 7) throw new Error('Bad FEN: ' + fen);
        this.put(c === c.toLowerCase() ? -t : t, r << 4 | f);
        f++;
      }
      this.side = parts[1] === 'b' ? -1 : 1;
      if (this.side < 0) { this.lo ^= ZS_L; this.hi ^= ZS_H; }
      let cr = 0;
      const cs = parts[2] || '-';
      if (cs.includes('K') && b[4] === K && b[7] === R) cr |= 1;
      if (cs.includes('Q') && b[4] === K && b[0] === R) cr |= 2;
      if (cs.includes('k') && b[116] === -K && b[119] === -R) cr |= 4;
      if (cs.includes('q') && b[116] === -K && b[112] === -R) cr |= 8;
      this.castle = cr; this.lo ^= ZC_L[cr]; this.hi ^= ZC_H[cr];
      this.ep = parts[3] && parts[3] !== '-' ? sqParse(parts[3]) : -1;
      if (this.ep >= 0) { this.lo ^= ZE_L[this.ep & 7]; this.hi ^= ZE_H[this.ep & 7]; }
      this.half = parts[4] ? +parts[4] : 0;
      this.full = parts[5] ? +parts[5] : 1;
      return this;
    }

    clone() {
      const c = new Position(this.fen());
      // Preserve repetition history by copying the undo stack.
      c.stack.set(this.stack.subarray(0, this.sp * STK));
      c.sp = this.sp;
      return c;
    }

    fen() {
      let s = '';
      for (let r = 7; r >= 0; r--) {
        let e = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.b[r << 4 | f];
          if (!p) { e++; continue; }
          if (e) { s += e; e = 0; }
          const l = ' pnbrqk'[Math.abs(p)];
          s += p > 0 ? l.toUpperCase() : l;
        }
        if (e) s += e;
        if (r) s += '/';
      }
      let cs = '';
      if (this.castle & 1) cs += 'K';
      if (this.castle & 2) cs += 'Q';
      if (this.castle & 4) cs += 'k';
      if (this.castle & 8) cs += 'q';
      return `${s} ${this.side > 0 ? 'w' : 'b'} ${cs || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
    }

    put(pc, sq) {
      this.b[sq] = pc;
      const i = (pc + 6) * 128 + sq;
      this.mg += PST_MG[i]; this.eg += PST_EG[i];
      this.phase += PHASE[Math.abs(pc)];
      this.lo ^= ZL[i]; this.hi ^= ZH[i];
      if (pc === K) this.k1 = sq; else if (pc === -K) this.k2 = sq;
    }

    take(sq) {
      const pc = this.b[sq];
      this.b[sq] = 0;
      const i = (pc + 6) * 128 + sq;
      this.mg -= PST_MG[i]; this.eg -= PST_EG[i];
      this.phase -= PHASE[Math.abs(pc)];
      this.lo ^= ZL[i]; this.hi ^= ZH[i];
    }

    attacked(sq, by) {
      if (sq < 0) return false;
      const b = this.b;
      const a = sq - by * 15, c = sq - by * 17;
      if (!(a & 0x88) && b[a] === by) return true;
      if (!(c & 0x88) && b[c] === by) return true;
      for (let i = 0; i < 8; i++) {
        const t = sq + KNIGHT[i];
        if (!(t & 0x88) && b[t] === by * N) return true;
      }
      for (let i = 0; i < 8; i++) {
        const t = sq + KING[i];
        if (!(t & 0x88) && b[t] === by * K) return true;
      }
      for (let i = 0; i < 4; i++) {
        const d = DIAG[i];
        for (let t = sq + d; !(t & 0x88); t += d) {
          const p = b[t];
          if (p) { if (p === by * B || p === by * Q) return true; break; }
        }
      }
      for (let i = 0; i < 4; i++) {
        const d = LINE[i];
        for (let t = sq + d; !(t & 0x88); t += d) {
          const p = b[t];
          if (p) { if (p === by * R || p === by * Q) return true; break; }
        }
      }
      return false;
    }

    inCheck(side) {
      const s = side === undefined ? this.side : side;
      return this.attacked(s > 0 ? this.k1 : this.k2, -s);
    }

    /* Pseudo-legal generation into buf from index n. Returns the new n. */
    gen(buf, n, capsOnly) {
      const b = this.b, side = this.side;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const sq = r << 4 | f, pc = b[sq];
        if (!pc || (pc > 0) !== (side > 0)) continue;
        const t = pc > 0 ? pc : -pc;
        if (t === P) {
          const dir = side * 16, one = sq + dir;
          const promoRank = side > 0 ? 7 : 0;
          if (!(one & 0x88) && !b[one]) {
            if ((one >> 4) === promoRank) {
              buf[n++] = sq | one << 7 | Q << 14;
              if (!capsOnly) {
                buf[n++] = sq | one << 7 | R << 14;
                buf[n++] = sq | one << 7 | B << 14;
                buf[n++] = sq | one << 7 | N << 14;
              }
            } else if (!capsOnly) {
              buf[n++] = sq | one << 7;
              if (r === (side > 0 ? 1 : 6) && !b[one + dir]) buf[n++] = sq | (one + dir) << 7 | FL_DOUBLE << 17;
            }
          }
          for (let i = -1; i <= 1; i += 2) {
            const to = one + i;
            if (to & 0x88) continue;
            const v = b[to];
            if (v && (v > 0) !== (side > 0)) {
              if ((to >> 4) === promoRank) {
                buf[n++] = sq | to << 7 | Q << 14;
                buf[n++] = sq | to << 7 | R << 14;
                buf[n++] = sq | to << 7 | B << 14;
                buf[n++] = sq | to << 7 | N << 14;
              } else buf[n++] = sq | to << 7;
            } else if (to === this.ep && !v) buf[n++] = sq | to << 7 | FL_EP << 17;
          }
        } else if (t === N || t === K) {
          const off = t === N ? KNIGHT : KING;
          for (let i = 0; i < 8; i++) {
            const to = sq + off[i];
            if (to & 0x88) continue;
            const v = b[to];
            if (v ? (v > 0) !== (side > 0) : !capsOnly) buf[n++] = sq | to << 7;
          }
        } else {
          if (t !== R) for (let i = 0; i < 4; i++) {
            const d = DIAG[i];
            for (let to = sq + d; !(to & 0x88); to += d) {
              const v = b[to];
              if (v) { if ((v > 0) !== (side > 0)) buf[n++] = sq | to << 7; break; }
              if (!capsOnly) buf[n++] = sq | to << 7;
            }
          }
          if (t !== B) for (let i = 0; i < 4; i++) {
            const d = LINE[i];
            for (let to = sq + d; !(to & 0x88); to += d) {
              const v = b[to];
              if (v) { if ((v > 0) !== (side > 0)) buf[n++] = sq | to << 7; break; }
              if (!capsOnly) buf[n++] = sq | to << 7;
            }
          }
        }
      }
      if (!capsOnly && this.castle) {
        if (side > 0) {
          if ((this.castle & 1) && !b[5] && !b[6] && !this.attacked(4, -1) && !this.attacked(5, -1) && !this.attacked(6, -1)) buf[n++] = 4 | 6 << 7 | FL_CASTLE << 17;
          if ((this.castle & 2) && !b[1] && !b[2] && !b[3] && !this.attacked(4, -1) && !this.attacked(3, -1) && !this.attacked(2, -1)) buf[n++] = 4 | 2 << 7 | FL_CASTLE << 17;
        } else {
          if ((this.castle & 4) && !b[117] && !b[118] && !this.attacked(116, 1) && !this.attacked(117, 1) && !this.attacked(118, 1)) buf[n++] = 116 | 118 << 7 | FL_CASTLE << 17;
          if ((this.castle & 8) && !b[113] && !b[114] && !b[115] && !this.attacked(116, 1) && !this.attacked(115, 1) && !this.attacked(114, 1)) buf[n++] = 116 | 114 << 7 | FL_CASTLE << 17;
        }
      }
      return n;
    }

    make(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
      const b = this.b, st = this.stack, s = this.sp * STK, side = this.side;
      const pc = b[from], cap = b[to];
      st[s] = this.castle; st[s + 1] = this.ep; st[s + 2] = this.half; st[s + 3] = cap;
      st[s + 4] = this.lo; st[s + 5] = this.hi; st[s + 6] = this.mg; st[s + 7] = this.eg;
      st[s + 8] = this.phase; st[s + 9] = m; st[s + 10] = this.k1; st[s + 11] = this.k2;
      this.sp++;

      if (this.ep >= 0) { this.lo ^= ZE_L[this.ep & 7]; this.hi ^= ZE_H[this.ep & 7]; this.ep = -1; }
      this.lo ^= ZC_L[this.castle]; this.hi ^= ZC_H[this.castle];

      const isPawn = pc === P || pc === -P;
      this.half = isPawn || cap ? 0 : this.half + 1;

      if (cap) this.take(to);
      this.take(from);
      this.put(promo ? side * promo : pc, to);

      if (flag === FL_EP) {
        this.take(to - side * 16);
        this.half = 0;
      } else if (flag === FL_CASTLE) {
        const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
        const rook = b[rf];
        this.take(rf); this.put(rook, rt);
      } else if (flag === FL_DOUBLE) {
        // Record the en-passant square only when an enemy pawn can use it.
        const l = to - 1, r = to + 1;
        if ((!(l & 0x88) && b[l] === -side) || (!(r & 0x88) && b[r] === -side)) {
          this.ep = from + side * 16;
          this.lo ^= ZE_L[this.ep & 7]; this.hi ^= ZE_H[this.ep & 7];
        }
      }

      this.castle &= CR[from] & CR[to];
      this.lo ^= ZC_L[this.castle]; this.hi ^= ZC_H[this.castle];
      if (side < 0) this.full++;
      this.side = -side;
      this.lo ^= ZS_L; this.hi ^= ZS_H;
    }

    unmake() {
      this.sp--;
      const st = this.stack, s = this.sp * STK;
      const m = st[s + 9], from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
      const b = this.b, side = -this.side;
      const moved = b[to];
      b[from] = promo ? side * P : moved;
      b[to] = st[s + 3];
      if (flag === FL_EP) b[to - side * 16] = -side * P;
      else if (flag === FL_CASTLE) {
        const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
        b[rf] = b[rt]; b[rt] = 0;
      }
      this.castle = st[s]; this.ep = st[s + 1]; this.half = st[s + 2];
      this.lo = st[s + 4]; this.hi = st[s + 5]; this.mg = st[s + 6]; this.eg = st[s + 7];
      this.phase = st[s + 8]; this.k1 = st[s + 10]; this.k2 = st[s + 11];
      if (side < 0) this.full--;
      this.side = side;
    }

    makeNull() {
      const st = this.stack, s = this.sp * STK;
      st[s] = this.castle; st[s + 1] = this.ep; st[s + 2] = this.half; st[s + 3] = 0;
      st[s + 4] = this.lo; st[s + 5] = this.hi; st[s + 6] = this.mg; st[s + 7] = this.eg;
      st[s + 8] = this.phase; st[s + 9] = 0; st[s + 10] = this.k1; st[s + 11] = this.k2;
      this.sp++;
      if (this.ep >= 0) { this.lo ^= ZE_L[this.ep & 7]; this.hi ^= ZE_H[this.ep & 7]; this.ep = -1; }
      this.side = -this.side; this.lo ^= ZS_L; this.hi ^= ZS_H;
    }

    unmakeNull() {
      this.sp--;
      const st = this.stack, s = this.sp * STK;
      this.ep = st[s + 1]; this.lo = st[s + 4]; this.hi = st[s + 5];
      this.side = -this.side;
    }

    /* All strictly legal moves as an array of ints. */
    legal() {
      const buf = new Int32Array(256);
      const n = this.gen(buf, 0, false);
      const out = [];
      const me = this.side;
      for (let i = 0; i < n; i++) {
        this.make(buf[i]);
        if (!this.inCheck(me)) out.push(buf[i]);
        this.unmake();
      }
      return out;
    }

    uci(m) {
      const pr = (m >> 14) & 7;
      return sqName(m & 127) + sqName((m >> 7) & 127) + (pr ? ' nbrq'[pr - 1] : '');
    }

    parseUci(u) {
      const from = sqParse(u.slice(0, 2)), to = sqParse(u.slice(2, 4));
      const pr = u[4] ? ' pnbrq'.indexOf(u[4]) : 0;
      for (const m of this.legal()) {
        if ((m & 127) === from && ((m >> 7) & 127) === to && ((m >> 14) & 7) === pr) return m;
      }
      return 0;
    }

    /* Standard algebraic notation for a legal move in this position. */
    san(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
      const pc = Math.abs(this.b[from]);
      let s;
      if (flag === FL_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else {
        const cap = this.b[to] || flag === FL_EP;
        if (pc === P) {
          s = (cap ? 'abcdefgh'[from & 7] + 'x' : '') + sqName(to);
          if (promo) s += '=' + LETTER[promo];
        } else {
          let same = false, sameFile = false, sameRank = false;
          for (const o of this.legal()) {
            if (o === m) continue;
            const of = o & 127;
            if (((o >> 7) & 127) === to && Math.abs(this.b[of]) === pc) {
              same = true;
              if ((of & 7) === (from & 7)) sameFile = true;
              if ((of >> 4) === (from >> 4)) sameRank = true;
            }
          }
          let dis = '';
          if (same) {
            if (!sameFile) dis = 'abcdefgh'[from & 7];
            else if (!sameRank) dis = String((from >> 4) + 1);
            else dis = sqName(from);
          }
          s = LETTER[pc] + dis + (cap ? 'x' : '') + sqName(to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }

    parseSan(text) {
      const norm = (x) => x.replace(/0/g, 'O').replace(/[+#!?x=]/g, '').replace(/e\.?p\.?$/i, '').trim();
      const want = norm(text);
      if (!want) return 0;
      for (const m of this.legal()) if (norm(this.san(m)) === want) return m;
      return 0;
    }

    /* Accepts a piece that may have been deliberately left off a teaching board. */
    pieceAt(name) {
      return this.b[sqParse(name)];
    }

    repetitions() {
      let c = 0;
      const st = this.stack;
      for (let i = this.sp - 2, lim = Math.max(0, this.sp - this.half); i >= lim; i -= 2) {
        if (st[i * STK + 4] === this.lo && st[i * STK + 5] === this.hi) c++;
      }
      return c;
    }

    insufficient() {
      if (this.phase > 2) return false;
      const b = this.b;
      let minor = 0, bishopColours = [0, 0], knights = 0, wm = 0, bm = 0;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = b[r << 4 | f];
        if (!p) continue;
        const t = Math.abs(p);
        if (t === P || t === R || t === Q) return false;
        if (t === K) continue;
        minor++;
        if (p > 0) wm++; else bm++;
        if (t === N) knights++;
        else bishopColours[(r + f) & 1]++;
      }
      if (minor <= 1) return true;
      if (minor === 2 && !knights && wm === 1 && bm === 1) return bishopColours[0] === 2 || bishopColours[1] === 2;
      return false;
    }

    status() {
      const legal = this.legal();
      if (!legal.length) {
        if (this.inCheck()) return { over: true, reason: 'checkmate', result: this.side > 0 ? '0-1' : '1-0' };
        return { over: true, reason: 'stalemate', result: '1/2-1/2' };
      }
      if (this.insufficient()) return { over: true, reason: 'insufficient material', result: '1/2-1/2' };
      if (this.half >= 100) return { over: true, reason: 'the 50-move rule', result: '1/2-1/2' };
      if (this.repetitions() >= 2) return { over: true, reason: 'threefold repetition', result: '1/2-1/2' };
      return { over: false };
    }

    /* Evaluation in centipawns from the side to move's point of view. */
    evaluate(style) {
      const b = this.b;
      const ph = this.phase > 24 ? 24 : this.phase;
      let mg = this.mg, eg = this.eg;
      const wMost = [-1, -1, -1, -1, -1, -1, -1, -1], bMost = [-1, -1, -1, -1, -1, -1, -1, -1];
      const wLeast = [8, 8, 8, 8, 8, 8, 8, 8], bLeast = [8, 8, 8, 8, 8, 8, 8, 8];
      const wCnt = [0, 0, 0, 0, 0, 0, 0, 0], bCnt = [0, 0, 0, 0, 0, 0, 0, 0];
      let wB = 0, bB = 0, wPawns = 0, bPawns = 0, wMat = 0, bMat = 0;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = b[r << 4 | f];
        if (!p) continue;
        if (p === P) { wPawns++; wCnt[f]++; if (r > wMost[f]) wMost[f] = r; if (r < wLeast[f]) wLeast[f] = r; }
        else if (p === -P) { bPawns++; bCnt[f]++; if (r > bMost[f]) bMost[f] = r; if (r < bLeast[f]) bLeast[f] = r; }
        else if (p === B) { wB++; wMat += 330; }
        else if (p === -B) { bB++; bMat += 330; }
        else if (p > 0 && p < K) wMat += VALUE[p];
        else if (p < 0 && p > -K) bMat += VALUE[-p];
      }
      if (wB >= 2) { mg += 25; eg += 45; }
      if (bB >= 2) { mg -= 25; eg -= 45; }
      const PASS = [0, 5, 10, 20, 40, 75, 120, 0];
      for (let f = 0; f < 8; f++) {
        if (wCnt[f] > 1) { mg -= 8; eg -= 16; }
        if (bCnt[f] > 1) { mg += 8; eg += 16; }
        const lw = f > 0 ? wCnt[f - 1] : 0, rw = f < 7 ? wCnt[f + 1] : 0;
        const lb = f > 0 ? bCnt[f - 1] : 0, rb = f < 7 ? bCnt[f + 1] : 0;
        if (wCnt[f] && !lw && !rw) { mg -= 10; eg -= 12; }
        if (bCnt[f] && !lb && !rb) { mg += 10; eg += 12; }
        if (wCnt[f]) {
          const r = wMost[f];
          if (bMost[f] <= r && (f === 0 || bMost[f - 1] <= r) && (f === 7 || bMost[f + 1] <= r)) { mg += PASS[r]; eg += PASS[r] * 2; }
        }
        if (bCnt[f]) {
          const r = bLeast[f];
          if (wLeast[f] >= r && (f === 0 || wLeast[f - 1] >= r) && (f === 7 || wLeast[f + 1] >= r)) { mg -= PASS[7 - r]; eg -= PASS[7 - r] * 2; }
        }
      }
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = b[r << 4 | f];
        if (p === R || p === -R) {
          const own = p > 0 ? wCnt[f] : bCnt[f], opp = p > 0 ? bCnt[f] : wCnt[f];
          const v = !own ? (!opp ? 22 : 11) : 0;
          if (p > 0) { mg += v; eg += v >> 1; } else { mg -= v; eg -= v >> 1; }
        }
      }
      if (ph > 8 && this.k1 >= 0 && this.k2 >= 0) {
        const shield = (ks, dir, pawn) => {
          let v = 0;
          const fl = ks & 7;
          for (let d = -1; d <= 1; d++) {
            const nf = fl + d;
            if (nf < 0 || nf > 7) continue;
            const a = ks + dir * 16 + d;
            if (!(a & 0x88) && b[a] === pawn) v += 12;
            else {
              const c = a + dir * 16;
              if (!(c & 0x88) && b[c] === pawn) v += 6;
              else v -= 10;
            }
          }
          return v;
        };
        mg += shield(this.k1, 1, P) - shield(this.k2, -1, -P);
      }
      let score = (mg * ph + eg * (24 - ph)) / 24;

      // Mop-up: with a decisive edge and no pawns left, drive the bare king to the edge.
      const diff = wMat - bMat;
      if (!wPawns && !bPawns && Math.abs(diff) >= 300 && this.k1 >= 0 && this.k2 >= 0) {
        const lose = diff > 0 ? this.k2 : this.k1, win = diff > 0 ? this.k1 : this.k2;
        const cd = Math.max(3 - (lose >> 4), (lose >> 4) - 4) + Math.max(3 - (lose & 7), (lose & 7) - 4);
        const dist = Math.abs((lose >> 4) - (win >> 4)) + Math.abs((lose & 7) - (win & 7));
        const m = 12 * cd + 4 * (14 - dist);
        score += diff > 0 ? m : -m;
      }
      // Without pawns, a single-minor edge rarely wins: damp it toward a draw.
      if ((diff > 0 && !wPawns && wMat < 500 && wMat - bMat < 400) || (diff < 0 && !bPawns && bMat < 500 && bMat - wMat < 400)) score /= 8;

      if (style) {
        const me = style.color;
        if (style.trade) score += me * style.trade * (24 - ph);
        if (style.attack && ph > 6) {
          const ek = me > 0 ? this.k2 : this.k1;
          if (ek >= 0) {
            let near = 0;
            for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
              const p = b[r << 4 | f];
              if (!p || (p > 0) !== (me > 0) || Math.abs(p) === P || Math.abs(p) === K) continue;
              const d = Math.max(Math.abs(r - (ek >> 4)), Math.abs(f - (ek & 7)));
              if (d <= 3) near += 4 - d;
            }
            score += me * style.attack * near;
          }
        }
      }
      return ((this.side > 0 ? score : -score) + 10) | 0;
    }
  }

  /* ---------- Search ---------- */
  const MATE = 30000, INF = 32000, MAX_PLY = 96;
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  let ttKey = null, ttMove, ttScore, ttMeta, ttGen = 0;
  const ttAlloc = () => {
    if (ttKey) return;
    ttKey = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE);
    ttScore = new Int16Array(TT_SIZE); ttMeta = new Int32Array(TT_SIZE);
  };

  const moveBuf = new Int32Array(MAX_PLY * 256), moveScore = new Int32Array(MAX_PLY * 256);
  const killers = new Int32Array(MAX_PLY * 2), history = new Int32Array(128 * 128);
  const pvTable = new Int32Array(MAX_PLY * MAX_PLY), pvLen = new Int32Array(MAX_PLY);

  function search(pos, opts) {
    opts = opts || {};
    ttAlloc(); ttGen = (ttGen + 1) & 255;
    const maxDepth = Math.min(opts.depth || 60, MAX_PLY - 8);
    const timeMs = opts.timeMs === undefined ? 1000 : opts.timeMs;
    const maxNodes = opts.nodes || Infinity;
    const style = opts.style || null;
    const t0 = Date.now(), deadline = t0 + timeMs;
    let nodes = 0, stop = false;
    killers.fill(0); history.fill(0);

    const timeUp = () => {
      if (nodes >= maxNodes || (timeMs > 0 && Date.now() >= deadline)) stop = true;
      return stop;
    };

    function order(ply, n, start, ttm) {
      const b = pos.b;
      const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
      for (let i = start; i < n; i++) {
        const m = moveBuf[i], from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
        let s;
        if (m === ttm) s = 20000000;
        else if (b[to] || flag === FL_EP) {
          const v = b[to] ? Math.abs(b[to]) : P;
          s = 10000000 + v * 16 - Math.abs(b[from]);
        } else if (promo) s = 9000000 + promo;
        else if (m === k1) s = 8000000;
        else if (m === k2) s = 7000000;
        else s = history[from | to << 7];
        moveScore[i] = s;
      }
    }

    function pick(i, n) {
      let best = i;
      for (let j = i + 1; j < n; j++) if (moveScore[j] > moveScore[best]) best = j;
      if (best !== i) {
        const tm = moveBuf[i]; moveBuf[i] = moveBuf[best]; moveBuf[best] = tm;
        const ts = moveScore[i]; moveScore[i] = moveScore[best]; moveScore[best] = ts;
      }
      return moveBuf[i];
    }

    function qs(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && timeUp()) return 0;
      if (stop) return 0;
      if (ply >= MAX_PLY - 2) return pos.evaluate(style);
      const inChk = pos.inCheck();
      let best;
      if (!inChk) {
        best = pos.evaluate(style);
        if (best >= beta) return best;
        if (best > alpha) alpha = best;
      } else best = -MATE + ply;
      const start = ply * 256;
      const n = pos.gen(moveBuf, start, !inChk);
      order(ply, n, start, 0);
      const me = pos.side;
      let any = false;
      for (let i = start; i < n; i++) {
        const m = pick(i, n);
        if (!inChk) {
          const to = (m >> 7) & 127, flag = (m >> 17) & 7, promo = (m >> 14) & 7;
          const cv = pos.b[to] ? VALUE[Math.abs(pos.b[to])] : (flag === FL_EP ? 100 : 0);
          if (!promo && best + cv + 200 < alpha) continue;
        }
        pos.make(m);
        if (pos.inCheck(me)) { pos.unmake(); continue; }
        any = true;
        const s = -qs(-beta, -alpha, ply + 1);
        pos.unmake();
        if (stop) return 0;
        if (s > best) {
          best = s;
          if (s > alpha) { alpha = s; if (s >= beta) return s; }
        }
      }
      if (inChk && !any) return -MATE + ply;
      return best;
    }

    function ab(depth, alpha, beta, ply, canNull) {
      if ((++nodes & 2047) === 0 && timeUp()) return 0;
      if (stop) return 0;
      pvLen[ply] = ply;
      if (pos.half >= 100 || pos.repetitions() >= 1 || pos.insufficient()) return 0;
      if (ply >= MAX_PLY - 2) return pos.evaluate(style);

      // Mate-distance pruning.
      if (alpha < -MATE + ply) alpha = -MATE + ply;
      if (beta > MATE - ply - 1) beta = MATE - ply - 1;
      if (alpha >= beta) return alpha;

      const inChk = pos.inCheck();
      if (inChk) depth++;
      if (depth <= 0) return qs(alpha, beta, ply);

      const pvNode = beta - alpha > 1;
      const idx = pos.lo & TT_MASK;
      let ttm = 0;
      if (ttKey[idx] === pos.hi) {
        ttm = ttMove[idx];
        const meta = ttMeta[idx], d = meta & 255, flag = (meta >> 8) & 3;
        if (!pvNode && d >= depth) {
          let v = ttScore[idx];
          if (v > MATE - 200) v -= ply; else if (v < -MATE + 200) v += ply;
          if (flag === 1 || (flag === 2 && v >= beta) || (flag === 3 && v <= alpha)) return v;
        }
      }

      const stand = inChk ? -INF : pos.evaluate(style);
      if (!pvNode && !inChk) {
        if (depth <= 3 && stand - 120 * depth >= beta && Math.abs(beta) < MATE - 200) return stand;
        if (canNull && depth >= 3 && stand >= beta) {
          // Null move is unsound in pawn-only endings because of zugzwang.
          const b = pos.b, own = pos.side;
          let pieces = false;
          for (let r = 0; r < 8 && !pieces; r++) for (let f = 0; f < 8; f++) {
            const p = b[r << 4 | f];
            if (p && (p > 0) === (own > 0) && Math.abs(p) !== P && Math.abs(p) !== K) { pieces = true; break; }
          }
          if (pieces) {
            pos.makeNull();
            const s = -ab(depth - 3 - (depth >> 3), -beta, -beta + 1, ply + 1, false);
            pos.unmakeNull();
            if (stop) return 0;
            if (s >= beta && Math.abs(s) < MATE - 200) return s;
          }
        }
      }

      const start = ply * 256;
      const n = pos.gen(moveBuf, start, false);
      order(ply, n, start, ttm);
      const me = pos.side;
      let best = -INF, bestMove = 0, tried = 0, flag = 3;
      for (let i = start; i < n; i++) {
        const m = pick(i, n);
        const to = (m >> 7) & 127, fl = (m >> 17) & 7, promo = (m >> 14) & 7;
        const quiet = !pos.b[to] && fl !== FL_EP && !promo;
        // Futility: a quiet move near the horizon cannot lift a hopeless score.
        if (!pvNode && !inChk && quiet && tried > 0 && depth <= 2 && stand + 150 * depth + 80 < alpha && Math.abs(alpha) < MATE - 200) continue;
        pos.make(m);
        if (pos.inCheck(me)) { pos.unmake(); continue; }
        tried++;
        const gives = pos.inCheck();
        let s;
        if (tried === 1) s = -ab(depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let r = 0;
          if (depth >= 3 && tried >= 4 && quiet && !inChk && !gives) r = 1 + (depth >= 6 && tried >= 12 ? 1 : 0);
          s = -ab(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
          if (!stop && s > alpha && r) s = -ab(depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (!stop && s > alpha && s < beta) s = -ab(depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake();
        if (stop) return 0;
        if (s > best) {
          best = s; bestMove = m;
          if (s > alpha) {
            alpha = s; flag = 1;
            pvTable[ply * MAX_PLY + ply] = m;
            for (let j = ply + 1; j < pvLen[ply + 1]; j++) pvTable[ply * MAX_PLY + j] = pvTable[(ply + 1) * MAX_PLY + j];
            pvLen[ply] = pvLen[ply + 1];
            if (s >= beta) {
              flag = 2;
              if (quiet) {
                if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
                history[(m & 127) | to << 7] += depth * depth;
              }
              break;
            }
          }
        }
      }
      if (!tried) return inChk ? -MATE + ply : 0;

      const old = ttMeta[idx];
      if (ttKey[idx] !== pos.hi || (old >> 16) !== ttGen || (old & 255) <= depth) {
        ttKey[idx] = pos.hi; ttMove[idx] = bestMove;
        let v = best;
        if (v > MATE - 200) v += ply; else if (v < -MATE + 200) v -= ply;
        ttScore[idx] = v;
        ttMeta[idx] = depth | flag << 8 | ttGen << 16;
      }
      return best;
    }

    let root = pos.legal();
    if (opts.only) { const allow = new Set(opts.only); root = root.filter((m) => allow.has(m)); }
    if (!root.length) return { lines: [], nodes: 0, depth: 0, ms: 0 };
    const multipv = Math.min(opts.multipv || 1, root.length);
    const rootScore = new Map(root.map((m) => [m, 0]));
    let lines = [];
    let reached = 0;

    for (let d = 1; d <= maxDepth; d++) {
      const iter = [];
      const excluded = new Set();
      for (let pvi = 0; pvi < multipv; pvi++) {
        let alpha = -INF, best = -INF, bestMove = 0, bestPv = [];
        const list = root.filter((m) => !excluded.has(m)).sort((a, b) => rootScore.get(b) - rootScore.get(a));
        let first = true;
        for (const m of list) {
          pos.make(m);
          let s;
          if (first) s = -ab(d - 1, -INF, -alpha, 1, true);
          else {
            s = -ab(d - 1, -alpha - 1, -alpha, 1, true);
            if (!stop && s > alpha) s = -ab(d - 1, -INF, -alpha, 1, true);
          }
          pos.unmake();
          if (stop) break;
          first = false;
          rootScore.set(m, s);
          if (s > best) {
            best = s; bestMove = m; alpha = s;
            bestPv = [m];
            for (let j = 1; j < pvLen[1]; j++) bestPv.push(pvTable[1 * MAX_PLY + j]);
          }
        }
        if (stop) {
          // Keep a partial result only when the first line of this iteration beat the last one.
          if (pvi === 0 && bestMove && lines.length && best > lines[0].score) {
            lines = [{ move: bestMove, score: best, depth: d, pv: bestPv }, ...lines.filter((l) => l.move !== bestMove)].slice(0, multipv);
          }
          break;
        }
        iter.push({ move: bestMove, score: best, depth: d, pv: bestPv });
        excluded.add(bestMove);
      }
      if (stop) break;
      lines = iter;
      reached = d;
      if (Math.abs(lines[0].score) >= MATE - 200 && multipv === 1 && d >= MATE - Math.abs(lines[0].score)) break;
      // A forced reply needs no deep search, but a caller scoring one chosen move does.
      if (root.length === 1 && multipv === 1 && d >= 2 && !opts.only) break;
      if (timeMs > 0 && Date.now() - t0 > timeMs * 0.6) break;
    }
    if (!lines.length) {
      // The clock ran out before depth 1 finished: answer with the first legal move.
      lines = [{ move: root[0], score: 0, depth: 0, pv: [root[0]] }];
    }
    return { lines, nodes, depth: reached, ms: Date.now() - t0 };
  }

  /* Choose a move the way a player of a given level would.
   * cfg: depth, timeMs, mpv, noise (cp), blunder (0-1), wild (0-1), style. */
  function pickMove(pos, cfg, random) {
    const r = random || Math.random;
    const legal = pos.legal();
    if (!legal.length) return { move: 0, score: 0 };
    if (cfg.wild && r() < cfg.wild) return { move: legal[Math.floor(r() * legal.length)], score: 0, kind: 'wild' };
    const blunder = cfg.blunder && r() < cfg.blunder;
    const depth = blunder ? 1 : cfg.depth;
    const res = search(pos, {
      depth,
      timeMs: cfg.timeMs === undefined ? 400 : cfg.timeMs,
      multipv: blunder ? 6 : (cfg.mpv || 1),
      style: cfg.style ? { ...cfg.style, color: pos.side } : null,
    });
    const lines = res.lines;
    const top = lines[0];
    if (Math.abs(top.score) >= MATE - 200 && top.score > 0 && !blunder && !cfg.noise) return { move: top.move, score: top.score };
    const noise = blunder ? 180 : (cfg.noise || 0);
    let best = lines[0], bestV = -Infinity;
    for (const l of lines) {
      const v = l.score + (noise ? (r() * 2 - 1) * noise : 0);
      if (v > bestV) { bestV = v; best = l; }
    }
    return { move: best.move, score: best.score, kind: blunder ? 'blunder' : 'normal', depth: res.depth };
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    let total = 0;
    const buf = new Int32Array(256);
    const n = pos.gen(buf, 0, false);
    const me = pos.side;
    for (let i = 0; i < n; i++) {
      pos.make(buf[i]);
      if (!pos.inCheck(me)) total += perft(pos, depth - 1);
      pos.unmake();
    }
    return total;
  }

  /* Plain-text moves ("1. e4 e5 2. Nf3") from PGN, without tags, comments or variations. */
  function pgnMoves(text) {
    let t = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let depth = 0, out = '';
    for (const c of t) {
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (!depth) out += c;
    }
    return out.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
      .split(/\s+/).filter(Boolean);
  }

  /* The message format shared by the Worker and the main-thread fallback. */
  function runTask(t) {
    const p = new Position(t.fen);
    for (const u of t.moves || []) {
      const m = p.parseUci(u);
      if (!m) break;
      p.make(m);
    }
    if (t.op === 'pick') {
      const r = pickMove(p, t.cfg);
      return { uci: r.move ? p.uci(r.move) : null, san: r.move ? p.san(r.move) : null, score: r.score, kind: r.kind };
    }
    const only = t.only ? t.only.map((u) => p.parseUci(u)).filter(Boolean) : undefined;
    const r = search(p, { ...(t.opts || {}), only });
    return {
      lines: r.lines.map((l) => ({ uci: p.uci(l.move), san: p.san(l.move), score: l.score, depth: l.depth, pv: l.pv.map((x) => p.uci(x)) })),
      depth: r.depth,
      nodes: r.nodes,
    };
  }

  return { Position, search, pickMove, perft, pgnMoves, runTask, sqName, sqParse, MATE, START_FEN };
});
