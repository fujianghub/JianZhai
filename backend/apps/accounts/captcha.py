"""Server-verified slider-jigsaw captcha for the login form — 古风 themed.

A puzzle is a procedurally-drawn background (one of several styles, in a
curated 古风 palette) with a classic jigsaw piece cut at a random x. Only the
*image pixels* reveal where the notch is — the target x is kept server-side in
Redis (one-time, 120s TTL) — so a script can't read the answer off the
response; it has to actually solve the image. The client drags the extracted
piece to align it and submits the drop x; ``verify_slider`` checks it landed
within TOLERANCE of the stored target.

Everything is drawn at SS× then downsampled with LANCZOS for smooth edges.
Stateless beyond the Redis entry: no model, no migration, no external assets.
"""
from __future__ import annotations

import base64
import io
import math
import random
import secrets

from django.core.cache import cache
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

WIDTH = 384
HEIGHT = 144
PIECE_BOX = 72  # bounding box / coordinate reference for the piece
TOLERANCE = 8  # px the drop may deviate from the true gap
TTL = 120  # seconds a puzzle stays solvable
SS = 2  # supersampling factor (draw big, downscale smooth)
_KEY = "slidecaptcha:{}"

Color = tuple[int, int, int]


class CaptchaThrottle(AnonRateThrottle):
    """Own bucket so puzzle refreshes don't eat the stricter login limit."""

    scope = "captcha"

# Curated 古风 palettes — (gradient top, gradient bottom, ink, accent). Picking
# from a harmonious set keeps every puzzle pretty instead of random-gray.
_PALETTES: list[dict[str, Color]] = [
    {"top": (245, 239, 224), "bot": (228, 214, 186), "ink": (70, 64, 54), "accent": (150, 110, 55)},   # 宣纸墨
    {"top": (247, 234, 229), "bot": (233, 198, 188), "ink": (120, 44, 38), "accent": (192, 57, 43)},   # 朱砂
    {"top": (224, 238, 233), "bot": (190, 222, 213), "ink": (38, 86, 80), "accent": (95, 168, 160)},   # 青瓷
    {"top": (224, 244, 235), "bot": (185, 226, 209), "ink": (18, 104, 76), "accent": (2, 179, 119)},   # 翡翠
    {"top": (226, 230, 246), "bot": (193, 202, 232), "ink": (44, 54, 108), "accent": (92, 112, 182)},  # 黛蓝
    {"top": (44, 48, 64), "bot": (26, 30, 46), "ink": (214, 204, 172), "accent": (236, 172, 18)},      # 暮金(深)
]


def _lerp(a: Color, b: Color, t: float) -> Color:
    return (int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t), int(a[2] + (b[2] - a[2]) * t))


def _gradient(draw: ImageDraw.ImageDraw, w: int, h: int, c0: Color, c1: Color, vertical: bool) -> None:
    if vertical:
        for y in range(h):
            draw.line([(0, y), (w, y)], fill=_lerp(c0, c1, y / h))
    else:
        for x in range(w):
            draw.line([(x, 0), (x, h)], fill=_lerp(c0, c1, x / w))


# ── background styles (all opaque tints — no alpha compositing needed) ─────────


def _bg_gradient_ink(d, w, h, pal):
    _gradient(d, w, h, pal["top"], pal["bot"], vertical=random.random() < 0.5)
    stroke = _lerp(pal["bot"], pal["ink"], 0.55)
    for _ in range(random.randint(3, 5)):
        pts = [(random.randint(0, w), random.randint(0, h)) for _ in range(random.randint(3, 5))]
        d.line(pts, fill=stroke, width=random.randint(2, 4) * SS, joint="curve")
    for _ in range(random.randint(10, 18)):
        r = random.randint(1, 3) * SS
        x, y = random.randint(0, w), random.randint(0, h)
        d.ellipse([x - r, y - r, x + r, y + r], fill=_lerp(pal["bot"], pal["ink"], 0.4))


