"""Font recognition + adaptation for LibreOffice deck rendering
(apps/editor/services/office_fonts.py)."""

from __future__ import annotations

import struct
import zipfile
from pathlib import Path

import pytest

from apps.editor.services import office_fonts as of

# --------------------------------------------------------------------------- #
# fixtures: a hand-rolled pptx zip with theme + slide + embedded font parts
# --------------------------------------------------------------------------- #

THEME = """<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<a:fontScheme name="x"><a:majorFont>
<a:latin typeface="Huawei Sans"/><a:ea typeface="方正兰亭黑简体"/><a:cs typeface=""/>
<a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/><a:font script="Hang" typeface="맑은 고딕"/>
<a:font script="Hans" typeface="宋体"/><a:font script="Thai" typeface="DokChampa"/>
</a:majorFont><a:minorFont>
<a:latin typeface="+mn-lt"/><a:ea typeface="宋体"/><a:cs typeface="Arial"/>
</a:minorFont></a:fontScheme></a:theme>"""

SLIDE = """<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
<a:r><a:rPr lang="zh-CN"><a:latin typeface="Microsoft YaHei" charset="-122"/><a:ea typeface="微软雅黑"/></a:rPr><a:t>x</a:t></a:r>
<a:pPr><a:buFont typeface="Wingdings"/><a:buChar char="§"/></a:pPr>
<a:r><a:rPr><a:latin typeface="Calibri"/></a:rPr><a:t>y</a:t></a:r>
<a:r><a:rPr><a:latin typeface="My Custom Heiti 黑"/></a:rPr><a:t>z</a:t></a:r>
</p:spTree></p:cSld></p:sld>"""


def _eot(font_bytes: bytes, *, compressed: bool = False, xor: bool = False) -> bytes:
    body = bytes(b ^ 0x50 for b in font_bytes) if xor else font_bytes
    flags = (0x4 if compressed else 0) | (0x10000000 if xor else 0)
    header = bytearray(82)
    struct.pack_into("<IIII", header, 0, 82 + len(body), len(body), 0x00020001, flags)
    struct.pack_into("<H", header, 34, 0x504C)
    return bytes(header) + body


FAKE_TTF = b"\x00\x01\x00\x00" + b"\x00" * 60


def _pptx(tmp_path: Path, *, embedded: bool = False, compressed: bool = False) -> Path:
    p = tmp_path / "deck.pptx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("ppt/theme/theme1.xml", THEME)
        z.writestr("ppt/slides/slide1.xml", SLIDE)
        pres = "<p:presentation xmlns:p='x' xmlns:r='y'>"
        if embedded:
            pres += (
                '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Custom Embed"/>'
                '<p:regular r:id="rId9"/><p:bold r:id="rId10"/></p:embeddedFont></p:embeddedFontLst>'
            )
            z.writestr(
                "ppt/_rels/presentation.xml.rels",
                '<Relationships><Relationship Id="rId9" Type="f" Target="fonts/font1.fntdata"/>'
                '<Relationship Id="rId10" Type="f" Target="fonts/font2.fntdata"/></Relationships>',
            )
            z.writestr("ppt/fonts/font1.fntdata", _eot(FAKE_TTF, compressed=compressed))
            z.writestr("ppt/fonts/font2.fntdata", _eot(FAKE_TTF, xor=True))
        pres += "</p:presentation>"
        z.writestr("ppt/presentation.xml", pres)
    return p


# --------------------------------------------------------------------------- #
# names / classification
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "raw, key",
    [
        ("Microsoft YaHei", "microsoftyahei"),
        ("microsoft  yahei", "microsoftyahei"),
        ("Ｍicrosoft YaHei", "microsoftyahei"),
        ("Segoe UI Regular", "segoeui"),
        ("ＭＳ Ｐゴシック", "msPゴシック".lower()),
        ("  宋体 ", "宋体"),
    ],
)
def test_normalize_name(raw, key):
    assert of.normalize_name(raw) == key


