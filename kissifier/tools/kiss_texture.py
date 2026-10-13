#!/usr/bin/env python3
"""
kiss_texture.py measures the texture of a real lipstick print and generates prints with it on other shapes.

Three commands:

  analyze   photo -> layered maps + stats
      python kiss_texture.py analyze uploads/pexels-umaykaratas-14716155.jpg --out kiss_tex/
      (optional --crop x,y,w,h ; default auto-detects the ink)

  add       place ridges, lines and weak spots on a shape and append them to a recipe (created if missing)
      python kiss_texture.py add kiss.json --shape kiss-red.png --ridges 45 --lines 70 --weak 5
          [--box x0,y0,x1,y1]  only place inside this part of the shape (fractions of its bounding box)
          [--at x,y]           place every new feature at this point instead
          [--seed N]

  render    shape + recipe -> textured PNG in one ink colour
      python kiss_texture.py render kiss.json --shape kiss-red.png --color "#7A1E1E" --out kiss-textured.png

The shape is any PNG whose alpha is the print outline (render an SVG to PNG first).

Outputs of `analyze` (all PNG are 8-bit grayscale, white = more ink unless noted):
  ink.png          total ink density (0..1), the print as an alpha mask
  pressure.png     low-frequency pressure: where the lips pressed hard vs. lightly
  detail.png       ink / pressure: texture with the outline and pressure removed (mid-grey = average)
  creases.png      ridge filter response: the thin paper-coloured lines inside the ink (white = crease)
  grain.png        fine speckle left after removing creases and pressure
  orientation.png  crease direction as hue (HSV), brightness = coherence
  texture-tile.png seamless tile of detail+creases, cut from inside the print at the working size, for CSS mask-image / overlays
  stats.json       coverage, opacity distribution, crease density, spacing, dominant angles (0 = horizontal, 90 = vertical)

Needs: numpy, pillow, scipy, scikit-image   (pip install numpy pillow scipy scikit-image)
"""
import argparse, json, os, math, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.special import ndtr
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
    """Make a square tile seamless. Along each axis in turn, the outer quarter on each side fades
    into a copy of the tile shifted by half its size. The copy's own seam lies in the middle, where
    the fade has not started. Dividing by the length of the two weights keeps the contrast where the
    two mix."""
    n = len(t)
    ramp = np.clip(4 * np.abs(np.arange(n) - (n - 1) / 2) / (n - 1) - 1, 0, 1)
    m = t.mean()
    for axis, w in ((0, ramp[:, None]), (1, ramp[None, :])):
        t = m + ((1 - w) * (t - m) + w * (np.roll(t, n // 2, axis) - m)) / np.hypot(1 - w, w)
    return t


# ---------- ink extraction ----------
def ink_density(rgb):
    """Redness (R - G) separates lipstick from cream paper and is robust to warm lighting."""
    red = rgb[..., 0] - rgb[..., 1]
    border = np.concatenate([red[0], red[-1], red[:, 0], red[:, -1]])
    paper = np.percentile(border, 90)
    ink = np.percentile(red, 99.5)
    d = np.clip((red - paper - 0.02) / (ink - paper - 0.02 + 1e-6), 0, 1)
    return d ** 0.85

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


# ---------- analysis ----------
def analyze(args):
    os.makedirs(args.out, exist_ok=True)
    rgb = load_rgb(args.photo)
    if args.crop:
        x, y, w, h = map(int, args.crop.split(","))
        rgb, box = rgb[y:y + h, x:x + w], (x, y, w, h)
    else:
        rgb, box = auto_crop(rgb)
    H, W = rgb.shape[:2]
    scale = 1200 / max(H, W)          # normalise working size so sigmas mean the same thing
    if scale < 1:
        rgb = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize(
            (int(W * scale), int(H * scale)), Image.LANCZOS)).astype(np.float32) / 255
        H, W = rgb.shape[:2]

    ink = ink_density(rgb)
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


# ---------- generate ----------
# A recipe lists every ridge, line and weak spot. "at" is a point as fractions of the shape's
# bounding box (x across, y down). Widths, lengths and radii are fractions of the box width.
#   ridge: a paper-coloured gap that opens on the outline and tapers to its tip at "at"
#   line:  a thin crack centred on "at", with short side branches
#   weak:  a patch around "at" where less ink transferred

def load_shape(path):
    A = np.asarray(Image.open(path).convert("RGBA"))[..., 3].astype(np.float32) / 255
    ys, xs = np.where(A > 0.5)
    return A, (xs.min(), ys.min(), xs.max() + 1 - xs.min(), ys.max() + 1 - ys.min())

def across(x, y, box):
    """Crease direction at a point: across each lip, fanning toward the corners, pointing away from the mouth."""
    x0, y0, w, h = box
    vx, vy = (x - x0 - w / 2) / (w / 2) ** 2, (y - y0 - h / 2) / (0.3 * h) ** 2
    n = np.hypot(vx, vy) + 1e-9
    return vx / n, vy / n

def trace(A, box, x, y, steps, wobble, rng, sign=1, heading=None):
    """Walk 1 px at a time along the crease direction (or a fixed heading) until `steps` or the shape ends."""
    pts, turn = [], 0.0
    for _ in range(steps):
        if not (0 <= x < A.shape[1] and 0 <= y < A.shape[0]) or A[int(y), int(x)] < 0.5:
            break
        pts.append((x, y))
        dx, dy = heading or across(x, y, box)
        turn = 0.9 * turn + rng.normal(0, wobble)
        c, s = math.cos(turn), math.sin(turn)
        x, y = x + sign * (c * dx - s * dy), y + sign * (s * dx + c * dy)
    return pts

def ridge_stroke(A, box, f):
    rng = np.random.default_rng(f["seed"])
    x0, y0, w, h = box
    pts = trace(A, box, x0 + f["at"][0] * w, y0 + f["at"][1] * h, w, 0.04, rng)[::-1]   # outline first
    n = len(pts)
    jitter = np.clip(1 + 0.9 * ndi.gaussian_filter1d(rng.standard_normal(n + 8), 3)[4:-4], 0.4, 1.6)
    return [(x, y, f["width"] * w / 2 * (1 - i / n) ** 0.6 * jitter[i]) for i, (x, y) in enumerate(pts)]

def line_strokes(A, box, f):
    rng = np.random.default_rng(f["seed"])
    x0, y0, w, h = box
    x, y, half = x0 + f["at"][0] * w, y0 + f["at"][1] * h, int(f["length"] * w / 2)
    main = trace(A, box, x, y, half, 0.08, rng, -1)[::-1] + trace(A, box, x, y, half, 0.08, rng)[1:]
    taper = lambda pts, r: [(px, py, r * math.sin(math.pi * (i + 0.5) / len(pts)) ** 0.5) for i, (px, py) in enumerate(pts)]
    strokes = [taper(main, f["width"] * w / 2)]
    for _ in range(f["branches"] if len(main) > 8 else 0):
        i = int(rng.integers(2, len(main) - 2))
        dx, dy = main[i + 2][0] - main[i - 2][0], main[i + 2][1] - main[i - 2][1]
        a = math.atan2(dy, dx) + rng.choice([-1, 1]) * rng.uniform(0.4, 1.0) + rng.choice([0, math.pi])
        branch = trace(A, box, *main[i], int(rng.uniform(0.3, 0.6) * len(main)), 0.08, rng, heading=(math.cos(a), math.sin(a)))
        if branch:
            strokes.append(taper(branch, 0.7 * f["width"] * w / 2))
    return strokes

def mouth_guide(mouth_edge, w):
    """Height of a curve through the middle of the mouth for every column. It has one height per
    column and is heavily smoothed, so it never turns back on itself. Short pieces of mouth edge,
    such as a notch where the lips meet at a corner, are left out."""
    if not mouth_edge.any():
        return np.zeros(mouth_edge.shape[1])
    lab, n = ndi.label(ndi.binary_dilation(mouth_edge, iterations=2))
    sizes = ndi.sum(mouth_edge, lab, range(1, n + 1))
    keep = mouth_edge & np.isin(lab, 1 + np.nonzero(sizes >= 0.3 * sizes.max())[0])
    ys, xs = np.nonzero(keep)
    count = np.bincount(xs, minlength=mouth_edge.shape[1])
    seen = count > 0
    cols = np.arange(mouth_edge.shape[1])
    guide = np.interp(cols, cols[seen], np.bincount(xs, ys, len(cols))[seen] / count[seen])
    return ndi.gaussian_filter1d(guide, 0.08 * w, mode="nearest")

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
    A, box = load_shape(args.shape)
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
            # reach up to about two thirds of the way from the outline to the mouth.
            ox, oy = trace(A, box, x0 + u * w, y0 + v * h, w, 0, rng)[-1]
            inward = trace(A, box, ox, oy, w, 0, rng, -1)
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

def render(args):
    A, box = load_shape(args.shape)
    x0, y0, w, h = box
    H, W = A.shape
    rec = json.load(open(args.recipe))
    rng = np.random.default_rng(rec["seed"])

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)

    def noise(sigma, gen=rng):
        n = ndi.gaussian_filter(gen.standard_normal((H, W)).astype(np.float32), sigma)
        return n / n.std()

    # The band along the mouth takes its variation from its own generator, so changing how the
    # band varies never changes the rest of the print.
    vary = np.random.default_rng([rec["seed"], 1])

    def streaks(n, steps, direction):
        """Smear noise along a direction field, so it reads as fine wrinkles. Each step keeps the
        heading of the step before, so the field only has to give the line, not which way along it."""
        acc = n.copy()
        for sign in (1, -1):
            x, y = xs.copy(), ys.copy()
            px = py = None
            for _ in range(steps):
                dx, dy = direction(x, y)
                if px is not None:
                    flip = np.where(dx * px + dy * py < 0, -1, 1)
                    dx, dy = dx * flip, dy * flip
                px, py = dx, dy
                x, y = x + sign * dx, y + sign * dy
                acc += ndi.map_coordinates(n, [y, x], order=1, mode="reflect")
        return acc / acc.std()

    # Pressure varies slowly. Ink thins out toward the outer outline, which is the edge the
    # crease direction points out of. The other edges face the mouth. The test is averaged over
    # 3% of the print width of outline, so a small dent in the outer outline stays outer.
    P = rec["pressure"] * np.clip(1 + 0.25 * noise(0.05 * w), 0, None)
    gy, gx = np.gradient(A)
    cx, cy = across(xs, ys, box)
    edge = np.hypot(gx, gy) > 0.1
    facing = ndi.gaussian_filter(np.where(edge, gx * cx + gy * cy, 0), 0.03 * w)
    facing_out = facing / (ndi.gaussian_filter(edge.astype(np.float32), 0.03 * w) + 1e-9) < 0
    to_outer = ndi.distance_transform_edt(~(edge & facing_out))
    to_mouth, (nearest_y, _) = ndi.distance_transform_edt(~(edge & ~facing_out), return_indices=True)
    if not (edge & ~facing_out).any():
        to_mouth[:] = np.inf  # a shape with no mouth has no band along it
    P *= 0.7 + 0.3 * np.clip(to_outer / (0.1 * w), 0, 1)
    P *= np.clip(to_outer / (0.02 * w), 0, 1) ** 0.7

    # Along the mouth each lip prints a band without cracks.
    ragged = noise(0.01 * w)
    depth = 0.06 * w * np.exp(0.2 * noise(0.04 * w, vary))
    band = np.clip((depth - to_mouth + 0.01 * w * ragged) / (0.015 * w), 0, 1)

    for f in rec["weak"]:
        d = np.hypot(xs - x0 - f["at"][0] * w, ys - y0 - f["at"][1] * h) / (f["radius"] * w)
        P *= 1 - f["strength"] * np.clip(1.5 * (1 - d) + 0.3 * ragged, 0, 1)

    gap = Image.new("L", (W, H))
    draw = ImageDraw.Draw(gap)
    strokes = [ridge_stroke(A, box, f) for f in rec["ridges"]]
    strokes += [s for f in rec["lines"] for s in line_strokes(A, box, f)]
    for stroke in strokes:
        for x, y, r in stroke:
            draw.ellipse((x - r, y - r, x + r, y + r), fill=255)
    P *= 1 - (1 - band) * ndi.gaussian_filter(np.asarray(gap, np.float32) / 255, 0.5 + 0.001 * w)

    # Ink reaches the high points of the paper first, so low pressure prints as dots and streaks.
    # The ink film is thinner where the lips pressed lightly.
    wrinkles = streaks(noise(0.0015 * w), int(0.008 * w), lambda x, y: across(x, y, box))
    paper = wrinkles + 0.3 * noise(0.001 * w)
    outside = np.clip((P - ndtr(paper / paper.std())) / 0.25, 0, 1) * np.clip(0.5 + 0.4 * P + 0.12 * wrinkles, 0.25, 1)

    # The band is a continuous ink film whose grain mixes round mottling with short striations.
    # On the photo the upper lip's band has ink from about 0.27 to 0.87
    # (median 0.51) and the lower lip's from about 0.38 to 0.99 (median 0.75). The upper lip's
    # band is palest next to the mouth and fades raggedly into it. The lower lip keeps a crisp
    # edge, which keeps the corners of the mouth sharp.
    # Striations take their direction from the guide curve, never steeper than 45 degrees, so
    # they run straight past the corners of the mouth instead of wrapping around them.
    slope = np.clip(np.arctan(np.gradient(mouth_guide(edge & ~facing_out, w))), -np.pi / 4, np.pi / 4)
    heading = slope[xs.astype(int)] + 0.2 * noise(0.008 * w, vary)
    tx, ty = np.cos(heading), np.sin(heading)
    parallel = lambda x, y: (ndi.map_coordinates(tx, [y, x], order=1), ndi.map_coordinates(ty, [y, x], order=1))
    texture = 0.6 * noise(0.002 * w, vary) + streaks(noise(0.0015 * w, vary), int(0.007 * w), parallel) \
        + 0.4 * noise(0.0006 * w, vary)
    # The upper lip is where the nearest point of the mouth lies below.
    upper = ndi.gaussian_filter(np.clip((nearest_y - ys) / (0.01 * w) + 0.5, 0, 1), 0.01 * w)
    tone = (1 - upper) * 0.66 + upper * (0.5 + 0.15 * np.clip(to_mouth / depth, 0, 1))
    tone *= np.clip(P / rec["pressure"], 0, 1.2) * np.exp(0.08 * noise(0.02 * w, vary))
    fade = 0.45 + 0.55 * np.clip(to_mouth / (0.012 * w * np.exp(0.5 * ragged)), 0, 1) ** 0.6
    film = np.clip(tone + 0.2 * texture / texture.std(), 0, 1) * (1 - upper * (1 - fade))
    alpha = A * ((1 - band) * outside + band * film)

    r, g, b = hex_rgb(args.color)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = r, g, b
    out[..., 3] = (alpha * 255).astype(np.uint8)
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
    c.add_argument("--color", default="#7A1E1E")
    args = ap.parse_args()
    {"analyze": analyze, "add": add, "render": render}[args.cmd](args)
