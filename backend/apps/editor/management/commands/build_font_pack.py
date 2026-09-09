"""Build the metric-compatible font pack for LibreOffice deck rendering.

    manage.py build_font_pack                # → infra/fonts/pack (dev default)
    manage.py build_font_pack --out /srv/fonts --only 宋体 黑体

Problem (docs/plans/2026-09-09-pptx-font-adaptation.md §1.3): decks set in
宋体 / 黑体 / 微软雅黑 / 方正兰亭黑 / Huawei Sans render on the worker with
Noto CJK, whose vertical metrics (hhea 1.160 / 0.288 → **1.448× line height**)
are far taller than the Windows originals (SimSun/SimHei ≈ 1.00, YaHei ≈
1.32). LibreOffice sizes lines from those metrics, so paragraphs grow by up to
45 % and spill out of their boxes. fontconfig cannot change metrics; the only
fix is a font *file* that carries the original family name with the original
line metrics — the same trick Carlito plays for Calibri.

So this command clones Noto Sans/Serif CJK SC (OFL 1.1, no Reserved Font
Name — renaming is permitted) into one OTF per target family × weight,
rewrites ``hhea`` / ``OS/2`` to the target's (public, approximate) metrics,
renames the ``name`` table (Chinese + English family records so both spellings
match). ``--subset`` additionally trims the glyphs to the GB + Latin
repertoire (~15 MB instead of 16–24 MB per file — but CFF subsetting of the
65k-glyph Noto takes ~7 min per face, so it is opt-in). A ``pack.json``
manifest tells ``office_fonts`` which aliases the pack claims.

The output is **not** committed (``infra/fonts/pack/`` is gitignored): build
locally, rsync to the server's ``infra/fonts/pack`` (mounted read-only at
``/usr/share/fonts/jianzhai`` by docker-compose.prod.yml), then
``reconvert_pptx --all``.
"""

from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# Public, approximate Windows metrics (fraction of unitsPerEm). SimSun/SimHei/
# KaiTi/FangSong share the GB "220/36 of 256" box; Microsoft YaHei is the tall
# one (2167/536 of 2048); DengXian and HarmonyOS/Huawei Sans are estimates
# (decks using them looked right at ≈1.25 and ≈1.17 line height).
METRICS: dict[str, dict[str, float]] = {
    "gb": {"asc": 0.859, "desc": 0.141},
    "yahei": {"asc": 1.058, "desc": 0.262},
    "dengxian": {"asc": 1.000, "desc": 0.250},
    "harmony": {"asc": 0.930, "desc": 0.240},
}


@dataclass(frozen=True)
class PackSpec:
    family: str            # Chinese/primary family name (what decks reference)
    english: str           # English family name record (second exact match)
    ps: str                # ASCII PostScript base name
    aliases: tuple[str, ...]
    category: str
    source: str            # Noto family to clone
    metrics: str           # METRICS key


PACK_SPECS: tuple[PackSpec, ...] = (
    PackSpec("宋体", "SimSun", "JZSongTi",
             ("NSimSun", "新宋体", "宋体-简", "华文宋体", "STSong", "华文中宋", "STZhongsong",
              "仿宋", "FangSong", "仿宋_GB2312", "FangSong_GB2312", "华文仿宋", "STFangsong",
              "方正书宋简体", "FZShuSong-Z01S"),
             "serif", "Noto Serif CJK SC", "gb"),
    PackSpec("黑体", "SimHei", "JZHeiTi",
             ("华文黑体", "STHeiti", "华文细黑", "STXihei", "Heiti SC", "黑体-简",
              "方正兰亭黑简体", "FZLanTingHei-R-GBK", "方正兰亭黑_GBK", "方正兰亭细黑简体", "FZLanTingHeiS-L-GB",
              "方正兰亭中黑简体", "方正兰亭粗黑简体", "方正兰亭纤黑简体", "FZLTHJW", "FZLTXHJW", "FZLTZHJW",
              "幼圆", "YouYuan"),
             "sans", "Noto Sans CJK SC", "gb"),
    PackSpec("微软雅黑", "Microsoft YaHei", "JZYaHei",
             ("Microsoft YaHei UI", "微软雅黑 Light", "Microsoft YaHei Light"),
             "sans", "Noto Sans CJK SC", "yahei"),
    PackSpec("等线", "DengXian", "JZDengXian",
             ("等线 Light", "DengXian Light"),
             "sans", "Noto Sans CJK SC", "dengxian"),
    PackSpec("Huawei Sans", "HarmonyOS Sans SC", "JZHuaweiSans",
             ("HuaweiSans", "HarmonyOS Sans", "HarmonyOS_Sans_SC"),
             "sans", "Noto Sans CJK SC", "harmony"),
)