@pytest.mark.parametrize(
    "name, category",
    [
        ("宋体", of.SERIF),
        ("SimSun", of.SERIF),
        ("华文细黑", of.SANS),
        ("Microsoft YaHei", of.SANS),
        ("方正兰亭黑简体", of.SANS),
        ("Huawei Sans", of.SANS),
        ("楷体_GB2312", of.KAI),
        ("仿宋", of.FANGSONG),
        ("Wingdings", of.SYMBOL),
        ("Consolas", of.MONO),
        ("Segoe UI", of.LATIN_SANS),
        ("Times New Roman", of.LATIN_SERIF),
        # unregistered names fall to keyword classification
        ("汉仪书宋二KW", of.SERIF),
        ("My Custom Heiti 黑", of.SANS),
        ("方正楷体拼音字库", of.KAI),
        ("Some Unknown Face", of.LATIN_SANS),
        ("Whatever Sans", of.LATIN_SANS),
        ("Foo Serif Display", of.LATIN_SERIF),
        ("未知字体", of.UNKNOWN),
    ],
)
def test_classify_font_name(name, category):
    assert of.classify_font_name(name) == category


def test_rule_aliases_are_unique_across_categories():
    seen: dict[str, str] = {}
    for aliases, cat in of.FONT_RULES:
        for a in aliases:
            k = of.normalize_name(a)
            assert seen.setdefault(k, cat) == cat, f"{a!r} listed under two categories"


# --------------------------------------------------------------------------- #
# inventory
# --------------------------------------------------------------------------- #


def test_inspect_pptx_fonts_collects_theme_runs_and_script_fallbacks(tmp_path):
    inv = of.inspect_pptx_fonts(_pptx(tmp_path))
    assert set(inv.referenced) >= {
        "Huawei Sans", "方正兰亭黑简体", "宋体", "Microsoft YaHei", "微软雅黑", "Wingdings", "Calibri",
        "My Custom Heiti 黑", "ＭＳ Ｐゴシック", "맑은 고딕", "DokChampa", "Arial",
    }
    assert "+mn-lt" not in inv.referenced and "" not in inv.referenced
    assert inv.theme["latin"] == ["Huawei Sans"] and inv.theme["ea"] == ["方正兰亭黑简体", "宋体"]
    # per-script fallbacks that never appear as a slot/run are flagged
    assert inv.script_only == {"ＭＳ Ｐゴシック", "맑은 고딕", "DokChampa"}
    assert "宋体" not in inv.script_only  # also a minor-font ea slot
    assert inv.embedded == []


def test_inspect_pptx_fonts_bad_zip_is_empty(tmp_path):
    p = tmp_path / "x.pptx"
    p.write_bytes(b"PK\x03\x04junk")
    inv = of.inspect_pptx_fonts(p)
    assert inv.referenced == {} and inv.families == []


# --------------------------------------------------------------------------- #
# embedded fonts (EOT)
# --------------------------------------------------------------------------- #


def test_unwrap_embedded_font_variants():
    assert of.unwrap_embedded_font(FAKE_TTF) == (FAKE_TTF, "extracted")
    assert of.unwrap_embedded_font(_eot(FAKE_TTF)) == (FAKE_TTF, "extracted")
    assert of.unwrap_embedded_font(_eot(FAKE_TTF, xor=True)) == (FAKE_TTF, "extracted")
    assert of.unwrap_embedded_font(_eot(FAKE_TTF, compressed=True)) == (None, "compressed")
    assert of.unwrap_embedded_font(b"garbage" * 10) == (None, "unknown")
    assert of.unwrap_embedded_font(b"") == (None, "unknown")


def test_extract_embedded_fonts_writes_files_and_statuses(tmp_path):
    p = _pptx(tmp_path, embedded=True)
    inv = of.inspect_pptx_fonts(p)
    assert [(e.name, e.style, e.part) for e in inv.embedded] == [
        ("Custom Embed", "regular", "ppt/fonts/font1.fntdata"),
        ("Custom Embed", "bold", "ppt/fonts/font2.fntdata"),
    ]
    out = of.extract_embedded_fonts(p, inv, tmp_path / "emb")
    assert len(out) == 2 and all(f.read_bytes() == FAKE_TTF for f in out)
    assert {e.status for e in inv.embedded} == {"extracted"}


def test_extract_embedded_fonts_reports_compressed(tmp_path):
    p = _pptx(tmp_path, embedded=True, compressed=True)
    inv = of.inspect_pptx_fonts(p)
    out = of.extract_embedded_fonts(p, inv, tmp_path / "emb")
    assert len(out) == 1  # only the XOR'd bold face
    assert [e.status for e in inv.embedded] == ["compressed", "extracted"]


# --------------------------------------------------------------------------- #
# resolution
# --------------------------------------------------------------------------- #

