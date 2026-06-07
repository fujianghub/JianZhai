from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.exporter.models import ExportTask
from apps.exporter.tasks import run_export
from apps.exporter.tests.conftest import make_doc

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def test_create_and_download(owner, kb, api_client, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    doc = make_doc(kb, "dl", published="# Title\n\nBody")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "md"},
        format="json",
    )
    assert resp.status_code == 201
    task_id = resp.data["id"]
    run_export(task_id)
    task = ExportTask.objects.get(pk=task_id)
    assert task.status == ExportTask.STATUS_DONE
    assert task.file_path
    from pathlib import Path

    assert Path(task.file_path).exists(), task.file_path

    dl = api_client.get(reverse("api_v1:export-download", kwargs={"pk": task_id}))
    assert dl.status_code == 200
    assert b"Body" in b"".join(dl.streaming_content)


def test_create_selection_combines_folder_and_docs(owner, kb, api_client, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    from apps.knowledge.models import Folder

    folder = Folder.objects.create(knowledge_base=kb, name="F")
    a = make_doc(kb, "a", folder=folder, published="# A\n\nbody-a")
    loose = make_doc(kb, "loose", published="# L\n\nbody-l")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {
            "scope": "selection",
            "format": "html",
            "folder_ids": [folder.id],
            "doc_ids": [loose.id],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    task = ExportTask.objects.get(pk=resp.data["id"])
    assert task.scope == "selection"
    assert task.target_id == kb.id  # anchored to the owning KB
    assert sorted(task.selection["doc_ids"]) == [loose.id]
    assert task.selection["folder_ids"] == [folder.id]
    run_export(task.id)
    task.refresh_from_db()
    assert task.status == ExportTask.STATUS_DONE
    # Anthology HTML should contain both the folder doc and the loose doc.
    from pathlib import Path

    html = Path(task.file_path).read_text(encoding="utf-8")
    assert "body-a" in html and "body-l" in html
    assert f"#doc-{a.id}" in html  # TOC links the selected folder doc


def test_create_selection_requires_picks(owner, kb, api_client):
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "selection", "format": "md", "folder_ids": [], "doc_ids": []},
        format="json",
    )
    assert resp.status_code == 400


def test_create_invalid_target_404(owner, api_client):
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": 99999, "format": "md"},
        format="json",
    )
    assert resp.status_code == 404


def test_download_before_done_404(owner, kb, api_client):
    doc = make_doc(kb, "x", published="a")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "md"},
        format="json",
    )
    dl = api_client.get(reverse("api_v1:export-download", kwargs={"pk": resp.data["id"]}))
    assert dl.status_code == 404


def test_list_not_paginated(owner, kb, api_client):
    api_client.force_authenticate(user=owner)
    for _ in range(25):
        ExportTask.objects.create(
            owner=owner,
            scope="kb",
            target_id=kb.id,
            format="md",
            status=ExportTask.STATUS_DONE,
        )
    resp = api_client.get(reverse("api_v1:export-list"))
    assert resp.status_code == 200
    assert isinstance(resp.data, list)
    assert len(resp.data) == 25


def test_delete_removes_file(owner, kb, api_client, tmp_path):
    doc = make_doc(kb, "del", published="x")
    api_client.force_login(user=owner)
    resp = api_client.post(
        reverse("api_v1:export-list"),
        {"scope": "doc", "target_id": doc.id, "format": "md"},
        format="json",
    )
    run_export(resp.data["id"])
    task = ExportTask.objects.get(pk=resp.data["id"])
    path = task.absolute_file_path
    assert path and path.exists()
    del_resp = api_client.delete(reverse("api_v1:export-detail", kwargs={"pk": task.id}))
    assert del_resp.status_code == 204
    assert not path.exists()
