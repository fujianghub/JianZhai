from django.urls import path

from .views import capabilities, run, settings_view, stream, usage

urlpatterns = [
    path("ai/capabilities/", capabilities, name="ai-capabilities"),
    path("ai/settings/", settings_view, name="ai-settings"),
    path("ai/usage/", usage, name="ai-usage"),
    path("ai/run/", run, name="ai-run"),
    path("ai/stream/", stream, name="ai-stream"),
]
