from django.apps import AppConfig


class LinkingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.linking"
    verbose_name = "Bidirectional Linking"

    def ready(self) -> None:
        from . import signals  # noqa: F401  -- register post_save handler
