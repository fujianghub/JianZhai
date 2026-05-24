from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DocumentViewSet,
    FolderViewSet,
    KnowledgeBaseCategoryViewSet,
    KnowledgeBaseViewSet,
    reorder_tree,
)

router = DefaultRouter()
router.register(r"kb-categories", KnowledgeBaseCategoryViewSet, basename="kb-category")
router.register(r"kbs", KnowledgeBaseViewSet, basename="kb")
router.register(r"folders", FolderViewSet, basename="folder")
router.register(r"documents", DocumentViewSet, basename="document")

urlpatterns = [
    path("", include(router.urls)),
    path("tree/reorder/", reorder_tree, name="tree-reorder"),
]
