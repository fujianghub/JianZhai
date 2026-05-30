from django.urls import path

from .views import (
    capabilities,
    chat,
    conversation_detail,
    conversations_list,
    estimate,
    run,
    settings_view,
    stream,
    template_detail,
    templates_list,
    usage,
    usage_csv,
)

urlpatterns = [
    # Core call paths
    path("ai/capabilities/", capabilities, name="ai-capabilities"),
    path("ai/settings/", settings_view, name="ai-settings"),
    path("ai/run/", run, name="ai-run"),
    path("ai/stream/", stream, name="ai-stream"),
    path("ai/chat/", chat, name="ai-chat"),
    path("ai/estimate/", estimate, name="ai-estimate"),

    # Usage / audit
    path("ai/usage/", usage, name="ai-usage"),
    path("ai/usage/csv/", usage_csv, name="ai-usage-csv"),

    # Per-user prompt templates
    path("ai/templates/", templates_list, name="ai-templates-list"),
    path("ai/templates/<int:pk>/", template_detail, name="ai-template-detail"),

    # Multi-turn chat history
    path("ai/conversations/", conversations_list, name="ai-conversations-list"),
    path("ai/conversations/<int:pk>/", conversation_detail, name="ai-conversation-detail"),
]
