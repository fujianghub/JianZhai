from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models.functions import TruncMonth
from django.db.models import Count
from django.http import HttpResponse
from django.utils.feedgenerator import Rss201rev2Feed
from xml.sax.saxutils import escape as xml_escape

from apps.knowledge.models import Document, Folder, KnowledgeBase
from apps.linking.models import DocumentLink

from .serializers import PublicKBSerializer, PublicPostDetailSerializer, PublicPostListSerializer


def _published_qs():
    from django.db.models import Prefetch

    from apps.editor.models import Attachment

    return (
        Document.objects.filter(
            status="published",
            visibility="public",
            knowledge_base__visibility="public",
        )
        .select_related("knowledge_base")
        .prefetch_related(
            "tags",
            Prefetch(
                "attachments",
                queryset=Attachment.objects.order_by("created_at"),
                to_attr="ordered_attachments",
            ),
        )
        .order_by("-published_at")
    )


class PublicPostViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        qs = _published_qs()
        kb_slug = self.request.query_params.get("kb")
        if kb_slug:
            qs = qs.filter(knowledge_base__slug=kb_slug)
        tag_slug = self.request.query_params.get("tag")
        if tag_slug:
            qs = qs.filter(tags__slug=tag_slug)
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PublicPostDetailSerializer
        return PublicPostListSerializer


class PublicKBViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    serializer_class = PublicKBSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return KnowledgeBase.objects.filter(visibility="public").order_by("order", "id")


def _build_public_folder_tree(kb: KnowledgeBase, docs: list[Document]) -> dict:
    """Return a folder-aware tree for the public KB endpoint.

    Folders that contain (or transitively contain) no published+public docs are
    pruned, so anonymous readers only see directories that actually have
    something to read. Documents at the KB root (folder is null) bubble up to
    the top-level ``documents`` list.
    """
    folders = list(
        Folder.objects.filter(knowledge_base=kb)
        .prefetch_related("tags")
        .order_by("order", "id")
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
    serialized = {d.id: d for d in docs}
    for d in docs:
        if d.folder_id and d.folder_id in folder_map:
            folder_map[d.folder_id]["documents"].append(serialized[d.id])
        else:
            root_docs.append(d)

    # Serialise documents lazily so we don't pay the cost for pruned subtrees.
    def serialize_folder(node: dict) -> dict:
        children = [serialize_folder(c) for c in node["children"]]
        children = [c for c in children if c]  # prune empty subtrees
        documents = PublicPostListSerializer(node["documents"], many=True).data
        if not children and not documents:
            return None  # type: ignore[return-value]
        return {
            "id": node["id"],
            "name": node["name"],
            "parent": node["parent"],
            "order": node["order"],
            "children": children,
            "documents": documents,
            "tags": node["tags"],
        }

    pruned_folders = [serialize_folder(f) for f in root_folders]
    pruned_folders = [f for f in pruned_folders if f]

    return {
        "folders": pruned_folders,
        "documents": PublicPostListSerializer(root_docs, many=True).data,
    }


class PublicKBTreeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        kb = get_object_or_404(KnowledgeBase.objects.filter(visibility="public"), slug=slug)
        docs = list(
            _published_qs().filter(knowledge_base=kb)
        )
        folder_tree = _build_public_folder_tree(kb, docs)
        return Response(
            {
                "id": kb.id,
                "name": kb.name,
                "slug": kb.slug,
                "accent_color": kb.accent_color,
                "description": kb.description,
                "tags": [
                    {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
                    for t in kb.tags.all()
                ],
                # Flat document list — kept for backward compatibility with the
                # rendering of card-grid views that don't care about folders.
                "documents": PublicPostListSerializer(docs, many=True).data,
                # Folder-aware nested view.
                "folders": folder_tree["folders"],
                "root_documents": folder_tree["documents"],
            }
        )


class PublicPostByIdView(APIView):
    """Lookup a public post by numeric id — used by the @-mention link resolver."""

    permission_classes = [AllowAny]

    def get(self, request, doc_id: int):
        doc = get_object_or_404(_published_qs(), pk=doc_id)
        return Response({"id": doc.id, "slug": doc.slug, "title": doc.title})


class PublicArchiveView(APIView):
    """Group published+public posts by year/month for the blog archive page."""

    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            _published_qs()
            .annotate(month=TruncMonth("published_at"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by("-month")
        )
        buckets = [
            {"year": m["month"].year, "month": m["month"].month, "count": m["count"]}
            for m in qs
        ]
        # Attach a lightweight post list to each bucket (capped per group).
        for bucket in buckets:
            posts = _published_qs().filter(
                published_at__year=bucket["year"],
                published_at__month=bucket["month"],
            )[:50]
            bucket["posts"] = PublicPostListSerializer(posts, many=True).data
        return Response(buckets)


def rss_feed(request):
    """Top-level RSS endpoint at /feed.xml (not under /api/v1/)."""
    site_url = request.build_absolute_uri("/")
    feed = Rss201rev2Feed(
        title="简斋 / JianZhai",
        link=site_url,
        description="个人知识库与博客",
        language="zh-CN",
    )
    for d in _published_qs()[:50]:
        feed.add_item(
            title=d.title,
            link=request.build_absolute_uri(f"/posts/{d.slug}"),
            pubdate=d.published_at,
            description=xml_escape((d.published_content or "")[:1000]),
            unique_id=str(d.id),
        )
    return HttpResponse(feed.writeString("utf-8"), content_type="application/rss+xml; charset=utf-8")


class PublicPostAdjacentView(APIView):
    """Return the immediately older and newer published posts relative to `slug`."""
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        post = get_object_or_404(_published_qs(), slug=slug)
        qs = _published_qs()
        # "上一篇" = older (published before this one); qs ordered by -published_at so .first() = most recent older
        older = qs.filter(published_at__lt=post.published_at).first()
        # "下一篇" = newer (published after); need ascending order to get the immediately-next one
        newer = qs.filter(published_at__gt=post.published_at).order_by('published_at').first()

        def brief(p):
            if p is None:
                return None
            return {'id': p.id, 'slug': p.slug, 'title': p.title}

        return Response({'prev': brief(older), 'next': brief(newer)})


class PublicBacklinksView(APIView):
    """Backlinks for a published+public document; only public sources are exposed."""

    permission_classes = [AllowAny]

    def get(self, request, doc_id: int):
        target = get_object_or_404(_published_qs(), pk=doc_id)
        links = (
            DocumentLink.objects.filter(target=target)
            .select_related("source", "source__knowledge_base")
            .filter(
                source__status="published",
                source__visibility="public",
                source__knowledge_base__visibility="public",
                source__is_deleted=False,
            )
            .order_by("-created_at")
        )
        return Response(
            [
                {
                    "id": l.id,
                    "context": l.context,
                    "position": l.position,
                    "created_at": l.created_at,
                    "source": {
                        "id": l.source.id,
                        "title": l.source.title,
                        "slug": l.source.slug,
                        "knowledge_base": l.source.knowledge_base_id,
                        "status": l.source.status,
                        "visibility": l.source.visibility,
                    },
                }
                for l in links
            ]
        )
