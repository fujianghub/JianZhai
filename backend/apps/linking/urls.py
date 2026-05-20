from django.urls import path

from .views import backlinks, graph

urlpatterns = [
    path("documents/<int:doc_id>/backlinks/", backlinks, name="document-backlinks"),
    path("links/graph/", graph, name="links-graph"),
]
