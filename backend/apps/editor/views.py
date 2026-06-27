from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsContentAuthor
from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document, Folder, KnowledgeBase
from apps.knowledge.serializers import DocumentSerializer

from .models import Attachment
from .serializers import AttachmentSerializer

logger = logging.getLogger(__name__)

# 2 GiB hard limit per single file
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
ALLOWED_DOC_EXT = {".pdf", ".doc", ".docx", ".html", ".htm", ".md", ".markdown", ".txt"}
ALLOWED_OTHER_EXT = {".zip", ".csv", ".json", ".xml"}
ALLOWED_EXT = ALLOWED_IMAGE_EXT | ALLOWED_DOC_EXT | ALLOWED_OTHER_EXT

# File types whose contents we inline directly into Document.raw_content on
# import. HTML is included so the in-editor HTML mode can round-trip edits
# back into raw_content; the blog reader detects doc_format='html' and renders
# the body via <iframe srcdoc> so DOMPurify-style markdown rendering doesn't
# butcher real HTML.
TEXT_IMPORT_EXT = {".md", ".markdown", ".txt", ".html", ".htm"}


def _classify(ext: str) -> str:
    if ext in ALLOWED_IMAGE_EXT:
        return Attachment.KIND_IMAGE
    if ext in ALLOWED_DOC_EXT:
        return Attachment.KIND_DOCUMENT
    return Attachment.KIND_OTHER


def _decode_text(blob: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "gbk", "gb18030"):
        try:
            return blob.decode(enc)
        except UnicodeDecodeError:
            continue
    return blob.decode("utf-8", errors="replace")


def _docx_to_markdown(blob: bytes) -> str:
    """Convert DOCX bytes to Markdown via mammoth → HTML → markdownify.

    Returns ``""`` on any failure (missing optional deps, malformed file, …)
    so that bulk imports don't 500 on a single bad upload — the import still
    creates the Document + Attachment, the user can then re-edit raw_content
    manually or re-upload.
    """
    try:
        import mammoth  # type: ignore[import-not-found]
        from markdownify import markdownify  # type: ignore[import-not-found]
    except ImportError:
        logger.warning(
            "mammoth/markdownify not installed — DOCX body will be left empty. "
            "Install with `pip install mammoth markdownify` to enable extraction."
        )
        return ""

    try:
        result = mammoth.convert_to_html(blob)
        for msg in result.messages:
            logger.info("mammoth docx import: %s", msg)
        html = result.value or ""
        return markdownify(html, heading_style="ATX", bullets="-").strip()
    except Exception as exc:  # noqa: BLE001 — mammoth raises many subclasses
        logger.warning("DOCX → Markdown conversion failed: %s", exc, exc_info=True)
        return ""


