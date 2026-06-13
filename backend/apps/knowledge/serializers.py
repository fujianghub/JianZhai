from __future__ import annotations

from pathlib import Path

from django.db import transaction
from django.db.models import Value
from django.db.models.functions import Coalesce, NullIf, Substr
from django.utils import timezone
from rest_framework import serializers

from .concurrency import VersionConflictError
from .models import Document, DocumentFavorite, Folder, KnowledgeBase, KnowledgeBaseCategory

# Truncated body head for format detection on list/tree endpoints that
# ``.defer()`` the full ``raw_content`` / ``published_content`` columns.
# ``looks_like_html`` only inspects the leading ~4096 chars, so this window is
# sufficient and keeps the deferred columns out of the result set.
_FMT_HEAD_EXPR = Substr(
    Coalesce(NullIf("raw_content", Value("")), "published_content", Value("")), 1, 4096
)


def _assert_owned(serializer, obj, owner_id):
    """Reject a writable FK that points outside the requesting user's tenant.

    DRF only calls ``validate_<field>`` for fields actually present in the
    payload, so autosave PATCHes (which omit ``knowledge_base``/``folder``)
    never pay this cost; it guards the create path against cross-tenant IDOR.
    """
    request = serializer.context.get("request")
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        raise serializers.ValidationError("未认证")
    if user.is_superuser:
        return obj
    if owner_id != user.id:
        raise serializers.ValidationError("无权引用该资源")
    return obj

DOC_FORMAT_ORDER = {
    "markdown": 0,
    "html": 1,
    "pdf": 2,
    "docx": 3,
    "image": 4,
}


def _primary_attachment(doc: Document):
    """Return the oldest attachment, reading from a Prefetch cache if present.

    `DocumentViewSet` populates ``ordered_attachments`` via a Prefetch so this
    function avoids issuing a fresh ORDER BY query per document.
    """
    if not doc.pk:
        return None
    cached = getattr(doc, "ordered_attachments", None)
    if cached is not None:
        return cached[0] if cached else None
    return doc.attachments.order_by("created_at").first()


def detect_doc_format(doc: Document) -> str:
    """Classify a document by its primary (first-uploaded) attachment.

    Returns one of: ``pdf``, ``html``, ``docx``, ``image``, ``markdown``.
    Falls back to ``markdown`` (the default body editor) when the document has
    no attachment or only inline-imported text. When there is no decisive
    attachment, ``raw_content`` / ``published_content`` that looks like HTML
    is treated as ``html`` (editor-created HTML docs without a ``.html`` file).
    """
    from .html_content import looks_like_html

    # List/tree endpoints ``.defer()`` the big body columns and instead annotate
    # ``_fmt_head`` (the first 4096 chars via Substr) — enough for
    # ``looks_like_html`` and the "has a text body?" check below. Reading the
    # annotation avoids a per-row query that would otherwise un-defer the column.
    head = getattr(doc, "_fmt_head", None)
    if head is None:
        head = (doc.raw_content or "") or (doc.published_content or "")

    att = _primary_attachment(doc)
    if att is not None:
        name = (att.original_filename or "").lower()
        ext = Path(name).suffix
        mime = att.mime_type or ""
        if ext == ".pdf" or mime == "application/pdf":
            return "pdf"
        if ext in {".html", ".htm"} or mime in {"text/html", "application/xhtml+xml"}:
            return "html"
        if ext == ".docx":
            return "docx"
        if att.kind == "image" or mime.startswith("image/"):
            # A genuine image document has an image as its primary attachment and
            # no text body. But a *markdown* doc that merely carries bundled image
            # assets (``./images/*`` uploaded alongside the .md) also has image
            # attachments — and depending on upload order one of them can be the
            # "first" attachment. Those keep their markdown in raw_content, so
            # classify by body when a text body exists rather than mislabeling the
            # whole document as an image (which hides the article behind a single
            # inline image preview).
            if not head.strip():
                return "image"
            # else: has a real text body → fall through to body-based detection
        else:
            return "markdown"

    if looks_like_html(head):
        return "html"
    return "markdown"


class KnowledgeBaseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeBaseCategory
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "accent_color",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


class KnowledgeBaseSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    category = KnowledgeBaseCategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=KnowledgeBaseCategory.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = KnowledgeBase
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "cover_image",
            "accent_color",
            "visibility",
            "category",
            "category_id",
            "doc_sort_mode",
            "order",
            "document_count",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "document_count", "tags", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            from apps.accounts.scoping import scope_queryset

            self.fields["category_id"].queryset = scope_queryset(
                KnowledgeBaseCategory.objects.all(), request.user, field="owner"
            )

    def get_document_count(self, obj: KnowledgeBase) -> int:
        annotated = getattr(obj, "_document_count", None)
        if annotated is not None:
            return annotated
        return obj.documents(manager="objects").count()

    def get_tags(self, obj: KnowledgeBase) -> list[dict]:
        tag_list = obj.tags.all()
        return [
            {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
            for t in tag_list
        ]


class FolderSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = [
            "id",
            "knowledge_base",
            "parent",
            "name",
            "order",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tags", "created_at", "updated_at"]

    def validate_knowledge_base(self, value: KnowledgeBase) -> KnowledgeBase:
        return _assert_owned(self, value, value.owner_id)

    def validate_parent(self, value: Folder | None) -> Folder | None:
        if value is None:
            return value
        value = _assert_owned(self, value, value.knowledge_base.owner_id)
        # Reject self/descendant targets: a parent cycle makes soft_delete()
        # recurse forever and drops the whole subtree out of build_tree.
        instance = getattr(self, "instance", None)
        if instance is not None and instance.pk is not None:
            seen: set[int] = set()
            node: Folder | None = value
            while node is not None:
                if node.pk == instance.pk or node.pk in seen:
                    raise serializers.ValidationError(
                        "不能把文件夹移动到自己或其子文件夹内"
                    )
                seen.add(node.pk)
                node = node.parent
        return value

    def get_tags(self, obj: Folder) -> list[dict]:
        return [
            {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
            for t in obj.tags.all()
        ]


class _KnowledgeBaseMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = KnowledgeBase
        fields = ["id", "name", "slug", "accent_color"]
        read_only_fields = fields


class FavoriteDocumentSerializer(serializers.Serializer):
    """One favorited document for GET /documents/favorites/."""

    id = serializers.IntegerField(source="document.id")
    title = serializers.CharField(source="document.title")
    slug = serializers.CharField(source="document.slug")
    status = serializers.CharField(source="document.status")
    visibility = serializers.CharField(source="document.visibility")
    doc_format = serializers.SerializerMethodField()
    knowledge_base = _KnowledgeBaseMiniSerializer(source="document.knowledge_base")
    favorited_at = serializers.DateTimeField(source="created_at")
    updated_at = serializers.DateTimeField(source="document.updated_at")

    def get_doc_format(self, obj: DocumentFavorite) -> str:
        return detect_doc_format(obj.document)


class DocumentListSerializer(serializers.ModelSerializer):
    """Light-weight serializer used in list endpoints (omits content)."""

    doc_format = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "knowledge_base",
            "folder",
            "title",
            "slug",
            "status",
            "visibility",
            "order",
            "doc_format",
            "created_at",
            "updated_at",
            "published_at",
        ]
        read_only_fields = fields

    def get_doc_format(self, obj: Document) -> str:
        return detect_doc_format(obj)


class DocumentSerializer(serializers.ModelSerializer):
    doc_format = serializers.SerializerMethodField()
    primary_attachment = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "knowledge_base",
            "folder",
            "title",
            "slug",
            "raw_content",
            "published_content",
            "status",
            "visibility",
            "paper_style",
            "order",
            "is_pinned",
            "pinned_at",
            "version",
            "doc_format",
            "primary_attachment",
            "created_at",
            "updated_at",
            "published_at",
        ]
        read_only_fields = [
            "id",
            "slug",
            "status",
            "published_at",
            "pinned_at",
            "doc_format",
            "primary_attachment",
            "created_at",
            "updated_at",
        ]

    def get_doc_format(self, obj: Document) -> str:
        return detect_doc_format(obj)

    def validate_knowledge_base(self, value: KnowledgeBase) -> KnowledgeBase:
        return _assert_owned(self, value, value.owner_id)

    def validate_folder(self, value: Folder | None) -> Folder | None:
        if value is None:
            return value
        return _assert_owned(self, value, value.knowledge_base.owner_id)

    def update(self, instance: Document, validated_data: dict) -> Document:
        expected = self.context.get("expected_version")
        if expected is not None:
            with transaction.atomic():
                locked = Document.objects.select_for_update().get(pk=instance.pk)
                if locked.version != expected:
                    raise VersionConflictError(locked)
                return self._apply_update(locked, validated_data)
        return self._apply_update(instance, validated_data)

    def _apply_update(self, instance: Document, validated_data: dict) -> Document:
        if "is_pinned" in validated_data:
            if validated_data["is_pinned"]:
                validated_data["pinned_at"] = timezone.now()
            else:
                validated_data["pinned_at"] = None
        # Dual-content: raw autosave does not overwrite published_content.
        # Use publish() or an explicit published_content PATCH to ship to readers.
        new_raw = validated_data.get("raw_content")
        content_changed = (
            (new_raw is not None and new_raw != instance.raw_content)
            or (
                "published_content" in validated_data
                and validated_data["published_content"] != instance.published_content
            )
        )
        if content_changed:
            validated_data["version"] = instance.version + 1
        raw_changed = new_raw is not None and new_raw != instance.raw_content
        published_changed = (
            "published_content" in validated_data
            and validated_data["published_content"] != instance.published_content
        )
        result = super().update(instance, validated_data)
        if raw_changed or published_changed:
            request = self.context.get("request")
            uploaded_by = getattr(request, "user", None) if request else None
            fmt = detect_doc_format(result)
            if fmt == "markdown":
                from apps.editor.services.image_mirror import (
                    mirror_images_for_document,
                )

                mirror_images_for_document(result, uploaded_by=uploaded_by)
                result.refresh_from_db()
            elif fmt == "html":
                from apps.editor.services.html_asset_mirror import (
                    mirror_html_assets_for_document,
                )

                mirror_html_assets_for_document(result, uploaded_by=uploaded_by)
                result.refresh_from_db()
        return result

    def get_primary_attachment(self, obj: Document) -> dict | None:
        att = _primary_attachment(obj)
        if not att:
            return None
        return {
            "id": att.id,
            "url": att.file.url if att.file else "",
            "original_filename": att.original_filename,
            "mime_type": att.mime_type,
            "size": att.size,
            "kind": att.kind,
        }


class DocumentPublishedContentSerializer(serializers.ModelSerializer):
    """PATCH /documents/{id}/published/ — only ``published_content`` is writable."""

    class Meta:
        model = Document
        fields = ["published_content"]

    def update(self, instance: Document, validated_data: dict) -> Document:
        # Reuse version bump + asset mirroring from DocumentSerializer.
        return DocumentSerializer(context=self.context).update(instance, validated_data)


# -------- tree representation --------

class _TreeDocumentSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    doc_format = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "type",
            "title",
            "slug",
            "status",
            "visibility",
            "order",
            "folder",
            "is_pinned",
            "doc_format",
            "is_favorited",
        ]

    def get_type(self, _obj: Document) -> str:
        return "document"

    def get_doc_format(self, obj: Document) -> str:
        return detect_doc_format(obj)

    def get_is_favorited(self, obj: Document) -> bool:
        fav_ids = self.context.get("favorite_doc_ids") or set()
        return obj.id in fav_ids


