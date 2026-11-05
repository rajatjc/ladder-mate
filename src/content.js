/* Ladder Mate curriculum. Pure data: no DOM and no engine calls.
 * test/content.test.mjs replays every move here and checks the claims against the
 * engine and the Lichess Syzygy tablebase. Change a position only if that test still passes.
 *
 * Step types:
 *   show    fen, text, arrows, marks              Read and continue.
 *   find    fen, text, ok[], bad{}, why           Play the right move. m = allowed engine margin in cp.
 *   line    moves, as, text                       Play your side of a line; notes sit in {braces}.
 *   demo    fen, moves, text                      Step through a line.
 *   pick    fen, text, options[{x, ok, why}]      Multiple choice. tb = expected tablebase verdict.
 *   squares fen, text, ans[], any, why            Click the square or squares.
 *   walk    fen, text                             Capture every target; the targets stay still.
 *   trial   fen, text, goal, par, why             Play it out against the engine.
 *   drill   themes[], n, text                     Rated Lichess puzzles on a theme.
 */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C;
  root.LMContent = C;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* tac is the puzzle rating needed to leave the class. The scale is Lichess puzzle rating,
   * which runs ahead of playing rating, so these are training targets and nothing official. */
  const CLASSES = [
    { id: 'N', name: 'Novice', floor: 400, motto: 'Learn how the pieces move', tac: 1000 },
    { id: 'F', name: 'Class F', floor: 800, motto: 'Stop giving pieces away', tac: 1200 },
    { id: 'E', name: 'Class E', floor: 1000, motto: 'See one move deeper', tac: 1400 },
    { id: 'D', name: 'Class D', floor: 1200, motto: 'Force the issue', tac: 1600 },
    { id: 'C', name: 'Class C', floor: 1400, motto: 'Calculate, then move', tac: 1800 },
    { id: 'B', name: 'Class B', floor: 1600, motto: 'Play with a plan', tac: 2000 },
    { id: 'A', name: 'Class A', floor: 1800, motto: 'Convert what you win', tac: 2250 },
    { id: 'X', name: 'Expert', floor: 2000, motto: 'You reached the top of the ladder', tac: null },
  ];

  /* cfg is passed to the engine's pickMove. rating is an estimate. Each cfg is tuned so the bot's
   * tactical level on human-rated puzzles matches the tactics gate of the class it guards.
   * Check with tools/calibrate_bots.js after changing one. */
  const BOTS = [
    { id: 'milo', cls: 0, name: 'Milo', rating: 750, wins: 1, bio: 'Learned the rules last month. Leaves pieces hanging, so check every capture.',
      cfg: { depth: 1, timeMs: 200, mpv: 6, noise: 220, blunder: 0.35, wild: 0.25 }, book: 0 },
    { id: 'joan', cls: 1, name: 'Trader Joan', rating: 1050, wins: 1, bio: 'Swaps every piece on sight and hopes for an endgame. Keep your pieces defended and win the ending.',
      cfg: { depth: 1, timeMs: 200, mpv: 6, noise: 170, blunder: 0.24, wild: 0.15, style: { trade: 2 } }, book: 2 },
    { id: 'kaz', cls: 2, name: 'Coffeehouse Kaz', rating: 1250, wins: 1, bio: 'Throws everything at your king and sets cheap traps. Defend calmly and count the attackers.',
      cfg: { depth: 2, timeMs: 250, mpv: 5, noise: 150, blunder: 0.22, wild: 0.11, style: { attack: 3 } }, book: 4 },
    { id: 'priya', cls: 3, name: 'Priya the Wall', rating: 1450, wins: 1, bio: 'Rarely hangs anything simple. You need a real plan to break through.',
      cfg: { depth: 2, timeMs: 250, mpv: 5, noise: 90, blunder: 0.15, wild: 0.05 }, book: 6 },
    { id: 'vise', cls: 4, name: 'Dr. Vise', rating: 1650, wins: 1, bio: 'Takes small edges and squeezes. Trades into endings that are slightly better, then grinds.',
      cfg: { depth: 3, timeMs: 300, mpv: 4, noise: 80, blunder: 0.14, wild: 0.03, style: { trade: 1 } }, book: 8 },
    { id: 'sasha', cls: 5, name: 'Sasha Blitz', rating: 1850, wins: 2, bio: 'Calculates sharply and punishes loose pieces. Beat them once with each colour.',
      cfg: { depth: 4, timeMs: 350, mpv: 4, noise: 70, blunder: 0.1, wild: 0.02, style: { attack: 2 } }, book: 10 },
    { id: 'arbiter', cls: 6, name: 'The Arbiter', rating: 2050, wins: 2, bio: 'The last gate before Expert. Beat it once with each colour.',
      cfg: { depth: 5, timeMs: 500, mpv: 3, noise: 25, blunder: 0.03 }, book: 14 },
  ];

  /* Every tag the puzzle data carries that the game names to the player. */
  const THEMES = {
    fork: ['Fork', 'One piece attacks two things at once.'],
    pin: ['Pin', 'A piece cannot move without exposing something more valuable behind it.'],
    skewer: ['Skewer', 'A valuable piece is attacked, moves, and the piece behind it falls.'],
    discoveredAttack: ['Discovered attack', 'Moving one piece unveils an attack from another.'],
    discoveredCheck: ['Discovered check', 'Moving one piece unveils check, so the moved piece can go anywhere.'],
    doubleCheck: ['Double check', 'Two pieces give check at once, so the king has to move.'],
    deflection: ['Deflection', 'Force a defender away from the thing it guards.'],
    attraction: ['Attraction', 'Force an enemy piece onto a square where it falls to a tactic.'],
    sacrifice: ['Sacrifice', 'Give up material now for a bigger gain or a mating attack.'],
    hangingPiece: ['Hanging piece', 'A piece with no defender can be taken for free.'],
    trappedPiece: ['Trapped piece', 'A piece has no safe square left to run to.'],
    capturingDefender: ['Remove the defender', 'Capture the piece that protects your real target.'],
    clearance: ['Clearance', 'Vacate a square or line so another piece can use it.'],
    interference: ['Interference', 'Block the line between an enemy piece and what it defends.'],
    intermezzo: ['In-between move', 'Before the expected recapture, play a stronger forcing move.'],
    xRayAttack: ['X-ray', 'A piece attacks or defends through another piece on the same line.'],
    quietMove: ['Quiet move', 'The winning move is neither a check nor a capture.'],
    defensiveMove: ['Defensive move', 'The best move stops the threat and keeps your advantage.'],
    zugzwang: ['Zugzwang', 'Any move makes the opponent’s position worse.'],
    promotion: ['Promotion', 'Get a pawn to the last rank.'],
    advancedPawn: ['Advanced pawn', 'A pawn near promotion ties down the whole enemy army.'],
    underPromotion: ['Underpromotion', 'Promote to a knight, bishop or rook because a queen is worse.'],
    enPassant: ['En passant', 'Capture a pawn that has just jumped past yours.'],
    castling: ['Castling', 'Castling is the strongest move here.'],
    attackingF2F7: ['Attack on f2 or f7', 'The square next to the king is guarded only by the king.'],
    kingsideAttack: ['Kingside attack', 'Pieces converge on the castled king.'],
    queensideAttack: ['Queenside attack', 'Pieces converge on a king on the queenside.'],
    exposedKing: ['Exposed king', 'A king without pawn cover falls to checks.'],
    mate: ['Mate', 'The line ends in checkmate.'],
    mateIn1: ['Mate in 1', 'One move ends the game.'],
    mateIn2: ['Mate in 2', 'A forcing first move leaves one mate.'],
    mateIn3: ['Mate in 3', 'A forced three-move mate.'],
    mateIn4: ['Mate in 4', 'A forced four-move mate.'],
    mateIn5: ['Mate in 5', 'A forced mate in five or more.'],
    backRankMate: ['Back-rank mate', 'A rook or queen mates a king shut in by its own pawns.'],
    smotheredMate: ['Smothered mate', 'A knight mates a king boxed in by its own pieces.'],
    anastasiaMate: ['Anastasia’s mate', 'A knight and rook trap the king against the side of the board.'],
    arabianMate: ['Arabian mate', 'A rook and knight mate a king in the corner.'],
    hookMate: ['Hook mate', 'A rook, knight and pawn combine against the king.'],
    bodenMate: ['Boden’s mate', 'Two bishops on crossing diagonals mate the king.'],
    doubleBishopMate: ['Double bishop mate', 'Two bishops mate on adjacent diagonals.'],
    dovetailMate: ['Dovetail mate', 'A queen mates next to the king while its own pieces block its escape.'],
    epauletteMate: ['Epaulette mate', 'The king’s own rooks flank it and block both escape squares.'],
    killBoxMate: ['Kill box mate', 'A rook and queen box the king on the edge.'],
    vukovicMate: ['Vuković mate', 'A rook, knight and advanced pawn mate on the edge.'],
    operaMate: ['Opera mate', 'A rook mates on the back rank with a bishop guarding it.'],
    pillsburysMate: ['Pillsbury’s mate', 'A rook and bishop mate along the g-file.'],
    morphysMate: ['Morphy’s mate', 'A bishop mates while a rook seals the g-file.'],
    triangleMate: ['Triangle mate', 'A queen and rook form a triangle around the king.'],
    swallowstailMate: ['Swallow’s tail', 'A queen mates a king whose own rooks block its escape.'],
    cornerMate: ['Corner mate', 'A rook and knight mate a king in the corner.'],
    balestraMate: ['Balestra mate', 'A bishop gives mate while the queen covers the escapes.'],
    rookEndgame: ['Rook ending', 'Activity usually matters more than a pawn.'],
    pawnEndgame: ['Pawn ending', 'Every tempo counts, and the king is a fighting piece.'],
    bishopEndgame: ['Bishop ending', 'Square colours decide what can be attacked.'],
    knightEndgame: ['Knight ending', 'Knights fork at short range and struggle against far-apart pawns.'],
    queenEndgame: ['Queen ending', 'Perpetual check is always in the air.'],
    queenRookEndgame: ['Queen and rook ending', 'Heavy pieces on open lines hunt the king.'],
    opening: ['Opening', 'The tactic comes straight out of the opening.'],
    middlegame: ['Middlegame', ''],
    endgame: ['Endgame', ''],
  };
  /* Same order as tools/build_puzzles.py: this is the decoding key for the data. */
  const THEME_ORDER = ('fork pin skewer discoveredAttack discoveredCheck doubleCheck deflection attraction sacrifice ' +
    'hangingPiece trappedPiece capturingDefender clearance interference intermezzo xRayAttack quietMove ' +
    'defensiveMove zugzwang promotion advancedPawn underPromotion enPassant castling attackingF2F7 ' +
    'kingsideAttack queensideAttack exposedKing mate mateIn1 mateIn2 mateIn3 mateIn4 mateIn5 ' +
    'backRankMate smotheredMate anastasiaMate arabianMate hookMate bodenMate doubleBishopMate dovetailMate ' +
    'epauletteMate killBoxMate vukovicMate operaMate pillsburysMate morphysMate triangleMate swallowstailMate ' +
    'cornerMate balestraMate rookEndgame pawnEndgame bishopEndgame knightEndgame queenEndgame queenRookEndgame ' +
    'opening middlegame endgame').split(' ');

  const show = (fen, text, extra) => ({ t: 'show', fen, text, ...extra });
  const find = (fen, text, ok, why, extra) => ({ t: 'find', fen, text, ok, why, ...extra });
  const line = (as, text, moves, extra) => ({ t: 'line', as, text, moves, ...extra });
  const demo = (fen, text, moves, extra) => ({ t: 'demo', fen, text, moves, ...extra });
  const pick = (fen, text, options, extra) => ({ t: 'pick', fen, text, options, ...extra });
  const squares = (fen, text, ans, why, extra) => ({ t: 'squares', fen, text, ans, why, ...extra });
  const walk = (fen, text) => ({ t: 'walk', fen, text });
  const trial = (fen, text, goal, par, why, extra) => ({ t: 'trial', fen, text, goal, par, why, ...extra });
  const drill = (themes, n, text) => ({ t: 'drill', themes, n, text });

  const L = (id, cls, track, title, summary, steps) => ({ id, cls, track, title, summary, steps });

  const LESSONS = [
    /* ================= Novice: the rules ================= */
    L('n-board', 0, 'rules', 'The board', 'Files, ranks and square names.', [
      squares(START, 'Every square has a name: a letter for the file (a to h, left to right from White’s side) and a number for the rank (1 to 8). White’s king starts on e1. Click e4, the square most games fight over first.', ['e4'], 'File e, rank 4.'),
      squares(START, 'Click d5.', ['d5'], 'File d, rank 5. Coaches and books name every move this way, so this skill pays you back forever.'),
      squares(START, 'Click a8, the far corner on White’s left.', ['a8'], 'Each player has a light square in the right-hand corner. Set your board up that way.'),
    ]),
    L('n-rook', 0, 'rules', 'The rook', 'Straight lines, as far as it likes.', [
      walk('8/2p5/8/8/5p2/8/2R2p2/8 w - - 0 1', 'The rook moves in straight lines, any distance, and it cannot jump. It captures whatever it lands on. Take all three pawns. They will stay still.'),
    ]),
    L('n-bishop', 0, 'rules', 'The bishop', 'Diagonals, and only one colour.', [
      walk('8/6p1/8/4p3/8/2B5/8/p7 w - - 0 1', 'The bishop moves diagonally any distance. It stays on the colour it started on for the whole game, so all these targets sit on dark squares.'),
    ]),
    L('n-queen-king', 0, 'rules', 'The queen and the king', 'The strongest piece and the one you must protect.', [
      walk('1p6/8/8/5p2/8/1Q6/8/5p2 w - - 0 1', 'The queen combines the rook and the bishop, so it moves in any straight line or diagonal. Take all three pawns.'),
      walk('8/8/8/4p1p1/4K3/8/8/8 w - - 0 1', 'The king moves one square in any direction, and it can never step onto an attacked square. Pawns attack diagonally forward, so f4 is off limits here. Capture both pawns.'),
    ]),
    L('n-knight', 0, 'rules', 'The knight', 'The only piece that jumps.', [
      walk('8/8/3p4/1p6/8/2N5/4p3/8 w - - 0 1', 'The knight moves in an L: two squares one way, one square to the side. It jumps over anything in its path. Take the three pawns.'),
    ]),
    L('n-pawn', 0, 'rules', 'The pawn', 'Forward to move, diagonal to capture.', [
      find('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'A pawn moves one square forward, or two from its starting square. Push this pawn two squares.', ['e4'], 'Pawns never move backward, so every push is a commitment.'),
      find('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'A pawn captures one square diagonally forward. Take the black pawn.', ['exd5'], 'It moves straight and captures on the diagonal. No other piece does this.'),
      pick('4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1', 'Can the white pawn on e4 move?', [
        { x: 'No, the black pawn blocks it', ok: true, why: 'Pawns cannot capture straight ahead, so two pawns facing each other are stuck.' },
        { x: 'Yes, it can capture e5', ok: false, why: 'Pawns capture diagonally only. The square directly ahead has to be empty.' },
      ]),
      find('8/4P2k/8/8/8/8/8/4K3 w - - 0 1', 'A pawn that reaches the last rank promotes into a queen, rook, bishop or knight. Promote this pawn to a queen.', ['e8=Q'], 'A second queen usually ends the game, which is why passed pawns matter so much.'),
    ]),
    L('n-check', 0, 'rules', 'Check and checkmate', 'How the game ends.', [
      find('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Check means the king is attacked. Give check with your rook.', ['Ra8+'], 'Black has to respond at once. Nothing else is allowed.'),
      find('4r2k/8/8/8/8/8/3P1P2/4K3 w - - 0 1', 'You are in check. There are three ways out: move the king, block, or capture the attacker. Only one works here, so move the king to a safe square.', ['Kd1', 'Kf1'], 'Ke2 would stay on the rook’s file, so it is illegal.'),
      find('4r2k/8/8/8/8/8/PP3PPP/R1B1KB1R w - - 0 1', 'Block the check with a bishop.', ['Be2', 'Be3'], 'A blocking piece stands between the attacker and your king.'),
      find('4r2k/8/3N4/8/8/8/PP3PPP/R3KB1R w - - 0 1', 'Capture the piece giving check.', ['Nxe8'], 'Capturing the attacker is often the best answer of the three.'),
      find('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Checkmate is check with no way out. Play it.', ['Ra8#'], 'The king cannot move, nothing can block, and nothing can capture the rook. The game is over.'),
      drill(['mateIn1'], 5, 'Now do it in real positions. Each of these is mate in one, taken from a real game.'),
    ]),
    L('n-special', 0, 'rules', 'Castling, en passant, draws', 'The rules people forget.', [
      find('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', 'Castling moves the king two squares toward a rook and puts the rook beside it. It tucks your king away and activates the rook. Castle kingside: drag your king to g1.', ['O-O'], 'Castle early in nearly every game.'),
      pick('4k3/8/8/2b5/8/8/8/4K2R w K - 0 1', 'White’s king and rook have never moved. Can White castle kingside here?', [
        { x: 'No, the bishop attacks g1', ok: true, why: 'The king cannot castle out of check, through check, or into check. The bishop covers g1.' },
        { x: 'Yes', ok: false, why: 'The bishop on c5 attacks g1 along the diagonal, and the king cannot castle onto an attacked square.' },
      ]),
      find('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1', 'White’s pawn just jumped two squares and landed beside yours. You may capture it as if it had moved one square. This is en passant, and you can only do it right away. Take it.', ['dxe3'], 'Your pawn lands on e3 and the white pawn leaves the board.'),
      pick('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'Black to move. What is the result?', [
        { x: 'Stalemate: a draw', ok: true, why: 'Black is not in check and has no legal move. That is a draw, and it throws away many won games.' },
        { x: 'Checkmate: White wins', ok: false, why: 'The king is not attacked right now, so it is not mate. With no legal move, it is stalemate.' },
      ]),
    ]),
    L('n-value', 0, 'rules', 'What pieces are worth', 'Pawn 1, knight 3, bishop 3, rook 5, queen 9.', [
      pick('6k1/5ppp/5r2/8/8/2B5/5PPP/6K1 w - - 0 1', 'Pawn 1, knight 3, bishop 3, rook 5, queen 9. Your bishop can take the rook on f6, and the g7 pawn recaptures. Is that good for you?', [
        { x: 'Yes, I give 3 and win 5', ok: true, why: 'This is called winning the exchange. Add up what leaves the board on each side.' },
        { x: 'No, I lose my bishop', ok: false, why: 'You do lose the bishop, but you take a rook for it. 5 beats 3.' },
      ]),
      find(START, 'Moves are written with a piece letter and a square: Nf3 means a knight goes to f3. N is knight, B bishop, R rook, Q queen, K king, and pawns get no letter. Play Nf3.', ['Nf3'], 'A capture adds an x: Nxe5. Check adds +, and mate adds #.'),
    ]),

    /* ================= Class F ================= */
    L('f-free', 1, 'motifs', 'Free pieces', 'Most games below 1000 are decided by a piece left undefended.', [
      show('rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'Black’s knight just attacked your pawn on e4. Ask this after every enemy move: what did that move attack, and what did it stop defending?', { marks: ['e4'], arrows: [['f6', 'e4']] }),
      drill(['hangingPiece'], 6, 'A piece is hanging when nothing defends it. Find the free material. It is usually one move.'),
    ]),
    L('f-mate', 1, 'motifs', 'Back-rank and one-move mates', 'Check for mate first.', [
      show('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Black’s own pawns trap the king on the back rank. Rd8 is mate. Look for this picture in every game, and on your own side too. A pawn move like h3 gives your king an escape square.', { arrows: [['d1', 'd8']] }),
      drill(['mateIn1', 'backRankMate'], 6, 'Scan for checks first. A mate ends the discussion.'),
    ]),
    L('f-fork', 1, 'motifs', 'Forks', 'One piece, two targets.', [
      find('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'Knights fork best. Find the square that attacks the king and the rook at once.', ['Nc7+'], 'Black must move the king, and you take the rook.'),
      drill(['fork'], 6, 'Look for two loose or valuable targets a knight’s jump apart. Queens and pawns fork too.'),
    ]),
    L('f-ladder', 1, 'technique', 'The ladder mate', 'The first mate everyone learns, and this game’s name.', [
      show('8/8/8/3k4/8/8/R7/1R2K3 w - - 0 1', 'Two rooks mate without any help. One rook guards a rank to stop the king coming back. The other checks on the next rank up. Then they swap roles and climb.', { arrows: [['a2', 'a5'], ['b1', 'b4']] }),
      trial('8/8/8/3k4/8/8/R7/1R2K3 w - - 0 1', 'Mate the king using the ladder. Walk the rooks up the board one rank at a time. If the king attacks a rook, slide that rook to the far side.', 'mate', 12, 'You drove the king to the edge with a wall that never let it back. This wall idea appears in every rook ending.'),
    ]),
    L('f-kqk', 1, 'technique', 'King and queen mate', 'A won ending you must not stalemate.', [
      show('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'Stay a knight’s move from the enemy king with your queen. That shrinks its box without giving check. When it reaches the edge, bring your own king in, and check only for mate.', { arrows: [['d1', 'd3']] }),
      trial('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'Mate within the par. A queen alone cannot mate, so your king has to come. If the enemy king has no legal move and is not in check, you have thrown away the win.', 'mate', 14, 'You shrank the box and brought the king. Practise until this takes no thought at all.'),
    ]),
    L('f-krk', 1, 'technique', 'King and rook mate', 'The most common basic ending.', [
      show('8/8/8/4k3/8/4K3/8/R7 w - - 0 1', 'Use your king to take the opposition, facing the enemy king with one square between. Then the rook checks along the edge side and the king must retreat. If the kings do not face each other, make a waiting move with the rook.', { arrows: [['a1', 'a4']] }),
      trial('8/8/8/4k3/8/8/8/R3K3 w - - 0 1', 'Mate within the par. A rook needs its king more than a queen does, so bring the king up first.', 'mate', 22, 'Opposition plus a rook check pushes the king back one rank every time.'),
    ]),
    L('f-principles', 1, 'strategy', 'Opening principles', 'Centre, development, king safety.', [
      find('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Bring a piece out toward the centre.', ['Nf3', 'Nc3', 'Bc4'], 'Develop knights and bishops first. Nf3 also attacks e5, so it gains time.', { bad: { Qh5: 'Early queens get chased, and every chase move develops the other side.', Qf3: 'This takes the knight’s best square and exposes the queen.', a3: 'This does nothing for the centre or for your pieces.', h3: 'This spends a move without developing anything.' }, m: 90 }),
      find('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 'You are Black. White threatens Qxf7, which is mate. Stop it.', ['g6', 'Qe7', 'Qf6'], 'The f7 pawn is guarded only by the king, which makes it your weakest square in the opening. After ...g6 the queen is also attacked.', { bad: { Nf6: 'This attacks the queen but loses at once to Qxf7#. Check for mate before you attack anything.' }, m: 120 }),
      find('r1bqkbnr/pppp1p1p/2n3p1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 1 4', 'White repeats the threat on f7. Block it with a move that also develops a piece.', ['Nf6'], 'One move solves the threat and develops. White’s early queen now stands in the way of the g1 knight.', { m: 80 }),
      find('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5', 'You have developed two pieces, and the centre is about to open. Make your king safe.', ['O-O'], 'Your king is safer, and your rook is closer to the centre. Do this before the first fight starts.', { m: 90 }),
    ]),
    L('f-count', 1, 'strategy', 'Count attackers and defenders', 'Know whether a capture is safe before you play it.', [
      pick('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'Your knight attacks e5. Is Nxe5 a free pawn?', [
        { x: 'No, the knight on c6 recaptures', ok: true, why: 'One attacker and one defender. Nxe5 Nxe5 gives a knight for a pawn. Count before you capture.' },
        { x: 'Yes, take it', ok: false, why: 'After Nxe5 Nxe5 you have lost 3 points and won 1.' },
      ]),
      find('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'You are Black, and your e5 pawn is attacked. Defend it.', ['Nc6', 'd6', 'Nf6'], 'Nc6 is the cleanest because it develops as it defends. ...Nf6 counterattacks e4 instead.', { bad: { f6: 'This defends the pawn but opens your king: Nxe5! fxe5 Qh5+ is a winning attack.', Qf6: 'This puts the queen on your knight’s best square.', Bd6: 'This defends, but it blocks your d-pawn and your c8 bishop.' }, m: 90 }),
      find('4k1n1/pp6/4p3/3p4/2P5/2N5/PP6/4K3 w - - 0 1', 'You attack d5 twice, and Black defends once. Win the pawn, and start with the right piece.', ['cxd5'], 'Lead with your cheapest attacker. cxd5 exd5 Nxd5 wins a clean pawn and keeps your knight.', { bad: { Nxd5: 'Starting with the knight costs you: Nxd5 exd5 cxd5 gives 3 points for two pawns.' } }),
    ]),
    L('f-habit', 1, 'strategy', 'The blunder check', 'A ten-second habit worth hundreds of points.', [
      squares('rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'Black just played ...Nf6. What does that knight attack? Click the piece it threatens to take.', ['e4'], 'Before every move, ask what the opponent’s last move changed.'),
      find('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'You are Black. White has opened the diagonal to the king with two pawn moves. Punish it.', ['Qh4#'], 'This is the fastest mate in chess. Pawn moves near your own king carry a real price.'),
      find('rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3', 'Your queen is attacked. Move it somewhere safe.', ['Qa5', 'Qd8', 'Qd6', 'Qe5+', 'Qe6+'], 'Before you let go of a piece, check every square it lands on. Is it attacked? Is it defended?', { bad: { Qc4: 'The bishop on f1 takes it.', Qxg2: 'The bishop on f1 takes it.', Qc5: 'That square is safe for now, but it walks into d4 and b4 with tempo. Prefer a more stable square.', Qd4: 'The queen in the middle gets hit again by Nf3.' }, m: 180 }),
    ]),
    L('f-italian', 1, 'openings', 'White: the Italian', 'A simple system for your e4 games.', [
      line('w', 'Your first White opening. Play both sides’ logic in your head as you go. The Italian develops quickly and aims at f7.', 'e4 {Claim the centre and open lines for your queen and bishop.} e5 Nf3 {Develop with an attack on e5.} Nc6 Bc4 {The bishop aims at f7, Black’s weakest square.} Bc5 c3 {Prepare d4, or a slower d3 setup.} Nf6 d3 {Hold e4 and keep every piece safe. Slow and solid.} d6 O-O {King safe. Rook closer to the action.} O-O Re1 {Support e4 and clear f1 for the knight.} a6 Nbd2 Ba7 Bb3 {Step back before ...Na5 or ...b5 chases the bishop.} h6 Nf1 {The knight heads for g3 and then f5.}'),
    ]),
    L('f-caro', 1, 'openings', 'Black: the Caro-Kann', 'A solid answer to e4, built on c6 and d5.', [
      line('b', 'Your Black opening against 1.e4. You challenge the centre with pawns, and your light-squared bishop gets out before ...e6 locks it in.', 'e4 c6 {Prepare ...d5 and keep the c8 bishop’s path open.} d4 d5 {Hit the centre at once.} Nc3 dxe4 Nxe4 Bf5 {Develop the bishop with an attack on the knight.} Ng3 Bg6 h4 h6 {Keep a retreat for the bishop on h7.} Nf3 Nd7 {Stops Ne5 and supports ...Ngf6.} h5 Bh7 Bd3 Bxd3 {Trade the bishop. It was your problem piece in many openings.} Qxd3 e6 {Now ...e6 is safe, because the bishop is already gone.}'),
    ]),

    /* ================= Class E ================= */
    L('e-pin', 2, 'motifs', 'Pins', 'A pinned piece is a target.', [
      find('4k3/8/4n3/8/3P4/8/8/4R1K1 w - - 0 1', 'The knight is pinned to the king, so it cannot move. Attack it with a pawn.', ['d5'], 'A pinned piece cannot run. Pile on it with something cheap.'),
      drill(['pin'], 6, 'Look along lines toward kings and queens. Ask what stands in between.'),
    ]),
    L('e-skewer', 2, 'motifs', 'Skewers', 'A pin in reverse.', [
      find('4q3/8/4k3/8/8/8/8/R5K1 w - - 0 1', 'Check the king so that it has to step aside. Your rook then takes the queen behind it.', ['Re1+'], 'The more valuable piece moves first, and the piece behind falls.'),
      drill(['skewer'], 5, 'Look for two pieces on the same line, with the bigger one in front.'),
    ]),
    L('e-discover', 2, 'motifs', 'Discovered attacks', 'Move one piece and two attack.', [
      find('8/4k3/8/3q4/8/8/3B4/3RK3 w - - 0 1', 'Your rook faces the queen with your own bishop between them. Move the bishop with check, and the queen falls.', ['Bb4+'], 'The bishop makes one threat and the rook makes another. Black can only answer the check.', { bad: { 'Bg5+': 'Check, yes, but the queen simply takes the bishop on g5 along the rank.' } }),
      drill(['discoveredAttack', 'discoveredCheck'], 6, 'Look for your own pieces standing on a line that aims at something valuable.'),
    ]),
    L('e-mate2', 2, 'motifs', 'Mate in two', 'Start calculating forcing lines.', [
      drill(['mateIn2'], 8, 'Try every check, including the ugly ones. For each check, ask where the king can go and what you then have.'),
    ]),
    L('e-square', 2, 'technique', 'The square of the pawn', 'Calculate a pawn race in one second.', [
      show('8/8/8/8/P6k/8/8/7K b - - 0 1', 'Draw a square from the pawn to its promotion rank. Here that runs a4, e4, e8, a8. If the defending king can step inside the square on its move, it catches the pawn.', { marks: ['a4', 'e4', 'e8', 'a8'] }),
      pick('8/8/8/8/P6k/8/8/7K b - - 0 1', 'Black to move. Can the king catch the a-pawn?', [
        { x: 'No, it cannot reach the square', ok: true, why: 'From h4 the king reaches the g-file at best, and the square starts on the e-file. White queens.' },
        { x: 'Yes', ok: false, why: 'The square spans a to e. From h4 one step only reaches the g-file.' },
      ], { tb: 'win' }),
      pick('8/8/8/8/P4k2/8/8/7K b - - 0 1', 'Same pawn, but the king is on f4. Black to move. Can it catch the pawn?', [
        { x: 'Yes, ...Ke5 enters the square', ok: true, why: 'The e-file is inside the square, so the king arrives in time.' },
        { x: 'No', ok: false, why: 'One step to e5 puts the king inside the a4-e8 square, and that is enough.' },
      ], { tb: 'draw' }),
      pick('8/8/8/8/P4k2/8/8/7K w - - 0 1', 'The same position, with White to move. Does the king still catch it?', [
        { x: 'No, a5 shrinks the square', ok: true, why: 'After a5 the square runs from a5 to d8. The king needs the d-file, and from f4 it reaches only the e-file.' },
        { x: 'Yes', ok: false, why: 'The pawn moves first, and the square shrinks with it to the a5-d8 box. One king step is not enough.' },
      ], { tb: 'win' }),
    ]),
    L('e-keysq', 2, 'technique', 'King in front of the pawn', 'The king leads and the pawn follows.', [
      show('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', 'A king on the sixth rank in front of its pawn wins whoever moves. Your king clears the way, and the pawn follows. Pushing too early is what loses these endings.'),
      trial('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', 'Win this. Promote the pawn. If you push with your king behind it, Black reaches stalemate.', 'promote', 8, 'Kd6, then push with tempo. The king goes first and the pawn follows.'),
      trial('8/4k3/8/8/4K3/4P3/8/8 w - - 0 1', 'Your king leads again. Get to the key squares in front of your pawn, and promote.', 'promote', 12, 'Ke5 took the key square and the opposition, and the rest was a matter of walking the pawn home.'),
    ]),
    L('e-opposition', 2, 'technique', 'The opposition', 'When kings face off, whoever must move gives way.', [
      show('8/4k3/8/4PK2/8/8/8/8 b - - 0 1', 'Kings facing each other with one square between them are in opposition. The side that has to move gives ground. This one idea decides most pawn endings.', { marks: ['f5', 'f7'] }),
      trial('8/4k3/8/4PK2/8/8/8/8 b - - 0 1', 'You are Black, a pawn down. Draw this. Keep the opposition and do not let the white king past you.', 'hold', 14, 'You took the opposition with ...Kf7 and answered every step. Without it White’s king walks through.'),
    ]),
    L('e-active', 2, 'strategy', 'Active pieces', 'A piece is worth what it can reach.', [
      find('r4rk1/pp3ppp/2n1b3/8/8/2N1B3/PP3PPP/R4RK1 w - - 0 1', 'The d-file has no pawns on it. Put a rook there.', ['Rad1', 'Rfd1'], 'Rooks belong on open files. They need clear lines to attack down.', { m: 70 }),
      find('2r2rk1/pp3ppp/2n1pn2/8/N7/4PN2/PP3PPP/2R2RK1 w - - 0 1', 'Your knight on a4 controls only four squares. Bring it back toward the centre.', ['Nc5', 'Nc3'], 'A knight on the rim controls half what a central one does. Improve your worst piece first.', { m: 70 }),
      find('3r2k1/1p3ppp/p7/8/8/1P5P/P4PP1/2R3K1 w - - 0 1', 'A rook on the seventh rank attacks pawns from behind. Your h3 pawn has given your king an escape square, so you can leave the back rank. Get there.', ['Rc7'], 'It hits b7 and confines the king. Rooks on the seventh win endgames.', { m: 70 }),
    ]),
    L('e-trade', 2, 'strategy', 'When to trade', 'Trade when ahead and avoid it when behind.', [
      find('3r1rk1/5ppp/8/8/8/5N2/5PPP/3R1RK1 w - - 0 1', 'You are a knight up. Simplify.', ['Rxd8'], 'A 3-point edge is small among 30 points of material and huge among 10. Every trade helps the side ahead.', { m: 80 }),
      pick('3r1rk1/5ppp/8/8/8/5N2/5PPP/3R1RK1 b - - 0 1', 'Now take Black’s side, a knight down. Is ...Rxd1 what you want?', [
        { x: 'No, keep pieces on for counterplay', ok: true, why: 'Down material, your chances lie in complications. Every swap brings a lost ending closer.' },
        { x: 'Yes, trades relieve the pressure', ok: false, why: 'Each trade makes White’s extra piece count for more. Trades help the side that is ahead.' },
      ]),
    ]),
    L('e-pawns', 2, 'strategy', 'Pawn vocabulary', 'Passed, isolated and doubled.', [
      squares('6k1/5ppp/8/P7/8/8/5PPP/6K1 w - - 0 1', 'A passed pawn has no enemy pawn in front of it or on the neighbouring files. Click the passed pawn.', ['a5'], 'Nothing but pieces can stop it now, and pieces hate that job.'),
      squares('6k1/pp3ppp/8/8/3P4/8/PP3PPP/6K1 w - - 0 1', 'An isolated pawn has no friendly pawn on a neighbouring file, so no pawn can ever defend it. Click it.', ['d4'], 'Pieces have to defend it, and that ties them down.'),
      squares('6k1/pp3ppp/8/8/8/2P5/P1P2PPP/6K1 w - - 0 1', 'Doubled pawns stand on one file. Click one of them.', ['c2', 'c3'], 'The front pawn blocks the rear one, and neither can guard the other.', { any: true }),
      pick('6k1/pp3ppp/8/8/8/P7/1PP2PPP/6K1 w - - 0 1', 'Where can White create a passed pawn?', [
        { x: 'On the queenside, where three white pawns face two', ok: true, why: 'A pawn majority can always produce a passer, because there are not enough enemy pawns to stop it. Advance the majority together.' },
        { x: 'On the kingside', ok: false, why: 'Three against three makes no passer without help. Count pawns by wing.' },
      ]),
    ]),
    L('e-italian2', 2, 'openings', 'White: Italian, the d4 break', 'The sharper main line, and how the pieces trade.', [
      line('w', 'When Black lets you play d4, take the whole centre.', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 {Now you strike. c3 was for this.} exd4 cxd4 Bb4+ {Black checks to break up your centre.} Bd2 Bxd2+ Nbxd2 d5 {Black must hit the centre before it rolls.} exd5 Nxd5 Qb3 {Pressure on d5 and b7 at once.} Nce7 O-O O-O Rfe1 c6 {You have the isolated d-pawn, with open lines and active pieces. Attack.}'),
    ]),
    L('e-slav', 2, 'openings', 'Black: the Slav', 'The same c6 and d5 plan against 1.d4.', [
      line('b', 'Use the Caro-Kann’s ideas against 1.d4, so you learn one set of plans.', 'd4 d5 {Claim the centre.} c4 c6 {Hold d5 with a pawn and keep the c8 bishop free.} Nf3 Nf6 Nc3 dxc4 {Take on c4, because White has to spend time recovering it.} a4 {Stops ...b5, which would hold the pawn.} Bf5 {The bishop gets out, just as in the Caro-Kann.} e3 e6 Bxc4 Bb4 {Pin the knight and pressure e4.} O-O O-O {A solid position with no bad bishop.}'),
    ]),

    /* ================= Class D ================= */
    L('d-deflect', 3, 'motifs', 'Deflection', 'Pull the defender away.', [
      drill(['deflection'], 7, 'Find what defends the target. Then find a forcing move that makes the defender leave.'),
    ]),
    L('d-attract', 3, 'motifs', 'Attraction', 'Drag a piece onto the wrong square.', [
      drill(['attraction'], 7, 'A sacrifice that forces a capture puts the enemy piece, often the king, where your next move hits it.'),
    ]),
    L('d-defender', 3, 'motifs', 'Remove the defender', 'If it guards the target, capture it.', [
      drill(['capturingDefender'], 6, 'Count defenders of your target. Then ask whether you can capture one of them.'),
    ]),
    L('d-patterns', 3, 'motifs', 'Mating patterns', 'Recognise the picture and the calculation gets short.', [
      drill(['smotheredMate', 'anastasiaMate', 'arabianMate', 'hookMate', 'dovetailMate', 'epauletteMate'], 8, 'Each of these has a named shape. After you solve one, read its name, and try to spot the same shape next time.'),
    ]),
    L('d-rookpawn', 3, 'technique', 'Rook pawns and the wrong bishop', 'Two famous ways to draw when down a lot of material.', [
      pick('7k/8/7K/7P/8/8/8/8 w - - 0 1', 'White has an extra pawn and the better king. Can White win?', [
        { x: 'No, it is a draw', ok: true, why: 'A rook pawn cannot force the king out of the corner. The attacker’s king has no way around it.' },
        { x: 'Yes', ok: false, why: 'Black’s king shuffles h8-g8, and any attempt to push ends in stalemate.' },
      ], { tb: 'draw' }),
      pick('7k/8/8/8/8/3B3P/8/6K1 b - - 0 1', 'White is a bishop and a pawn up. Black’s king sits on h8. Result with best play?', [
        { x: 'A draw: wrong-coloured bishop', ok: true, why: 'The bishop is light-squared and h8 is dark, so it can never drive the king out. Check bishop colour before you trade down to this.' },
        { x: 'White wins', ok: false, why: 'A bishop that does not control the promotion corner cannot evict the king.' },
      ], { tb: 'draw' }),
    ]),
    L('d-qvp', 3, 'technique', 'Queen against a pawn', 'Stop a pawn on the seventh rank.', [
      show('8/8/5K2/8/8/8/1pk5/7Q w - - 0 1', 'Check until the enemy king has to stand in front of its own pawn. That gives you a free move, and you use it to bring your king one step closer. Repeat.'),
      trial('8/8/5K2/8/8/8/1pk5/7Q w - - 0 1', 'Win the pawn and keep your queen. Force the king in front of the pawn, and walk your own king in with the free moves.', 'bare', 24, 'Each time the king blocked the pawn, you gained a tempo. Knight and centre pawns lose this way every time.'),
      trial('8/6K1/8/8/8/8/2pk4/7Q b - - 0 1', 'Now switch sides. You have the c-pawn on the seventh, and White’s king is far away. Hold the draw. Head for the corner: if White takes the pawn, you may be stalemated.', 'hold', 18, 'Bishop and rook pawns on the seventh draw against a distant king, thanks to that stalemate trick.'),
    ]),
    L('d-break', 3, 'technique', 'Pawn breakthrough', 'Three pawns against three can win by force.', [
      trial('7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1', 'Three pawns face three, and the kings are too far away to matter. Find the sacrifice that makes a queen.', 'promote', 8, 'b6! is the key. After axb6 play c6, and after cxb6 play a6. A pawn gets through either way.'),
    ]),
    L('d-outposts', 3, 'strategy', 'Outposts', 'A square no pawn can challenge.', [
      squares('r2q1rk1/pp2bppp/2np1n2/4p3/4P3/2N1BN2/PPP2PPP/R2Q1RK1 w - - 0 1', 'An outpost is a square in enemy territory that no enemy pawn can ever attack. Black’s e-pawn has passed d5, and there is no c-pawn left. Click White’s outpost.', ['d5'], 'A knight on d5 cannot be driven off by a pawn. It stands there for the rest of the game.'),
      find('r2q1rk1/pp2bppp/2np1n2/4p3/4P3/2N1BN2/PPP2PPP/R2Q1RK1 w - - 0 1', 'Occupy it.', ['Nd5'], 'If Black takes, a recapture with the e-pawn gains space and fixes a backward pawn on d6.', { m: 90 }),
      find('r2qr1k1/pp2bppp/2npbn2/4p1B1/4P3/2N2N2/PPP1BPPP/R2Q1RK1 w - - 0 1', 'Two pieces guard d5: the knight on f6 and the bishop on e6. Remove one of the defenders.', ['Bxf6'], 'You give up the bishop to win permanent control of d5. The trade serves a plan, and the plan is worth the price.', { m: 90 }),
    ]),
    L('d-bishops', 3, 'strategy', 'Good and bad bishops', 'Your own pawns decide which one you have.', [
      pick('8/5k2/2n1p3/3pPp2/3P1P2/4K3/5B2/8 w - - 0 1', 'White’s pawns stand on d4, e5 and f4, all dark squares. Is the bishop on f2 good or bad?', [
        { x: 'Bad: its own pawns block it', ok: true, why: 'A bishop on the same colour as its own central pawns defends them and attacks nothing. Black’s pawns on light squares are out of its reach.' },
        { x: 'Good: it protects the pawns', ok: false, why: 'It protects them, but it has no targets, because Black’s pawns sit on light squares. Defending is all it can do.' },
      ]),
      find('rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3', 'You are Black, and you will want ...e6 soon. That move shuts in the c8 bishop, so get it out first.', ['Bf5'], 'Get the bishop outside the pawn chain before you close it. This is the whole point of the Caro-Kann.', { m: 80 }),
    ]),
    L('d-weak', 3, 'strategy', 'Holes and backward pawns', 'Pawns cannot go back, so their squares stay weak.', [
      squares('r1bq1rk1/ppp2p2/2np1n1p/2b1p1p1/2B1P3/2NP1NB1/PPP2PPP/R2Q1RK1 w - - 0 1', 'Black has pushed ...h6 and ...g5. Click a square near the king that no black pawn can ever defend again.', ['f5', 'h5'], 'Those squares are holes now. A knight will settle on f5, and no pawn can kick it. Think twice before pushing pawns in front of your king.', { any: true }),
      pick('r2q1rk1/pp2bppp/2np1n2/4p3/4P3/1NN1B3/PPP2PPP/R2Q1RK1 w - - 0 1', 'Which black pawn is backward?', [
        { x: 'd6', ok: true, why: 'It sits on a half-open file, its neighbours have moved past it, and pushing it just loses it. Attack it with Rd2 and Rfd1.' },
        { x: 'e5', ok: false, why: 'The e5 pawn is ahead of its neighbour and defended by d6. The base of that pair is the weak one.' },
        { x: 'b7', ok: false, why: 'The b7 pawn is still free to advance, and the a-pawn can support it.' },
      ]),
    ]),
    L('d-advance', 3, 'openings', 'White: meet the Sicilian and Caro', 'Simple answers to the replies you will meet most.', [
      line('w', 'Against the Sicilian, 2.c3 builds a big centre and avoids mountains of theory.', 'e4 c5 c3 {Prepare d4. You take the game out of Sicilian theory.} d5 exd5 Qxd5 d4 {Black’s queen is out early, and you build your centre.} Nf6 Nf3 e6 Be2 {Modest. You castle before you start anything.} Nc6 O-O cxd4 cxd4 Be7 Nc3 {Now the knight comes with a gain of time on the queen.}'),
      line('w', 'Against the Caro-Kann, the Advance takes space and starts a long fight.', 'e4 c6 d4 d5 e5 {Take space and shut in Black’s position.} Bf5 Nf3 e6 Be2 c5 Be3 {Back up d4, the target of ...c5.} Nd7 O-O {You keep a space edge and an easy plan with c4 or Nbd2.}'),
    ]),
    L('d-caro2', 3, 'openings', 'Black: Caro-Kann, Advance and Exchange', 'What to do when White closes or trades.', [
      line('b', 'In the Advance, attack the base of White’s chain with ...c5.', 'e4 c6 d4 d5 e5 Bf5 {Outside the chain before ...e6.} Nf3 e6 Be2 c5 {Hit the chain at its base. That is your plan in every closed centre.} Be3 cxd4 Nxd4 Ne7 {The knight heads for c6 to challenge White’s centre.} O-O Nbc6'),
      line('b', 'In the Exchange, Black develops freely. Use the bishop before ...e6.', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 {Develop outside before ...e6.} Qb3 Qd7 {Defend b7 and connect your pieces.} Nd2 e6 Ngf3 Bxf3 {Give the bishop for a knight when it helps you finish development.} Nxf3 Bd6 {A comfortable, equal game.}'),
    ]),
    L('d-traps', 3, 'openings', 'Four traps everyone should know', 'Set them, and avoid them.', [
      demo('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Légal’s mate. White gives up the queen and mates in two moves if Black takes it.', 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 {Too slow, and now the pin is not real.} Nxe5 {The queen hangs, but look at the follow-up.} Bxd1 Bxf7+ Ke7 Nd5# {Three minor pieces mate. Never grab a queen without checking the reply.}'),
      demo('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'The Blackburne Shilling. Black offers a pawn, and greedy White loses fast.', 'e4 e5 Nf3 Nc6 Bc4 Nd4 {A bad move that sets a nasty trap.} Nxe5 {Greedy. Nxd4 or c3 is good for White.} Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3# {A smothered mate with the king boxed in by its own pieces.}'),
      demo('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'The Elephant Trap in the Queen’s Gambit. The pin on the knight is not what it looks like.', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 {It looks like the f6 knight is pinned.} Nxd5 Bxd8 Bb4+ {The in-between check is the point.} Qd2 Bxd2+ Kxd2 Kxd8 {Black has won a piece for a pawn.}'),
      demo('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'A Caro-Kann trap you must avoid as Black. Natural development gets you smothered.', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 {A quiet-looking trap.} Ngf6 Nd6# {The knight is immune because the e7 pawn is pinned. The king has no squares. Five moves of normal-looking chess and it is over.}'),
    ]),

    /* ================= Class C ================= */
    L('c-intermezzo', 4, 'motifs', 'The in-between move', 'Recaptures are not forced.', [
      drill(['intermezzo'], 8, 'Before you recapture, ask if you have a check or a bigger threat first.'),
    ]),
    L('c-lines', 4, 'motifs', 'X-rays and clearance', 'Think in lines, through the pieces.', [
      drill(['xRayAttack', 'clearance'], 8, 'Your piece may be working through another piece, or a piece may need to vacate its square for the real blow.'),
    ]),
    L('c-interfere', 4, 'motifs', 'Interference', 'Cut the line between defender and target.', [
      drill(['interference'], 6, 'Enemy pieces defend along lines. Put something on that line, even if it gets captured.'),
    ]),
    L('c-attack', 4, 'motifs', 'Sacrifices on the king', 'Calculate to the end, then sacrifice.', [
      drill(['exposedKing', 'mateIn3', 'attackingF2F7'], 8, 'List forcing moves in order: checks, then captures, then threats. Follow each one until the position goes quiet.'),
    ]),
    L('c-lucena', 4, 'technique', 'The Lucena position', 'The winning method in rook and pawn endings.', [
      demo('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'Your pawn is on the seventh, and your king is stuck in front of it. Build a bridge so the king can come out and shelter from checks.', 'Rd1+ {Push the enemy king one file further away.} Ke7 Rd4 {The key move. The rook goes to the fourth rank to build the bridge.} Ra1 Kc7 {Now the king steps out.} Rc1+ Kb6 Rb1+ Kc6 Rc1+ Kb5 Rb1+ Rb4 {The bridge. The checks are over, and the pawn queens.}'),
      trial('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'Now win it yourself against best defence. Promote the pawn safely.', 'promote', 14, 'You built the bridge. Remember the order: check first, then the rook to the fourth rank, then the king out.'),
    ]),
    L('c-philidor', 4, 'technique', 'The Philidor defence', 'The drawing method every player needs.', [
      demo('4k3/R7/8/3KP3/8/8/8/6r1 b - - 0 1', 'You are a pawn down with your king in front of it. Put your rook on the sixth rank, and wait until the pawn advances.', 'Rg6 {The rook holds the third rank from White’s side. The white king cannot advance.} Ra8+ Kf7 Ra7+ Ke8 e6 {White has to push to make progress.} Rg1 {Now drop the rook far back and check from behind. The pawn gives the white king no shelter.}'),
      trial('4k3/R7/8/3KP3/8/8/8/6r1 b - - 0 1', 'You are Black. Hold the draw for the full count. Keep the rook on the sixth until the pawn moves, then go to the first rank and check forever.', 'hold', 25, 'You kept the king in front of the pawn, waited on the sixth, then checked from behind. That is a book draw you can now play at speed.'),
    ]),
    L('c-rookbehind', 4, 'technique', 'Rooks behind passed pawns', 'Tarrasch’s rule.', [
      find('1r6/5pk1/6p1/1P6/8/6P1/5PK1/3R4 w - - 0 1', 'Your rook belongs behind your passed pawn. Put it there.', ['Rb1'], 'From behind, the rook gains scope with every pawn push. Black’s rook in front gets more passive with every step.', { m: 90 }),
      pick('1R6/1P3pk1/6p1/8/8/6P1/1r3PK1/8 w - - 0 1', 'Compare the rooks. White’s stands in front of the b-pawn, and Black’s stands behind it. Which is better placed?', [
        { x: 'Black’s, behind the pawn', ok: true, why: 'White’s rook is stuck on b8 as long as the pawn needs it. Black’s rook stays free to move along the file, and the white king has to find shelter from its checks.' },
        { x: 'White’s, because it protects the promotion square', ok: false, why: 'It does guard b8, but it cannot move without giving up the pawn. Passive rooks lose endings.' },
      ]),
    ]),
    L('c-passed', 4, 'strategy', 'Passed pawns', 'Passed pawns must be pushed.', [
      find('8/5pk1/6p1/P7/8/6P1/5PK1/8 w - - 0 1', 'Your passed pawn is free. Push it. Black’s king now has to leave the kingside.', ['a6'], 'Each step takes more squares from the defender. Pushing also creates room for your king to go after the other wing.', { m: 90 }),
      pick('6k1/5ppp/8/8/8/2n2P2/1P3KPP/8 w - - 0 1', 'Which piece makes the best blocker for an enemy passed pawn?', [
        { x: 'A knight', ok: true, why: 'A knight keeps all its range while it blockades. A rook or queen loses most of its power standing in front of a pawn.' },
        { x: 'A rook', ok: false, why: 'The rook wastes most of its scope on blockading. Use your cheapest effective blocker, and a knight keeps its full range.' },
      ]),
    ]),
    L('c-iqp', 4, 'strategy', 'The isolated queen pawn', 'Dynamic in the middlegame, weak in the ending.', [
      pick('r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 1', 'White has an isolated pawn on d4. What should White aim for?', [
        { x: 'Attack the kingside, using e5 and open lines', ok: true, why: 'The pawn gives you space, a knight outpost on e5 and freer pieces. Use them before the pawn’s weakness tells.' },
        { x: 'Trade pieces into an ending', ok: false, why: 'That is what Black wants. In a simplified position the pawn is only a weakness.' },
      ]),
      pick('r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQR1K1 b - - 0 1', 'Now take Black’s side, against the isolated pawn. What is your plan?', [
        { x: 'Keep a piece on d5 and trade off White’s attackers', ok: true, why: 'A blockader on d5 stops the pawn from ever moving, and each trade reduces White’s attack and brings the weak pawn closer to falling.' },
        { x: 'Attack on the kingside with pawn pushes', ok: false, why: 'This opens your own king while White’s pieces are the active ones. Your edge is long-term, so play for it.' },
      ]),
    ]),
    L('c-doubled', 4, 'strategy', 'Pawn levers', 'Open the position where you want it open.', [
      pick('r1bqkb1r/pp3ppp/2n1pn2/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R b KQkq - 0 6', 'You are Black, in a French-style structure. Which pawn break is your plan?', [
        { x: '...c5 and ...f6, against d4 and e5', ok: true, why: 'Pawns are attacked from their base and from the side. ...c5 hits d4, and ...f6 hits e5. Every closed centre has its levers.' },
        { x: '...a5 and ...h5', ok: false, why: 'Those pushes do not challenge White’s centre. Find the pawn breaks that touch the chain.' },
      ]),
    ]),
    L('c-panov', 4, 'openings', 'Black: Panov Attack', 'Play against the isolated pawn.', [
      line('b', 'Your Caro-Kann can reach an isolated pawn position. Now you know what to do with it.', 'e4 c6 d4 d5 exd5 cxd5 c4 {The Panov. White accepts an isolated d-pawn for activity.} Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 {Your knight lands on the blockade square.} Bd3 Nc6 O-O O-O Re1 Bf6 {Pressure on d4, the pawn that cannot be defended by another pawn.}'),
    ]),
    L('c-french', 4, 'openings', 'White: French and Scandinavian', 'Finish your e4 repertoire.', [
      line('w', 'The Advance French. You get space, and Black gets levers. Your job is to keep d4 solid.', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 {Prepares b4 and stops ...Bb4.} Nh6 b4 cxd4 cxd4 Nf5 Be3 {The centre holds, and now you develop.}'),
      line('w', 'The Scandinavian. Black’s queen comes out early, so develop with tempo.', 'e4 d5 exd5 Qxd5 Nc3 {The knight develops and attacks the queen.} Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Nd5 {A discovered attack on the queen.} Qd8 Nxf6+ Qxf6 O-O {You lead in development.}'),
    ]),

    /* ================= Class B ================= */
    L('b-quiet', 5, 'motifs', 'Quiet moves', 'The strongest move may not be a check.', [
      drill(['quietMove'], 8, 'When forcing moves fail by one tempo, look for the calm move that adds a second threat.'),
    ]),
    L('b-defence', 5, 'motifs', 'Defensive moves', 'Finding the only defence earns points too.', [
      drill(['defensiveMove'], 8, 'What does your opponent threaten? Find the move that stops it and keeps your edge.'),
    ]),
    L('b-trap', 5, 'motifs', 'Trapped pieces', 'Take away the last safe square.', [
      drill(['trappedPiece'], 6, 'Count the safe squares of each enemy piece. Bishops and knights near the edge run out first.'),
    ]),
    L('b-promo', 5, 'motifs', 'Advanced pawns', 'A pawn on the sixth is worth a lot of material.', [
      drill(['advancedPawn', 'promotion'], 8, 'Count the moves to promotion. Sometimes you can give up a piece to clear the path.'),
    ]),
    L('b-outside', 5, 'technique', 'The outside passed pawn', 'A decoy that wins pawn endings.', [
      trial('8/8/3k1p2/5p2/P2K1P2/8/8/8 w - - 0 1', 'Your a-pawn drags the enemy king to the far side. Push it, then march your king to the kingside and win the f-pawns.', 'promote', 16, 'The outside pawn pulled the king away, and your king ate the other wing. Remember this before you trade into a pawn ending.'),
    ]),
    L('b-triangle', 5, 'technique', 'Triangulation', 'Lose a move on purpose.', [
      show('8/8/2k5/K1p1p3/2P1P3/8/8/8 w - - 0 1', 'If it were Black’s move here, the king would have to leave c5 undefended or let you in. It is your move, and chess has no pass. You can still hand the move over by taking three king moves to make a trip that takes Black’s king two. That detour is triangulation.', { arrows: [['a5', 'a6'], ['a6', 'b5']] }),
      trial('8/8/2k5/K1p1p3/2P1P3/8/8/8 w - - 0 1', 'Win this. Only one first move wins, and it looks like a retreat. Lose a tempo, win the c5 pawn, and promote.', 'promote', 16, 'Ka6 was the only winning move. Black ran out of useful squares, so you won c5. Every pawn ending at this level comes down to who runs out of waiting moves.'),
    ]),
    L('b-reti', 5, 'technique', 'The Réti study', 'One king chases two goals at once.', [
      show('7K/8/k1P5/7p/8/8/8/8 w - - 0 1', 'It looks hopeless. Your king is outside the h-pawn’s square, and your pawn is about to fall. Kings move diagonally as fast as they move straight, so a diagonal walk does two jobs at once.', { arrows: [['h8', 'e5']] }),
      trial('7K/8/k1P5/7p/8/8/8/8 w - - 0 1', 'Draw this. Walk the diagonal toward your pawn and toward the square of the h-pawn at the same time. Richard Réti composed this in 1921.', 'hold', 10, 'Every step threatened two things. A king on a diagonal covers a file and a rank at once, which is why counting moves beats counting squares.'),
    ]),
    L('b-ocb', 5, 'technique', 'Opposite-coloured bishops', 'Two pawns up can still be a draw.', [
      pick('8/8/4k3/8/4PP2/2B5/2b2K2/8 w - - 0 1', 'White is two pawns up, yet this kind of ending is often a draw. White’s bishop runs on dark squares and Black’s on light. Why are these endings so drawn?', [
        { x: 'Neither bishop can ever challenge the other’s squares', ok: true, why: 'A blockade on one colour stands forever, because the other bishop can never contest it. Trade into these when you are behind, and avoid them when you are ahead.' },
        { x: 'Bishops are weak in endings', ok: false, why: 'Bishops are often strong in endings. The problem is colour: each side controls squares the other cannot touch.' },
      ]),
    ]),
    L('b-majority', 5, 'strategy', 'Pawn majorities and the minority attack', 'Pawn structures make the plan for you.', [
      pick('r1bq1rk1/pp2bppp/2n2n2/2pp4/3P4/2PBPN2/PP3PPP/RNBQ1RK1 w - - 0 1', 'Pawn structures tell you which wing to play on. Which side should you expand on?', [
        { x: 'The side where your pawns outnumber the enemy’s', ok: true, why: 'A majority makes a passed pawn. Advance it with piece support, and keep the leading pawn backed up.' },
        { x: 'Wherever the enemy is strongest', ok: false, why: 'Push where you have more. Attacking strength with weakness costs you pawns.' },
      ]),
      pick('r1b2rk1/pp1nqppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 10', 'This is the Carlsbad structure. White has a2 and b2, and Black has a7, b7 and c6. What is White’s classic plan?', [
        { x: 'The minority attack: b4-b5 and bxc6', ok: true, why: 'Two pawns against three sounds wrong, but pushing b5 gives Black a weak c-pawn or a backward pawn on an open file. You then attack it for the rest of the game.' },
        { x: 'Push the a-pawn alone', ok: false, why: 'A lone a-pawn does not create a weakness. The b-pawn is the one that hits c6.' },
      ]),
    ]),
    L('b-castling', 5, 'strategy', 'Opposite-side castling', 'Whoever opens first wins.', [
      pick('r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/2KR1B1R w - - 0 9', 'The kings have castled on opposite sides. What should White do?', [
        { x: 'Throw the h- and g-pawns at the king', ok: true, why: 'Your own king does not live behind those pawns, so pushing them costs you nothing. It becomes a race, and tempo matters more than material.' },
        { x: 'Make a slow move on the queenside', ok: false, why: 'Slow play loses this race. Black’s rook and bishop are already aiming at your king.' },
      ]),
    ]),
    L('b-weak2', 5, 'strategy', 'The principle of two weaknesses', 'One weakness can be defended. Two usually cannot.', [
      pick('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', 'Your opponent has a weak pawn, and all their pieces defend it. What now?', [
        { x: 'Create a second weakness on the other wing', ok: true, why: 'Defenders cannot be in two places. Switch targets until something breaks. This is how endings get won against good defence.' },
        { x: 'Keep attacking the same pawn', ok: false, why: 'If it is defended as often as you attack it, you have to change something. A second target stretches the defence.' },
      ]),
    ]),
    L('b-carlsbad', 5, 'openings', 'Black: facing the London', 'A clean plan against a system opening.', [
      line('b', 'The London is common at every level. Hit the centre with ...c5 and develop quickly.', 'd4 d5 Bf4 Nf6 e3 c5 {Challenge d4 before White’s setup finishes.} c3 Nc6 Nd2 e6 Ngf3 Bd6 {Offer to trade White’s best piece.} Bg3 O-O Bd3 b6 {The queen’s bishop comes to b7, supporting ...e5 later.}'),
    ]),
    L('b-two-knights', 5, 'openings', 'White: Two Knights and the Fried Liver', 'Handle ...Nf6 with confidence.', [
      line('w', 'Against 3...Nf6, 4.d3 is simple, and it keeps your Italian plans.', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 {Keep it simple. You do not need to rush.} Bc5 c3 d6 O-O O-O Re1 a6 Bb3 {The same plan as before: Nbd2 and Nf1.}'),
      demo('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'The Fried Liver: a trap every Italian player should know. Black recaptures on d5 naturally, and it fails.', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 {Natural but wrong. ...Na5 is correct.} Nxf7 {The sacrifice drags out the king.} Kxf7 Qf3+ Ke6 Nc3 {The knight on d5 is pinned, and every white piece joins in.}'),
    ]),

    /* ================= Class A ================= */
    L('a-zug', 6, 'motifs', 'Zugzwang', 'Make them move.', [
      drill(['zugzwang'], 8, 'What happens if your opponent has to move right now? If every move hurts, play a move that changes nothing.'),
    ]),
    L('a-under', 6, 'motifs', 'Underpromotion and double check', 'The rare moves strong players never miss.', [
      drill(['underPromotion', 'doubleCheck'], 8, 'Promote to a knight when it forks or checks, and to a rook when a queen would stalemate. In double check, only the king can move.'),
    ]),
    L('a-long', 6, 'motifs', 'Long mates', 'Calculate five moves deep.', [
      drill(['mateIn4', 'mateIn5'], 8, 'These need a disciplined search. Look only at forcing replies, and write the tree out in your head one branch at a time.'),
    ]),
    L('a-sharp', 6, 'motifs', 'Master-level tactics', 'Everything at once, near your limit.', [
      drill(['sacrifice', 'discoveredAttack', 'deflection', 'quietMove'], 10, 'These sit at the top of your range. Take your time and calculate as you would in a long game.'),
    ]),
    L('a-vancura', 6, 'technique', 'The Vančura defence', 'Draw against a rook pawn with your rook on the side.', [
      show('R7/6k1/P4r2/8/8/8/8/1K6 b - - 0 1', 'Your rook attacks the pawn from the side, on the same rank. It waits there until the pawn moves. If it moves, you start giving checks from behind. The attacker has no shelter for the king and no way to free the rook.', { arrows: [['f6', 'a6']] }),
      trial('R7/6k1/P4r2/8/8/8/8/1K6 b - - 0 1', 'You are Black. Hold the draw. Stay on the sixth rank attacking the pawn, and check from behind whenever the king comes up.', 'hold', 20, 'White’s rook is stuck guarding the pawn, and your checks never run out. Many rook endings a pawn down end up in this drawn setup.'),
    ]),
    L('a-bn', 6, 'technique', 'Bishop and knight mate', 'The hard basic mate.', [
      show('8/8/8/4k3/8/8/8/4KBN1 w - - 0 1', 'You can only mate in a corner your bishop controls. Drive the king to the edge first, then along it. The usual route is the W manoeuvre with the knight. The 50-move rule applies, so plan your moves.', { marks: ['a8', 'h1'] }),
      trial('8/8/8/4k3/8/8/8/4KBN1 w - - 0 1', 'Mate inside the 50-move limit. This is hard, and many masters have failed it in tournaments. Your bishop is light-squared, so aim for a8 or h1.', 'mate', 45, 'Few club players can do this on demand. You now can.'),
    ]),
    L('a-active', 6, 'technique', 'Active rook endings', 'An active rook is usually worth a pawn.', [
      pick('8/5kpp/8/8/1r6/1P3P2/4K1PP/R7 w - - 0 1', 'In rook endings, which matters most?', [
        { x: 'Rook activity, even at the cost of a pawn', ok: true, why: 'A passive rook guarding a pawn often loses, while an active rook a pawn down often draws. Rubinstein and Capablanca both won many endings on this idea.' },
        { x: 'Keeping every pawn', ok: false, why: 'Tying your rook to one pawn is the classic way to lose. Counterattack instead.' },
      ]),
    ]),
    L('a-exchange', 6, 'strategy', 'The exchange sacrifice', 'A rook for a piece can be a bargain.', [
      pick('2rq1rk1/pp2ppbp/3p1np1/4n3/3NP1b1/1BN1BP2/PPPQ2PP/2KR3R b - - 0 12', 'In many Sicilian positions, Black plays ...Rxc3. What does Black get for the exchange?', [
        { x: 'A wrecked king shelter and a strong knight or bishop', ok: true, why: 'Material is one factor among several. If the rook has no open files and the minor piece dominates, the sacrifice is sound.' },
        { x: 'Nothing, it always loses material', ok: false, why: 'It gives up 2 points, but structure and king safety can be worth much more.' },
      ]),
    ]),
    L('a-prophylaxis', 6, 'strategy', 'Prophylaxis', 'Ask what your opponent wants, then stop it.', [
      pick('r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 b - - 0 8', 'Before choosing a move, what is the most useful question?', [
        { x: '“What does my opponent want to do next?”', ok: true, why: 'Strong players spend real time on this. If you can stop the plan and improve your position with one move, you are playing at a much higher level.' },
        { x: '“What is my most aggressive move?”', ok: false, why: 'Aggression without knowing the opponent’s plan loses games to simple counterplay.' },
      ]),
    ]),
    L('a-convert', 6, 'strategy', 'Converting an advantage', 'Winning a won position.', [
      pick('6k1/5ppp/8/8/8/5N2/5PPP/6K1 w - - 0 1', 'You are a piece up. What is the reliable way to win?', [
        { x: 'Stop counterplay, trade pieces, then use the extra piece', ok: true, why: 'Eliminate their ideas first. Hurrying is how won games get thrown away. Keep everything defended, and trade pieces and not pawns.' },
        { x: 'Attack the king straight away', ok: false, why: 'You do not need risk. Attacking leaves pieces loose, and loose pieces are how they get back into the game.' },
      ]),
    ]),
    L('a-review', 6, 'openings', 'Your whole repertoire', 'Play each line from memory, without notes.', [
      line('w', 'White: the Italian, from memory.', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Nbd2 Ba7 Bb3'),
      line('b', 'Black: the Caro-Kann main line, from memory.', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6'),
      line('b', 'Black: the Slav, from memory.', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O'),
    ]),
  ];

  /* Short mainlines the sparring bots can draw from, on top of the lesson repertoire. */
  const BOOK = [
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nc3 Bb4 Nxc6 bxc6 Bd3 d5',
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7',
    'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bc4 e6',
    'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7',
    'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6',
    'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5',
    'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6',
    'd4 d5 Nf3 Nf6 c4 c6 e3 Bf5 Nc3 e6 Nh4 Bg6',
    'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6',
    'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 d3 e6 Nbd2 h6',
  ];

  const TRACKS = {
    rules: { name: 'Rules', gate: 'knowledge' },
    motifs: { name: 'Tactics', gate: 'tactics' },
    technique: { name: 'Endgames', gate: 'technique' },
    strategy: { name: 'Strategy', gate: 'knowledge' },
    openings: { name: 'Openings', gate: 'knowledge' },
  };

  return { CLASSES, BOTS, THEMES, THEME_ORDER, LESSONS, BOOK, TRACKS, START };
});
