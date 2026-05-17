from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExportTaskViewSet, download

router = DefaultRouter()
router.register(r"exports", ExportTaskViewSet, basename="export")

urlpatterns = [
    path("exports/<int:pk>/download/", download, name="export-download"),
    path("", include(router.urls)),
]
