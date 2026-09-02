"""``/public/posts/?doc_format=epub`` returns only documents carrying an EPUB
attachment (the 读完页's "same-shelf books" source)."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.editor.models import Attachment
from apps.knowledge.models import Document, KnowledgeBase

pytestmark = pytest.mark.django_db
User = get_user_model()


def _doc(kb, title):
    return Document.objects.create(
        knowledge_base=kb, title=title, raw_content="x", published_content="x",
        status="published", visibility="public",
    )


def test_format_epub_filters_to_epub_docs():
    owner = User.objects.create_user("author", "a@e.com", "pass", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=owner, name="KB", slug="kb", visibility="public")
    book = _doc(kb, "Book")
    _doc(kb, "Plain markdown")
    Attachment.objects.create(
        document=book, uploaded_by=owner,
        file=SimpleUploadedFile("b.epub", b"zipbytes"),
        original_filename="b.epub", kind="document",
        mime_type="application/epub+zip", size=8,
    )
    client = APIClient()
    client.force_authenticate(User.objects.create_user("reader", "r@e.com", "pass"))
    all_posts = client.get("/api/v1/public/posts/").data["results"]
    assert {p["title"] for p in all_posts} == {"Book", "Plain markdown"}
    books = client.get("/api/v1/public/posts/", {"doc_format": "epub"}).data["results"]
    assert [p["title"] for p in books] == ["Book"]
