// Assemble the single-file game: node tools/build.mjs
// Everything ships inside one HTML file: engine, curriculum, puzzles and piece shapes.
//   dist/index.html     the complete page. Render serves it, and it opens straight from disk.
//   dist/artifact.html  the same game without a page wrapper, for publishing on claude.ai.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const guard = (s) => {
  if (/<\/script/i.test(s)) throw new Error('A data block contains a closing script tag');
  return s;
};

const engine = guard(read('src/engine.js'));
const content = guard(read('src/content.js'));
const app = guard(read('src/app-core.js') + '\n' + read('src/app-modes.js'));

const head = `<title>Ladder Mate</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,700;1,400&family=Courier+Prime:wght@400;700&family=Kalam:wght@300;400&family=Rozha+One&display=swap">
<style>
${read('src/style.css')}
</style>`;

const body = `<div class="app">
  <aside class="rail" id="rail" aria-label="Your rating"></aside>
  <div class="main">
    <nav class="tabs" id="tabs" aria-label="Sections"></nav>
    <div class="stage" id="stage">
      <div class="boardcol">
        <div class="board" id="board"></div>
        <div class="under"><span class="say" id="say" aria-live="polite"></span><span id="underbtns"></span></div>
      </div>
      <section class="side" id="side" aria-live="polite"></section>
    </div>
    <div class="page" id="page" hidden></div>
  </div>
</div>
<div class="promo" id="promo" hidden></div>
<div class="toast" id="toast" role="status" hidden></div>
<script type="text/plain" id="engine-src">${engine}</script>
<script type="text/plain" id="puzzle-data">${guard(read('data/puzzles.txt'))}</script>
<script type="text/plain" id="blunder-data">${guard(read('data/blunders.txt'))}</script>
<script type="application/json" id="piece-data">${guard(read('data/pieces.json'))}</script>
<script>${engine}</script>
<script>${content}</script>
<script>
(function () {
'use strict';
${app}
})();
</script>
`;

// dist/ is not committed, so a fresh clone has to create it.
mkdirSync(join(root, 'dist'), { recursive: true });

const reset = ':root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
const description = 'A chess training game that climbs from the rules to 2000, with rated puzzles, endgame trials, an opening repertoire, sparring bots and review of your own games.';
// The tab icon is the game's own rook, inlined so the page makes no extra request.
const rook = JSON.parse(read('data/pieces.json')).bR;
const icon = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#fdfdf8" d="${rook.sil}"/><path fill="#0c1e19" d="${rook.ink}"/></svg>`);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${description}"><link rel="icon" href="${icon}"><style>${reset}</style>
${head}
</head><body>
${body}</body></html>
`;
writeFileSync(join(root, 'dist/index.html'), page);

// claude.ai adds its own page wrapper when this is published.
writeFileSync(join(root, 'dist/artifact.html'), `<meta name="claude:viewport-fit-sides" content="cover">\n${head}\n${body}`);

console.log('dist/index.html', (page.length / 1024 / 1024).toFixed(2), 'MB');
