"""Font recognition + adaptation for LibreOffice-rendered Office decks.

Why this exists (docs/plans/2026-09-09-pptx-font-adaptation.md): the PPT
reader paints server-rendered rasters, so every glyph the reader sees was
chosen by LibreOffice on the worker. Without guidance fontconfig resolves
unknown families to its *default sans* — 宋体 lost its serifs, every Latin run
of 微软雅黑 / Huawei Sans fell to DejaVu Sans (wider → different line breaks
→ text spilling out of its box), and CJK fell back per-glyph to Noto CJK,
whose 1.448× line height inflates paragraphs by up to 45 % versus the Windows
originals (≈1.0).

Three layers fix that, all funnelled through :func:`prepare_fonts`:

1. **Inventory** — :func:`inspect_pptx_fonts` reads the theme / master /
   layout / slide XML for every ``typeface`` (plus ``p:embeddedFontLst``).
2. **Resolution** — each referenced family is classified (serif / sans / kai
   / fangsong / mono / symbol / latin) and mapped: exact install → metric
   pack family (``build_font_pack``) → curated rule → category fallback.
   Symbol fonts (Wingdings, Symbol …) are deliberately left alone: LibreOffice
   recodes them onto OpenSymbol itself and a text-font override would turn
   bullets into letters.
3. **fontconfig** — :func:`write_fontconfig` emits a per-conversion
   ``fonts.conf`` (**absolute path** — a relative ``FONTCONFIG_FILE`` makes
   fontconfig silently fall back to *no* config) with ``<match
   target="pattern"> … mode="assign"`` rules for every family that is *not*
   installed. ``prefer`` aliases are not enough: they only prepend candidates
   and fontconfig still hands unknown Latin names to DejaVu. Embedded fonts
   (EOT ``.fntdata``) are unpacked into the workdir and added as a ``<dir>``
   so they win by exact match.

The resulting report (``FontPlan.report()``) is stored on
``DerivedFile(deck_pdf).meta["fonts"]`` so the reader can say which fonts were
substituted — the "识别" half of the feature.
"""

from __future__ import annotations

import json
import logging
import os
import re
import struct
import subprocess
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings

log = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# categories
# --------------------------------------------------------------------------- #

SERIF = "serif"          # 宋体 / 明体 family: Song/Ming
SANS = "sans"            # 黑体 family: Hei/Gothic, incl. 微软雅黑 / 兰亭黑
KAI = "kai"              # 楷体
FANGSONG = "fangsong"    # 仿宋
MONO = "mono"
SYMBOL = "symbol"        # Wingdings / Symbol — LibreOffice recodes → leave alone
LATIN_SANS = "latin-sans"
LATIN_SERIF = "latin-serif"
UNKNOWN = "unknown"

# Method labels in the report.
M_EXACT = "exact"          # family installed as-is
M_EMBEDDED = "embedded"    # unpacked from the deck
M_PACK = "pack"            # metric-compatible pack family (build_font_pack)
M_RULE = "rule"            # curated substitution below
M_CLASS = "classified"     # keyword classification → category fallback
M_SYSTEM = "system"        # left to fontconfig / LibreOffice (symbol fonts, metric aliases)

# Ordered fallback candidates per category; the first *installed* one wins.
# Noto CJK is what the image ships (fonts-noto-cjk); the others come from the
# optional Debian packages / font volume listed in infra/backend.Dockerfile.
CATEGORY_TARGETS: dict[str, tuple[str, ...]] = {
    SERIF: ("Noto Serif CJK SC", "Source Han Serif SC", "AR PL UMing CN", "Noto Serif"),
    SANS: ("Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", "Noto Sans"),
    KAI: ("LXGW WenKai", "LXGW WenKai Screen", "AR PL UKai CN", "Noto Serif CJK SC"),
    FANGSONG: ("Zhuque Fangsong (technical preview)", "Noto Serif CJK SC"),
    MONO: ("Noto Sans Mono CJK SC", "JetBrains Mono", "Liberation Mono", "DejaVu Sans Mono"),
    LATIN_SANS: ("Liberation Sans", "Noto Sans", "DejaVu Sans"),
    LATIN_SERIF: ("Liberation Serif", "Noto Serif", "DejaVu Serif"),
    UNKNOWN: ("Noto Sans CJK SC", "Noto Sans"),
}

