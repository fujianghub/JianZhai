"""EPUB upload validation + script scrubbing.

An EPUB is a zip of XHTML chapters that the reader renders inside ``blob:``
iframes on the site origin. Iframe ``sandbox`` cannot stop scripts there (WebKit
bug 218086 forces ``allow-scripts``), so the file itself must be clean before it
is stored: this module rewrites the container, dropping ``<script>`` elements,
inline event handlers, ``javascript:`` URLs, nested browsing contexts and any
``.js`` resources. Everything else is copied byte-for-byte; when nothing needs
scrubbing the original upload is kept untouched.

It also refuses the structural attacks a zip can carry — path traversal in
entry names and decompression bombs — with a clear message.
"""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field

# Entries whose markup we scan. EPUB 2 books commonly use ``.html``.
MARKUP_SUFFIXES = (".xhtml", ".html", ".htm", ".xml", ".svg")
SCRIPT_SUFFIXES = (".js", ".mjs", ".es", ".jsm")

# Decompression guardrails: a 2 GiB upload cap already exists upstream; these
# bound what a *small* upload may inflate to.
MAX_ENTRIES = 20_000
MAX_UNCOMPRESSED_BYTES = 1_536 * 1024 * 1024  # 1.5 GiB
MAX_COMPRESSION_RATIO = 200

_SCRIPT_BLOCK = re.compile(rb"<script\b[^>]*>[\s\S]*?</script\s*>", re.IGNORECASE)
_SCRIPT_TAIL = re.compile(rb"<script\b[^>]*/?>", re.IGNORECASE)
_ON_ATTR = re.compile(rb"""\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)""", re.IGNORECASE)
_JS_URL = re.compile(
    rb"""(\s(?:href|src|xlink:href|action|formaction|data|poster)\s*=\s*)(["']?)\s*javascript:[^"'>\s]*""",
    re.IGNORECASE,
)
_EMBED_BLOCK = re.compile(rb"<(iframe|object|embed|applet)\b[^>]*>[\s\S]*?</\1\s*>", re.IGNORECASE)
_EMBED_TAIL = re.compile(rb"<(iframe|object|embed|applet)\b[^>]*/?>", re.IGNORECASE)
_QUICK = re.compile(rb"<script|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed|<applet", re.IGNORECASE)
_SCRIPTED_PROP = re.compile(rb"""(\sproperties\s*=\s*["'][^"']*?)\bscripted\b\s*""", re.IGNORECASE)


class EpubValidationError(ValueError):
    """Raised for structurally unsafe containers; message is user-facing."""


@dataclass
class EpubSanitizeReport:
    """What the scrub touched (for logs / tests)."""

    scrubbed_entries: list[str] = field(default_factory=list)
    dropped_entries: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.scrubbed_entries or self.dropped_entries)


def scrub_markup(data: bytes) -> bytes:
    """Strip script vectors from one XHTML/HTML/SVG entry (bytes in, bytes out)."""
    if not _QUICK.search(data):
        return data
    data = _SCRIPT_BLOCK.sub(b"", data)
    data = _SCRIPT_TAIL.sub(b"", data)
    data = _ON_ATTR.sub(b"", data)
    data = _JS_URL.sub(rb"\1\2#", data)
    data = _EMBED_BLOCK.sub(b"", data)
    data = _EMBED_TAIL.sub(b"", data)
    return data


def _unsafe_path(name: str) -> bool:
    if not name or name.startswith(("/", "\\")) or "\\" in name:
        return True
    if re.match(r"^[A-Za-z]:", name):
        return True
    parts = posixpath.normpath(name).split("/")
    return ".." in parts


def validate_epub_container(blob: bytes) -> zipfile.ZipFile:
    """Open the upload as a zip and reject traversal / bomb shapes.

    Returns the open ``ZipFile`` (over an in-memory buffer) so callers don't
    parse the central directory twice.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile as e:  # pragma: no cover - guarded upstream too
        raise EpubValidationError("文件不是有效的 EPUB（zip 容器损坏）") from e
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise EpubValidationError(f"EPUB 内文件数超过 {MAX_ENTRIES} 上限")
    total = 0
    for info in infos:
        if _unsafe_path(info.filename):
            raise EpubValidationError(f"EPUB 内含非法路径条目：{info.filename}")
        total += info.file_size
        if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO and info.file_size > 1024 * 1024:
            raise EpubValidationError("EPUB 内含异常压缩比条目（疑似压缩炸弹）")
    if total > MAX_UNCOMPRESSED_BYTES:
        raise EpubValidationError("EPUB 解压后体积超过上限")
    if "mimetype" not in zf.namelist():
        raise EpubValidationError("文件不是有效的 EPUB（缺少 mimetype 条目）")
    if zf.read("mimetype").strip() != b"application/epub+zip":
        raise EpubValidationError("文件不是有效的 EPUB（mimetype 不是 application/epub+zip）")
    return zf


def sanitize_epub(blob: bytes) -> tuple[bytes, EpubSanitizeReport]:
    """Validate and scrub an EPUB. Returns ``(bytes, report)``.

    The returned bytes are the original upload when nothing was scrubbed; when
    something was, a rewritten container with ``mimetype`` first and stored
    (per the OCF spec) and every other entry re-added with its original
    compression method.
    """
    zf = validate_epub_container(blob)
    report = EpubSanitizeReport()
    replacements: dict[str, bytes] = {}
    dropped: set[str] = set()
    opf_names: list[str] = []
    for info in zf.infolist():
        name = info.filename
        lower = name.lower()
        if info.is_dir():
            continue
        if lower.endswith(SCRIPT_SUFFIXES):
            dropped.add(name)
        elif lower.endswith(".opf"):
            opf_names.append(name)
        elif lower.endswith(MARKUP_SUFFIXES):
            raw = zf.read(name)
            cleaned = scrub_markup(raw)
            if cleaned != raw:
                replacements[name] = cleaned
    # Manifest pass last (zip order is arbitrary): drop the ``scripted``
    # property flag and any <item> pointing at a removed script so the package
    # stays consistent for strict parsers.
    for name in opf_names:
        raw = zf.read(name)
        cleaned = _SCRIPTED_PROP.sub(rb"\1", raw)
        for d in dropped:
            base = re.escape(posixpath.basename(d).encode())
            cleaned = re.sub(
                rb"<item\b[^>]*href\s*=\s*[\"'][^\"']*" + base + rb"[\"'][^>]*/?>(?:\s*</item>)?",
                b"",
                cleaned,
                flags=re.IGNORECASE,
            )
        if cleaned != raw:
            replacements[name] = cleaned
    report.scrubbed_entries = sorted(replacements)
    report.dropped_entries = sorted(dropped)
    if not report.changed:
        return blob, report

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zout:
        zout.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for info in zf.infolist():
            name = info.filename
            if name == "mimetype" or name in dropped or info.is_dir():
                continue
            data = replacements.get(name)
            if data is None:
                data = zf.read(name)
            zi = zipfile.ZipInfo(name, date_time=info.date_time)
            zi.compress_type = info.compress_type if info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) else zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    return out.getvalue(), report
