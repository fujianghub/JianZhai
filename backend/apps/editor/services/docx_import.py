"""DOCX → Markdown import with table + image fidelity.

The blog reader renders a document's Markdown body through the full pipeline
(TOC, heading numbering, typography). To let Word uploads behave exactly like
native Markdown notes we convert the ``.docx`` into Markdown that:

* keeps ``<table>`` blocks as raw HTML (wrapped in ``.jz-table-wrap`` so wide
  tables scroll — see memory ``project_table_overflow_2026-06-07``) instead of
  letting ``markdownify`` flatten colspans / styling into a lossy pipe table;
* preserves embedded images by handing each one back to the caller so it can be
  materialised as an :class:`Attachment` and the reference rewritten to
  ``/media/…`` (mirrors ``image_mirror.mirror_images_for_document``).

The caller (``editor.views._create_doc_from_upload``) is responsible for
turning the returned :class:`EmbeddedImage` list into attachments and swapping
each ``token`` for the stored file URL — the conversion itself has no document
context.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from io import BytesIO

logger = logging.getLogger(__name__)

# Tokens use only lowercase letters + digits so neither ``markdownify`` nor the
# markdown renderer mangles or escapes them before the caller substitutes the
# real URLs / table HTML back in.
_IMG_TOKEN = "jzdocimg{}z"
_TABLE_TOKEN = "jzdoctable{}z"

# Colour sentinels wrap a coloured run's text *inside the docx* (before mammoth)
# so the hex survives conversion as plain text, then get swapped for a
# ``<span style="color:#hex">`` in the final markdown. mammoth drops direct
# run-level colour formatting entirely, so this pre-pass is the only way to keep
# Word font colours in the imported body. ``begin``/``end`` are alnum-only so
# neither markdownify nor the markdown renderer escapes them.
_COLOR_BEGIN = "jzcolor{}b"  # {} = lowercase 6-hex
_COLOR_END = "jzcolore"
_COLOR_SPAN_RE = re.compile(r"jzcolor([0-9a-f]{6})b(.*?)jzcolore", re.S)
# Word writes ``w:val="auto"`` for "automatic" (theme/default) colour — never a
# real colour, and near-black defaults add noise, so both are skipped.
_HEX6_RE = re.compile(r"^[0-9A-Fa-f]{6}$")

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/x-emf": ".png",  # Word metafiles — mammoth rasterises to png bytes
}


@dataclass
class EmbeddedImage:
    """One image extracted from a DOCX, awaiting Attachment materialisation."""

    token: str  # placeholder substring present verbatim in the returned markdown
    data: bytes
    content_type: str

    @property
    def ext(self) -> str:
        return _EXT_BY_MIME.get(self.content_type.lower(), ".png")


def _promote_outline_headings(blob: bytes) -> bytes:
    """Give real heading styles to paragraphs Word marked with an outline level.

    Many Word docs (especially ones built from templates) carry their heading
    hierarchy as ``w:outlineLvl`` on otherwise body-styled paragraphs — the
    navigation pane and field-code TOC read those levels, but the visual style
    stays "Body Text"/"Normal". mammoth only maps genuine ``Heading N`` styles
    to ``<hN>``, so without this step those docs convert to a flat wall of text
    with an empty reader TOC.

    We inject a ``HeadingN`` style id (which mammoth's default style map maps to
    ``hN`` by id, even when the style isn't fully defined in styles.xml) onto
    each outline-level paragraph. Returns the rewritten docx bytes, or the
    original blob unchanged on any failure / when there's nothing to promote.
    """
    try:
        from docx import Document as Docx  # type: ignore[import-not-found]
        from docx.oxml import OxmlElement  # type: ignore[import-not-found]
        from docx.oxml.ns import qn  # type: ignore[import-not-found]
    except ImportError:
        return blob

    try:
        doc = Docx(BytesIO(blob))
    except Exception as exc:  # noqa: BLE001 — malformed file: let mammoth handle it
        logger.info("docx outline promotion skipped (open failed): %s", exc)
        return blob

    promoted = 0
    for p in doc.paragraphs:
        pPr = p._p.pPr
        if pPr is None:
            continue
        ol = pPr.find(qn("w:outlineLvl"))
        if ol is None:
            continue
        try:
            lvl = int(ol.get(qn("w:val")))
        except (TypeError, ValueError):
            continue
        text = (p.text or "").strip()
        # Headings are short; a long outline-tagged paragraph is body text we
        # must not turn into a giant heading. Word outline levels run 0–8; we
        # only surface the top 6 (h1–h6).
        if lvl < 0 or lvl > 5 or not text or len(text) > 200:
            continue
        pStyle = pPr.find(qn("w:pStyle"))
        if pStyle is None:
            pStyle = OxmlElement("w:pStyle")
            pPr.insert(0, pStyle)
        pStyle.set(qn("w:val"), f"Heading{lvl + 1}")
        promoted += 1

    if not promoted:
        return blob
    out = BytesIO()
    try:
        doc.save(out)
    except Exception as exc:  # noqa: BLE001
        logger.warning("docx outline promotion save failed: %s", exc)
        return blob
    logger.info("docx import: promoted %d outline-level paragraphs to headings", promoted)
    return out.getvalue()


def _mark_run_colors(blob: bytes) -> bytes:
    """Wrap every explicitly-coloured run's text with colour sentinels.

    mammoth converts a ``.docx`` to *semantic* HTML and silently drops direct
    run-level formatting like ``<w:color w:val="FF0001"/>`` — so Word font
    colours never reach the imported markdown. We pre-process the docx XML,
    wrapping each coloured run's ``<w:t>`` text in ``jzcolor<hex>b … jzcolore``
    sentinels (plain alnum, so mammoth + markdownify carry them through as
    text); :func:`convert_docx` swaps them for ``<span style="color:#hex">`` at
    the end. Operates at the XML level so runs inside tables (and nested tables)
    are covered too — ``python-docx``'s ``doc.paragraphs`` skips table cells.

    Returns the rewritten docx bytes, or the original blob unchanged on any
    failure / when there's nothing to mark.
    """
    try:
        from docx import Document as Docx  # type: ignore[import-not-found]
        from docx.oxml.ns import qn  # type: ignore[import-not-found]
    except ImportError:
        return blob

    try:
        doc = Docx(BytesIO(blob))
    except Exception as exc:  # noqa: BLE001 — malformed file: let mammoth handle it
        logger.info("docx colour marking skipped (open failed): %s", exc)
        return blob

    marked = 0
    for r in doc.element.iter(qn("w:r")):
        rpr = r.find(qn("w:rPr"))
        if rpr is None:
            continue
        color = rpr.find(qn("w:color"))
        if color is None:
            continue
        val = color.get(qn("w:val"))
        if not val or val.lower() == "auto" or not _HEX6_RE.match(val):
            continue
        # Skip near-black defaults — colouring body text black is pure noise.
        if val.lower() in {"000000", "010101"}:
            continue
        texts = r.findall(qn("w:t"))
        if not texts:
            continue
        # A run with only whitespace carries no visible colour — skip so we
        # don't emit empty ``<span> </span>`` wrappers.
        if not any((t.text or "").strip() for t in texts):
            continue
        hexv = val.lower()
        first, last = texts[0], texts[-1]
        first.text = _COLOR_BEGIN.format(hexv) + (first.text or "")
        last.text = (last.text or "") + _COLOR_END
        marked += 1

    if not marked:
        return blob
    out = BytesIO()
    try:
        doc.save(out)
    except Exception as exc:  # noqa: BLE001
        logger.warning("docx colour marking save failed: %s", exc)
        return blob
    logger.info("docx import: marked %d coloured runs", marked)
    return out.getvalue()


def _protect_tables(html: str) -> tuple[str, list[str]]:
    """Replace each top-level ``<table>…</table>`` with a token placeholder.

    Handles nested Word tables by depth-counting so an inner table doesn't
    terminate the span early. Returns the protected HTML plus the extracted
    table HTML blocks in document order.
    """
    tables: list[str] = []
    lower = html.lower()
    out: list[str] = []
    n = len(html)
    i = 0
    while i < n:
        start = lower.find("<table", i)
        if start == -1:
            out.append(html[i:])
            break
        out.append(html[i:start])
        depth = 0
        j = start
        end = n
        while j < n:
            nt = lower.find("<table", j)
            ct = lower.find("</table>", j)
            if ct == -1:
                end = n
                break
            if nt != -1 and nt < ct:
                depth += 1
                j = nt + len("<table")
            else:
                depth -= 1
                j = ct + len("</table>")
                if depth == 0:
                    end = j
                    break
        tables.append(html[start:end])
        out.append(f"\n\n{_TABLE_TOKEN.format(len(tables) - 1)}\n\n")
        i = end
    return "".join(out), tables


def convert_docx(blob: bytes) -> tuple[str, list[EmbeddedImage]]:
    """Convert DOCX bytes to Markdown + a list of embedded images.

    Returns ``("", [])`` on any failure (missing optional deps, malformed file)
    so bulk imports never 500 on a single bad upload — the caller falls back to
    a placeholder body and keeps the original ``.docx`` attachment.
    """
    try:
        import mammoth  # type: ignore[import-not-found]
        from markdownify import markdownify  # type: ignore[import-not-found]
    except ImportError:
        logger.warning(
            "mammoth/markdownify not installed — DOCX body will be left empty. "
            "Install with `pip install mammoth markdownify` to enable extraction."
        )
        return "", []

    # Recover heading structure Word stored as outline levels before mammoth
    # runs (no-op when the doc already uses real Heading styles).
    blob = _promote_outline_headings(blob)
    # Wrap coloured runs with sentinels so font colours survive mammoth (which
    # drops direct run-level colour) — swapped for <span> at the end.
    blob = _mark_run_colors(blob)

    images: list[EmbeddedImage] = []

    def _handle_image(image):
        token = _IMG_TOKEN.format(len(images))
        try:
            with image.open() as fh:
                data = fh.read()
        except Exception as exc:  # noqa: BLE001 — never let one image kill import
            logger.warning("docx import: image read failed — %s", exc)
            return {"src": ""}
        images.append(
            EmbeddedImage(token=token, data=data, content_type=image.content_type or "image/png")
        )
        return {"src": token}

    try:
        result = mammoth.convert_to_html(
            BytesIO(blob), convert_image=mammoth.images.img_element(_handle_image)
        )
        for msg in result.messages:
            logger.info("mammoth docx import: %s", msg)
        html = result.value or ""
    except Exception as exc:  # noqa: BLE001 — mammoth raises many subclasses
        logger.warning("DOCX → HTML conversion failed: %s", exc, exc_info=True)
        return "", []

    protected, tables = _protect_tables(html)
    md = markdownify(protected, heading_style="ATX", bullets="-").strip()

    # Re-inject each preserved table as raw HTML wrapped in the reader's scroll
    # container so wide tables don't clip.
    for idx, table_html in enumerate(tables):
        md = md.replace(
            _TABLE_TOKEN.format(idx),
            f'<div class="jz-table-wrap">{table_html}</div>',
        )

    # Swap colour sentinels for inline <span> colour spans. Runs on the full md
    # (including the re-injected raw table HTML) so coloured cells keep colour
    # too. The reader's DOMPurify allowlist permits <span style="color:…">.
    md = _COLOR_SPAN_RE.sub(
        lambda m: f'<span style="color:#{m.group(1)}">{m.group(2)}</span>', md
    )

    # Drop images that failed to read (empty src) so they don't leave dangling
    # ``![](jzdocimgNz)`` refs the caller can't resolve.
    images = [im for im in images if im.data]
    return md, images


# Body used when a DOCX has no extractable text (scanned / image-only). Keeps
# the document body-bearing so it flows through the Markdown reader like any
# other note, while honestly signalling nothing was extracted. The original
# ``.docx`` is still surfaced at the bottom of the post by the reader.
EMPTY_FALLBACK = (
    "> 本文档由 Word 导入，未能提取到可编辑的文字内容"
    "（可能是扫描件 / 纯图片）。原始文件见文末下载。\n"
)


def materialize_docx_images(doc, images, *, uploaded_by=None) -> bool:
    """Persist DOCX-embedded images as Attachments and rewrite body refs.

    Each :class:`EmbeddedImage` carries a placeholder ``token`` present verbatim
    in ``doc.raw_content``/``published_content``; we store the bytes under the
    standard ``uploads/YYYY/MM/<uuid>.<ext>`` scheme and swap every token for
    the stored ``/media/…`` URL. Returns ``True`` if the body changed (caller
    saves). Does not save the document itself.
    """
    import uuid
    from datetime import datetime

    from django.core.files.base import ContentFile

    from apps.editor.models import Attachment

    changed = False
    for img in images:
        now = datetime.now()
        rel_path = f"uploads/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{img.ext}"
        att = Attachment(
            document=doc,
            uploaded_by=uploaded_by,
            original_filename=f"docx-image{img.ext}",
            kind=Attachment.KIND_IMAGE,
            mime_type=img.content_type,
            size=len(img.data),
        )
        att.file.save(rel_path, ContentFile(img.data), save=False)
        att.save()
        url = att.file.url
        if img.token in (doc.raw_content or ""):
            doc.raw_content = doc.raw_content.replace(img.token, url)
            changed = True
        if img.token in (doc.published_content or ""):
            doc.published_content = doc.published_content.replace(img.token, url)
            changed = True
    return changed


def reconvert_document(doc, *, uploaded_by=None) -> dict:
    """Re-run DOCX conversion for an already-imported document, in place.

    Reads the document's original ``.docx`` attachment, converts it with the
    current (improved) pipeline, overwrites ``raw_content`` == ``published_content``
    and materialises embedded images. Used by the ``reconvert_docx`` management
    command to backfill documents imported before a converter fix. Returns a
    small status dict. No-op (``ok=False``) when the doc has no ``.docx`` source.
    """
    from pathlib import Path

    from apps.editor.models import Attachment

    att = (
        Attachment.objects.filter(document=doc, kind=Attachment.KIND_DOCUMENT)
        .order_by("created_at")
        .first()
    )
    if att is None or Path((att.original_filename or "").lower()).suffix != ".docx":
        return {"ok": False, "reason": "no .docx source attachment"}

    with att.file.open("rb") as fh:
        blob = fh.read()
    md, images = convert_docx(blob)
    if not md.strip():
        md = EMPTY_FALLBACK

    # Drop images a previous conversion of THIS doc materialised (named
    # ``docx-image.*``) so re-running doesn't pile up orphaned duplicates. Only
    # our own converter ever creates that name, so bundled/user images are safe.
    Attachment.objects.filter(
        document=doc, kind=Attachment.KIND_IMAGE, original_filename__startswith="docx-image"
    ).delete()

    doc.raw_content = md
    doc.published_content = md
    # Save the new body first so image-token rewriting operates on it.
    doc.save(update_fields=["raw_content", "published_content", "updated_at"])
    if images:
        changed = materialize_docx_images(doc, images, uploaded_by=uploaded_by or att.uploaded_by)
        if changed:
            doc.save(update_fields=["raw_content", "published_content", "updated_at"])
    return {"ok": True, "images": len(images), "chars": len(md)}
