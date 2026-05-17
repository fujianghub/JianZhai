from django.urls import path

from .views import backlinks

urlpatterns = [
    path("documents/<int:doc_id>/backlinks/", backlinks, name="document-backlinks"),
]
