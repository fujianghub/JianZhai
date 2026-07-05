from __future__ import annotations

from rest_framework import serializers

from apps.knowledge.html_content import resolve_published_html_body
from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import detect_doc_format


def _tags_summary(obj) -> list[dict]:
    return [
        {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
        for t in obj.tags.all()
    ]


def _primary_attachment(doc: Document) -> dict | None:
    """Return the document's defining attachment (typically the imported source).

    Normally the oldest attachment. But a markdown doc bundled with image
    *assets* (``./images/*`` uploaded next to the ``.md``) carries image
    attachments that — depending on upload order — can be the oldest; those are
    embedded assets, not the source file. When the doc has a real text body we
    prefer the oldest non-image attachment so the reader doesn't echo an asset
    image as the "original file" at the bottom of the article.

    Uses the ``ordered_attachments`` Prefetch populated by blog views when
    present, so list endpoints don't issue a per-doc query.
    """
    cached = getattr(doc, "ordered_attachments", None)
    atts = list(cached) if cached is not None else list(doc.attachments.order_by("created_at"))
    if not atts:
        return None
    att = atts[0]
    head = getattr(doc, "_fmt_head", None)
    if head is None:
        head = (doc.raw_content or "") or (doc.published_content or "")
    if head and head.strip():
        att = next(
            (a for a in atts if a.kind != "image" and not (a.mime_type or "").startswith("image/")),
            att,
        )
    return {
        "id": att.id,
        "url": att.file.url if att.file else "",
        "original_filename": att.original_filename,
        "mime_type": att.mime_type,
        "size": att.size,
        "kind": att.kind,
    }


def _slides_summary(doc: Document) -> list[dict]:
    """Ordered rendered-slide images for a PPT/PPTX document (empty otherwise).

    Empty while conversion is still running — the reader shows a "转换中"
    placeholder and polls the slides endpoint until this returns rows.
    """
    slides = getattr(doc, "prefetched_slides", None)
    if slides is None:
        slides = doc.slides.all()
    return [
        {
            "index": s.index,
            "url": s.image.url if s.image else "",
            "width": s.width,
            "height": s.height,
        }
        for s in slides
    ]


class PublicPostListSerializer(serializers.ModelSerializer):
    excerpt = serializers.SerializerMethodField()
    knowledge_base = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    doc_format = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

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
            "is_pinned",
            "is_favorited",
        ]

    def get_is_pinned(self, obj: Document) -> bool:
        return bool(obj.is_pinned)

    def get_is_favorited(self, obj: Document) -> bool:
        fav_ids = self.context.get("favorite_doc_ids") or set()
        return obj.id in fav_ids

    def get_excerpt(self, obj: Document) -> str:
        # List endpoints defer ``published_content`` and annotate ``_excerpt_head``
        # (first 400 chars) so reading the excerpt never un-defers the full body.
        head = getattr(obj, "_excerpt_head", None)
        content = (head if head is not None else (obj.published_content or "")).strip()
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
    slides = serializers.SerializerMethodField()

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
            "heading_numbering",
            "primary_attachment",
            "doc_format",
            "slides",
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

    def get_slides(self, obj: Document) -> list[dict]:
        return _slides_summary(obj)

    def get_published_content(self, obj: Document) -> str:
        """HTML posts may have body only in a ``.html`` attachment (legacy docs).

        Never falls back to ``raw_content`` — that's the private working copy.
        """
        if detect_doc_format(obj) == "html":
            return resolve_published_html_body(obj)
        return obj.published_content or ""


class PublicKBCategorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField()
    accent_color = serializers.CharField()
    order = serializers.IntegerField()


class PublicKBSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()
    post_count = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()

    class Meta:
        model = KnowledgeBase
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "cover_image",
            "accent_color",
            "category",
            "tags",
            "post_count",
            "updated_at",
        ]

    def get_category(self, obj: KnowledgeBase) -> dict | None:
        cat = obj.category
        if not cat:
            return None
        return {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "order": cat.order,
            "accent_color": cat.accent_color,
        }

    def get_tags(self, obj: KnowledgeBase) -> list[dict]:
        return _tags_summary(obj)

    def get_post_count(self, obj: KnowledgeBase) -> int:
        # Prefer the annotation set by the viewset (avoids a COUNT query per KB on
        # list endpoints); fall back to a live count if unannotated.
        annotated = getattr(obj, "_post_count", None)
        if annotated is not None:
            return annotated
        return obj.documents.filter(status="published", visibility="public").count()