# Curated rules: (aliases, category). The *target* is the category's first
# installed candidate unless a metric pack family claims the alias first.
# Aliases are matched after :func:`normalize_name` (NFKC + lowercase + no
# spaces), so "Microsoft YaHei", "microsoft yahei" and "ＭicrosoftYaHei" all hit.
FONT_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    # --- Simplified Chinese: serif ---
    (("宋体", "SimSun", "NSimSun", "新宋体", "宋体-简", "华文宋体", "STSong", "华文中宋", "STZhongsong",
      "方正书宋简体", "FZShuSong-Z01S", "方正宋体S-超大字符集", "思源宋体", "Source Han Serif SC",
      "Source Han Serif", "Noto Serif SC", "SimSun-ExtB", "宋体-PUA", "Songti SC", "宋体-简"), SERIF),
    # --- Simplified Chinese: sans ---
    (("黑体", "SimHei", "华文黑体", "STHeiti", "华文细黑", "STXihei", "Heiti SC", "黑体-简",
      "微软雅黑", "Microsoft YaHei", "Microsoft YaHei UI", "微软雅黑 Light", "Microsoft YaHei Light",
      "等线", "DengXian", "等线 Light", "DengXian Light",
      "方正兰亭黑简体", "FZLanTingHei-R-GBK", "方正兰亭黑_GBK", "方正兰亭细黑简体", "FZLanTingHeiS-L-GB",
      "方正兰亭中黑简体", "方正兰亭粗黑简体", "方正兰亭纤黑简体", "FZLTHJW", "FZLTXHJW", "FZLTZHJW",
      "Huawei Sans", "HuaweiSans", "HarmonyOS Sans", "HarmonyOS Sans SC", "HarmonyOS_Sans_SC",
      "阿里巴巴普惠体", "Alibaba PuHuiTi", "Alibaba Sans", "思源黑体", "Source Han Sans SC", "Source Han Sans",
      "Noto Sans SC", "PingFang SC", "苹方-简", "苹方", "MiSans", "OPPOSans", "OPPO Sans", "汉仪旗黑",
      "HYQiHei", "汉仪中黑简", "站酷高端黑", "站酷酷黑", "幼圆", "YouYuan", "华文琥珀", "STHupo",
      "华文彩云", "STCaiyun", "华文新魏", "STXinwei", "华文隶书", "STLiti", "隶书", "LiSu"), SANS),
    # --- Simplified Chinese: kai / fangsong ---
    (("楷体", "KaiTi", "楷体_GB2312", "KaiTi_GB2312", "华文楷体", "STKaiti", "Kaiti SC", "楷体-简",
      "方正楷体简体", "FZKai-Z03S", "霞鹜文楷", "LXGW WenKai"), KAI),
    (("仿宋", "FangSong", "仿宋_GB2312", "FangSong_GB2312", "华文仿宋", "STFangsong", "方正仿宋简体",
      "FZFangSong-Z02S"), FANGSONG),
    # --- Traditional Chinese / Japanese / Korean (theme script fallbacks) ---
    (("新細明體", "PMingLiU", "細明體", "MingLiU", "PMingLiU-ExtB", "MingLiU-ExtB", "微軟正黑體",
      "Microsoft JhengHei", "Microsoft JhengHei UI", "標楷體", "DFKai-SB"), SERIF),
    (("ＭＳ Ｐゴシック", "MS PGothic", "ＭＳ ゴシック", "MS Gothic", "ＭＳ Ｐ明朝", "MS PMincho", "ＭＳ 明朝",
      "MS Mincho", "Meiryo", "Meiryo UI", "游ゴシック", "Yu Gothic", "游ゴシック Light", "Yu Gothic Light",
      "游明朝", "Yu Mincho", "メイリオ"), SANS),
    (("맑은 고딕", "Malgun Gothic", "맑은 고딕 Semilight", "Malgun Gothic Semilight", "돋움", "Dotum", "굴림",
      "Gulim", "바탕", "Batang", "궁서", "Gungsuh"), SANS),
    # --- Latin without metric-compatible twins on Linux ---
    (("Segoe UI", "Segoe UI Light", "Segoe UI Semibold", "Segoe UI Semilight", "Segoe UI Black", "Tahoma",
      "Verdana", "Trebuchet MS", "Century Gothic", "Franklin Gothic Book", "Franklin Gothic Medium", "Gill Sans MT",
      "Lucida Sans", "Lucida Sans Unicode", "Candara", "Corbel", "Helvetica", "Helvetica Neue", "Myriad Pro",
      "Frutiger", "FrutigerNext LT Regular", "FrutigerNext LT Medium", "FrutigerNext LT Bold", "Univers",
      "Roboto", "Open Sans", "Lato", "Montserrat", "Nirmala UI", "Leelawadee UI", "Ebrima"), LATIN_SANS),
    (("Times New Roman", "Times", "Cambria", "Cambria Math", "Georgia", "Garamond", "Book Antiqua", "Palatino Linotype", "Century Schoolbook", "Bookman Old Style",
      "Constantia", "Perpetua", "Baskerville Old Face", "Goudy Old Style", "Sylfaen"), LATIN_SERIF),
    (("Consolas", "Courier New", "Lucida Console", "Source Code Pro", "Fira Code", "Menlo", "Monaco",
      "SimSun-ExtB Mono"), MONO),
    # --- Symbol fonts: LibreOffice recodes to OpenSymbol; never override ---
    (("Wingdings", "Wingdings 2", "Wingdings 3", "Webdings", "Symbol", "MT Extra", "Marlett",
      "Segoe UI Symbol", "Segoe UI Emoji", "Segoe MDL2 Assets", "Segoe Fluent Icons", "ZapfDingbats"), SYMBOL),
)

