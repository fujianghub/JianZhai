from __future__ import annotations

import io
import logging
import mimetypes
import zipfile
from pathlib import Path

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.permissions import IsContentAuthor, PublicOrLoginGated
from apps.accounts.scoping import scope_queryset
from apps.knowledge.models import Document, Folder, KnowledgeBase
from apps.knowledge.serializers import DocumentSerializer

from .models import Attachment
from .serializers import AttachmentSerializer
from .services.link_preview import LinkPreviewError, fetch_link_preview

logger = logging.getLogger(__name__)

# 2 GiB hard limit per single file
MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
ALLOWED_DOC_EXT = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".html", ".htm", ".md", ".markdown", ".txt",
}
ALLOWED_OTHER_EXT = {".zip", ".csv", ".json", ".xml"}
ALLOWED_EXT = ALLOWED_IMAGE_EXT | ALLOWED_DOC_EXT | ALLOWED_OTHER_EXT

# File types whose contents we inline directly into Document.raw_content on
# import. HTML is included so the in-editor HTML mode can round-trip edits
# back into raw_content; the blog reader detects doc_format='html' and renders
# the body via <iframe srcdoc> so DOMPurify-style markdown rendering doesn't
# butcher real HTML.
TEXT_IMPORT_EXT = {".md", ".markdown", ".txt", ".html", ".htm"}

# OOXML formats (.docx/.pptx) are ZIP containers. A truncated / half-downloaded
# upload keeps a valid ``PK\x03\x04`` header but loses the End-Of-Central-Directory
# at the tail, so it's no longer a loadable zip — LibreOffice/mammoth then fail
# deep in async conversion with a cryptic "转换失败". We reject such files up front
# (see ``_is_valid_zip``) with a clear message so the user re-exports immediately.
ZIP_DOC_EXT = {".docx", ".pptx"}


def _is_valid_zip(f) -> bool:
    """True if the uploaded file is a structurally valid zip (has an EOCD record).

    Cheap: ``zipfile.is_zipfile`` seeks to the tail to find the central directory
    rather than reading the whole file, so it's safe even for large decks. The
    file pointer is restored to 0 for the subsequent Attachment save.
    """
    try:
        f.seek(0)
        return zipfile.is_zipfile(f)
    except Exception:
        return False
    finally:
        try:
            f.seek(0)
        except Exception:
            pass


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


# Markdown-capable text formats where a ``[TOC]`` marker is meaningful.
_MARKDOWNISH_EXTS = {".md", ".markdown", ".txt", ".docx"}


def _parse_import_options(request) -> tuple[bool, bool]:
    """Read the ``heading_numbering`` / ``insert_toc`` import flags (default off)."""
    def _flag(name: str) -> bool:
        return str(request.data.get(name, "")).strip().lower() in {"1", "true", "on", "yes"}

    return _flag("heading_numbering"), _flag("insert_toc")


