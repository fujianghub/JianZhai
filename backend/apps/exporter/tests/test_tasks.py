from __future__ import annotations

import pytest

from apps.exporter.models import ExportTask
from apps.exporter.tasks import run_export
from apps.exporter.tests.conftest import make_doc


@pytest.mark.django_db
def test_run_export_success(owner, kb):
    from apps.knowledge.models import Document

    make_doc(kb, "doc", published="# Hello")
    doc = Document.objects.get(knowledge_base=kb)
    task = ExportTask.objects.create(
        owner=owner,
        scope="doc",
        target_id=doc.id,
        format=ExportTask.FORMAT_MD,
    )
    run_export(task.id)
    task.refresh_from_db()
    assert task.status == ExportTask.STATUS_DONE
    assert task.file_path
    assert task.file_size > 0


@pytest.mark.django_db
def test_run_export_empty_folder_fails(owner, kb):
    from apps.knowledge.models import Folder

    folder = Folder.objects.create(knowledge_base=kb, name="Empty")
    task = ExportTask.objects.create(
        owner=owner,
        scope="folder",
        target_id=folder.id,
        format=ExportTask.FORMAT_MD,
    )
    run_export(task.id)
    task.refresh_from_db()
    assert task.status == ExportTask.STATUS_FAILED
    assert "no documents" in task.error.lower()


@pytest.mark.django_db
def test_run_export_missing_task_does_not_raise():
    run_export(999999)


@pytest.mark.django_db
def test_run_export_idempotent_when_done(owner, kb):
    make_doc(kb, "doc", published="x")
    from apps.knowledge.models import Document

    doc = Document.objects.get(knowledge_base=kb)
    task = ExportTask.objects.create(
        owner=owner,
        scope="doc",
        target_id=doc.id,
        format=ExportTask.FORMAT_MD,
        status=ExportTask.STATUS_DONE,
        file_path="/tmp/fake.md",
    )
    run_export(task.id)
    task.refresh_from_db()
    assert task.file_path == "/tmp/fake.md"