def normalize_name(name: str) -> str:
    """Canonical key for font-name comparison: NFKC, lowercase, no whitespace,
    trailing weight/style words dropped (``"Microsoft YaHei Bold"`` →
    ``microsoftyahei``)."""
    s = unicodedata.normalize("NFKC", name or "").strip().lower()
    s = re.sub(r"\s*[-_]?\s*(regular|normal|book|roman)$", "", s)
    s = re.sub(r"\s+", "", s)
    return s


def _build_rule_index() -> dict[str, str]:
    idx: dict[str, str] = {}
    for aliases, category in FONT_RULES:
        for a in aliases:
            idx.setdefault(normalize_name(a), category)
    return idx


_RULE_INDEX = _build_rule_index()

_METRIC_ALIAS_NAMES = frozenset(
    normalize_name(n)
    for n in (
        "Calibri", "Calibri Light", "Cambria", "Cambria Math", "Arial", "Arial Black", "Arial Narrow",
        "Times New Roman", "Courier New", "Helvetica", "Times", "Courier", "Liberation Sans",
        "Liberation Serif", "Liberation Mono", "Carlito", "Caladea", "Georgia",
    )
)

_KEYWORDS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(楷|kai)", re.I), KAI),
    (re.compile(r"(仿宋|fangsong)", re.I), FANGSONG),
    (re.compile(r"(宋|song|明|ming|serif|batang|mincho)", re.I), SERIF),
    (re.compile(r"(黑|hei|gothic|sans|雅黑|兰亭|圆|yuan|round|dotum|gulim|puhui|harmony|misans)", re.I), SANS),
    (re.compile(r"(mono|code|consol|courier|typewriter)", re.I), MONO),
    (re.compile(r"(wingding|webding|symbol|dingbat|emoji|icon)", re.I), SYMBOL),
)


