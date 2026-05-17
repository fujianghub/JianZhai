from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TagViewSet, document_tags, kb_tags

router = DefaultRouter()
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = [
    path("", include(router.urls)),
    path("documents/<int:doc_id>/tags/", document_tags, name="document-tags"),
    path("kbs/<int:kb_id>/tags/", kb_tags, name="kb-tags"),
]
