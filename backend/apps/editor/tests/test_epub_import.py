"""EPUB import: container validation, script scrubbing, format detection."""

from __future__ import annotations

import io
import zipfile

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.editor.models import Attachment
from apps.editor.services.epub_sanitize import (
    EpubValidationError,
    sanitize_epub,
    scrub_markup,
    validate_epub_container,
)
from apps.knowledge.models import Document, KnowledgeBase
from apps.knowledge.serializers import detect_doc_format

User = get_user_model()

OPF_TEMPLATE = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试书</dc:title><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="c1.html" media-type="application/xhtml+xml"{scripted}/>
{js_item}    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/></spine>
</package>"""

CLEAN_CHAPTER = "<html><body><h1>第一章</h1><p>安全内容</p></body></html>".encode()
DIRTY_CHAPTER = (
    '<html><head><script src="evil.js"></script></head>'
    '<body onload="steal()"><p onclick=\'x()\' class="k">文</p>'
    '<a href="javascript:alert(1)">l</a><iframe src="https://x"></iframe></body></html>'
).encode()


def make_epub(chapter: bytes = CLEAN_CHAPTER, *, with_js: bool = False, entries: dict | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        z.writestr(
            "OEBPS/content.opf",
            OPF_TEMPLATE.format(
                scripted=' properties="scripted"' if with_js else "",
                js_item='    <item id="js" href="evil.js" media-type="application/javascript"/>\n' if with_js else "",
            ),
        )
        z.writestr("OEBPS/toc.ncx", "<ncx/>")
        z.writestr("OEBPS/c1.html", chapter)
        if with_js:
            z.writestr("OEBPS/evil.js", "alert(1)")
        for name, data in (entries or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


# ── pure sanitiser ────────────────────────────────────────────────────────


def test_scrub_markup_leaves_clean_bytes_identical():
    assert scrub_markup(CLEAN_CHAPTER) is CLEAN_CHAPTER


def test_scrub_markup_strips_every_script_vector():
    out = scrub_markup(DIRTY_CHAPTER)
    assert b"<script" not in out.lower()
    assert b"onload" not in out.lower() and b"onclick" not in out.lower()
    assert b"javascript:" not in out.lower()
    assert b"<iframe" not in out.lower()
    assert b'class="k"' in out
    assert b'href="#"' in out


def test_sanitize_returns_original_bytes_when_clean():
    blob = make_epub()
    out, report = sanitize_epub(blob)
    assert out is blob
    assert not report.changed


def test_sanitize_rewrites_container_with_mimetype_first_and_stored():
    blob = make_epub(DIRTY_CHAPTER, with_js=True)
    out, report = sanitize_epub(blob)
    assert report.changed
    assert "OEBPS/c1.html" in report.scrubbed_entries
    assert "OEBPS/content.opf" in report.scrubbed_entries
    assert report.dropped_entries == ["OEBPS/evil.js"]
    z = zipfile.ZipFile(io.BytesIO(out))
    infos = z.infolist()
    assert infos[0].filename == "mimetype" and infos[0].compress_type == zipfile.ZIP_STORED
    assert "OEBPS/evil.js" not in z.namelist()
    assert b"<script" not in z.read("OEBPS/c1.html").lower()
    opf = z.read("OEBPS/content.opf")
    assert b"evil.js" not in opf
    assert b"scripted" not in opf
    assert z.read("OEBPS/toc.ncx") == b"<ncx/>"


@pytest.mark.parametrize(
    "entries, msg",
    [
        ({"../escape.html": b"x"}, "非法路径"),
        ({"OEBPS/../../etc/passwd": b"x"}, "非法路径"),
        ({"/abs.html": b"x"}, "非法路径"),
    ],
)
def test_validate_rejects_path_traversal(entries, msg):
    with pytest.raises(EpubValidationError, match=msg):
        validate_epub_container(make_epub(entries=entries))


def test_validate_rejects_missing_or_wrong_mimetype():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/zip")
        z.writestr("a.html", "<p/>")
    with pytest.raises(EpubValidationError, match="mimetype"):
        validate_epub_container(buf.getvalue())
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("a.html", "<p/>")
    with pytest.raises(EpubValidationError, match="mimetype"):
        validate_epub_container(buf.getvalue())


def test_validate_rejects_decompression_bomb():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("bomb.html", b"\0" * (300 * 1024 * 1024))
    with pytest.raises(EpubValidationError, match="压缩炸弹"):
        validate_epub_container(buf.getvalue())


# ── API ───────────────────────────────────────────────────────────────────


@pytest.fixture
def owner(db):
    return User.objects.create_user("epubowner", "epub@e.com", "pass", is_staff=True)


@pytest.fixture
def kb(owner):
    return KnowledgeBase.objects.create(name="EPUB KB", slug="epub-kb", owner=owner)


@pytest.fixture
def client(owner):
    c = APIClient()
    c.force_authenticate(owner)
    return c


def _upload(client, kb, name, blob, content_type="application/octet-stream"):
    return client.post(
        reverse("api_v1:import-file"),
        {"knowledge_base": kb.id, "file": SimpleUploadedFile(name, blob, content_type=content_type)},
        format="multipart",
    )


@pytest.mark.django_db
def test_import_epub_creates_binary_document(client, kb):
    blob = make_epub()
    resp = _upload(client, kb, "我的书.epub", blob)
    assert resp.status_code == 201, resp.content
    doc = Document.objects.get(id=resp.data["id"])
    assert doc.title == "我的书"
    assert doc.raw_content == "" and doc.published_content == ""
    att = Attachment.objects.get(document=doc)
    assert att.kind == Attachment.KIND_DOCUMENT
    assert att.mime_type == "application/epub+zip"
    assert att.original_filename == "我的书.epub"
    assert detect_doc_format(doc) == "epub"
    assert resp.data["doc_format"] == "epub"
    # clean upload stored byte-for-byte
    with att.file.open("rb") as fh:
        assert fh.read() == blob


@pytest.mark.django_db
def test_import_epub_strips_scripts_before_storing(client, kb):
    resp = _upload(client, kb, "dirty.epub", make_epub(DIRTY_CHAPTER, with_js=True))
    assert resp.status_code == 201, resp.content
    att = Attachment.objects.get(document_id=resp.data["id"])
    with att.file.open("rb") as fh:
        z = zipfile.ZipFile(io.BytesIO(fh.read()))
    assert "OEBPS/evil.js" not in z.namelist()
    assert b"<script" not in z.read("OEBPS/c1.html").lower()
    assert z.infolist()[0].filename == "mimetype"


@pytest.mark.django_db
def test_import_epub_rejects_corrupt_and_unsafe(client, kb):
    corrupt = b"PK\x03\x04" + b"x" * 200 + b"\0" * 64
    resp = _upload(client, kb, "broken.epub", corrupt)
    assert resp.status_code == 400
    assert "损坏" in resp.data["detail"]
    resp = _upload(client, kb, "trav.epub", make_epub(entries={"../x.html": b"x"}))
    assert resp.status_code == 400
    assert "非法路径" in resp.data["detail"]
    assert not Document.objects.filter(knowledge_base=kb).exists()