def classify_font_name(name: str) -> str:
    """Category for a family name: curated rule first, then keywords, then
    ``LATIN_SANS`` for pure-ASCII names and ``UNKNOWN`` otherwise."""
    key = normalize_name(name)
    if not key:
        return UNKNOWN
    if key in _RULE_INDEX:
        return _RULE_INDEX[key]
    ascii_only = bool(re.fullmatch(r"[\x00-\x7f]+", name or ""))
    for pat, cat in _KEYWORDS:
        if pat.search(name):
            # "Whatever Sans" / "Foo Serif" with no CJK in the name are Latin
            # faces — keep them on the Latin (Liberation) chain, not Noto CJK.
            if ascii_only and cat == SANS:
                return LATIN_SANS
            if ascii_only and cat == SERIF:
                return LATIN_SERIF
            return cat
    if ascii_only:
        return LATIN_SANS
    return UNKNOWN


# --------------------------------------------------------------------------- #
# inventory
# --------------------------------------------------------------------------- #

# latin/ea/cs/sym run slots + buFont (bullet fonts — where Wingdings really lives)
_SLOT_ATTR = re.compile(r'<a:(latin|ea|cs|sym|buFont)\b[^>]*?\btypeface="([^"]*)"')
_THEME_FONT = re.compile(r'<a:font\b[^>]*?\bscript="([^"]*)"[^>]*?\btypeface="([^"]*)"')
_EMBEDDED_FONT = re.compile(r"<p:embeddedFont>(.*?)</p:embeddedFont>", re.S)
_EMBEDDED_NAME = re.compile(r'<p:font\b[^>]*?\btypeface="([^"]*)"')
_EMBEDDED_STYLE = re.compile(r'<p:(regular|bold|italic|boldItalic)\b[^>]*?\br:id="([^"]*)"')
_REL = re.compile(r'<Relationship\b[^>]*?\bId="([^"]*)"[^>]*?\bTarget="([^"]*)"')
_REL_ALT = re.compile(r'<Relationship\b[^>]*?\bTarget="([^"]*)"[^>]*?\bId="([^"]*)"')


@dataclass
class EmbeddedFont:
    name: str
    style: str            # regular | bold | italic | boldItalic
    part: str             # zip member name
    status: str = "pending"   # extracted | compressed | unknown | missing | error
    path: str = ""        # extracted file path


@dataclass
class FontInventory:
    referenced: dict[str, int] = field(default_factory=dict)   # family → refs (theme + runs)
    theme: dict[str, list[str]] = field(default_factory=dict)  # slot (latin/ea/cs) → families
    # Families that only appear as <a:font script="…"> per-script fallbacks in
    # the theme (Latha, DokChampa, 新細明體 …): PowerPoint lists ~30 of them in
    # every deck and they seldom render a glyph — reported, not counted as
    # substitutions.
    script_only: set[str] = field(default_factory=set)
    embedded: list[EmbeddedFont] = field(default_factory=list)
    scanned_parts: int = 0

    @property
    def families(self) -> list[str]:
        return sorted(self.referenced, key=lambda k: (-self.referenced[k], k))


def _content_parts(names: list[str]) -> list[str]:
    return [
        n for n in names
        if n.endswith(".xml")
        and n.startswith(("ppt/slides/", "ppt/slideMasters/", "ppt/slideLayouts/", "ppt/theme/",
                          "ppt/notesMasters/", "ppt/handoutMasters/", "ppt/tables/"))
        and "/_rels/" not in n
    ]


def inspect_pptx_fonts(path: Path | str) -> FontInventory:
    """Scan a pptx for every font family it references (zip + regex — python-pptx
    only exposes run-level names and misses theme/master slots)."""
    inv = FontInventory()
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        log.warning("office_fonts: cannot open %s: %s", path, exc)
        return inv
    direct: set[str] = set()
    script: set[str] = set()
    with zf:
        names = zf.namelist()
        for part in _content_parts(names):
            try:
                xml = zf.read(part).decode("utf-8", "ignore")
            except Exception:  # noqa: BLE001
                continue
            inv.scanned_parts += 1
            is_theme = part.startswith("ppt/theme/")
            for slot, face in _SLOT_ATTR.findall(xml):
                if not face or face.startswith("+"):
                    continue  # +mn-lt / +mj-ea theme references
                inv.referenced[face] = inv.referenced.get(face, 0) + 1
                direct.add(face)
                if is_theme and slot in ("latin", "ea", "cs"):
                    inv.theme.setdefault(slot, [])
                    if face not in inv.theme[slot]:
                        inv.theme[slot].append(face)
            if is_theme:
                # <a:font script="Hans" typeface="宋体"/> per-script fallbacks
                for _script, face in _THEME_FONT.findall(xml):
                    if face and not face.startswith("+"):
                        inv.referenced[face] = inv.referenced.get(face, 0) + 1
                        script.add(face)
        inv.script_only = script - direct
        if "ppt/presentation.xml" in names:
            inv.embedded = _embedded_fonts(zf, names)
    return inv