def _create_doc_from_upload(
    *,
    request,
    kb: KnowledgeBase,
    folder: Folder | None,
    f,
    heading_numbering: bool = False,
    insert_toc: bool = False,
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
    if ext in ZIP_DOC_EXT and not _is_valid_zip(f):
        return Response(
            {
                "detail": f"文件已损坏或不是有效的 {ext[1:].upper()}"
                f"（缺少 ZIP 结尾目录，可能下载/复制未完成），请重新导出后再上传：{f.name}"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    title = Path(f.name).stem or "Untitled"
    raw_content = ""
    docx_images: list = []
    if ext in TEXT_IMPORT_EXT:
        raw_content = _decode_text(f.read())
        f.seek(0)
    elif ext == ".docx":
        from apps.editor.services.docx_import import EMPTY_FALLBACK, convert_docx

        raw_content, docx_images = convert_docx(f.read())
        f.seek(0)
        if not raw_content.strip():
            raw_content = EMPTY_FALLBACK

    # Optionally prepend a whole-document TOC marker (markdown-capable text only;
    # the reader expands ``[TOC]`` into a real heading list). This is the only
    # content mutation on import — numbering stays a display-only flag.
    if insert_toc and raw_content and ext in _MARKDOWNISH_EXTS:
        raw_content = "[TOC]\n\n" + raw_content

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
        heading_numbering=heading_numbering,
        published_at=now,
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
    if docx_images:
        from apps.editor.services.docx_import import materialize_docx_images

        if materialize_docx_images(doc, docx_images, uploaded_by=request.user):
            doc.save(update_fields=["raw_content", "published_content", "updated_at"])
    if ext in {".ppt", ".pptx"}:
        # Slides render asynchronously (LibreOffice is slow); the reader shows a
        # "转换中" placeholder and polls until slides appear. Body stays empty —
        # a pptx is a view-only binary like a PDF. Mark pending so the reader can
        # tell "still converting" from a permanent failure (task flips it to
        # done/failed).
        from apps.editor.tasks import convert_pptx_to_slides

        doc.slide_status = "pending"
        doc.save(update_fields=["slide_status"])
        convert_pptx_to_slides.delay(doc.id, att.id)
    if raw_content and ext in {".md", ".markdown"}:
        # Mirror remote images off-request: a Yuque export can carry dozens of
        # cdn.nlark.com images that throttle per-IP, so a synchronous fetch blew
        # past the request timeout and left the body full of broken remote URLs.
        # The reader shows the remote images (referrerpolicy=no-referrer) until
        # the task localises them. Only dispatch when there's actually a remote
        # image to fetch — an image-less note shouldn't queue a no-op task.
        from apps.editor.services.image_mirror import (
            extract_markdown_image_urls,
            should_mirror,
        )

        if any(should_mirror(u) for u in extract_markdown_image_urls(raw_content)):
            from apps.editor.tasks import mirror_document_images

            mirror_document_images.delay(doc.id, request.user.id)
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

    heading_numbering, insert_toc = _parse_import_options(request)
    result = _create_doc_from_upload(
        request=request,
        kb=kb,
        folder=folder,
        f=f,
        heading_numbering=heading_numbering,
        insert_toc=insert_toc,
    )
    if isinstance(result, Response):
        return result
    return Response(DocumentSerializer(result).data, status=status.HTTP_201_CREATED)


def _bundle_import_entries(
    *,
    request,
    kb: KnowledgeBase,
    root_folder: Folder | None,
    entries: list[tuple[str, object]],
    heading_numbering: bool = False,
    insert_toc: bool = False,
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

        result = _create_doc_from_upload(
            request=request,
            kb=kb,
            folder=folder,
            f=f,
            heading_numbering=heading_numbering,
            insert_toc=insert_toc,
        )
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

    heading_numbering, insert_toc = _parse_import_options(request)
    folders_before = Folder.objects.filter(knowledge_base=kb).count()
    created, errors = _bundle_import_entries(
        request=request,
        kb=kb,
        root_folder=root_folder,
        entries=entries,
        heading_numbering=heading_numbering,
        insert_toc=insert_toc,
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

    heading_numbering, insert_toc = _parse_import_options(request)
    folders_before = Folder.objects.filter(knowledge_base=kb).count()
    created, errors = _bundle_import_entries(
        request=request,
        kb=kb,
        root_folder=root_folder,
        entries=entries,
        heading_numbering=heading_numbering,
        insert_toc=insert_toc,
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
# 抓取逻辑（SSRF 守卫 / 500KB 上限 / 5s 超时 / 1 天缓存）在
# services/link_preview.py，与导出端共用；这里只做权限 + 限流 + 状态码映射。


class LinkPreviewThrottle(UserRateThrottle):
    """独立桶：端点会触发服务端外呼抓取，放宽给登录读者（语雀式链接卡片
    在博客端也要水合）后必须限速，防止被当 SSRF 探测/代理滥用。
    UserRateThrottle 对匿名请求按 IP 计数，登录/匿名都覆盖。"""

    scope = "link_preview"


@api_view(["GET"])
@permission_classes([PublicOrLoginGated])
@throttle_classes([LinkPreviewThrottle])
def link_preview(request):
    """获取 URL 的 OG 卡片信息。

    Query: ?url=https://example.com

    Returns: { title, description, image, site_name, favicon, url }

    权限：PublicOrLoginGated —— 阅读端 link-card 水合也走这里；友邻模式
    （SITE_REQUIRE_LOGIN=true）下匿名照常被闸门挡下。
    """
    try:
        data = fetch_link_preview(request.query_params.get("url") or "")
    except LinkPreviewError as e:
        return Response({"detail": e.detail}, status=e.status)
    return Response(data)
