"""drawio画板 附件回收 + 「原文件」主附件挑选。"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.utils import timezone

from apps.blog.serializers import _primary_attachment as blog_primary
from apps.editor.models import Attachment
from apps.editor.services.drawio_gc import GRACE_SECONDS, is_drawio_filename, prune_drawio_attachments
from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import _primary_attachment as kb_primary

User = get_user_model()


@pytest.fixture
def author():
    return User.objects.create_user("dgauthor", "a@e.com", "pass", is_staff=True)


@pytest.fixture
def doc(author, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    kb = KnowledgeBase.objects.create(owner=author, name="DG", slug="dg-kb", visibility="public")
    return Document.objects.create(knowledge_base=kb, title="D", raw_content="正文", status="published", visibility="public")


def _att(doc, author, name, *, age_s=GRACE_SECONDS + 60, mime="image/svg+xml"):
    a = Attachment.objects.create(
        document=doc, uploaded_by=author, file=ContentFile(b"x", name=name),
        original_filename=name, kind=Attachment.KIND_IMAGE, mime_type=mime, size=1,
    )
    Attachment.objects.filter(pk=a.pk).update(created_at=timezone.now() - timedelta(seconds=age_s))
    a.refresh_from_db()
    return a


def _figure(svg, png):
    return (
        f'<figure class="jz-drawio" data-jz-drawio="1" data-png="{png.url}">'
        f'<img src="{svg.url}" alt="drawio画板" /></figure>'
    )


def test_filename_rule():
    assert is_drawio_filename("drawio画板-20260924-173012.svg")
    assert is_drawio_filename("drawio画板-20260924-173012.png")
    assert is_drawio_filename("drawio.svg") and is_drawio_filename("drawio.png")
    assert not is_drawio_filename("screenshot.png")
    assert not is_drawio_filename("drawio-notes.pdf")
    assert not is_drawio_filename("mydrawio.svg")


@pytest.mark.django_db
def test_prunes_superseded_pair_keeps_current_and_foreign(doc, author):
    old_svg, old_png = _att(doc, author, "drawio画板-1.svg"), _att(doc, author, "drawio画板-1.png", mime="image/png")
    new_svg, new_png = _att(doc, author, "drawio画板-2.svg"), _att(doc, author, "drawio画板-2.png", mime="image/png")
    pasted = _att(doc, author, "pasted.png", mime="image/png")  # not a board file, unreferenced
    doc.raw_content = "前文\n\n" + _figure(new_svg, new_png)
    doc.save(update_fields=["raw_content"])
    assert prune_drawio_attachments(doc) == 2
    left = set(Attachment.objects.filter(document=doc).values_list("original_filename", flat=True))
    assert left == {"drawio画板-2.svg", "drawio画板-2.png", "pasted.png"}
    assert not old_svg.file.storage.exists(old_svg.file.name)
    assert not old_png.file.storage.exists(old_png.file.name)


@pytest.mark.django_db
def test_published_reference_keeps_old_pair(doc, author):
    old_svg, old_png = _att(doc, author, "drawio画板-1.svg"), _att(doc, author, "drawio画板-1.png", mime="image/png")
    doc.published_content = _figure(old_svg, old_png)  # readers still see the old board
    doc.raw_content = "编辑中，画板已删"
    doc.save(update_fields=["raw_content", "published_content"])
    assert prune_drawio_attachments(doc) == 0
    assert Attachment.objects.filter(document=doc).count() == 2


@pytest.mark.django_db
def test_grace_period_protects_fresh_uploads(doc, author):
    _att(doc, author, "drawio画板-9.svg", age_s=5)
    _att(doc, author, "drawio画板-9.png", age_s=5, mime="image/png")
    assert prune_drawio_attachments(doc) == 0  # just uploaded, body not saved yet
    assert prune_drawio_attachments(doc, now=timezone.now() + timedelta(seconds=GRACE_SECONDS + 10)) == 2


@pytest.mark.django_db(transaction=True)
def test_signal_runs_after_commit_on_body_save(doc, author):
    _att(doc, author, "drawio画板-1.svg")
    doc.raw_content = "新正文，没有画板"
    doc.save()
    assert Attachment.objects.filter(document=doc).count() == 0


@pytest.mark.django_db(transaction=True)
def test_signal_ignores_unrelated_update_fields(doc, author):
    _att(doc, author, "drawio画板-1.svg")
    doc.title = "改标题"
    doc.save(update_fields=["title"])
    assert Attachment.objects.filter(document=doc).count() == 1


@pytest.mark.django_db
def test_primary_attachment_none_for_body_with_only_images(doc, author):
    svg, png = _att(doc, author, "drawio画板-1.svg"), _att(doc, author, "drawio画板-1.png", mime="image/png")
    doc.raw_content = doc.published_content = _figure(svg, png)
    doc.save()
    doc = Document.objects.get(pk=doc.pk)
    assert kb_primary(doc) is None
    assert blog_primary(doc) is None


@pytest.mark.django_db
def test_primary_attachment_image_only_doc_unchanged(doc, author):
    img = _att(doc, author, "photo.png", mime="image/png")
    doc.raw_content = doc.published_content = ""
    doc.save()
    doc = Document.objects.get(pk=doc.pk)
    assert kb_primary(doc) == img
    assert blog_primary(doc)["id"] == img.id


@pytest.mark.django_db
def test_primary_attachment_prefers_source_file(doc, author):
    _att(doc, author, "asset.png", mime="image/png", age_s=500)
    src = _att(doc, author, "note.md", mime="text/markdown", age_s=400)
    Attachment.objects.filter(pk=src.pk).update(kind=Attachment.KIND_DOCUMENT)
    doc = Document.objects.get(pk=doc.pk)
    assert kb_primary(doc).pk == src.pk
    assert blog_primary(doc)["id"] == src.pk