def _bg_mountains(d, w, h, pal):
    _gradient(d, w, h, pal["top"], pal["bot"], vertical=True)
    for i in range(3):
        col = _lerp(pal["bot"], pal["ink"], 0.22 + 0.22 * i)
        ridge = int(h * (0.42 + 0.17 * i))
        pts = [(0, h)]
        x = 0
        step = max(1, w // 6)
        while x <= w:
            pts.append((x, ridge + random.randint(-h // 10, h // 10)))
            x += step
        pts += [(w, h)]
        d.polygon(pts, fill=col)


def _bg_geometric(d, w, h, pal):
    _gradient(d, w, h, pal["top"], pal["bot"], vertical=random.random() < 0.5)
    for _ in range(20):
        pts = [(random.randint(0, w), random.randint(0, h)) for _ in range(3)]
        d.polygon(pts, fill=_lerp(pal["top"], pal["accent"], random.uniform(0.12, 0.5)))


def _bg_clouds(d, w, h, pal):
    _gradient(d, w, h, pal["top"], pal["bot"], vertical=True)
    stroke = _lerp(pal["bot"], pal["accent"], 0.6)
    for _ in range(random.randint(3, 5)):
        base = random.randint(0, h)
        amp = h * random.uniform(0.04, 0.09)
        phase = random.random() * 6.28
        pts = [(x, int(base + math.sin(x / (w / 6.28) + phase) * amp)) for x in range(0, w + 1, max(1, w // 48))]
        d.line(pts, fill=stroke, width=2 * SS, joint="curve")


_STYLES = [_bg_gradient_ink, _bg_mountains, _bg_geometric, _bg_clouds]


# ── piece shape ───────────────────────────────────────────────────────────────


def _piece_mask(box: int, tabs: dict[str, int]) -> Image.Image:
    """Classic jigsaw mask inside ``box``: a rounded body with a random
    tab(+1) / blank(-1) / flat(0) on each side. Knobs stay inside the box so
    the box stays the coordinate reference for verification."""
    m = Image.new("L", (box, box), 0)
    d = ImageDraw.Draw(m)
    pad = int(box * 0.17)
    r = int(box * 0.13)
    x0, y0, x1, y1 = pad, pad, box - pad, box - pad
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(box * 0.12), fill=255)
    cx, cy = box // 2, box // 2
    centers = {"top": (cx, y0), "bottom": (cx, y1), "left": (x0, cy), "right": (x1, cy)}
    for side, sign in tabs.items():
        if sign == 0:
            continue
        ccx, ccy = centers[side]
        d.ellipse([ccx - r, ccy - r, ccx + r, ccy + r], fill=255 if sign > 0 else 0)
    return m


def _rim(mask: Image.Image) -> Image.Image:
    """Thin edge band of the mask (for the raised highlight)."""
    eroded = mask.filter(ImageFilter.MinFilter(5))
    return ImageChops.subtract(mask, eroded)


def _b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def generate() -> dict:
    """Build a puzzle, stash the answer in Redis, return the client payload."""
    pal = random.choice(_PALETTES)
    box = random.randint(60, 72)
    target_x = random.randint(8, WIDTH - box - 8)
    y = random.randint(8, HEIGHT - box - 8)
    tabs = {s: random.choice([-1, 0, 1]) for s in ("top", "right", "bottom", "left")}
    if all(v == 0 for v in tabs.values()):
        tabs[random.choice(list(tabs))] = random.choice([-1, 1])

    sw, sh, sbox = WIDTH * SS, HEIGHT * SS, box * SS
    sx, sy = target_x * SS, y * SS

    big = Image.new("RGB", (sw, sh), pal["bot"])
    random.choice(_STYLES)(ImageDraw.Draw(big), sw, sh, pal)

    mask = _piece_mask(sbox, tabs)
    rim = _rim(mask)

    # Extract the piece from the background, give it a soft raised rim.
    # NB: Image.paste(src, pos, mask) uses the *mask* as the blend factor and
    # ignores src's own alpha — so to get translucency we scale the mask.
    region = big.crop((sx, sy, sx + sbox, sy + sbox)).convert("RGBA")
    piece_big = Image.new("RGBA", (sbox, sbox), (0, 0, 0, 0))
    piece_big.paste(region, (0, 0), mask)
    piece_big.paste(Image.new("RGBA", (sbox, sbox), (255, 255, 255, 255)), (0, 0), rim.point(lambda v: int(v * 0.8)))

    # Carve the notch: ~50% darken (texture still shows) + a faint light rim.
    bg = big.convert("RGB")
    bg.paste(Image.new("RGB", (sbox, sbox), (0, 0, 0)), (sx, sy), mask.point(lambda v: int(v * 0.5)))
    bg.paste(Image.new("RGB", (sbox, sbox), (255, 255, 255)), (sx, sy), rim.point(lambda v: int(v * 0.5)))

    background = bg.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    piece = piece_big.resize((box, box), Image.Resampling.LANCZOS)

    cid = secrets.token_urlsafe(16)
    cache.set(_KEY.format(cid), int(target_x), TTL)
    return {
        "id": cid,
        "background": _b64_png(background),
        "piece": _b64_png(piece),
        "y": y,
        "piece_width": box,
        "width": WIDTH,
        "height": HEIGHT,
    }


def verify_slider(cid: str, x) -> bool:
    """True iff ``x`` matches the stored target within TOLERANCE. One-time:
    the entry is consumed whether or not the answer is right (so a single
    puzzle can't be reused to brute-force passwords)."""
    if not cid:
        return False
    key = _KEY.format(cid)
    target = cache.get(key)
    if target is None:
        return False
    cache.delete(key)
    try:
        xi = int(round(float(x)))
    except (TypeError, ValueError):
        return False
    return abs(xi - int(target)) <= TOLERANCE


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([CaptchaThrottle])
def get_captcha(request):
    return Response(generate())
