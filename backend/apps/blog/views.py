from __future__ import annotations

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from apps.accounts.permissions import PublicOrLoginGated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models.functions import Substr, TruncMonth
from django.db.models import Count, Q

# Annotation matching PublicKBSerializer.get_post_count — counts published+public,
# non-deleted documents per KB in one query instead of one COUNT per KB.
_POST_COUNT_ANNOTATION = Count(
    "documents",
    filter=Q(
        documents__status="published",
        documents__visibility="public",
        documents__is_deleted=False,
    ),
)
from django.http import HttpResponse
from django.utils.feedgenerator import Rss201rev2Feed
from xml.sax.saxutils import escape as xml_escape

from apps.knowledge.models import Document, Folder, KnowledgeBase, KnowledgeBaseCategory
from apps.knowledge.serializers import _FMT_HEAD_EXPR, _favorite_doc_ids_for_user, sort_documents
from apps.linking.models import DocumentLink

from .serializers import PublicKBSerializer, PublicPostDetailSerializer, PublicPostListSerializer


def _kb_can_manage(kb: KnowledgeBase, user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return kb.owner_id == user.id


def _published_qs(defer_body: bool = False):
    from django.db.models import Prefetch

    from apps.editor.models import Attachment

    qs = (
        Document.objects.filter(
            status="published",
            visibility="public",
            knowledge_base__visibility="public",
            knowledge_base__is_deleted=False,
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
    if defer_body:
        # List / tree / archive / sitemap only need metadata + a short excerpt.
        # Defer the big body columns and annotate a truncated head for
        # ``detect_doc_format`` (4096) and the excerpt (400 → trimmed to 180).
        qs = qs.defer("raw_content", "published_content", "search_vector").annotate(
            _fmt_head=_FMT_HEAD_EXPR,
            _excerpt_head=Substr("published_content", 1, 400),
        )
    return qs


def resolve_public_post_by_slug(
    qs,
    slug: str,
    kb_slug: str | None = None,
) -> Document:
    """Resolve a single published public post by slug.

    Slugs are unique per knowledge base, not globally. Without ``kb_slug``,
    multiple KBs may share the same slug — we return the most recently
    published match instead of raising ``MultipleObjectsReturned``.
    """
    candidates = qs.filter(slug=slug)
    if kb_slug:
        candidates = candidates.filter(knowledge_base__slug=kb_slug)
    post = candidates.order_by("-published_at", "-id").first()
    if post is None:
        raise Http404
    return post


class PublicPostViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = [PublicOrLoginGated]
    lookup_field = "slug"

    def get_queryset(self):
        # retrieve needs the full body; list only needs excerpt + metadata.
        qs = _published_qs(defer_body=self.action != "retrieve")
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

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        slug = self.kwargs[self.lookup_field]
        kb_slug = self.request.query_params.get("kb")
        return resolve_public_post_by_slug(queryset, slug, kb_slug)


class PublicKBViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [PublicOrLoginGated]
    serializer_class = PublicKBSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            KnowledgeBase.objects.filter(visibility="public")
            .select_related("category")
            .prefetch_related("tags")
            .annotate(_post_count=_POST_COUNT_ANNOTATION)
            .order_by("order", "id")
        )


class PublicKBCategoriesView(APIView):
    """Public KBs grouped by category for the blog home page."""

    permission_classes = [PublicOrLoginGated]

    def get(self, request):
        from .serializers import PublicKBSerializer

        # Fetch every public KB once (with post counts + tags + category) and
        # group in Python, instead of one annotated query per category.
        all_kbs = list(
            KnowledgeBase.objects.filter(visibility="public", is_deleted=False)
            .select_related("category")
            .prefetch_related("tags")
            .annotate(_post_count=_POST_COUNT_ANNOTATION)
            .order_by("order", "id")
        )
        by_category: dict[int | None, list] = {}
        for kb in all_kbs:
            by_category.setdefault(kb.category_id, []).append(kb)

        groups = []
        # Categories that actually have public KBs, in their configured order.
        seen_cat_ids = {cid for cid in by_category if cid is not None}
        if seen_cat_ids:
            categories = (
                KnowledgeBaseCategory.objects.filter(id__in=seen_cat_ids)
                .order_by("order", "id")
            )
            for cat in categories:
                kbs = by_category.get(cat.id, [])
                if kbs:
                    groups.append(
                        {
                            "category": {
                                "id": cat.id,
                                "name": cat.name,
                                "slug": cat.slug,
                                "description": cat.description,
                                "accent_color": cat.accent_color,
                                "order": cat.order,
                            },
                            "knowledge_bases": PublicKBSerializer(kbs, many=True).data,
                        }
                    )
        uncategorized = by_category.get(None, [])
        if uncategorized:
            groups.append(
                {
                    "category": None,
                    "knowledge_bases": PublicKBSerializer(uncategorized, many=True).data,
                }
            )
        return Response(groups)


def _build_public_folder_tree(
    kb: KnowledgeBase,
    docs: list[Document],
    user=None,
) -> dict:
    """Return a folder-aware tree for the public KB endpoint.

    Folders that contain (or transitively contain) no published+public docs are
    pruned, so anonymous readers only see directories that actually have
    something to read. Documents at the KB root (folder is null) bubble up to
    the top-level ``documents`` list.
    """
    favorite_ids = _favorite_doc_ids_for_user(kb, user)
    sort_mode = kb.doc_sort_mode or "custom"
    ser_ctx = {"favorite_doc_ids": favorite_ids}

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

    for node in folder_map.values():
        node["documents"] = sort_documents(node["documents"], sort_mode, favorite_ids)
    root_docs = sort_documents(root_docs, sort_mode, favorite_ids)

    # Serialise documents lazily so we don't pay the cost for pruned subtrees.
    def serialize_folder(node: dict) -> dict:
        children = [serialize_folder(c) for c in node["children"]]
        children = [c for c in children if c]  # prune empty subtrees
        documents = PublicPostListSerializer(
            node["documents"], many=True, context=ser_ctx
        ).data
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

    sorted_flat = sort_documents(list(docs), sort_mode, favorite_ids)
    return {
        "folders": pruned_folders,
        "documents": PublicPostListSerializer(
            root_docs, many=True, context=ser_ctx
        ).data,
        "flat_documents": PublicPostListSerializer(
            sorted_flat, many=True, context=ser_ctx
        ).data,
    }


class PublicKBTreeView(APIView):
    permission_classes = [PublicOrLoginGated]

    def get(self, request, slug: str):
        kb = get_object_or_404(KnowledgeBase.objects.filter(visibility="public"), slug=slug)
        docs = list(
            _published_qs(defer_body=True).filter(knowledge_base=kb)
        )
        user = request.user
        folder_tree = _build_public_folder_tree(kb, docs, user=user)
        can_manage = _kb_can_manage(kb, user)
        payload = {
            "id": kb.id,
            "name": kb.name,
            "slug": kb.slug,
            "accent_color": kb.accent_color,
            "description": kb.description,
            "doc_sort_mode": kb.doc_sort_mode or "custom",
            "can_manage": can_manage,
            "tags": [
                {"id": t.id, "name": t.name, "slug": t.slug, "color": t.color}
                for t in kb.tags.all()
            ],
            "documents": folder_tree["flat_documents"],
            "folders": folder_tree["folders"],
            "root_documents": folder_tree["documents"],
        }
        if can_manage:
            payload["owner_id"] = kb.owner_id
        return Response(payload)


class PublicPostByIdView(APIView):
    """Lookup a public post by numeric id — used by the @-mention link resolver."""

    permission_classes = [PublicOrLoginGated]

    def get(self, request, doc_id: int):
        doc = get_object_or_404(_published_qs(), pk=doc_id)
        return Response({"id": doc.id, "slug": doc.slug, "title": doc.title})


class PublicArchiveView(APIView):
    """Group published+public posts by year/month for the blog archive page."""

    permission_classes = [PublicOrLoginGated]

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
            posts = _published_qs(defer_body=True).filter(
                published_at__year=bucket["year"],
                published_at__month=bucket["month"],
            )[:50]
            bucket["posts"] = PublicPostListSerializer(posts, many=True).data
        return Response(buckets)


def _friend_gate_response(request):
    """Mirror PublicOrLoginGated for the plain Django views (feed/sitemap).

    These live outside /api/v1/public/ so the DRF permission class never runs;
    without this check they would leak published titles/content to anonymous
    visitors even when the site is in friends-only mode.
    """
    from django.conf import settings as dj_settings

    if getattr(dj_settings, "SITE_REQUIRE_LOGIN", False) and not request.user.is_authenticated:
        return HttpResponse(status=403)
    return None


def rss_feed(request):
    """Top-level RSS endpoint at /feed.xml (not under /api/v1/)."""
    gated = _friend_gate_response(request)
    if gated is not None:
        return gated
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


class PublicPostRelatedView(APIView):
    """Related published posts by shared tags and backlinks (public sources only)."""

    permission_classes = [PublicOrLoginGated]

    def get(self, request, slug: str):
        kb_slug = request.query_params.get("kb")
        post = resolve_public_post_by_slug(_published_qs(), slug, kb_slug)
        base_qs = _published_qs().exclude(pk=post.pk)
        if kb_slug:
            base_qs = base_qs.filter(knowledge_base__slug=kb_slug)

        seen: set[int] = set()
        items: list[dict] = []

        def add_doc(d: Document, reason: str) -> None:
            if d.id in seen:
                return
            seen.add(d.id)
            items.append(
                {
                    "id": d.id,
                    "slug": d.slug,
                    "title": d.title,
                    "reason": reason,
                    "knowledge_base": {
                        "id": d.knowledge_base_id,
                        "name": d.knowledge_base.name,
                        "slug": d.knowledge_base.slug,
                        "accent_color": d.knowledge_base.accent_color,
                    },
                    "published_at": d.published_at.isoformat() if d.published_at else None,
                }
            )

        tag_ids = list(post.tags.values_list("id", flat=True))
        if tag_ids:
            for d in (
                base_qs.filter(tags__id__in=tag_ids)
                .distinct()
                .order_by("-published_at")[:5]
            ):
                add_doc(d, "tag")

        for link in (
            DocumentLink.objects.filter(target=post)
            .select_related("source", "source__knowledge_base")
            .filter(
                source__status="published",
                source__visibility="public",
                source__knowledge_base__visibility="public",
                source__knowledge_base__is_deleted=False,
                source__is_deleted=False,
            )
            .order_by("-created_at")[:5]
        ):
            if link.source_id not in seen:
                add_doc(link.source, "backlink")

        for link in (
            DocumentLink.objects.filter(source=post)
            .select_related("target", "target__knowledge_base")
            .filter(
                target__status="published",
                target__visibility="public",
                target__knowledge_base__visibility="public",
                target__knowledge_base__is_deleted=False,
                target__is_deleted=False,
            )
            .order_by("-created_at")[:5]
        ):
            if link.target_id not in seen and len(items) < 8:
                add_doc(link.target, "mention")

        return Response(items[:8])


def robots_txt(request):
    """Tell crawlers what to index. Public blog routes are crawlable; admin and
    API surfaces are not. Points to the sitemap so search engines find posts
    without crawling. Built dynamically so it always matches the current host."""
    site = request.build_absolute_uri("/").rstrip("/")
    body = (
        "User-agent: *\n"
        "Disallow: /admin\n"
        "Disallow: /api/\n"
        "Disallow: /d/\n"
        "Allow: /\n"
        f"Sitemap: {site}/sitemap.xml\n"
    )
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


def sitemap_xml(request):
    """Top-level sitemap for published public posts and static blog pages."""
    gated = _friend_gate_response(request)
    if gated is not None:
        return gated
    site = request.build_absolute_uri("/").rstrip("/")
    urls = [
        f"  <url><loc>{xml_escape(site + '/')}</loc><changefreq>daily</changefreq></url>",
        f"  <url><loc>{xml_escape(site + '/archive')}</loc><changefreq>weekly</changefreq></url>",
        f"  <url><loc>{xml_escape(site + '/tags')}</loc><changefreq>weekly</changefreq></url>",
    ]
    for d in _published_qs(defer_body=True)[:500]:
        path = f"/posts/{d.slug}"
        if d.knowledge_base.slug:
            path += f"?kb={d.knowledge_base.slug}"
        loc = xml_escape(site + path)
        lastmod = (d.published_at or d.updated_at).strftime("%Y-%m-%d")
        urls.append(f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )
    return HttpResponse(body, content_type="application/xml; charset=utf-8")


class PublicPostAdjacentView(APIView):
    """Return the immediately older and newer published posts relative to `slug`."""
    permission_classes = [PublicOrLoginGated]

    def get(self, request, slug: str):
        kb_slug = request.query_params.get("kb")
        post = resolve_public_post_by_slug(_published_qs(), slug, kb_slug)
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

    permission_classes = [PublicOrLoginGated]

    def get(self, request, doc_id: int):
        target = get_object_or_404(_published_qs(), pk=doc_id)
        links = (
            DocumentLink.objects.filter(target=target)
            .select_related("source", "source__knowledge_base")
            .filter(
                source__status="published",
                source__visibility="public",
                source__knowledge_base__visibility="public",
                source__knowledge_base__is_deleted=False,
                source__is_deleted=False,
            )
            .order_by("-created_at")
        )
        return Response(
            [
                {
                    "id": link.id,
                    "context": link.context,
                    "position": link.position,
                    "created_at": link.created_at,
                    "source": {
                        "id": link.source.id,
                        "title": link.source.title,
                        "slug": link.source.slug,
                        "knowledge_base": link.source.knowledge_base_id,
                        "status": link.source.status,
                        "visibility": link.source.visibility,
                    },
                }
                for link in links
            ]
        )
