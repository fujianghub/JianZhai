from django.urls import path

from .views import delete_comment, document_comments

urlpatterns = [
    path("documents/<int:doc_id>/comments/", document_comments, name="document-comments"),
    path("comments/<int:pk>/", delete_comment, name="delete-comment"),
]
