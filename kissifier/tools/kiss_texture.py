#!/usr/bin/env python3
"""
kiss_texture.py measures a photo of a real lipstick print and draws prints with its texture on other shapes.

Three commands:

  analyze   photo -> maps, stats and the texture files that render reads
      python kiss_texture.py analyze photo.jpg --out kiss_tex/
      (optional --crop x,y,w,h ; default finds the print by its ink)

  add       place ridges, lines and weak spots on a shape and append them to a recipe (created if missing)
      python kiss_texture.py add kiss.json --shape kiss-red.png --ridges 45 --lines 70 --weak 5
          [--box x0,y0,x1,y1]  only place inside this part of the shape (fractions of its bounding box)
          [--at x,y]           place every new feature at this point instead
          [--seed N]

  render    shape + recipe + the folder analyze wrote -> print PNG in one ink colour
      python kiss_texture.py render kiss.json --shape kiss-red.png --texture kiss_tex/ --color "#7A1E1E" --out print.png

The shape is any PNG whose alpha is the print outline (render an SVG to PNG first).

Outputs of `analyze` (8-bit grayscale PNG, white = more ink unless noted), at a 1200 px working size:
  ink.png          ink amount (0..1)
  pressure.png     low-frequency pressure: where the lips pressed hard vs. lightly
  detail.png       ink / pressure: texture with the outline and pressure removed (mid-grey = average)
  creases.png      ridge filter response: the thin paper-coloured lines inside the ink (white = crease)
  grain.png        fine speckle left after removing creases and pressure
  orientation.png  crease direction as hue (HSV), brightness = coherence
  texture-tile.png seamless tile of detail+creases from inside the print, for CSS mask-image / overlays
  stats.json       coverage, opacity distribution, crease density, spacing, dominant angles (0 = horizontal, 90 = vertical)
and the files render reads, at the photo's full size:
  band-upper.png, band-lower.png  the photo's ink along the mouth and the seams: one column per pixel along
                   the lip's edge, one row per pixel out from it, alpha = inside the photo's print
  lip-upper.png, lip-lower.png    a seamless tile of each lip
  texture.json     print width, positions along the edges, tile crease directions, ink by distance from the outline

Needs: numpy, pillow, scipy, scikit-image   (pip install numpy pillow scipy scikit-image)
"""
import argparse, itertools, json, os, math, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.special import ndtr, ndtri
from skimage.filters import sato
from skimage.feature import structure_tensor


# ---------- helpers ----------
def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0

def save_gray(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "L").save(path)

def norm(a, lo=1, hi=99, mask=None):
    v = a[mask] if mask is not None else a
    p0, p1 = np.percentile(v, [lo, hi])
    return np.clip((a - p0) / (p1 - p0 + 1e-6), 0, 1)

