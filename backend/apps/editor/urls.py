from django.urls import path

from .views import (
    delete_attachment,
    document_attachments,
    import_batch,
    import_file,
    import_zip,
    link_preview,
    my_attachments,
    upload,
)

urlpatterns = [
    path("uploads/", upload, name="upload"),
    path("imports/", import_file, name="import-file"),
    path("imports/batch/", import_batch, name="import-batch"),
    path("imports/zip/", import_zip, name="import-zip"),
    path("attachments/", my_attachments, name="my-attachments"),
    path("attachments/<int:pk>/", delete_attachment, name="delete-attachment"),
    path("documents/<int:doc_id>/attachments/", document_attachments, name="document-attachments"),
    path("link-preview/", link_preview, name="link-preview"),
]
