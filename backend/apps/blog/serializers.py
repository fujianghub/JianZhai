from __future__ import annotations

from rest_framework import serializers

from apps.knowledge.html_content import resolve_html_body
from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import detect_doc_format


def _tags_summary(obj) -> list[dict]:
    return [
        {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
        for t in obj.tags.all()
    ]


def _primary_attachment(doc: Document) -> dict | None:
    """Return the first attachment of a doc (typically the imported source file).

    Uses the ``ordered_attachments`` Prefetch populated by blog views when
    present, so list endpoints don't issue a per-doc query.
    """
    cached = getattr(doc, "ordered_attachments", None)
    if cached is not None:
        att = cached[0] if cached else None
    else:
        att = doc.attachments.order_by("created_at").first()
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


class PublicPostListSerializer(serializers.ModelSerializer):
    excerpt = serializers.SerializerMethodField()
    knowledge_base = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    doc_format = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "slug",
            "excerpt",
            "published_at",
            "knowledge_base",
            "tags",
            "doc_format",
        ]

    def get_excerpt(self, obj: Document) -> str:
        content = (obj.published_content or "").strip()
        return content[:180]

    def get_knowledge_base(self, obj: Document) -> dict:
        kb = obj.knowledge_base
        return {"id": kb.id, "name": kb.name, "slug": kb.slug}

    def get_tags(self, obj: Document) -> list[dict]:
        return _tags_summary(obj)

    def get_doc_format(self, obj: Document) -> str:
        return detect_doc_format(obj)


class PublicPostDetailSerializer(serializers.ModelSerializer):
    knowledge_base = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    primary_attachment = serializers.SerializerMethodField()
    doc_format = serializers.SerializerMethodField()
    published_content = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "slug",
            "published_content",
            "published_at",
            "updated_at",
            "knowledge_base",
            "tags",
            "paper_style",
            "primary_attachment",
            "doc_format",
        ]

    def get_knowledge_base(self, obj: Document) -> dict:
        kb = obj.knowledge_base
        return {
            "id": kb.id,
            "name": kb.name,
            "slug": kb.slug,
            "accent_color": kb.accent_color,
        }

    def get_tags(self, obj: Document) -> list[dict]:
        return _tags_summary(obj)

    def get_primary_attachment(self, obj: Document) -> dict | None:
        return _primary_attachment(obj)

    def get_doc_format(self, obj: Document) -> str:
        return detect_doc_format(obj)

    def get_published_content(self, obj: Document) -> str:
        """HTML posts may have body only in ``raw_content`` or a ``.html`` attachment."""
        if detect_doc_format(obj) == "html":
            return resolve_html_body(obj)
        return obj.published_content or ""


class PublicKBSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()
    post_count = serializers.SerializerMethodField()

    class Meta:
        model = KnowledgeBase
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "cover_image",
            "accent_color",
            "tags",
            "post_count",
            "updated_at",
        ]

    def get_tags(self, obj: KnowledgeBase) -> list[dict]:
        return _tags_summary(obj)

    def get_post_count(self, obj: KnowledgeBase) -> int:
        return obj.documents.filter(status="published", visibility="public").count()
