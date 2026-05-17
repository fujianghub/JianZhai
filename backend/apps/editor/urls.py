from django.urls import path

from .views import delete_attachment, document_attachments, import_file, my_attachments, upload

urlpatterns = [
    path("uploads/", upload, name="upload"),
    path("imports/", import_file, name="import-file"),
    path("attachments/", my_attachments, name="my-attachments"),
    path("attachments/<int:pk>/", delete_attachment, name="delete-attachment"),
    path("documents/<int:doc_id>/attachments/", document_attachments, name="document-attachments"),
]
