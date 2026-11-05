#!/usr/bin/env python3
"""Pick a stratified puzzle set from the Lichess puzzle CSV (CC0).

Usage: build_puzzles.py <puzzles.csv> <out.txt>

Every rating band gets a base quota, then each teaching theme is topped up per band
so rare motifs (Boden's mate, interference, zugzwang) stay available at every level.
Output is sorted by rating so the game can binary-search for a target difficulty.
Line format: id|fen|moves|rating|themeChars
"""
import csv
import random
import sys
from collections import defaultdict

# Order is part of the data format: src/data.js reads the same list. Append only.
THEMES = """fork pin skewer discoveredAttack discoveredCheck doubleCheck deflection attraction sacrifice
hangingPiece trappedPiece capturingDefender clearance interference intermezzo xRayAttack quietMove
defensiveMove zugzwang promotion advancedPawn underPromotion enPassant castling attackingF2F7
kingsideAttack queensideAttack exposedKing mate mateIn1 mateIn2 mateIn3 mateIn4 mateIn5
backRankMate smotheredMate anastasiaMate arabianMate hookMate bodenMate doubleBishopMate dovetailMate
epauletteMate killBoxMate vukovicMate operaMate pillsburysMate morphysMate triangleMate swallowstailMate
cornerMate balestraMate rookEndgame pawnEndgame bishopEndgame knightEndgame queenEndgame queenRookEndgame
opening middlegame endgame""".split()
CODE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
THEME_CODE = {t: CODE[i] for i, t in enumerate(THEMES)}
assert len(THEMES) <= len(CODE)

BAND = 50
BASE_QUOTA = 230
THEME_BAND = 200
# Motifs that get a deeper reserve because the syllabus drills them directly.
THEME_QUOTA = 14
PHASE_OR_GENERIC = {"mate", "opening", "middlegame", "endgame", "kingsideAttack", "queensideAttack"}


def main(src, out):
    rng = random.Random(2000)
    by_band = defaultdict(list)
    with open(src, newline="") as f:
        for row in csv.DictReader(f):
            try:
                rating = int(row["Rating"])
                popularity = int(row["Popularity"])
                plays = int(row["NbPlays"])
                deviation = int(row["RatingDeviation"])
            except (ValueError, TypeError):
                continue
            # Well-liked, often-played, well-calibrated puzzles only.
            if popularity < 85 or plays < 300 or deviation > 90 or rating < 400:
                continue
            themes = [t for t in row["Themes"].split() if t in THEME_CODE]
            by_band[rating // BAND * BAND].append(
                (row["PuzzleId"], row["FEN"], row["Moves"], rating, themes, popularity)
            )

    chosen = {}
    for band, rows in by_band.items():
        rng.shuffle(rows)
        rows.sort(key=lambda r: -(r[5] >= 92))  # prefer the best liked, stable after shuffle
        for r in rows[:BASE_QUOTA]:
            chosen[r[0]] = r

    # Top up each theme per wider band.
    wide = defaultdict(list)
    for band, rows in by_band.items():
        wide[band // THEME_BAND * THEME_BAND].extend(rows)
    for band, rows in wide.items():
        for theme in THEMES:
            have = sum(1 for r in chosen.values() if band <= r[3] < band + THEME_BAND and theme in r[4])
            quota = 6 if theme in PHASE_OR_GENERIC else THEME_QUOTA
            if have >= quota:
                continue
            extra = [r for r in rows if theme in r[4] and r[0] not in chosen]
            rng.shuffle(extra)
            for r in extra[: quota - have]:
                chosen[r[0]] = r

    final = sorted(chosen.values(), key=lambda r: (r[3], r[0]))
    with open(out, "w") as f:
        for pid, fen, moves, rating, themes, _ in final:
            short_fen = " ".join(fen.split()[:4])
            code = "".join(THEME_CODE[t] for t in themes)
            f.write(f"{pid}|{short_fen}|{moves}|{rating}|{code}\n")

    counts = defaultdict(int)
    for r in final:
        for t in r[4]:
            counts[t] += 1
    print(len(final), "puzzles", "rating", final[0][3], "to", final[-1][3])
    print("thinnest themes:", sorted(counts.items(), key=lambda kv: kv[1])[:12])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