@api_view(["POST"])
@permission_classes([IsContentAuthor])
@parser_classes([MultiPartParser])
def upload(request):
    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "missing file"}, status=status.HTTP_400_BAD_REQUEST)
    if f.size > MAX_UPLOAD_SIZE:
        return Response(
            {"detail": f"文件超过 {MAX_UPLOAD_SIZE // (1024*1024)} MB 上限"},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    ext = Path(f.name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return Response(
            {"detail": f"不支持的文件类型：{ext or '(无扩展名)'}"},
            status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    doc = None
    doc_id = request.data.get("document")
    if doc_id:
        doc = get_object_or_404(
            scope_queryset(Document.objects.all(), request.user), pk=doc_id
        )

    mime = f.content_type or mimetypes.guess_type(f.name)[0] or ""
    att = Attachment.objects.create(
        document=doc,
        uploaded_by=request.user,
        file=f,
        original_filename=f.name,
        kind=_classify(ext),
        mime_type=mime,
        size=f.size,
    )
    return Response(AttachmentSerializer(att).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsContentAuthor])
def document_attachments(request, doc_id: int):
    doc = get_object_or_404(
        scope_queryset(Document.objects.all(), request.user), pk=doc_id
    )
    qs = doc.attachments.all()
    return Response(AttachmentSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsContentAuthor])
def my_attachments(request):
    """Media library — all uploads by the current user."""
    qs = Attachment.objects.filter(uploaded_by=request.user)
    kind = request.query_params.get("kind")
    if kind in {"image", "document", "other"}:
        qs = qs.filter(kind=kind)
    return Response(AttachmentSerializer(qs, many=True).data)


@api_view(["DELETE"])
@permission_classes([IsContentAuthor])
def delete_attachment(request, pk: int):
    att = get_object_or_404(Attachment, pk=pk, uploaded_by=request.user)
    try:
        att.file.delete(save=False)
    except Exception:
        pass
    att.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _ensure_folder_path(kb: KnowledgeBase, root: Folder | None, parts: list[str]) -> Folder | None:
    """Walk/create a folder chain under ``root`` and return the leaf folder.

    Empty path segments are ignored. Returns ``root`` when ``parts`` is empty.
    """
    parent = root
    for name in parts:
        name = name.strip()
        if not name:
            continue
        existing = Folder.objects.filter(
            knowledge_base=kb, parent=parent, name=name
        ).first()
        if existing is None:
            existing = Folder.objects.create(
                knowledge_base=kb, parent=parent, name=name
            )
        parent = existing
    return parent


def _create_doc_from_upload(
    *,
    request,
    kb: KnowledgeBase,
    folder: Folder | None,
    f,
) -> Document | Response:
    """Shared logic for turning one uploaded file into a Document + Attachment."""
    if f.size > MAX_UPLOAD_SIZE:
        return Response(
            {"detail": f"文件超过 {MAX_UPLOAD_SIZE // (1024*1024)} MB 上限: {f.name}"},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    ext = Path(f.name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return Response(
            {"detail": f"不支持的文件类型：{ext or '(无扩展名)'} ({f.name})"},
            status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    title = Path(f.name).stem or "Untitled"
    raw_content = ""
    if ext in TEXT_IMPORT_EXT:
        raw_content = _decode_text(f.read())
        f.seek(0)
    elif ext == ".docx":
        raw_content = _docx_to_markdown(f.read())
        f.seek(0)

    # New uploads default to public + published so the document is immediately
    # visible on the blog frontend. The admin can still flip it back to
    # private/draft from the editor.
    now = timezone.now()
    doc = Document.objects.create(
        knowledge_base=kb,
        folder=folder,
        title=title,
        raw_content=raw_content,
        published_content=raw_content,
        status="published",
        visibility="public",
        published_at=now,
    )
    mime = f.content_type or mimetypes.guess_type(f.name)[0] or ""
    Attachment.objects.create(
        document=doc,
        uploaded_by=request.user,
        file=f,
        original_filename=f.name,
        kind=_classify(ext),
        mime_type=mime,
        size=f.size,
    )
    if raw_content and ext in {".md", ".markdown"}:
        from apps.editor.services.image_mirror import mirror_images_for_document

        mirror_images_for_document(doc, uploaded_by=request.user)
    elif raw_content and ext in {".html", ".htm"}:
        from apps.editor.services.html_asset_mirror import mirror_html_assets_for_document

        mirror_html_assets_for_document(doc, uploaded_by=request.user)
    return doc


@api_view(["POST"])
@permission_classes([IsContentAuthor])
@parser_classes([MultiPartParser])
def import_file(request):
    """Upload a file directly into a KB — creates a new Document and attaches the file.

    For text formats (md/html/txt) the file's contents are also written into
    Document.raw_content so the user can edit them in the editor. For PDF/DOCX
    the file becomes the document's primary attachment (rendered inline by the
    front-end via the attachment-preview component).
    """
    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "missing file"}, status=status.HTTP_400_BAD_REQUEST)

    kb_id = request.data.get("knowledge_base")
    if not kb_id:
        return Response(
            {"detail": "knowledge_base is required"}, status=status.HTTP_400_BAD_REQUEST
        )
    kb = get_object_or_404(
        scope_queryset(KnowledgeBase.objects.all(), request.user, field="owner"), pk=kb_id
    )

    folder = None
    folder_id = request.data.get("folder")
    if folder_id and str(folder_id).lower() not in {"null", ""}:
        folder = get_object_or_404(
            Folder.objects.filter(knowledge_base=kb), pk=folder_id
        )

    result = _create_doc_from_upload(request=request, kb=kb, folder=folder, f=f)
    if isinstance(result, Response):
        return result
    return Response(DocumentSerializer(result).data, status=status.HTTP_201_CREATED)


def _bundle_import_entries(
    *,
    request,
    kb: KnowledgeBase,
    root_folder: Folder | None,
    entries: list[tuple[str, object]],
) -> tuple[list[Document], list[dict]]:
    """Import ``(relpath, file)`` entries with markdown-image bundling.

    When the entries carry both a text document (md/html/txt/docx) and image
    files, the images become *Attachments* of the markdown (not standalone
    documents) and the markdown's local ``![](./images/x.png)`` refs are
    rewritten to the resulting ``/media/…`` URLs. Images with no accompanying
    text document keep the legacy one-document-per-image behaviour.

    ``file`` objects must be Django File-like (``.name``/``.size``/``.read``/
    ``.seek``; optional ``.content_type``) — both ``UploadedFile`` (batch) and
    ``SimpleUploadedFile`` (unpacked from a zip) qualify. Folders are
    auto-created from each entry's relpath. Returns ``(created, errors)``.
    """
    from apps.editor.services.local_image_assets import (
        IMAGE_EXTS,
        AssetIndex,
        rewrite_local_image_refs,
    )

    created: list[Document] = []
    errors: list[dict] = []

    text_doc_exts = TEXT_IMPORT_EXT | {".docx"}
    has_text_doc = any(Path(f.name).suffix.lower() in text_doc_exts for _, f in entries)

    asset_index = AssetIndex()
    asset_attachments: list[Attachment] = []

    if has_text_doc:
        for rel, f in entries:
            if Path(f.name).suffix.lower() not in IMAGE_EXTS:
                continue
            if f.size > MAX_UPLOAD_SIZE:
                errors.append(
                    {"name": f.name, "detail": f"文件超过 {MAX_UPLOAD_SIZE // (1024*1024)} MB 上限"}
                )
                continue
            mime = getattr(f, "content_type", None) or mimetypes.guess_type(f.name)[0] or ""
            att = Attachment.objects.create(
                document=None,
                uploaded_by=request.user,
                file=f,
                original_filename=f.name,
                kind=Attachment.KIND_IMAGE,
                mime_type=mime,
                size=f.size,
            )
            asset_index.add(rel or f.name, att.file.url)
            asset_attachments.append(att)

    for rel, f in entries:
        ext = Path(f.name).suffix.lower()
        # Image assets were already consumed above; don't also make them docs.
        if has_text_doc and ext in IMAGE_EXTS:
            continue

        parts = [p for p in rel.split("/") if p and p not in {".", ".."}]
        # Last segment is the filename — drop it before walking folders.
        folder_parts = parts[:-1] if len(parts) > 1 else []
        try:
            folder = _ensure_folder_path(kb, root_folder, folder_parts)
        except Exception as exc:  # noqa: BLE001
            errors.append({"name": f.name, "detail": str(exc)})
            continue

        result = _create_doc_from_upload(request=request, kb=kb, folder=folder, f=f)
        if isinstance(result, Response):
            errors.append({"name": f.name, "detail": str(result.data.get("detail", "导入失败"))})
            continue

        if ext in {".md", ".markdown"} and asset_attachments:
            rewrite_local_image_refs(result, asset_index, doc_rel=rel)
        created.append(result)

    # Bind each uploaded image asset to the first document that now references it
    # so it shows up in that document's attachment list / media library.
    if asset_attachments and created:
        for att in asset_attachments:
            for doc in created:
                if att.file.url in (doc.raw_content or ""):
                    att.document = doc
                    att.save(update_fields=["document"])
                    break

    return created, errors


@api_view(["POST"])
@permission_classes([IsContentAuthor])
@parser_classes([MultiPartParser])
def import_batch(request):
    """Batch / folder-aware upload.

    Accepts multiple files via the ``files`` multipart field. For each file the
    client may pass a parallel ``paths[]`` entry containing the file's relative
    path inside the dropped folder (browser supplies this via
    ``webkitRelativePath`` for ``<input webkitdirectory>``). Missing/empty paths
    fall back to the bare filename — i.e. the file lands directly under the
    target folder. Folders are auto-created on the path as needed.

    Markdown files that reference local images (``![](./images/x.png)``) get
    those sibling images bundled as Attachments + rewritten to ``/media/…`` when
    the images ride in the same request (see ``_bundle_import_entries``).

    Response shape::

        {
          "created": [Document, ...],         # successful imports
          "errors":  [{"name": ..., "detail": ...}, ...],
          "folders_created": <int>,
        }
    """
    files = request.FILES.getlist("files")
    if not files:
        return Response({"detail": "missing files"}, status=status.HTTP_400_BAD_REQUEST)

    kb_id = request.data.get("knowledge_base")
    if not kb_id:
        return Response(
            {"detail": "knowledge_base is required"}, status=status.HTTP_400_BAD_REQUEST
        )
    kb = get_object_or_404(
        scope_queryset(KnowledgeBase.objects.all(), request.user, field="owner"), pk=kb_id
    )

    root_folder = None
    folder_id = request.data.get("folder")
    if folder_id and str(folder_id).lower() not in {"null", ""}:
        root_folder = get_object_or_404(
            Folder.objects.filter(knowledge_base=kb), pk=folder_id
        )

    paths = request.data.getlist("paths") if hasattr(request.data, "getlist") else []
    rels = [
        (paths[idx] if idx < len(paths) else "").replace("\\", "/").strip()
        for idx in range(len(files))
    ]
    entries = list(zip(rels, files))

    folders_before = Folder.objects.filter(knowledge_base=kb).count()
    created, errors = _bundle_import_entries(
        request=request, kb=kb, root_folder=root_folder, entries=entries
    )
    folders_after = Folder.objects.filter(knowledge_base=kb).count()
    return Response(
        {
            "created": DocumentSerializer(created, many=True).data,
            "errors": errors,
            "folders_created": max(0, folders_after - folders_before),
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
    )


# Zip-bundle import limits (uncompressed) — guard against zip bombs.
ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024
ZIP_MAX_FILES = 500


@api_view(["POST"])
@permission_classes([IsContentAuthor])
@parser_classes([MultiPartParser])
def import_zip(request):
    """Import a single ``.zip`` bundle of markdown file(s) + their image folders.

    The archive is unpacked in memory and fed through the same markdown-image
    bundling as ``import_batch`` (relative ``./images/x.png`` refs are rewritten
    to ``/media/…``). Directory entries, hidden files, ``__MACOSX`` cruft, path
    traversal, unsupported extensions and oversized members are skipped and
    reported under ``skipped``.

    Response shape mirrors ``import_batch`` plus a ``skipped`` list.
    """
    import io
    import zipfile

    from django.core.files.uploadedfile import SimpleUploadedFile

    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "missing file"}, status=status.HTTP_400_BAD_REQUEST)
    if Path(f.name).suffix.lower() != ".zip":
        return Response({"detail": "仅支持 .zip 文件"}, status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
    if f.size > MAX_UPLOAD_SIZE:
        return Response(
            {"detail": f"文件超过 {MAX_UPLOAD_SIZE // (1024*1024)} MB 上限"},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    kb_id = request.data.get("knowledge_base")
    if not kb_id:
        return Response(
            {"detail": "knowledge_base is required"}, status=status.HTTP_400_BAD_REQUEST
        )
    kb = get_object_or_404(
        scope_queryset(KnowledgeBase.objects.all(), request.user, field="owner"), pk=kb_id
    )

    root_folder = None
    folder_id = request.data.get("folder")
    if folder_id and str(folder_id).lower() not in {"null", ""}:
        root_folder = get_object_or_404(
            Folder.objects.filter(knowledge_base=kb), pk=folder_id
        )

    try:
        zf = zipfile.ZipFile(io.BytesIO(f.read()))
    except zipfile.BadZipFile:
        return Response({"detail": "无效的 zip 文件"}, status=status.HTTP_400_BAD_REQUEST)

    entries: list[tuple[str, object]] = []
    skipped: list[str] = []
    total = 0
    for info in zf.infolist():
        if info.is_dir():
            continue
        norm = info.filename.replace("\\", "/").strip()
        segs = norm.split("/")
        if norm.startswith("/") or ".." in segs:
            skipped.append(f"{norm}（非法路径）")
            continue
        if any(s.startswith(".") and len(s) > 1 for s in segs) or "__MACOSX" in segs:
            skipped.append(f"{norm}（隐藏/系统文件）")
            continue
        ext = Path(norm).suffix.lower()
        if ext not in ALLOWED_EXT:
            skipped.append(f"{norm}（不支持的类型）")
            continue
        if info.file_size > MAX_UPLOAD_SIZE:
            skipped.append(f"{norm}（超过 2GB）")
            continue
        total += info.file_size
        if total > ZIP_MAX_TOTAL_BYTES:
            return Response(
                {"detail": f"解压后总大小超过 {ZIP_MAX_TOTAL_BYTES // (1024*1024)} MB 上限"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        if len(entries) >= ZIP_MAX_FILES:
            skipped.append(f"{norm}（超过 {ZIP_MAX_FILES} 文件上限）")
            continue
        data = zf.read(info)
        mime = mimetypes.guess_type(norm)[0] or "application/octet-stream"
        upfile = SimpleUploadedFile(Path(norm).name, data, content_type=mime)
        entries.append((norm, upfile))

    if not entries:
        return Response(
            {"detail": "zip 内没有可导入的文件", "skipped": skipped},
            status=status.HTTP_400_BAD_REQUEST,
        )

    folders_before = Folder.objects.filter(knowledge_base=kb).count()
    created, errors = _bundle_import_entries(
        request=request, kb=kb, root_folder=root_folder, entries=entries
    )
    folders_after = Folder.objects.filter(knowledge_base=kb).count()
    return Response(
        {
            "created": DocumentSerializer(created, many=True).data,
            "errors": errors,
            "skipped": skipped,
            "folders_created": max(0, folders_after - folders_before),
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
    )


# ── 外部 URL 链接卡片预览 ──
#
# 抓取目标网页的 <meta og:*> + <title> + 描述 + 首张图。简单缓存到内存
# (基于 Django cache) 防止重复抓取相同 URL。
#
# 安全：限制只抓取 http(s); 域名解析后过滤内网 IP；超时 5 秒；大小限制 500KB。

import ipaddress
import re as _re
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin
from urllib.request import Request, urlopen
from urllib.error import URLError

from django.core.cache import cache


def _is_safe_host(host: str) -> bool:
    """阻止 SSRF：拒绝解析到 localhost / 内网 / link-local 的目标。"""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


class _OGParser(HTMLParser):
    """极简 HTML 解析器，只拿我们关心的 meta + title。"""

    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_chunks: list[str] = []
        self.meta: dict[str, str] = {}
        self.icon: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        tag = tag.lower()
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            prop = attrs_d.get("property") or attrs_d.get("name") or ""
            content = attrs_d.get("content")
            if prop and content:
                self.meta[prop.lower()] = content
        elif tag == "link":
            rel = (attrs_d.get("rel") or "").lower()
            if "icon" in rel.split():
                self.icon = attrs_d.get("href")

    def handle_endtag(self, tag: str):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str):
        if self.in_title:
            self.title_chunks.append(data)


@api_view(["GET"])
@permission_classes([IsContentAuthor])
def link_preview(request):
    """获取 URL 的 OG 卡片信息。

    Query: ?url=https://example.com

    Returns: { title, description, image, site_name, favicon, url }
    """
    url = (request.query_params.get("url") or "").strip()
    if not url:
        return Response({"detail": "缺少 url 参数"}, status=400)
    if not (url.startswith("http://") or url.startswith("https://")):
        return Response({"detail": "url 必须以 http:// 或 https:// 开头"}, status=400)
    if len(url) > 2000:
        return Response({"detail": "url 过长"}, status=400)

    cache_key = f"link-preview:{url}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host or not _is_safe_host(host):
        return Response({"detail": "目标地址不可达或处于内网"}, status=400)

    try:
        req = Request(
            url,
            headers={
                "User-Agent": "JianZhai-LinkPreview/1.0 (+https://github.com/fujianghub/JianZhai)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )
        with urlopen(req, timeout=5) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype:
                return Response({"detail": "目标不是 HTML 页面"}, status=400)
            raw = resp.read(500_000)  # 上限 500KB
    except URLError as e:
        return Response({"detail": f"无法访问目标：{e}"}, status=502)
    except Exception as e:  # noqa: BLE001
        return Response({"detail": f"抓取失败：{e}"}, status=502)

    # 尝试以 UTF-8 解码，失败则猜测 GBK
    try:
        html = raw.decode("utf-8", errors="replace")
    except Exception:
        try:
            html = raw.decode("gbk", errors="replace")
        except Exception:
            html = raw.decode("latin-1", errors="replace")

    parser = _OGParser()
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001
        pass

    title = (parser.meta.get("og:title") or "".join(parser.title_chunks)).strip()[:200]
    desc = (
        parser.meta.get("og:description")
        or parser.meta.get("description")
        or parser.meta.get("twitter:description")
        or ""
    ).strip()[:300]
    image = parser.meta.get("og:image") or parser.meta.get("twitter:image") or ""
    site_name = (parser.meta.get("og:site_name") or host).strip()[:80]
    favicon = parser.icon or "/favicon.ico"

    # 相对路径补全
    if image and not image.startswith(("http://", "https://")):
        image = urljoin(url, image)
    if favicon and not favicon.startswith(("http://", "https://")):
        favicon = urljoin(url, favicon)

    # 标题简单清理（多空格 / 换行）
    title = _re.sub(r"\s+", " ", title) or host

    data = {
        "url": url,
        "title": title,
        "description": desc,
        "image": image,
        "site_name": site_name,
        "favicon": favicon,
    }
    cache.set(cache_key, data, timeout=24 * 3600)  # 缓存 1 天
    return Response(data)
