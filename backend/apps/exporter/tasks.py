"""Celery tasks that dispatch an ExportTask to the right format service."""
from __future__ import annotations

import logging
import traceback

from celery import shared_task
from django.utils import timezone

from .models import ExportTask
from .scope import collect_for_scope
from .services import docx_export, html_export, markdown_export, pdf_export, static_site

log = logging.getLogger(__name__)

FORMAT_DISPATCH = {
    ExportTask.FORMAT_MD: markdown_export.export,
    ExportTask.FORMAT_HTML: html_export.export,
    ExportTask.FORMAT_DOCX: docx_export.export,
    ExportTask.FORMAT_PDF: pdf_export.export,
    ExportTask.FORMAT_SITE: static_site.export,
}


@shared_task(name="exporter.run_export")
def run_export(task_id: int) -> None:
    task = ExportTask.objects.select_related("owner").get(pk=task_id)
    task.status = ExportTask.STATUS_RUNNING
    task.started_at = timezone.now()
    task.save(update_fields=["status", "started_at"])

    try:
        scope = collect_for_scope(
            owner=task.owner,
            scope=task.scope,
            target_id=task.target_id,
            only_published=(task.format == ExportTask.FORMAT_SITE),
        )
        # Empty scope is OK only for static sites (renders a stub index).
        if not scope.documents and task.format != ExportTask.FORMAT_SITE:
            raise ValueError("no documents in scope to export")

        export_fn = FORMAT_DISPATCH[task.format]
        path, filename, mime = export_fn(scope)

        task.file_path = str(path)
        task.filename = filename
        task.mime_type = mime
        task.file_size = path.stat().st_size if path.exists() else 0
        task.target_label = scope.label
        task.status = ExportTask.STATUS_DONE
        task.completed_at = timezone.now()
        task.save()
    except Exception as exc:  # noqa: BLE001
        log.exception("export task %s failed", task_id)
        task.status = ExportTask.STATUS_FAILED
        task.error = f"{type(exc).__name__}: {exc}\n\n{traceback.format_exc()[-2000:]}"
        task.completed_at = timezone.now()
        task.save(update_fields=["status", "error", "completed_at"])
