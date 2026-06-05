from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.accounts.hero import hero_public
from apps.blog.views import robots_txt, rss_feed, sitemap_xml
from apps.tags.views import public_tag_cloud, public_tag_entries

api_v1_patterns = [
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.knowledge.urls")),
    path("", include("apps.editor.urls")),
    path("", include("apps.linking.urls")),
    path("", include("apps.versioning.urls")),
    path("", include("apps.search.urls")),
    path("", include("apps.exporter.urls")),
    path("", include("apps.tags.urls")),
    path("", include("apps.comments.urls")),
    path("", include("apps.ai.urls")),
    path("public/tags/", public_tag_cloud, name="public-tag-cloud"),
    path("public/tags/<int:tag_id>/entries/", public_tag_entries, name="public-tag-entries"),
    path("public/hero/", hero_public, name="public-hero"),
    path("public/", include("apps.blog.urls")),
]

urlpatterns = [
    # ``django-admin/`` (not ``admin/``) — in production the React SPA owns
    # /admin, and Caddy proxies /django-admin/* to this backend.  Dev uses
    # http://localhost:8002/django-admin/ directly.
    path("django-admin/", admin.site.urls),
    path("api/v1/", include((api_v1_patterns, "api_v1"))),
    path("feed.xml", rss_feed, name="feed"),
    path("sitemap.xml", sitemap_xml, name="sitemap"),
    path("robots.txt", robots_txt, name="robots"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
