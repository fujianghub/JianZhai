from django.urls import path

from .views import bookmark_detail, document_bookmarks, document_highlights, highlight_detail

urlpatterns = [
    path("documents/<int:doc_id>/highlights/", document_highlights, name="document-highlights"),
    path("highlights/<int:pk>/", highlight_detail, name="highlight-detail"),
    path("documents/<int:doc_id>/bookmarks/", document_bookmarks, name="document-bookmarks"),
    path("bookmarks/<int:pk>/", bookmark_detail, name="bookmark-detail"),
]
