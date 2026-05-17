from django.urls import path

from .views import VersionDetail, VersionDiff, VersionListCreate, VersionRestore

urlpatterns = [
    path(
        "documents/<int:doc_id>/versions/",
        VersionListCreate.as_view(),
        name="version-list-create",
    ),
    path(
        "documents/<int:doc_id>/versions/diff/",
        VersionDiff.as_view(),
        name="version-diff",
    ),
    path(
        "documents/<int:doc_id>/versions/<int:vid>/",
        VersionDetail.as_view(),
        name="version-detail",
    ),
    path(
        "documents/<int:doc_id>/versions/<int:vid>/restore/",
        VersionRestore.as_view(),
        name="version-restore",
    ),
]