INSTALLED = frozenset(of.normalize_name(n) for n in (
    "Noto Sans CJK SC", "Noto Serif CJK SC", "Liberation Sans", "Liberation Serif", "Liberation Mono",
    "DejaVu Sans", "Carlito", "Arial", "黑体", "SimHei",
))


def _inv(*names: str, script_only=()) -> of.FontInventory:
    inv = of.FontInventory(referenced={n: 10 - i for i, n in enumerate(names)})
    inv.script_only = set(script_only)
    return inv


def test_resolve_exact_rule_classified_system():
    inv = _inv("宋体", "黑体", "Wingdings", "Calibri", "Huawei Sans", "汉仪书宋二KW", "Whatever Sans", "DokChampa",
               script_only=("DokChampa",))
    res = {r.source: r for r in of.resolve_fonts(inv, INSTALLED)}
    assert (res["宋体"].target, res["宋体"].method) == ("Noto Serif CJK SC", of.M_RULE)
    assert (res["黑体"].target, res["黑体"].method) == ("黑体", of.M_EXACT)
    assert (res["Wingdings"].target, res["Wingdings"].method) == ("", of.M_SYSTEM)   # never override
    assert (res["Calibri"].target, res["Calibri"].method) == ("", of.M_SYSTEM)       # metric alias → system
    assert (res["Huawei Sans"].target, res["Huawei Sans"].method) == ("Noto Sans CJK SC", of.M_RULE)
    assert (res["汉仪书宋二KW"].target, res["汉仪书宋二KW"].method) == ("Noto Serif CJK SC", of.M_CLASS)
    assert (res["Whatever Sans"].target, res["Whatever Sans"].method) == ("Liberation Sans", of.M_CLASS)
    assert res["DokChampa"].scope == "script" and res["宋体"].scope == "text"


def test_resolve_prefers_pack_family_when_installed():
    packs = [of.PackFamily("宋体", ["SimSun", "华文宋体"], of.SERIF, ["JZSongTi-Regular.otf"])]
    installed = INSTALLED | {of.normalize_name("宋体")}
    inv = _inv("SimSun", "华文宋体", "宋体")
    res = {r.source: r for r in of.resolve_fonts(inv, installed, packs)}
    assert (res["SimSun"].target, res["SimSun"].method) == ("宋体", of.M_PACK)
    assert (res["华文宋体"].target, res["华文宋体"].method) == ("宋体", of.M_PACK)
    assert (res["宋体"].target, res["宋体"].method) == ("宋体", of.M_PACK)
    # pack listed but its files not visible → ignored, rule fallback
    res2 = {r.source: r for r in of.resolve_fonts(inv, INSTALLED, packs)}
    assert (res2["SimSun"].target, res2["SimSun"].method) == ("Noto Serif CJK SC", of.M_RULE)


def test_resolve_embedded_wins():
    inv = _inv("Custom Embed", "宋体")
    res = {r.source: r for r in of.resolve_fonts(inv, INSTALLED, embedded_ok={of.normalize_name("Custom Embed")})}
    assert (res["Custom Embed"].target, res["Custom Embed"].method) == ("Custom Embed", of.M_EMBEDDED)


def test_resolve_category_fallback_chain():
    only_noto_sans = frozenset({of.normalize_name("Noto Sans CJK SC")})
    res = {r.source: r for r in of.resolve_fonts(_inv("宋体", "楷体"), only_noto_sans)}
    # no serif / kai candidate installed → UNKNOWN chain → Noto Sans CJK SC
    assert res["宋体"].target == "Noto Sans CJK SC" and res["楷体"].target == "Noto Sans CJK SC"


# --------------------------------------------------------------------------- #
# fontconfig output
# --------------------------------------------------------------------------- #


def test_write_fontconfig_emits_assign_rules_only_for_substitutions(tmp_path, settings):
    settings.OFFICE_FONT_CACHE_DIR = str(tmp_path / "cache")
    inv = _inv("宋体", "黑体", "Wingdings", "Calibri", "ＭＳ Ｐゴシック")
    res = of.resolve_fonts(inv, INSTALLED)
    emb = tmp_path / "emb"
    emb.mkdir()
    conf = of.write_fontconfig(res, tmp_path, extra_dirs=[emb], base_dirs=[])
    assert conf.is_absolute() and conf.name == "fonts.conf"
    text = conf.read_text("utf-8")
    assert '<include ignore_missing="yes">/etc/fonts/fonts.conf</include>' in text
    assert f"<dir>{emb}</dir>" in text
    assert "<cachedir>" in text
    assert '<string>宋体</string>' in text and 'mode="assign" binding="strong"><string>Noto Serif CJK SC' in text
    # exact / system fonts get no rule
    assert "<string>黑体</string>" not in text
    assert "Wingdings" not in text and "Calibri" not in text
    # full-width name gets its NFKC variant too
    assert "<string>ＭＳ Ｐゴシック</string>" in text and "<string>MS Pゴシック</string>" in text
    import xml.dom.minidom

    xml.dom.minidom.parseString(text.encode("utf-8").replace(b'<!DOCTYPE fontconfig SYSTEM "fonts.dtd">', b""))