class _TreeFolderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    type = serializers.SerializerMethodField()
    name = serializers.CharField()
    parent = serializers.IntegerField(allow_null=True)
    order = serializers.IntegerField()
    children = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    def get_type(self, _obj) -> str:
        return "folder"

    def get_children(self, obj):
        return _TreeFolderSerializer(obj["children"], many=True).data

    def get_documents(self, obj):
        return _TreeDocumentSerializer(
            obj["documents"], many=True, context=self.context
        ).data

    def get_tags(self, obj):
        return obj.get("tags", [])


def _favorite_doc_ids_for_user(kb: KnowledgeBase, user) -> set[int]:
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    return set(
        DocumentFavorite.objects.filter(
            user=user,
            document__knowledge_base=kb,
        ).values_list("document_id", flat=True)
    )


def sort_documents(
    docs: list[Document],
    mode: str,
    favorite_ids: set[int] | None = None,
) -> list[Document]:
    """Sort documents within a folder: pinned first, then favorites, then mode."""
    favorite_ids = favorite_ids or set()
    mode = mode or "custom"

    def sort_key(d: Document):
        pinned_tier = 0 if d.is_pinned else 1
        pinned_ts = 0.0
        if d.pinned_at:
            pinned_ts = -d.pinned_at.timestamp()
        fav_tier = 0 if (d.id in favorite_ids and not d.is_pinned) else 1

        if mode == "title":
            mode_key: object = d.title.lower()
        elif mode == "created_at":
            mode_key = -d.created_at.timestamp() if d.created_at else 0
        elif mode == "updated_at":
            mode_key = -d.updated_at.timestamp() if d.updated_at else 0
        elif mode == "doc_format":
            mode_key = DOC_FORMAT_ORDER.get(detect_doc_format(d), 99)
        else:
            mode_key = (d.order, d.id)
        return (pinned_tier, pinned_ts, fav_tier, mode_key)

    return sorted(docs, key=sort_key)


