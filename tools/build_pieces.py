#!/usr/bin/env python3
"""Extract chess piece outlines from DejaVu Sans into data/pieces.json.

Usage: build_pieces.py <DejaVuSans.ttf> <out.json>

Each piece gets `sil`, the silhouette that is filled first so the board's hatching never
shows through a piece, and `ink`, the glyph drawn over it. Paths fit a 100 x 100 box.
"""
import json
import sys

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

GLYPHS = {
    "wK": 0x2654, "wQ": 0x2655, "wR": 0x2656, "wB": 0x2657, "wN": 0x2658, "wP": 0x2659,
    "bK": 0x265A, "bQ": 0x265B, "bR": 0x265C, "bB": 0x265D, "bN": 0x265E, "bP": 0x265F,
}


def contours(glyph_set, name):
    pen = DecomposingRecordingPen(glyph_set)
    glyph_set[name].draw(pen)
    out, cur = [], []
    for op, args in pen.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            out.append(cur)
            cur = []
    return out


def points(contour):
    return [p for _, args in contour for p in args if p is not None]


def bbox(contour):
    pts = points(contour)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def path(contour, fx, fy):
    d = []
    for op, args in contour:
        if op == "moveTo":
            d.append("M%s %s" % (fx(args[0][0]), fy(args[0][1])))
        elif op == "lineTo":
            d.append("L%s %s" % (fx(args[0][0]), fy(args[0][1])))
        elif op == "qCurveTo":
            # TrueType implied on-curve points: expand into explicit quadratics.
            pts = list(args)
            for i in range(len(pts) - 1):
                c = pts[i]
                if i < len(pts) - 2:
                    e = ((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
                else:
                    e = pts[i + 1]
                d.append("Q%s %s %s %s" % (fx(c[0]), fy(c[1]), fx(e[0]), fy(e[1])))
        elif op == "curveTo":
            d.append("C" + " ".join("%s %s" % (fx(p[0]), fy(p[1])) for p in args))
        elif op == "closePath":
            d.append("Z")
    return "".join(d)


def num(v):
    s = "%.1f" % v
    return s[:-2] if s.endswith(".0") else s


def main(font_path, out):
    font = TTFont(font_path)
    cmap, glyph_set = font.getBestCmap(), font.getGlyphSet()
    result = {}
    # One scale for the whole set keeps relative piece heights true to the font.
    heights = []
    for code in GLYPHS.values():
        cs = contours(glyph_set, cmap[code])
        heights.append(max(bbox(c)[3] - bbox(c)[1] for c in cs))
    scale = 86.0 / max(heights)
    for key, code in GLYPHS.items():
        cs = contours(glyph_set, cmap[code])
        boxes = [bbox(c) for c in cs]
        x0, y0, x1, y1 = min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)
        ox = 50 - (x0 + x1) / 2 * scale
        oy = 93 + y0 * scale  # stand every piece on a common baseline
        fx = lambda v: num(v * scale + ox)
        fy = lambda v: num(oy - v * scale)
        ink = "".join(path(c, fx, fy) for c in cs)
        # The contour with the largest box is the outer silhouette.
        outer = max(range(len(cs)), key=lambda i: (boxes[i][2] - boxes[i][0]) * (boxes[i][3] - boxes[i][1]))
        result[key] = {"sil": path(cs[outer], fx, fy), "ink": ink}
    with open(out, "w") as f:
        json.dump(result, f, separators=(",", ":"))
    print("wrote", out, sum(len(v["ink"]) + len(v["sil"]) for v in result.values()), "bytes of path data")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