def test_prepare_fonts_end_to_end(tmp_path, settings, monkeypatch):
    settings.OFFICE_FONT_CACHE_DIR = str(tmp_path / "cache")
    settings.OFFICE_FONT_DIRS = [str(tmp_path / "nope")]
    monkeypatch.setattr(of, "installed_families", lambda *a, **k: (INSTALLED, {}))
    p = _pptx(tmp_path, embedded=True)
    plan = of.prepare_fonts(p, tmp_path)
    assert plan.conf_path and plan.env["FONTCONFIG_FILE"] == str(plan.conf_path)
    assert plan.env["LANG"] == "C.UTF-8" and plan.env["XDG_CACHE_HOME"]
    rep = of.load_report(tmp_path)
    assert rep is not None and rep == plan.report()
    names = {r["name"]: r for r in rep["referenced"]}
    assert names["宋体"]["method"] == of.M_RULE and names["Wingdings"]["method"] == of.M_SYSTEM
    assert names["DokChampa"]["scope"] == "script"
    assert "DokChampa" not in rep["substituted"] and "宋体" in rep["substituted"]
    assert rep["missing"] == ["My Custom Heiti 黑"]  # classified, not in rules
    assert [(e["name"], e["status"]) for e in rep["embedded"]] == [("Custom Embed", "extracted")] * 2
    assert plan.embedded_dir is not None and f"<dir>{plan.embedded_dir}</dir>" in plan.conf_path.read_text()


def test_prepare_fonts_never_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(of, "inspect_pptx_fonts", lambda *a: (_ for _ in ()).throw(RuntimeError("boom")))
    plan = of.prepare_fonts(tmp_path / "missing.pptx", tmp_path)
    assert plan.env == {} and plan.conf_path is None and plan.report()["referenced"] == []


def test_static_fontconfig_is_prefer_only_and_skips_symbols():
    xml = of.render_static_fontconfig(("/usr/share/fonts/jianzhai",))
    assert "<dir>/usr/share/fonts/jianzhai</dir>" in xml
    assert 'mode="assign"' not in xml and "<prefer>" in xml
    assert "Wingdings" not in xml and "<family>宋体</family>" in xml


# --------------------------------------------------------------------------- #
# task wiring: report lands on DerivedFile.meta
# --------------------------------------------------------------------------- #


@pytest.mark.django_db
def test_store_deck_pdf_records_font_report(tmp_path, settings):
    from django.contrib.auth import get_user_model
    from django.core.files.base import ContentFile

    from apps.editor import tasks
    from apps.editor.models import Attachment, DerivedFile
    from apps.knowledge.models import Document, KnowledgeBase

    settings.MEDIA_ROOT = tmp_path / "media"
    user = get_user_model().objects.create_user("fontowner", "f@e.com", "pw", is_staff=True)
    kb = KnowledgeBase.objects.create(owner=user, name="F", slug="f-kb", visibility="public")
    doc = Document.objects.create(knowledge_base=kb, title="Deck", status="published")
    att = Attachment.objects.create(document=doc, uploaded_by=user, original_filename="d.pptx",
                                    file=ContentFile(b"x", name="d.pptx"), size=1)
    (tmp_path / "fonts-report.json").write_text('{"substituted": ["宋体"], "referenced": []}', "utf-8")
    pdf = tmp_path / "deck.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    tasks._store_deck_pdf(doc.id, att, pdf, 3)
    deck = DerivedFile.objects.get(document=doc, kind="deck_pdf")
    assert deck.meta["fonts"]["substituted"] == ["宋体"]
    # no report next to the PDF → meta untouched
    (tmp_path / "fonts-report.json").unlink()
    tasks._store_deck_pdf(doc.id, att, pdf, 3)
    deck.refresh_from_db()
    assert deck.meta["fonts"]["substituted"] == ["宋体"]