def _embedded_fonts(zf: zipfile.ZipFile, names: list[str]) -> list[EmbeddedFont]:
    try:
        pres = zf.read("ppt/presentation.xml").decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return []
    rels: dict[str, str] = {}
    rel_part = "ppt/_rels/presentation.xml.rels"
    if rel_part in names:
        rx = zf.read(rel_part).decode("utf-8", "ignore")
        for rid, target in _REL.findall(rx):
            rels[rid] = target
        for target, rid in _REL_ALT.findall(rx):
            rels.setdefault(rid, target)
    out: list[EmbeddedFont] = []
    for block in _EMBEDDED_FONT.findall(pres):
        m = _EMBEDDED_NAME.search(block)
        if not m:
            continue
        fname = m.group(1)
        for style, rid in _EMBEDDED_STYLE.findall(block):
            target = rels.get(rid, "")
            if target.startswith("/"):
                part = target.lstrip("/")           # absolute part name
            elif target:
                part = "ppt/" + target              # relative to ppt/presentation.xml
            else:
                part = ""
            out.append(EmbeddedFont(name=fname, style=style, part=part,
                                    status="pending" if part in names else "missing"))
    return out


# --------------------------------------------------------------------------- #
# embedded font extraction (EOT container → TTF/OTF)
# --------------------------------------------------------------------------- #

_EOT_MAGIC = 0x504C
_EOT_TTCOMPRESSED = 0x00000004
_EOT_XOR = 0x10000000


def unwrap_embedded_font(data: bytes) -> tuple[bytes | None, str]:
    """Return ``(font_bytes, status)`` for a ``.fntdata`` payload.

    PowerPoint stores embedded fonts as Embedded OpenType (EOT). The font data
    sits at the tail (``FontDataSize`` bytes); MTX-compressed payloads
    (``TTEMBED_TTCOMPRESSED``) need libeot and are reported as ``compressed``.
    Raw TrueType/OpenType blobs pass through unchanged.
    """
    if len(data) < 4:
        return None, "unknown"
    head = data[:4]
    if head in (b"\x00\x01\x00\x00", b"OTTO", b"true", b"ttcf"):
        return data, "extracted"
    if len(data) >= 36:
        eot_size, font_size, _version, flags = struct.unpack_from("<IIII", data, 0)
        (magic,) = struct.unpack_from("<H", data, 34)
        if magic == _EOT_MAGIC and 0 < font_size <= len(data):
            if flags & _EOT_TTCOMPRESSED:
                return None, "compressed"
            body = data[-font_size:]
            if flags & _EOT_XOR:
                body = bytes(b ^ 0x50 for b in body)
            if body[:4] in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
                return body, "extracted"
            return None, "unknown"
    return None, "unknown"


def extract_embedded_fonts(pptx_path: Path | str, inventory: FontInventory, outdir: Path) -> list[Path]:
    """Unpack the deck's embedded fonts into ``outdir``; updates each
    :class:`EmbeddedFont` status/path and returns the written files."""
    written: list[Path] = []
    if not inventory.embedded:
        return written
    try:
        zf = zipfile.ZipFile(pptx_path)
    except (zipfile.BadZipFile, OSError):
        return written
    outdir.mkdir(parents=True, exist_ok=True)
    with zf:
        for i, ef in enumerate(inventory.embedded):
            if ef.status == "missing":
                continue
            try:
                raw = zf.read(ef.part)
            except KeyError:
                ef.status = "missing"
                continue
            except Exception:  # noqa: BLE001
                ef.status = "error"
                continue
            body, status = unwrap_embedded_font(raw)
            ef.status = status
            if body is None:
                continue
            ext = ".otf" if body[:4] == b"OTTO" else ".ttf"
            safe = re.sub(r"[^\w.-]+", "_", f"{ef.name}-{ef.style}") or f"font{i}"
            dest = outdir / f"{i:02d}-{safe}{ext}"
            dest.write_bytes(body)
            ef.path = str(dest)
            written.append(dest)
    return written


