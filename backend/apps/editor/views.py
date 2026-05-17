from __future__ import annotations

import mimetypes
from pathlib import Path

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.knowledge.models import Document, Folder, KnowledgeBase
from apps.knowledge.serializers import DocumentSerializer

from .models import Attachment
from .serializers import AttachmentSerializer

# 50 MB hard limit; matches non-functional requirements
MAX_UPLOAD_SIZE = 50 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
ALLOWED_DOC_EXT = {".pdf", ".doc", ".docx", ".html", ".htm", ".md", ".markdown", ".txt"}
ALLOWED_OTHER_EXT = {".zip", ".csv", ".json", ".xml"}
ALLOWED_EXT = ALLOWED_IMAGE_EXT | ALLOWED_DOC_EXT | ALLOWED_OTHER_EXT

# File types whose contents we inline directly into Document.raw_content on import.
# HTML stays as a binary attachment so the blog reader renders the original file
# (via iframe) instead of dumping the raw HTML source into the Markdown body.
TEXT_IMPORT_EXT = {".md", ".markdown", ".txt"}


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
@permission_classes([IsAuthenticated])
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
            Document.objects.filter(knowledge_base__owner=request.user), pk=doc_id
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
@permission_classes([IsAuthenticated])
def document_attachments(request, doc_id: int):
    doc = get_object_or_404(
        Document.objects.filter(knowledge_base__owner=request.user), pk=doc_id
    )
    qs = doc.attachments.all()
    return Response(AttachmentSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_attachments(request):
    """Media library — all uploads by the current user."""
    qs = Attachment.objects.filter(uploaded_by=request.user)
    kind = request.query_params.get("kind")
    if kind in {"image", "document", "other"}:
        qs = qs.filter(kind=kind)
    return Response(AttachmentSerializer(qs, many=True).data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_attachment(request, pk: int):
    att = get_object_or_404(Attachment, pk=pk, uploaded_by=request.user)
    try:
        att.file.delete(save=False)
    except Exception:
        pass
    att.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
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

    kb_id = request.data.get("knowledge_base")
    if not kb_id:
        return Response(
            {"detail": "knowledge_base is required"}, status=status.HTTP_400_BAD_REQUEST
        )
    kb = get_object_or_404(KnowledgeBase.objects.filter(owner=request.user), pk=kb_id)

    folder = None
    folder_id = request.data.get("folder")
    if folder_id and str(folder_id).lower() not in {"null", ""}:
        folder = get_object_or_404(
            Folder.objects.filter(knowledge_base=kb), pk=folder_id
        )

    title = Path(f.name).stem or "Untitled"

    raw_content = ""
    if ext in TEXT_IMPORT_EXT:
        raw_content = _decode_text(f.read())
        f.seek(0)

    doc = Document.objects.create(
        knowledge_base=kb,
        folder=folder,
        title=title,
        raw_content=raw_content,
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
    return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)
