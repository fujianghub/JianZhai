"""DEBUG-only static server for the self-hosted draw.io bundle.

Production: caddy ``handle_path /drawio/*`` → ``/srv-drawio`` (the same
``infra/drawio/dist`` directory, rsynced). Development: the vite dev server
proxies ``/drawio`` to Django and this view serves the directory named by
``settings.DRAWIO_DIST_DIR``. Not an API: no auth (the bundle is public code),
no Range (files are small enough), directory → ``index.html``.
"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.http import Http404
from django.views.static import serve


def serve_drawio(request, path: str = ""):
    root = Path(settings.DRAWIO_DIST_DIR)
    if not root.is_dir():
        raise Http404("draw.io bundle not built — run infra/drawio/build.py")
    if path == "" or path.endswith("/"):
        path += "index.html"
    resp = serve(request, path, document_root=str(root))
    resp["Cache-Control"] = "public, max-age=3600"
    return resp