# --------------------------------------------------------------------------- #
# installed families / metric pack
# --------------------------------------------------------------------------- #


def font_dirs() -> list[Path]:
    """Extra font directories (metric pack, operator-provided fonts) that exist."""
    raw = getattr(settings, "OFFICE_FONT_DIRS", None) or []
    out: list[Path] = []
    for d in raw:
        p = Path(d)
        if p.is_dir() and p not in out:
            out.append(p)
    return out


def cache_dir() -> Path:
    p = Path(getattr(settings, "OFFICE_FONT_CACHE_DIR", None) or Path(tempfile.gettempdir()) / "jianzhai-fontconfig")
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError:
        p = Path(tempfile.mkdtemp(prefix="jz-fc-"))
    return p


@dataclass
class PackFamily:
    family: str
    aliases: list[str]
    category: str
    files: list[str]


def load_pack_manifests(dirs: list[Path]) -> list[PackFamily]:
    """Read ``pack.json`` manifests written by ``build_font_pack``."""
    out: list[PackFamily] = []
    for d in dirs:
        mf = d / "pack.json"
        if not mf.is_file():
            continue
        try:
            data = json.loads(mf.read_text("utf-8"))
        except Exception:  # noqa: BLE001
            log.warning("office_fonts: unreadable pack manifest %s", mf)
            continue
        for fam in data.get("families", []):
            out.append(PackFamily(
                family=fam.get("family", ""),
                aliases=list(fam.get("aliases", [])),
                category=fam.get("category", UNKNOWN),
                files=list(fam.get("files", [])),
            ))
    return out


_INSTALLED_CACHE: dict[str, tuple[float, frozenset[str], dict[str, str]]] = {}


