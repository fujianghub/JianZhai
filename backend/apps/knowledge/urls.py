from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .trash_views import (
    batch_purge_documents,
    batch_purge_knowledge_bases,
    batch_restore_documents,
    batch_restore_knowledge_bases,
    empty_trash,
    purge_document,
    purge_knowledge_base,
    restore_document,
    restore_knowledge_base,
    trash_list,
)
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
    path("trash/", trash_list, name="trash-list"),
    path("trash/kbs/<int:pk>/restore/", restore_knowledge_base, name="trash-kb-restore"),
    path("trash/kbs/<int:pk>/", purge_knowledge_base, name="trash-kb-purge"),
    path("trash/documents/<int:pk>/restore/", restore_document, name="trash-doc-restore"),
    path("trash/documents/<int:pk>/", purge_document, name="trash-doc-purge"),
    path(
        "trash/kbs/batch-restore/",
        batch_restore_knowledge_bases,
        name="trash-kb-batch-restore",
    ),
    path(
        "trash/kbs/batch-purge/",
        batch_purge_knowledge_bases,
        name="trash-kb-batch-purge",
    ),
    path(
        "trash/documents/batch-restore/",
        batch_restore_documents,
        name="trash-doc-batch-restore",
    ),
    path(
        "trash/documents/batch-purge/",
        batch_purge_documents,
        name="trash-doc-batch-purge",
    ),
    path("trash/empty/", empty_trash, name="trash-empty"),
]
