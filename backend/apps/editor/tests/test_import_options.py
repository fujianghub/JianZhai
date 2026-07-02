"""Import parse options: heading numbering flag + auto-insert whole-doc TOC."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.knowledge.models import Document, KnowledgeBase

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user("optowner", "opt@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(owner=owner, name="Opt KB", slug="opt-kb")


@pytest.mark.django_db
def test_import_file_applies_numbering_and_toc(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    md = SimpleUploadedFile("guide.md", b"# A\n\n## B\n", content_type="text/markdown")

    resp = api_client.post(
        reverse("api_v1:import-file"),
        data={
            "knowledge_base": kb.id,
            "file": md,
            "heading_numbering": "true",
            "insert_toc": "true",
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(pk=resp.data["id"])
    assert doc.heading_numbering is True
    # TOC marker prepended; headings themselves untouched (numbering is display-only).
    assert doc.raw_content.startswith("[TOC]\n\n")
    assert doc.published_content.startswith("[TOC]\n\n")
    assert "# A" in doc.raw_content


@pytest.mark.django_db
def test_import_file_defaults_off(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    md = SimpleUploadedFile("plain.md", b"# A\n", content_type="text/markdown")

    resp = api_client.post(
        reverse("api_v1:import-file"),
        data={"knowledge_base": kb.id, "file": md},
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(pk=resp.data["id"])
    assert doc.heading_numbering is False
    assert "[TOC]" not in doc.raw_content


@pytest.mark.django_db
def test_import_batch_threads_options(api_client, owner, kb, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    api_client.force_authenticate(owner)
    files = [SimpleUploadedFile("n.md", b"# T\n\n## U\n", content_type="text/markdown")]

    resp = api_client.post(
        reverse("api_v1:import-batch"),
        data={
            "knowledge_base": kb.id,
            "files": files,
            "paths": ["n.md"],
            "heading_numbering": "true",
            "insert_toc": "true",
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(pk=resp.data["created"][0]["id"])
    assert doc.heading_numbering is True
    assert doc.raw_content.startswith("[TOC]\n\n")