def build_tree(kb: KnowledgeBase, user=None) -> dict:
    """Return a nested tree of folders + documents for one knowledge base."""
    from django.db.models import Prefetch

    from apps.editor.models import Attachment

    favorite_ids = _favorite_doc_ids_for_user(kb, user)
    sort_mode = kb.doc_sort_mode or "custom"

    folders = list(
        Folder.objects.filter(knowledge_base=kb)
        .prefetch_related("tags")
        .order_by("order", "id")
    )
    # The tree only needs metadata; defer the big body columns and instead
    # annotate ``_fmt_head`` (first 4096 chars) so ``detect_doc_format`` can
    # classify no-attachment HTML docs without un-deferring the full content.
    documents = list(
        Document.objects.filter(knowledge_base=kb)
        .defer("raw_content", "published_content", "search_vector")
        .annotate(_fmt_head=_FMT_HEAD_EXPR)
        .prefetch_related(
            Prefetch(
                "attachments",
                queryset=Attachment.objects.order_by("created_at"),
                to_attr="ordered_attachments",
            )
        )
    )
    folder_map: dict[int, dict] = {
        f.id: {
            "id": f.id,
            "name": f.name,
            "parent": f.parent_id,
            "order": f.order,
            "children": [],
            "documents": [],
            "tags": [
                {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
                for t in f.tags.all()
            ],
        }
        for f in folders
    }
    root_folders: list[dict] = []
    for f in folders:
        node = folder_map[f.id]
        if f.parent_id and f.parent_id in folder_map:
            folder_map[f.parent_id]["children"].append(node)
        else:
            root_folders.append(node)

    root_docs: list[Document] = []
    for d in documents:
        if d.folder_id and d.folder_id in folder_map:
            folder_map[d.folder_id]["documents"].append(d)
        else:
            root_docs.append(d)

    for node in folder_map.values():
        node["documents"] = sort_documents(node["documents"], sort_mode, favorite_ids)
    root_docs = sort_documents(root_docs, sort_mode, favorite_ids)
    tree_ctx = {"favorite_doc_ids": favorite_ids}

    return {
        "id": kb.id,
        "name": kb.name,
        "doc_sort_mode": kb.doc_sort_mode,
        "folders": _TreeFolderSerializer(
            root_folders, many=True, context=tree_ctx
        ).data,
        "documents": _TreeDocumentSerializer(
            root_docs, many=True, context=tree_ctx
        ).data,
    }


class ReorderItemSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["folder", "document"])
    id = serializers.IntegerField()
    parent_folder_id = serializers.IntegerField(allow_null=True, required=False)
    order = serializers.IntegerField()


class ReorderRequestSerializer(serializers.Serializer):
    knowledge_base = serializers.IntegerField()
    items = ReorderItemSerializer(many=True)