def installed_families(base_conf: Path, *, ttl: float = 300.0) -> tuple[frozenset[str], dict[str, str]]:
    """``(normalized names, normalized → display name)`` of every family
    fontconfig sees through ``base_conf``. Cached per conf path for ``ttl`` s."""
    import time

    key = str(base_conf)
    hit = _INSTALLED_CACHE.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < ttl:
        return hit[1], hit[2]
    names: set[str] = set()
    display: dict[str, str] = {}
    try:
        proc = subprocess.run(
            ["fc-list", ":", "family"],
            env={"FONTCONFIG_FILE": str(base_conf), "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                 "HOME": str(cache_dir())},
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60,
        )
        for line in proc.stdout.decode("utf-8", "ignore").splitlines():
            for fam in line.split(","):
                fam = fam.strip()
                if fam:
                    k = normalize_name(fam)
                    names.add(k)
                    display.setdefault(k, fam)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("office_fonts: fc-list failed: %s", exc)
    frozen = frozenset(names)
    _INSTALLED_CACHE[key] = (now, frozen, display)
    return frozen, display


def _conf_header() -> str:
    return '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'


def _conf_dirs(dirs: list[Path]) -> str:
    return "".join(f"  <dir>{escape(str(d))}</dir>\n" for d in dirs)


def write_base_fontconfig(dirs: list[Path] | None = None) -> Path:
    """The static per-process config: system config + extra font dirs + a
    persistent cache dir (a fresh ``HOME`` per conversion used to rebuild the
    fontconfig cache from scratch every time)."""
    dirs = font_dirs() if dirs is None else dirs
    cache = cache_dir()
    body = (
        _conf_header()
        + '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
        + _conf_dirs(dirs)
        + f"  <cachedir>{escape(str(cache / 'cache'))}</cachedir>\n"
        + "</fontconfig>\n"
    )
    path = cache / "base.conf"
    try:
        if not path.exists() or path.read_text("utf-8") != body:
            path.write_text(body, "utf-8")
    except OSError:
        fd, tmp = tempfile.mkstemp(prefix="jz-fc-base-", suffix=".conf")
        os.close(fd)
        path = Path(tmp)
        path.write_text(body, "utf-8")
    return path.resolve()


# --------------------------------------------------------------------------- #
# resolution
# --------------------------------------------------------------------------- #


@dataclass
class FontResolution:
    source: str
    category: str
    target: str            # "" = leave to the system
    method: str
    refs: int = 0
    scope: str = "text"    # text | script (theme per-script fallback only)

    @property
    def needs_rule(self) -> bool:
        return bool(self.target) and self.method in (M_PACK, M_RULE, M_CLASS)


def _pick_installed(candidates: tuple[str, ...] | list[str], installed: frozenset[str]) -> str:
    for c in candidates:
        if normalize_name(c) in installed:
            return c
    return ""


def resolve_fonts(
    inventory: FontInventory,
    installed: frozenset[str],
    packs: list[PackFamily] | None = None,
    embedded_ok: set[str] | None = None,
) -> list[FontResolution]:
    """Decide a target for every referenced family (see module docstring)."""
    packs = packs or []
    pack_alias: dict[str, PackFamily] = {}
    for pf in packs:
        if normalize_name(pf.family) not in installed:
            continue  # manifest present but files not visible → ignore
        for a in [pf.family, *pf.aliases]:
            pack_alias.setdefault(normalize_name(a), pf)
    embedded_ok = embedded_ok or set()
    out: list[FontResolution] = []
    for name in inventory.families:
        refs = inventory.referenced[name]
        scope = "script" if name in inventory.script_only else "text"
        key = normalize_name(name)
        category = classify_font_name(name)
        if key in embedded_ok:
            out.append(FontResolution(name, category, name, M_EMBEDDED, refs, scope))
            continue
        if key in installed:
            method = M_PACK if key in pack_alias and pack_alias[key].family == name else M_EXACT
            out.append(FontResolution(name, category, name, method, refs, scope))
            continue
        if category == SYMBOL or key in _METRIC_ALIAS_NAMES:
            out.append(FontResolution(name, category, "", M_SYSTEM, refs, scope))
            continue
        pf = pack_alias.get(key)
        if pf is not None:
            out.append(FontResolution(name, category, pf.family, M_PACK, refs, scope))
            continue
        target = _pick_installed(CATEGORY_TARGETS.get(category, CATEGORY_TARGETS[UNKNOWN]), installed)
        if not target:
            target = _pick_installed(CATEGORY_TARGETS[UNKNOWN], installed)
        method = M_RULE if key in _RULE_INDEX else M_CLASS
        out.append(FontResolution(name, category, target, method, refs, scope))
    return out


def write_fontconfig(
    resolutions: list[FontResolution],
    workdir: Path,
    *,
    extra_dirs: list[Path] | None = None,
    base_dirs: list[Path] | None = None,
) -> Path:
    """Emit the per-conversion ``fonts.conf`` (absolute path) in ``workdir``."""
    dirs = list(font_dirs() if base_dirs is None else base_dirs) + list(extra_dirs or [])
    cache = cache_dir()
    rules = []
    for r in resolutions:
        if not r.needs_rule:
            continue
        for alias in _family_variants(r.source):
            rules.append(
                '  <match target="pattern">\n'
                f'    <test qual="any" name="family"><string>{escape(alias)}</string></test>\n'
                f'    <edit name="family" mode="assign" binding="strong"><string>{escape(r.target)}</string></edit>\n'
                "  </match>\n"
            )
    body = (
        _conf_header()
        + '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
        + _conf_dirs(dirs)
        + f"  <cachedir>{escape(str(cache / 'cache'))}</cachedir>\n"
        + "".join(rules)
        + "</fontconfig>\n"
    )
    path = (Path(workdir) / "fonts.conf").resolve()
    path.write_text(body, "utf-8")
    return path


def _family_variants(name: str) -> list[str]:
    """Spellings LibreOffice may hand fontconfig for one deck family: the raw
    name plus its NFKC form (full-width spaces / letters normalised)."""
    out = [name]
    nfkc = unicodedata.normalize("NFKC", name)
    if nfkc != name:
        out.append(nfkc)
    return out


# --------------------------------------------------------------------------- #
# plan
# --------------------------------------------------------------------------- #


@dataclass
class FontPlan:
    inventory: FontInventory
    resolutions: list[FontResolution]
    conf_path: Path | None
    env: dict[str, str]
    embedded_dir: Path | None = None
    pack_present: bool = False

    def report(self) -> dict:
        substituted = [
            r for r in self.resolutions if r.method in (M_PACK, M_RULE, M_CLASS) and r.scope == "text"
        ]
        return {
            "referenced": [
                {"name": r.source, "refs": r.refs, "category": r.category, "target": r.target,
                 "method": r.method, "scope": r.scope}
                for r in self.resolutions
            ],
            "embedded": [
                {"name": e.name, "style": e.style, "status": e.status} for e in self.inventory.embedded
            ],
            "substituted": [r.source for r in substituted],
            "missing": [r.source for r in substituted if r.method == M_CLASS],
            "pack": self.pack_present,
            "engine": "libreoffice",
        }


def prepare_fonts(pptx_path: Path | str, workdir: Path | str) -> FontPlan:
    """Inventory + resolution + fonts.conf for one deck; never raises — on any
    failure the plan degrades to the system defaults (empty ``env``)."""
    workdir = Path(workdir)
    try:
        inventory = inspect_pptx_fonts(pptx_path)
        emb_dir = workdir / "embedded-fonts"
        extracted = extract_embedded_fonts(pptx_path, inventory, emb_dir)
        base_conf = write_base_fontconfig()
        installed, _display = installed_families(base_conf)
        packs = load_pack_manifests(font_dirs())
        embedded_ok = {normalize_name(e.name) for e in inventory.embedded if e.status == "extracted"}
        resolutions = resolve_fonts(inventory, installed, packs, embedded_ok)
        conf = write_fontconfig(resolutions, workdir, extra_dirs=[emb_dir] if extracted else None)
        env = {
            "FONTCONFIG_FILE": str(conf),
            "XDG_CACHE_HOME": str(cache_dir()),
            "LANG": "C.UTF-8",
        }
        plan = FontPlan(inventory, resolutions, conf, env, emb_dir if extracted else None,
                        pack_present=any(normalize_name(p.family) in installed for p in packs))
        try:
            (workdir / "fonts-report.json").write_text(json.dumps(plan.report(), ensure_ascii=False), "utf-8")
        except OSError:
            pass
        return plan
    except Exception:  # noqa: BLE001 — fonts must never block the conversion
        log.exception("office_fonts: prepare failed for %s — using system defaults", pptx_path)
        return FontPlan(FontInventory(), [], None, {})


def load_report(workdir: Path | str) -> dict | None:
    p = Path(workdir) / "fonts-report.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return None


# --------------------------------------------------------------------------- #
# static config for the image (Chromium exporter shares it)
# --------------------------------------------------------------------------- #


def render_static_fontconfig(dirs: tuple[str, ...] = ("/usr/share/fonts/jianzhai",)) -> str:
    """``infra/fonts/60-jianzhai-office.conf``: extra font dirs + *prefer*
    aliases for the curated CJK families. ``prefer`` (not ``assign``) on
    purpose — system-wide it must never shadow a font the operator installs
    under its real name; the per-conversion config handles the hard overrides."""
    lines = [_conf_header()]
    lines.append("  <!-- generated by `manage.py office_fonts_conf`; edit FONT_RULES instead -->\n")
    for d in dirs:
        lines.append(f"  <dir>{escape(d)}</dir>\n")
    for aliases, category in FONT_RULES:
        if category in (SYMBOL,):
            continue
        prefer = CATEGORY_TARGETS.get(category, ())
        if not prefer:
            continue
        for a in aliases:
            lines.append(
                f'  <alias binding="same"><family>{escape(a)}</family><prefer>'
                + "".join(f"<family>{escape(p)}</family>" for p in prefer)
                + "</prefer></alias>\n"
            )
    lines.append("</fontconfig>\n")
    return "".join(lines)