WEIGHTS: tuple[tuple[str, str, int], ...] = (("Regular", "Regular", 400), ("Bold", "Bold", 700))

# GB repertoire + Latin + punctuation + fullwidth forms + kana (theme JP
# fallbacks). Keeps every glyph a Simplified-Chinese deck can reasonably use
# and drops the ~35k Traditional/Korean/rare glyphs.
SUBSET_RANGES: tuple[tuple[int, int], ...] = (
    (0x0020, 0x024F),   # Basic Latin, Latin-1, Latin Extended A/B
    (0x0370, 0x03FF),   # Greek
    (0x0400, 0x04FF),   # Cyrillic
    (0x2000, 0x206F),   # General punctuation
    (0x2070, 0x209F),   # super/subscripts
    (0x20A0, 0x20CF),   # currency
    (0x2100, 0x214F),   # letterlike
    (0x2150, 0x218F),   # number forms
    (0x2190, 0x21FF),   # arrows
    (0x2200, 0x22FF),   # math operators
    (0x2300, 0x23FF),   # misc technical
    (0x2460, 0x24FF),   # enclosed alphanumerics ①
    (0x2500, 0x257F),   # box drawing
    (0x2580, 0x25FF),   # geometric shapes ■●
    (0x2600, 0x26FF),   # misc symbols ★☆
    (0x2700, 0x27BF),   # dingbats ✔
    (0x3000, 0x303F),   # CJK symbols and punctuation
    (0x3040, 0x30FF),   # Hiragana + Katakana
    (0x3100, 0x312F),   # Bopomofo
    (0x3190, 0x31FF),   # Kanbun / CJK strokes / Katakana ext
    (0x3200, 0x32FF),   # enclosed CJK ㈠
    (0x3300, 0x33FF),   # CJK compatibility ㎡
    (0x3400, 0x4DBF),   # CJK Ext A
    (0x4E00, 0x9FFF),   # CJK Unified
    (0xF900, 0xFAFF),   # CJK compatibility ideographs
    (0xFE30, 0xFE4F),   # CJK compatibility forms (vertical)
    (0xFF00, 0xFFEF),   # halfwidth/fullwidth forms
)


