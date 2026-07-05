from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PublicArchiveView,
    PublicBacklinksView,
    PublicKBCategoriesView,
    PublicKBTreeView,
    PublicKBViewSet,
    PublicPostAdjacentView,
    PublicPostByIdView,
    PublicPostRelatedView,
    PublicPostSlidesView,
    PublicPostViewSet,
)

router = DefaultRouter()
router.register(r"posts", PublicPostViewSet, basename="public-post")
router.register(r"kbs", PublicKBViewSet, basename="public-kb")

urlpatterns = [
    path("posts/by-id/<int:doc_id>/", PublicPostByIdView.as_view(), name="public-post-by-id"),
    path("posts/by-id/<int:doc_id>/backlinks/", PublicBacklinksView.as_view(), name="public-post-backlinks"),
    path("posts/by-id/<int:doc_id>/slides/", PublicPostSlidesView.as_view(), name="public-post-slides"),
    path("posts/<str:slug>/adjacent/", PublicPostAdjacentView.as_view(), name="public-post-adjacent"),
    path("posts/<str:slug>/related/", PublicPostRelatedView.as_view(), name="public-post-related"),
    path("archive/", PublicArchiveView.as_view(), name="public-archive"),
    path("kb-categories/", PublicKBCategoriesView.as_view(), name="public-kb-categories"),
    path("", include(router.urls)),
    path("kbs/<str:slug>/tree/", PublicKBTreeView.as_view(), name="public-kb-tree"),
]
