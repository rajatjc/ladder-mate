# Ladder Mate

A chess training game that climbs from the rules to 2000. It ships as one HTML file, with no
server and no dependencies.

## Run it

```sh
node tools/build.mjs
open dist/index.html
```

`dist/index.html` is the complete page. `dist/artifact.html` is the same game without a page
wrapper, for publishing on claude.ai. `dist/` is generated and not committed.

## Deploy

`render.yaml` describes a Render static site. In the Render dashboard, choose New > Blueprint and
pick this repository. Each push to the default branch then redeploys it.

On a plain web host, progress is saved in the player's browser only. It does not follow them to
another device, and clearing site data erases it. The claude.ai copy saves to the viewer's account,
and the two copies do not share progress.

## Build and test

```sh
node tools/build.mjs            # assemble dist/ from src/ and data/
node test/engine.test.mjs       # perft against published counts, notation, tactics
node test/content.test.mjs      # every lesson against the engine and the Lichess tablebase
node tools/calibrate_bots.js data/puzzles.txt 320   # bot tactical level on rated puzzles
```

Regenerating the data needs the Lichess puzzle CSV and a copy of DejaVu Sans:

```sh
python3 tools/build_puzzles.py lichess_db_puzzle.csv data/puzzles.txt
python3 tools/build_pieces.py DejaVuSans.ttf data/pieces.json
node tools/build_blunders.js data/puzzles.txt data/blunders.txt 1400
```

`build_puzzles.py` and `src/content.js` share one theme order, which is the decoding key for the
data. Only ever append to it. Changing `DATA_VERSION` in `src/app-core.js` resets each player's
list of seen puzzles.

## What is verified, and how far to trust it

- The move generator matches published perft counts, and all 14,315 puzzles replay legally.
- Lesson answers are checked against this project's own engine. Endings with up to 7 pieces are
  checked against Syzygy tablebases through the Lichess API.
- Bot strength is tuned so each bot's tactical level on human-rated puzzles matches the tactics
  gate of the class it guards. This measures tactics only. The bots have never played rated
  humans or a calibrated engine, so their "about 1450" labels are estimates.
- The Ladder rating is a training measure and does not predict a FIDE, US Chess or online rating.

## Credits

Puzzles: Lichess puzzle database (CC0). Piece shapes: DejaVu Sans. Evaluation tables: PeSTO by
Ronald Friederich.