def _fc_file(family: str, style: str) -> tuple[Path, int]:
    out = subprocess.run(
        ["fc-match", "-f", "%{file}\n%{index}\n%{family}\n", f"{family}:style={style}"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60,
    ).stdout.decode("utf-8", "ignore").splitlines()
    if len(out) < 3 or family.lower() not in out[2].lower():
        raise CommandError(f"{family} ({style}) is not installed (fc-match → {out[2:3]}). Install fonts-noto-cjk.")
    return Path(out[0]), int(out[1] or 0)


def _load_face(path: Path, index: int):
    from fontTools.ttLib import TTCollection, TTFont

    if path.suffix.lower() in (".ttc", ".otc"):
        return TTCollection(str(path), lazy=False).fonts[index]
    return TTFont(str(path), lazy=False)


def _subset(font, ranges):
    from fontTools import subset

    unicodes: list[int] = []
    for lo, hi in ranges:
        unicodes.extend(range(lo, hi + 1))
    opts = subset.Options()
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.desubroutinize = False
    opts.recalc_bounds = False
    opts.prune_unicode_ranges = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    return font


def _set_metrics(font, m: dict[str, float]) -> None:
    upm = font["head"].unitsPerEm
    asc, desc = round(m["asc"] * upm), round(m["desc"] * upm)
    hhea, os2 = font["hhea"], font["OS/2"]
    hhea.ascent, hhea.descent, hhea.lineGap = asc, -desc, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = asc, -desc, 0
    os2.usWinAscent, os2.usWinDescent = asc, desc
    if os2.version < 4:
        os2.version = 4                # fsSelection bit 7 is only defined from v4
    os2.fsSelection |= 1 << 7          # USE_TYPO_METRICS
    os2.fsType = 0                     # installable embedding
    if "vhea" in font:
        pass  # vertical metrics untouched


def _rename(font, spec: PackSpec, style: str, weight: int) -> None:
    from fontTools.ttLib.tables._n_a_m_e import NameRecord  # noqa: F401

    name = font["name"]
    name.names = [n for n in name.names if n.nameID not in (1, 2, 3, 4, 6, 16, 17, 18, 20, 21, 22)]
    full_cn = spec.family if style == "Regular" else f"{spec.family} {style}"
    full_en = spec.english if style == "Regular" else f"{spec.english} {style}"
    ps = f"{spec.ps}-{style}"
    uid = f"JianZhai:{ps}:{time.strftime('%Y')}"
    # Windows platform: English (0x409) + Simplified Chinese (0x804) records;
    # fontconfig lists both as families so either spelling exact-matches.
    for lang, fam, full in ((0x409, spec.english, full_en), (0x804, spec.family, full_cn)):
        name.setName(fam, 1, 3, 1, lang)
        name.setName(style, 2, 3, 1, lang)
        name.setName(uid, 3, 3, 1, lang)
        name.setName(full, 4, 3, 1, lang)
        name.setName(ps, 6, 3, 1, lang)
    # Mac platform (some tools insist): English only.
    name.setName(spec.english, 1, 1, 0, 0)
    name.setName(style, 2, 1, 0, 0)
    name.setName(full_en, 4, 1, 0, 0)
    name.setName(ps, 6, 1, 0, 0)
    font["OS/2"].usWeightClass = weight
    if "CFF " in font:
        cff = font["CFF "].cff
        try:
            cff.fontNames[0] = ps
            top = cff.topDictIndex[0]
            top.FullName = full_en
            top.FamilyName = spec.english
        except Exception:  # noqa: BLE001 — cosmetic (pdffonts label)
            pass


class Command(BaseCommand):
    help = "Clone Noto CJK into metric-compatible, renamed fonts (宋体/黑体/微软雅黑/等线/Huawei Sans)."

    def add_arguments(self, parser):
        parser.add_argument("--out", default="", help="output dir (default infra/fonts/pack)")
        parser.add_argument("--only", nargs="*", default=None, help="restrict to these family names")
        parser.add_argument("--subset", action="store_true",
                            help="trim glyphs to the GB + Latin repertoire (slow: ~7 min per face)")
        parser.add_argument("--force", action="store_true", help="rebuild files that already exist")

    def handle(self, *args, **opts):
        out = Path(opts["out"] or (Path(settings.BASE_DIR).parent / "infra" / "fonts" / "pack")).resolve()
        out.mkdir(parents=True, exist_ok=True)
        only = set(opts["only"] or [])
        specs = [s for s in PACK_SPECS if not only or s.family in only or s.english in only]
        if not specs:
            raise CommandError("no matching families")
        manifest_families = []
        for spec in specs:
            files = []
            for style, fc_style, weight in WEIGHTS:
                dest = out / f"{spec.ps}-{style}.otf"
                files.append(dest.name)
                if dest.exists() and not opts["force"]:
                    self.stdout.write(f"skip {dest.name} (exists)")
                    continue
                t0 = time.monotonic()
                src, index = _fc_file(spec.source, fc_style)
                font = _load_face(src, index)
                if opts["subset"]:
                    _subset(font, SUBSET_RANGES)
                _set_metrics(font, METRICS[spec.metrics])
                _rename(font, spec, style, weight)
                font.save(str(dest))
                self.stdout.write(
                    f"{dest.name}: {spec.source} {fc_style} #{index} → {dest.stat().st_size // 1024} KB "
                    f"({time.monotonic() - t0:.1f}s)"
                )
            manifest_families.append({
                "family": spec.family,
                "english": spec.english,
                "aliases": [spec.english, *spec.aliases],
                "category": spec.category,
                "source": spec.source,
                "metrics": METRICS[spec.metrics],
                "files": files,
            })
        manifest = {
            "version": 1,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "license": "Derived from Noto CJK (SIL OFL 1.1, no Reserved Font Name); renamed for metric compatibility.",
            "families": manifest_families,
        }
        (out / "pack.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
        self.stdout.write(self.style.SUCCESS(f"pack → {out} ({len(manifest_families)} families)"))
