#!/usr/bin/env python3
"""Build the self-hosted draw.io bundle: fetch a pinned upstream tag, trim it,
apply 简斋 overrides, write ``dist/`` (gitignored).

    python3 infra/drawio/build.py            # uses PINNED_TAG
    python3 infra/drawio/build.py --tag v31.5.0 --force
    python3 infra/drawio/build.py --check    # verify dist matches PINNED_TAG

No Java / Ant: draw.io's ``src/main/webapp`` is already the compiled static app
(``app.min.js`` etc. are committed upstream); the only edits are whole-file
overrides (``overrides/``) plus one string patch in ``bootstrap.js`` (the
application-name meta — trademark hygiene). Everything else is deletion.

Source is fetched with ``git clone --depth 1 --branch <tag>`` into ``src/``
(cached; ``--refetch`` to redo). Output layout mirrors the upstream webapp so
``/drawio/<path>`` maps 1:1; ``dist/VERSION.json`` records tag / size / file
count for the smoke test and for ``--check``.

See VENDOR.md for what is trimmed and why, and how to upgrade.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
PINNED_TAG = "v31.4.6"
UPSTREAM = "https://github.com/jgraph/drawio.git"
SRC_DIR = HERE / "src"
DIST_DIR = HERE / "dist"
OVERRIDES = HERE / "overrides"
FAVICON = REPO_ROOT / "frontend" / "public" / "favicon.ico"

# Directories / files under src/main/webapp that never load in embed mode or
# are server-side / dev-only. Runtime-verified against the network log of a
# full init → load → export round trip (2026-09-23 probes).
TRIM_DIRS = [
    "WEB-INF",           # servlets + jars (Java server side)
    "connect",           # Atlassian connect descriptors
    "js/diagramly",      # sources — compiled into app.min.js
    "js/grapheditor",    # sources — compiled into app.min.js
    "mxgraph/src",       # sources — mxClient compiled into app.min.js (css/images kept)
    "stencils",          # 42 MB of XML — all bundled into js/stencils.min.js
    "shapes",            # sources — bundled into js/shapes-14-6-5.min.js
    "templates",         # template dialog only (hidden with offline=1)
    "plugins",           # plugins=0
    "js/dropbox", "js/onedrive", "js/jquery", "js/simplepeer",  # cloud / collab clients
    "META-INF",          # war manifest
]
TRIM_FILES = [
    "js/integrate.min.js",   # 22 MB Confluence bundle
    "service-worker.js", "service-worker.js.map",
    "teams.html", "dropbox.html", "vsdxImporter.html",
    "github.html", "gitlab.html", "onedrive3.html", "open.html", "clear.html", "export3.html",  # OAuth / import / export-server pages
    "monday-app-association.json",
]
TRIM_GLOBS = ["workbox-*.js", "workbox-*.js.map"]
# i18n: keep English (compiled into app anyway), 简体, 繁體.
KEEP_RESOURCES = {"dia.txt", "dia_zh.txt", "dia_zh-tw.txt"}

# bootstrap.js emits <meta name="application-name" content="diagrams.net">.
BOOTSTRAP_PATCH = ("var name = 'diagrams.net';", "var name = '简斋画板';")


def run(cmd: list[str], **kw) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def fetch(tag: str, refetch: bool) -> Path:
    target = SRC_DIR / f"drawio-{tag}"
    if target.exists() and not refetch:
        print(f"source cached: {target}")
        return target
    if target.exists():
        shutil.rmtree(target)
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--depth", "1", "--branch", tag, "--single-branch", UPSTREAM, str(target)])
    got = (target / "VERSION").read_text().strip()
    if got != tag.lstrip("v"):
        sys.exit(f"VERSION file says {got}, expected {tag}")
    return target


def build(src: Path, tag: str) -> dict:
    webapp = src / "src" / "main" / "webapp"
    if not (webapp / "js" / "app.min.js").exists():
        sys.exit(f"not a draw.io checkout: {webapp}")
    # Replace the *contents* of dist/, never the directory itself: caddy (prod
    # compose volume, local replica) bind-mounts this path, and deleting the
    # directory would leave the mount pointing at a dead inode (every request
    # 404s until the container restarts).
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    for child in DIST_DIR.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
    print(f"copy {webapp} → {DIST_DIR}")
    shutil.copytree(webapp, DIST_DIR, symlinks=False, dirs_exist_ok=True)

    removed = 0
    for d in TRIM_DIRS:
        p = DIST_DIR / d
        if p.is_dir():
            shutil.rmtree(p)
            removed += 1
    for f in TRIM_FILES:
        p = DIST_DIR / f
        if p.exists():
            p.unlink()
            removed += 1
    for g in TRIM_GLOBS:
        for p in DIST_DIR.glob(g):
            p.unlink()
            removed += 1
    res = DIST_DIR / "resources"
    if res.is_dir():
        for p in res.iterdir():
            if p.name not in KEEP_RESOURCES:
                p.unlink()
                removed += 1

    # overrides: whole files, same relative layout
    for p in OVERRIDES.rglob("*"):
        if p.is_file():
            rel = p.relative_to(OVERRIDES)
            dst = DIST_DIR / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dst)
            print(f"override {rel}")
    if FAVICON.exists():
        shutil.copy2(FAVICON, DIST_DIR / "favicon.ico")

    boot = DIST_DIR / "js" / "bootstrap.js"
    text = boot.read_text(encoding="utf-8")
    if BOOTSTRAP_PATCH[0] not in text:
        sys.exit("bootstrap.js patch anchor not found — upstream changed, update BOOTSTRAP_PATCH")
    boot.write_text(text.replace(BOOTSTRAP_PATCH[0], BOOTSTRAP_PATCH[1]), encoding="utf-8")

    # keep upstream licences next to the code
    for lic in ("LICENSE",):
        if (src / lic).exists():
            shutil.copy2(src / lic, DIST_DIR / "LICENSE.drawio")

    files = [p for p in DIST_DIR.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    manifest = {
        "tag": tag,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "files": len(files),
        "bytes": total,
        "trimmed_entries": removed,
        "overrides": sorted(str(p.relative_to(OVERRIDES)) for p in OVERRIDES.rglob("*") if p.is_file()),
    }
    (DIST_DIR / "VERSION.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"dist: {len(files)} files, {total / 1048576:.1f} MB, trimmed {removed} entries")
    return manifest


def check(tag: str) -> int:
    vj = DIST_DIR / "VERSION.json"
    if not vj.exists():
        print("dist/VERSION.json missing — run build.py")
        return 1
    m = json.loads(vj.read_text())
    ok = m.get("tag") == tag and (DIST_DIR / "js" / "app.min.js").exists() and (DIST_DIR / "js" / "PreConfig.js").exists()
    print(f"dist tag={m.get('tag')} pinned={tag} files={m.get('files')} → {'OK' if ok else 'MISMATCH'}")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tag", default=PINNED_TAG)
    ap.add_argument("--force", action="store_true", help="rebuild even if dist matches")
    ap.add_argument("--refetch", action="store_true", help="re-clone the source")
    ap.add_argument("--check", action="store_true", help="only verify dist/VERSION.json against the tag")
    ap.add_argument("--src", help="use an existing draw.io checkout instead of cloning (its VERSION must equal --tag)")
    a = ap.parse_args()
    if a.check:
        return check(a.tag)
    if not a.force and check(a.tag) == 0:
        print("dist up to date (use --force to rebuild)")
        return 0
    if a.src:
        src = Path(a.src).resolve()
        got = (src / "VERSION").read_text().strip()
        if got != a.tag.lstrip("v"):
            sys.exit(f"--src VERSION is {got}, expected {a.tag}")
    else:
        src = fetch(a.tag, a.refetch)
    build(src, a.tag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
