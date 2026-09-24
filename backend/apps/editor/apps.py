from django.apps import AppConfig


class EditorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.editor"
    verbose_name = "Editor"

    def ready(self):
        from . import signals  # noqa: F401 — drawio画板 附件回收