def hex_rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def seamless(t):
    """Make a tile seamless. Along each axis in turn, the outer quarter on each side fades into a
    copy of the tile shifted by half its size. The copy's own seam lies in the middle, where the fade
    has not started. Dividing by the length of the two weights keeps the contrast where the two mix."""
    m = t.mean()
    for axis in (0, 1):
        n = t.shape[axis]
        ramp = np.clip(4 * np.abs(np.arange(n) - (n - 1) / 2) / (n - 1) - 1, 0, 1)
        w = ramp[:, None] if axis == 0 else ramp[None, :]
        t = m + ((1 - w) * (t - m) + w * (np.roll(t, n // 2, axis) - m)) / np.hypot(1 - w, w)
    return t

def largest(mask):
    lab, n = ndi.label(mask)
    return lab == 1 + np.argmax(np.bincount(lab.ravel())[1:]) if n else mask


# ---------- ink ----------
def ink_amount(rgb):
    """Ink from brightness. Paper is the 10th percentile of brightness along the crop's border, less a
    margin for the paper's own grain, and full ink is the darkest 0.5%. The result is the alpha that
    lays the ink colour over the paper with the photo's brightness. Redness (R - G) would be soft,
    because a JPEG stores colour at half resolution."""
    Y = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    border = np.concatenate([Y[0], Y[-1], Y[:, 0], Y[:, -1]])
    paper, ink = np.percentile(border, 10) - 0.02, np.percentile(Y, 0.5)
    return np.clip((paper - Y) / (paper - ink), 0, 1)

def auto_crop(rgb, pad=0.04):
    red = rgb[..., 0] - rgb[..., 1]
    m = red > np.percentile(red, 99) * 0.5
    m = ndi.binary_opening(m, iterations=3)
    lab, n = ndi.label(m)
    if n == 0:
        return rgb, (0, 0, rgb.shape[1], rgb.shape[0])
    sizes = ndi.sum(m, lab, range(1, n + 1))
    big = lab == (np.argmax(sizes) + 1)
    big = ndi.binary_dilation(big, iterations=int(0.03 * max(rgb.shape[:2])))
    ys, xs = np.where(big)
    h, w = rgb.shape[:2]
    py, px = int(pad * h), int(pad * w)
    y0, y1 = max(0, ys.min() - py), min(h, ys.max() + py)
    x0, x1 = max(0, xs.min() - px), min(w, xs.max() + px)
    return rgb[y0:y1, x0:x1], (x0, y0, x1 - x0, y1 - y0)


# ---------- the lip frame ----------
# The photo's print and the shape are described in the same coordinates. The mouth ends in two
# tips. From each tip a straight seam runs on to the notch in the outline where the lips meet. The
# upper lip's edge is the left seam, the top of the mouth and the right seam, and the lower lip's
# edge is the same with the bottom of the mouth. A pixel of a lip has a distance d from that lip's
# edge and a position s along it. Positions on the shape's edge are matched to positions on the
# photo's edge through the seam ends and tips. All sizes are fractions of the print width w.

def pick_mouth(candidates, w):
    """The mouth among patches of paper (on the photo) or holes (in a shape). An opening with a box
    0.6% of the print width tall cuts the hairline that joins the photo's mouth to the paper outside
    at a corner, and the cracks that run out of the mouth. A shape's mouth goes through the same
    opening, so the tips are the same landmark on both. Patches narrower than a tenth of the print
    are not a mouth."""
    opened = ndi.binary_opening(candidates, np.ones((max(1, round(0.006 * w)), max(1, round(0.01 * w)))))
    lab, n = ndi.label(opened)
    spans = [np.ptp(np.nonzero((lab == i).any(0))[0]) for i in range(1, n + 1)]
    wide = [i + 1 for i, s in enumerate(spans) if s >= 0.1 * w]
    if not wide:
        return np.zeros_like(candidates)
    return lab == max(wide, key=lambda i: (lab == i).sum())

def seam_end(F, tip, side, w):
    """The most concave point of the outline beyond the tip, near the tip's height. Without one, the
    outermost point of the filled outline in the tip's row, or the box's edge if the row has none."""
    outline = F & ~ndi.binary_erosion(F)
    ys, xs = np.nonzero(outline)
    near = (np.sign(xs - tip[0]) == side) & (np.abs(ys - tip[1]) < 0.1 * w)
    if near.any():
        conc = ndi.gaussian_filter(F.astype(np.float32), 0.025 * w)[ys[near], xs[near]]
        k = np.argmax(conc)
        if conc[k] > 0.6:
            return float(xs[near][k]), float(ys[near][k])
    row = np.nonzero(F[int(round(tip[1]))] & (np.sign(np.arange(F.shape[1]) - tip[0]) == side))[0]
    if not len(row):
        row = np.nonzero(F.any(0))[0]
    return float(row[0] if side < 0 else row[-1]), tip[1]

def lip_line(F, mouth, box):
    """Tips, seam ends, and the upper and lower edge with one height per column. A shape without a
    mouth gets a mouth of no length at the centre of its box, so its seam runs through the middle."""
    x0, y0, w, h = box
    X = np.arange(F.shape[1], dtype=np.float64)
    if mouth.any():
        mc = np.nonzero(mouth.any(0))[0]
        tips = [(float(c), float(np.nonzero(mouth[:, c])[0].mean())) for c in (mc[0], mc[-1])]
    else:
        tips = [(x0 + w / 2, y0 + h / 2)] * 2
    ends = [seam_end(F, tips[0], -1, w), seam_end(F, tips[1], 1, w)]
    knots = [ends[0], tips[0], tips[1], ends[1]] if mouth.any() else [ends[0], tips[0], ends[1]]
    up = np.interp(X, [p[0] for p in knots], [p[1] for p in knots])
    lo = up.copy()
    if mouth.any():
        rows = np.arange(F.shape[0])[:, None]
        span = slice(mc[0], mc[-1] + 1)
        up[span] = np.where(mouth, rows, np.inf).min(0)[span] - 0.5
        lo[span] = np.where(mouth, rows, -np.inf).max(0)[span] + 0.5
    mid = (up + lo) / 2
    return {"tips": tips, "ends": ends, "up": up, "lo": lo, "mid": mid,
            "mid_smooth": ndi.gaussian_filter1d(mid, 0.05 * w, mode="nearest")}

def chain(edge, shape):
    """The edge as a chain of points about 0.5 px apart, so steep parts leave no gaps: the pixels
    it passes through, the arc length at each, and the arc length at every column."""
    H, W = shape
    s_col = np.concatenate([[0], np.cumsum(np.hypot(1, np.diff(edge)))])
    t = np.arange(0, s_col[-1], 0.5)
    ix, iy = np.round(np.interp(t, s_col, np.arange(W))).astype(int), np.round(np.interp(t, s_col, edge)).astype(int)
    ok = (iy >= 0) & (iy < H)
    curve = np.zeros(shape, bool); curve[iy[ok], ix[ok]] = True
    smap = np.zeros(shape, np.float32); smap[iy[ok], ix[ok]] = t[ok]
    return curve, smap, s_col

def lip_coords(line, edge, sign, shape, w):
    """For each pixel on one side of the lip line: its distance d from the lip's edge, its position s
    along it, and whether it lies beyond the edge rather than in the mouth. Also the positions of
    the seam ends and tips along the edge.
    d is measured from the edge smoothed over 0.5% of the print width. That keeps the edge's shape
    and drops notches a few pixels deep, around which the band would bend into V shapes. s is the
    position of the nearest point on the edge smoothed over 4%. On the edge itself the nearest
    point stays put over a fan of pixels beyond each corner and jumps across each bend, and the
    band would smear there."""
    H = shape[0]
    near = ndi.gaussian_filter1d(edge, 0.005 * w, mode="nearest")
    curve, _, _ = chain(near, shape)
    d = ndi.distance_transform_edt(~curve).astype(np.float32) / w
    curve, smap, s_col = chain(ndi.gaussian_filter1d(edge, 0.04 * w, mode="nearest"), shape)
    ny, nx = ndi.distance_transform_edt(~curve, return_distances=False, return_indices=True)
    rows = np.arange(H)[:, None]
    m = ((rows - line["mid"][None, :]) * sign > 0).astype(np.float32)
    s = ndi.gaussian_filter(smap[ny, nx] * m, 0.01 * w) / (ndi.gaussian_filter(m, 0.01 * w) + 1e-9)
    xs = [line["ends"][0][0], line["tips"][0][0], line["tips"][1][0], line["ends"][1][0]]
    knots = np.interp(xs, np.arange(shape[1]), s_col)
    return (rows - near[None, :]) * sign > 0, d, s, knots

def strip_column(s, knots, strip_knots, scale):
    """Where position s on one edge falls on the strip. Between the tips it falls in proportion, and
    so does a seam up to 1.25 times as long as the photo's, measured in print widths. On a longer
    seam, as in a ring, the photo's corner is stretched no further and the rest of the seam gets the
    lip texture."""
    k = strip_knots
    left = max((k[1] - k[0]) / (knots[1] - knots[0]), scale / 1.25)
    right = max((k[3] - k[2]) / (knots[3] - knots[2]), scale / 1.25)
    col = np.interp(s, knots[1:3], k[1:3])
    col = np.where(s < knots[1], k[1] - (knots[1] - s) * left, col)
    return np.where(s > knots[2], k[2] + (s - knots[2]) * right, col)


# ---------- analysis ----------
TEXTURE_FILES = ["band-upper.png", "band-lower.png", "lip-upper.png", "lip-lower.png", "texture.json"]
BAND = 0.12       # how far the strips reach from the edge, as a fraction of the print width
DIST_BINS = 15    # ink by distance from the outline in steps of 1% of the print width, plus one bin for deeper

def band_strip(ink, F, beyond, d, s, knots, w):
    """Resample the photo's ink into (position along the edge, distance from it), about one cell per
    pixel. Each pixel is shared between its four nearest cells. A cell that gets too little of any
    pixel is filled from its neighbours, and one with no pixel nearby is marked as outside the print,
    so render falls back to the lip texture there. So are the strip's two ends, gradually, so that
    a band reaching past them does not stop on a straight line."""
    s0 = knots[0] - 0.25 * (knots[1] - knots[0])
    n_s = int(knots[3] + 0.25 * (knots[3] - knots[2]) - s0) + 2
    n_d = int(BAND * w) + 2
    sel = beyond & (d < BAND)
    cs, rd = s[sel] - s0, d[sel] * w
    ok = (cs >= 0) & (cs < n_s - 1)
    cs, rd, v, inside = cs[ok], rd[ok], ink[sel][ok], F[sel][ok]
    i0, j0 = rd.astype(int), cs.astype(int)
    fi, fj = rd - i0, cs - j0
    acc, val, wt = (np.zeros((n_d, n_s)) for _ in range(3))
    for di, wi in ((0, 1 - fi), (1, fi)):
        for dj, wj in ((0, 1 - fj), (1, fj)):
            k = wi * wj
            np.add.at(acc, (i0 + di, j0 + dj), k * v)
            np.add.at(val, (i0 + di, j0 + dj), k * inside)
            np.add.at(wt, (i0 + di, j0 + dj), k)
    full, near = wt >= 0.25, ndi.gaussian_filter(wt, 2)
    fill = lambda a: np.where(full, a / np.maximum(wt, 1e-9), ndi.gaussian_filter(a, 2) / np.maximum(near, 1e-9))
    empty = ~full & (near < 0.05)
    j = np.arange(n_s)
    ends = np.clip(np.minimum(j / (0.15 * (knots[1] - knots[0])), (n_s - 1 - j) / (0.15 * (knots[3] - knots[2]))), 0, 1)
    return fill(acc), np.where(empty, 0, fill(val)) * ends, float(s0), float(empty.mean())

def lip_tile(ink, ok):
    """The largest rectangle twice as wide as tall inside `ok`, made seamless. A chessboard distance
    on the mask squeezed to half its width finds it."""
    W2 = ok.shape[1] // 2
    half = ok[:, 0:2 * W2:2] & ok[:, 1:2 * W2:2]
    inside = ndi.distance_transform_cdt(np.pad(half, 1), metric="chessboard")[1:-1, 1:-1]
    cy, cx = np.unravel_index(np.argmax(inside), inside.shape)
    r = int(inside[cy, cx]) - 1
    return seamless(ink[cy - r: cy + r, 2 * (cx - r): 2 * (cx + r)])

def crease_angle(tile):
    """Dominant crease direction in degrees, as atan2(dy, dx) with y down and taken as an axis. Creases
    run across the dominant gradient of the whole tile."""
    Arr, Arc, Acc = (a.sum() for a in structure_tensor(tile, sigma=1.5, order="rc"))
    return float(np.degrees(0.5 * math.atan2(2 * Arc, Acc - Arr) + math.pi / 2) % 180)

def analyze(args):
    os.makedirs(args.out, exist_ok=True)
    rgb = load_rgb(args.photo)
    if args.crop:
        x, y, w, h = map(int, args.crop.split(","))
        rgb, box = rgb[y:y + h, x:x + w], (x, y, w, h)
    else:
        rgb, box = auto_crop(rgb)
    full = ink_amount(rgb)
    H, W = full.shape
    scale = 1200 / max(H, W)          # normalise working size so sigmas mean the same thing
    ink = np.asarray(Image.fromarray(full).resize((int(W * scale), int(H * scale)), Image.LANCZOS)) if scale < 1 else full
    analyze_maps(ink, args, box)

    # What render reads comes from the full size, which keeps the grain.
    r = 0.005 * max(H, W)
    F = largest(ndi.binary_fill_holes(ndi.binary_closing(ndi.gaussian_filter(full, r) > 0.2, iterations=round(r))))
    cols, rows = np.nonzero(F.any(0))[0], np.nonzero(F.any(1))[0]
    w = int(cols[-1] + 1 - cols[0])
    mouth = pick_mouth(F & (ndi.gaussian_filter(full, 2) <= 0.12), w)
    if not mouth.any():
        sys.exit("found no mouth in the print; try --crop")
    line = lip_line(F, mouth, (cols[0], rows[0], w, rows[-1] + 1 - rows[0]))
    to_outline = ndi.distance_transform_edt(F) / w
    rel = lambda p: [round(float(p[0] - cols[0]) / w, 3), round(float(p[1] - rows[0]) / w, 3)]
    tex = {"print_width_px": w}
    report = [f"print width {w} px, tips {[rel(p) for p in line['tips']]}, seam ends {[rel(p) for p in line['ends']]}"]
    for lip, edge, sign in (("upper", line["up"], -1), ("lower", line["lo"], 1)):
        beyond, d, s, knots = lip_coords(line, edge, sign, F.shape, w)
        strip, valid, s0, empty = band_strip(full, F, beyond, d, s, knots, w)
        Image.fromarray((np.clip(np.stack([strip, valid], -1), 0, 1) * 255).astype(np.uint8), "LA") \
            .save(os.path.join(args.out, f"band-{lip}.png"))
        body = beyond & F & ~mouth & (d > BAND)
        tile = lip_tile(full, beyond & F & ~mouth & (d > 0.09) & (to_outline > 0.03))
        save_gray(tile, os.path.join(args.out, f"lip-{lip}.png"))
        # Ink by distance from the outline: quantiles in bins 1% of the print width wide. A bin
        # with less than 2% of the lip's pixels takes the nearest bin that has more. The photo's
        # lower lip is thin, so its deepest bins hold a handful of pixels.
        b = np.minimum((to_outline * 100).astype(int), DIST_BINS)
        enough = [i for i in range(DIST_BINS + 1) if (body & (b == i)).sum() >= 0.02 * body.sum()]
        table = [np.quantile(full[body & (b == min(enough, key=lambda j: abs(j - i)))], np.linspace(0, 1, 33)).round(4).tolist()
                 for i in range(DIST_BINS + 1)]
        tex[lip] = {"knots": [float(k - s0) for k in knots], "crease_angle": round(crease_angle(tile), 1),
                    "ink_by_distance": table}
        report.append(f"{lip} lip: tile {tile.shape[1]} x {tile.shape[0]} px, {100 * empty:.1f}% of the band strip empty")
    with open(os.path.join(args.out, "texture.json"), "w") as f:
        json.dump(tex, f)
    print("\n".join(report))

def analyze_maps(ink, args, box):
    H, W = ink.shape
    body = ndi.gaussian_filter(ink, 6) > 0.2          # inside the print
    body = ndi.binary_fill_holes(ndi.binary_closing(body, iterations=6)) & (ndi.gaussian_filter(ink, 12) > 0.15)

    # Pressure: heavy blur, normalised inside the print.
    pressure = ndi.gaussian_filter(ink, 0.035 * max(H, W))
    pressure_n = norm(pressure, 2, 98, body) * body

    # Detail: how much ink each pixel has relative to local pressure (removes outline + pressure).
    detail = np.where(body, ink / (pressure + 1e-3), 1.0)
    detail_n = np.clip(detail / (np.percentile(detail[body], 95) + 1e-6), 0, 1)

    # Creases: thin bright (paper) ridges inside the ink. Sato on the *gap* image.
    gaps = (1 - ink) * body
    cr = sato(gaps, sigmas=[1, 1.5, 2.5, 3.5], black_ridges=False)
    creases = norm(cr, 50, 99.5, body) * body

    # Grain: what's left at the finest scale.
    hi = ink - ndi.gaussian_filter(ink, 2)
    grain = norm(np.abs(hi) * (1 - creases), 5, 99, body) * body

    # Orientation field (structure tensor on the crease map). Creases wiggle at small scales,
    # so the tensor averages over ~16 px. Creases run perpendicular to the dominant gradient.
    Arr, Arc, Acc = structure_tensor(creases, sigma=16, order="rc")
    theta = np.mod(0.5 * np.arctan2(2 * Arc, Acc - Arr), math.pi) - math.pi / 2
    l1 = 0.5 * (Arr + Acc + np.sqrt((Arr - Acc) ** 2 + 4 * Arc ** 2))
    l2 = 0.5 * (Arr + Acc - np.sqrt((Arr - Acc) ** 2 + 4 * Arc ** 2))
    coherence = ((l1 - l2) / (l1 + l2 + 1e-9)) * body
    hue = ((theta + math.pi / 2) / math.pi)
    hsv = np.stack([hue, np.ones_like(hue) * 0.8, norm(coherence, 1, 99, body)], -1)
    Image.fromarray((hsv * 255).astype(np.uint8), "HSV").convert("RGB").save(os.path.join(args.out, "orientation.png"))

    # The crease spacing and the tile come from the largest square that fits inside the print, so
    # the square holds neither the mouth nor the outline. The padding keeps it inside the image when
    # a tight --crop lets the print touch the edge.
    inside = ndi.distance_transform_cdt(np.pad(body, 1), metric="chessboard")[1:-1, 1:-1]
    cy, cx = np.unravel_index(np.argmax(inside), inside.shape)
    half = int(inside[cy, cx]) - 1
    square = np.s_[cy - half: cy + half, cx - half: cx + half]

    # Crease spacing: dominant frequency of detail perpendicular to creases (FFT of the square). A
    # Hann window stops the jump between opposite edges of the square from showing up as a frequency.
    s = 2 * half
    patch = detail_n[square]
    F = np.abs(np.fft.fftshift(np.fft.fft2((patch - patch.mean()) * np.outer(np.hanning(s), np.hanning(s)))))
    F[s // 2 - 2: s // 2 + 3, s // 2 - 2: s // 2 + 3] = 0
    fy, fx = np.unravel_index(np.argmax(F), F.shape)
    freq = math.hypot(fy - s // 2, fx - s // 2) / s
    spacing_px = (1 / freq) if freq else None

    for name, arr in [("ink", ink), ("pressure", pressure_n), ("detail", detail_n),
                      ("creases", creases), ("grain", grain)]:
        save_gray(arr, os.path.join(args.out, f"{name}.png"))

    tex = np.clip(detail_n * (1 - 0.8 * creases), 0, 1)
    save_gray(seamless(tex[square]), os.path.join(args.out, "texture-tile.png"))

    # Crease angles repeat every 180 degrees, so the histogram wraps around. Its bins are shifted so
    # that vertical is one bin centred on 90. The dominant angles are its three highest peaks after
    # smoothing over neighbouring bins, so a bump on the side of a peak is not a direction of its own.
    ang = (np.degrees(theta[body & (coherence > 0.3)]) + 87.5) % 180 - 87.5
    hist, edges = np.histogram(ang, bins=36, range=(-87.5, 92.5))
    hist = hist + 0.5 * (np.roll(hist, 1) + np.roll(hist, -1))
    peaks = np.nonzero((hist > np.roll(hist, 1)) & (hist >= np.roll(hist, -1)))[0]
    top = [float((edges[i] + edges[i + 1]) / 2) for i in peaks[np.argsort(hist[peaks])[::-1][:3]]]
    stats = {
        "source": os.path.basename(args.photo), "crop_px": [int(v) for v in box], "working_size": [W, H],
        "coverage": float((ink > 0.5).sum() / body.sum()),
        "opacity": {"mean": float(ink[body].mean()),
                    "p10": float(np.percentile(ink[body], 10)),
                    "p50": float(np.percentile(ink[body], 50)),
                    "p90": float(np.percentile(ink[body], 90))},
        "pressure_contrast": float(pressure[body].std() / (pressure[body].mean() + 1e-6)),
        "crease_density": float((creases > 0.5).sum() / body.sum()),
        "crease_spacing_px": spacing_px,
        "crease_spacing_rel": (spacing_px / max(H, W)) if spacing_px else None,
        "dominant_crease_angles_deg": top,
        "orientation_coherence_mean": float(coherence[body].mean()),
        "grain_energy": float(grain[body].mean()),
    }
    with open(os.path.join(args.out, "stats.json"), "w") as f:
        json.dump(stats, f, indent=2)
    print(json.dumps(stats, indent=2))


# ---------- shapes and features ----------
# A recipe lists every ridge, line and weak spot. "at" is a point as fractions of the shape's
# bounding box (x across, y down). Widths, lengths and radii are fractions of the box width.
#   ridge: a paper-coloured gap that opens on the outline and tapers to its tip at "at"
#   line:  a thin crack centred on "at", with short side branches
#   weak:  a patch around "at" where less ink transferred

def load_shape(path):
    """The shape's alpha, bounding box, mouth, the hole the mouth lies in, and the lip line. Holes
    are looked for after closing gaps up to 2% of the print width, so a mouth that reaches the
    outline through a narrow gap still counts."""
    A = np.asarray(Image.open(path).convert("RGBA"))[..., 3].astype(np.float32) / 255
    S = A > 0.5
    if not S.any():
        sys.exit(f"{path} has no pixel with alpha above half; its alpha is the outline")
    ys, xs = np.where(S)
    box = (xs.min(), ys.min(), xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min())
    r = max(1, round(0.01 * box[2]))
    disc = np.hypot(*np.mgrid[-r:r + 1, -r:r + 1]) <= r
    closed = ndi.binary_closing(np.pad(S, r + 1), disc)[r + 1:-r - 1, r + 1:-r - 1] | S
    filled = ndi.binary_fill_holes(closed)
    holes = filled & ~S
    mouth = pick_mouth(holes, box[2])
    lab, _ = ndi.label(holes)
    hole = np.isin(lab, np.unique(lab[mouth])) if mouth.any() else mouth
    return A, box, mouth, hole, lip_line(filled, mouth, box)

def across(x, y, box, line):
    """Crease direction at a point: across each lip, fanning toward the corners, pointing away from
    the line through the mouth and the seams."""
    x0, y0, w, h = box
    mid = np.interp(x, np.arange(len(line["mid_smooth"])), line["mid_smooth"])
    vx, vy = (x - x0 - w / 2) / (w / 2) ** 2, (y - mid) / (0.3 * h) ** 2
    n = np.hypot(vx, vy) + 1e-9
    return vx / n, vy / n

def trace(A, box, line, x, y, steps, wobble, rng, sign=1, heading=None):
    """Walk 1 px at a time along the crease direction (or a fixed heading) until `steps` or the shape ends."""
    pts, turn = [], 0.0
    for _ in range(steps):
        if not (0 <= x < A.shape[1] and 0 <= y < A.shape[0]) or A[int(y), int(x)] < 0.5:
            break
        pts.append((x, y))
        dx, dy = heading or across(x, y, box, line)
        turn = 0.9 * turn + rng.normal(0, wobble)
        c, s = math.cos(turn), math.sin(turn)
        x, y = x + sign * (c * dx - s * dy), y + sign * (s * dx + c * dy)
    return pts

def ridge_stroke(A, box, line, f):
    rng = np.random.default_rng(f["seed"])
    x0, y0, w, h = box
    pts = trace(A, box, line, x0 + f["at"][0] * w, y0 + f["at"][1] * h, w, 0.04, rng)[::-1]   # outline first
    n = len(pts)
    jitter = np.clip(1 + 0.9 * ndi.gaussian_filter1d(rng.standard_normal(n + 8), 3)[4:-4], 0.4, 1.6)
    return [(x, y, f["width"] * w / 2 * (1 - i / n) ** 0.6 * jitter[i]) for i, (x, y) in enumerate(pts)]

def line_strokes(A, box, line, f):
    rng = np.random.default_rng(f["seed"])
    x0, y0, w, h = box
    x, y, half = x0 + f["at"][0] * w, y0 + f["at"][1] * h, int(f["length"] * w / 2)
    main = trace(A, box, line, x, y, half, 0.08, rng, -1)[::-1] + trace(A, box, line, x, y, half, 0.08, rng)[1:]
    taper = lambda pts, r: [(px, py, r * math.sin(math.pi * (i + 0.5) / len(pts)) ** 0.5) for i, (px, py) in enumerate(pts)]
    strokes = [taper(main, f["width"] * w / 2)]
    for _ in range(f["branches"] if len(main) > 8 else 0):
        i = int(rng.integers(2, len(main) - 2))
        dx, dy = main[i + 2][0] - main[i - 2][0], main[i + 2][1] - main[i - 2][1]
        a = math.atan2(dy, dx) + rng.choice([-1, 1]) * rng.uniform(0.4, 1.0) + rng.choice([0, math.pi])
        branch = trace(A, box, line, *main[i], int(rng.uniform(0.3, 0.6) * len(main)), 0.08, rng, heading=(math.cos(a), math.sin(a)))
        if branch:
            strokes.append(taper(branch, 0.7 * f["width"] * w / 2))
    return strokes

def load_recipe(path):
    if os.path.exists(path):
        return json.load(open(path))
    return {"seed": 1, "pressure": 1.1, "ridges": [], "lines": [], "weak": []}

def save_recipe(rec, path):
    """One feature per line, so a recipe is easy to read and edit by hand."""
    def value(v):
        return json.dumps(v) if not isinstance(v, list) else "[" + ",".join("\n  " + json.dumps(x) for x in v) + "\n ]"
    with open(path, "w") as f:
        f.write("{" + ",".join(f'\n "{k}": {value(v)}' for k, v in rec.items()) + "\n}\n")

def add(args):
    A, box, _, _, line = load_shape(args.shape)
    x0, y0, w, h = box
    rec = load_recipe(args.recipe)
    rng = np.random.default_rng(args.seed)
    bx0, by0, bx1, by1 = map(float, args.box.split(",")) if args.box else (0, 0, 1, 1)
    r4 = lambda v: round(float(v), 4)

    def spot():
        if args.at:
            return [float(v) for v in args.at.split(",")]
        for _ in range(10000):
            u, v = rng.uniform(bx0, bx1), rng.uniform(by0, by1)
            x, y = int(x0 + u * w), int(y0 + v * h)
            if 0 <= x < A.shape[1] and 0 <= y < A.shape[0] and A[y, x] > 0.5:
                return [u, v]
        sys.exit("--box does not overlap the shape")

    for _ in range(args.ridges):
        u, v = spot()
        if not args.at:
            # Walk out to the outline, then back in to the mouth. On the photo, lower-lip ridges
            # reach up to about two thirds of the way from the outline to the mouth. The walk in
            # stops at the lip line, where the creases of a shape without a mouth meet.
            ox, oy = trace(A, box, line, x0 + u * w, y0 + v * h, w, 0, rng)[-1]
            side = lambda p: p[1] > np.interp(p[0], np.arange(len(line["mid_smooth"])), line["mid_smooth"])
            inward = list(itertools.takewhile(lambda p: side(p) == side((ox, oy)), trace(A, box, line, ox, oy, w, 0, rng, -1)))
            px, py = inward[int(rng.uniform(0.15, 0.65) * (len(inward) - 1))]
            u, v = (px - x0) / w, (py - y0) / h
        rec["ridges"].append({"at": [r4(u), r4(v)], "width": r4(rng.uniform(0.0025, 0.006)), "seed": int(rng.integers(1e9))})
    for _ in range(args.lines):
        rec["lines"].append({"at": [r4(c) for c in spot()], "width": r4(rng.uniform(0.0025, 0.005)),
                             "length": r4(rng.uniform(0.06, 0.16)), "branches": int(rng.integers(1, 5)),
                             "seed": int(rng.integers(1e9))})
    for _ in range(args.weak):
        rec["weak"].append({"at": [r4(c) for c in spot()], "radius": r4(rng.uniform(0.03, 0.08)),
                            "strength": r4(rng.uniform(0.3, 0.7))})
    save_recipe(rec, args.recipe)
    print(f"{args.recipe}: {len(rec['ridges'])} ridges, {len(rec['lines'])} lines, {len(rec['weak'])} weak spots")


# ---------- render ----------
def load_texture(folder, w):
    """The files analyze wrote, for a shape w pixels wide. When the shape is smaller than the photo's
    print, the photo's grain is blurred first so it does not alias. Each tile is kept as the normal
    score of each pixel's rank, so mixing two samples of it keeps its distribution."""
    missing = [f for f in TEXTURE_FILES if not os.path.exists(os.path.join(folder, f))]
    if missing:
        sys.exit(f"{folder} has no {', '.join(missing)}. Run analyze on a photo of a print first, with --out {folder}.")
    tex = json.load(open(os.path.join(folder, "texture.json")))
    tex["scale"] = scale = tex["print_width_px"] / w      # photo pixels per shape pixel
    blur = 0.5 * math.sqrt(max(scale ** 2 - 1, 0))
    for lip in ("upper", "lower"):
        band = np.asarray(Image.open(os.path.join(folder, f"band-{lip}.png")).convert("LA"), np.float32) / 255
        tile = ndi.gaussian_filter(np.asarray(Image.open(os.path.join(folder, f"lip-{lip}.png")).convert("L"), np.float32), blur, mode="wrap")
        rank = (np.argsort(np.argsort(tile, axis=None)).reshape(tile.shape) + 0.5) / tile.size
        tex[lip].update(band=ndi.gaussian_filter(band[..., 0], blur), valid=band[..., 1], z=ndtri(rank))
    return tex

def lip_texture(t, angle, at, scale, offsets):
    """Ink rank (0..1) from the lip's tile at pixels `at` (x, y from the box corner), turned so the
    tile's creases follow `angle` (degrees). The tile is sampled in 12 turns 15 degrees apart, and
    each pixel mixes the two nearest. Normal scores mixed with weights divided by their length stay
    normal, so the rank keeps its spread."""
    x, y = at
    turn = ((angle - t["crease_angle"]) % 180) / 15
    k0 = np.floor(turn).astype(int) % 12
    f = turn - np.floor(turn)
    z = np.zeros(len(x), np.float32)
    norm2 = np.zeros(len(x), np.float32)
    for k in range(12):
        sel = (k0 == k) | ((k0 + 1) % 12 == k)
        a = math.radians(15 * k)
        c, s = math.cos(a), math.sin(a)
        sample = ndi.map_coordinates(t["z"], [offsets[k][0] + scale * (c * y[sel] - s * x[sel]),
                                               offsets[k][1] + scale * (c * x[sel] + s * y[sel])], order=1, mode="grid-wrap")
        wk = np.where(k0[sel] == k, 1 - f[sel], f[sel])
        z[sel] += wk * sample
        norm2[sel] += wk ** 2
    return ndtr(z / np.sqrt(norm2))

def render(args):
    A, box, mouth, hole, line = load_shape(args.shape)
    x0, y0, w, h = box
    H, W = A.shape
    rec = json.load(open(args.recipe))
    tex = load_texture(args.texture, w)
    rng = np.random.default_rng(rec["seed"])
    offsets = rng.uniform(0, 1, (2, 12, 2))
    ragged = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.01 * w)
    ragged /= ragged.std()

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    inside = A > 0
    to_outline = ndi.distance_transform_edt((A > 0.5) | hole) / w
    cx, cy = across(xs[inside], ys[inside], box, line)
    angle = np.degrees(np.arctan2(cy, cx)) % 180

    ink = np.zeros((H, W), np.float32)
    band = np.zeros((H, W), np.float32)
    for i, (lip, edge, sign) in enumerate((("upper", line["up"], -1), ("lower", line["lo"], 1))):
        t = tex[lip]
        # Lip texture: the tile's rank, mapped to the photo's ink at the same distance from the outline.
        rank = lip_texture(t, angle, (xs[inside] - x0, ys[inside] - y0), tex["scale"], offsets[i] * t["z"].shape)
        table = np.array(t["ink_by_distance"])
        b = np.clip(to_outline[inside] * 100 - 0.5, 0, DIST_BINS)
        lip_ink = ndi.map_coordinates(table, [b, rank * (table.shape[1] - 1)], order=1)
        # Band: the photo's strip at the same position along the edge and the same distance from it.
        # It ends about 10% of the print width from the edge, and where the photo's lip ended, on
        # lines roughened by noise. A wide fade would wash the two textures into a smooth pink.
        lip_band = np.zeros_like(lip_ink)
        if mouth.any():
            _, d, s, knots = lip_coords(line, edge, sign, (H, W), w)
            col = strip_column(s[inside], knots, np.array(t["knots"]), tex["scale"])
            row = d[inside] * tex["print_width_px"]
            strip = ndi.map_coordinates(t["band"], [row, col], order=1, mode="nearest")
            valid = ndi.map_coordinates(ndi.gaussian_filter(t["valid"], 0.005 * tex["print_width_px"]), [row, col],
                                        order=1, mode="constant", cval=0)
            rough = ragged[inside]
            lip_band = np.clip((0.10 - d[inside] + 0.01 * np.clip(rough, -2, 2)) / 0.005, 0, 1) \
                * np.clip((valid - 0.5 - 0.2 * np.clip(rough, -2, 2)) / 0.1 + 0.5, 0, 1)
            lip_ink = (1 - lip_band) * lip_ink + lip_band * strip
        # Where no mouth separates the lips, the two meet in a blend 1% of the print width wide.
        mine = np.clip(0.5 + sign * (ys[inside] - line["mid"][xs[inside].astype(int)]) / (0.01 * w), 0, 1)
        ink[inside] += mine * lip_ink
        band[inside] += mine * lip_band

    # Pressure and weak spots set an exponent. Low ink falls faster than high ink, so lighter pressure
    # prints as fewer, thinner dots, as at the photo's outline.
    e = np.full((H, W), 1.1 / rec["pressure"], np.float32)
    for f in rec["weak"]:
        dd = np.hypot(xs - x0 - f["at"][0] * w, ys - y0 - f["at"][1] * h) / (f["radius"] * w)
        e /= 1 - f["strength"] * np.clip(1.5 * (1 - dd) + 0.3 * ragged, 0, 1)
    ink = ink ** e

    # Ridges and lines cut paper-coloured gaps outside the band. Inside it the photo's own band is drawn.
    gap = Image.new("L", (W, H))
    draw = ImageDraw.Draw(gap)
    strokes = [ridge_stroke(A, box, line, f) for f in rec["ridges"]]
    strokes += [s for f in rec["lines"] for s in line_strokes(A, box, line, f)]
    for stroke in strokes:
        for x, y, r in stroke:
            draw.ellipse((x - r, y - r, x + r, y + r), fill=255)
    ink *= 1 - (1 - band) * ndi.gaussian_filter(np.asarray(gap, np.float32) / 255, 0.5 + 0.001 * w)

    r, g, b = hex_rgb(args.color)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = r, g, b
    out[..., 3] = (np.clip(A * ink, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(args.out)
    print("wrote", args.out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze"); a.add_argument("photo"); a.add_argument("--out", default="kiss_tex"); a.add_argument("--crop")
    b = sub.add_parser("add")
    b.add_argument("recipe"); b.add_argument("--shape", required=True)
    b.add_argument("--ridges", type=int, default=0); b.add_argument("--lines", type=int, default=0)
    b.add_argument("--weak", type=int, default=0)
    b.add_argument("--box"); b.add_argument("--at"); b.add_argument("--seed", type=int)
    c = sub.add_parser("render")
    c.add_argument("recipe"); c.add_argument("--shape", required=True); c.add_argument("--out", required=True)
    c.add_argument("--texture", default="kiss_tex"); c.add_argument("--color", default="#7A1E1E")
    args = ap.parse_args()
    {"analyze": analyze, "add": add, "render": render}[args.cmd](args)
