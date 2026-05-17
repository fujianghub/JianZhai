from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PublicArchiveView,
    PublicBacklinksView,
    PublicKBTreeView,
    PublicKBViewSet,
    PublicPostByIdView,
    PublicPostViewSet,
)

router = DefaultRouter()
router.register(r"posts", PublicPostViewSet, basename="public-post")
router.register(r"kbs", PublicKBViewSet, basename="public-kb")

urlpatterns = [
    path("posts/by-id/<int:doc_id>/", PublicPostByIdView.as_view(), name="public-post-by-id"),
    path("posts/by-id/<int:doc_id>/backlinks/", PublicBacklinksView.as_view(), name="public-post-backlinks"),
    path("archive/", PublicArchiveView.as_view(), name="public-archive"),
    path("", include(router.urls)),
    path("kbs/<str:slug>/tree/", PublicKBTreeView.as_view(), name="public-kb-tree"),
]
