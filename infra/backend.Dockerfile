# Backend Dockerfile — Django + Gunicorn + optional PDF.
#
# Same image powers both the web and the celery containers — they
# differ only in the ``command`` set in docker-compose.prod.yml.
#
# Build context is the **project root** (so we can copy backend/ in
# without parent dotted paths).  ``cd infra && docker compose build``
# uses ``context: ..`` to make this work.

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# psycopg2 needs libpq + a C compiler.  build-essential is removed
# from the final layer to keep the image lean (~180 MB instead of 450).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

# LibreOffice (headless) + poppler render PPT/PPTX uploads into per-slide PNGs
# (see apps/editor/tasks.convert_pptx_to_slides: soffice --convert-to pdf →
# pdftoppm). These are RUNTIME deps for the celery worker, so this separate
# layer must survive the build-deps purge below (which only strips
# build-essential/gcc). fonts-noto-cjk lets Chinese slide text render instead
# of tofu boxes; the layer is early so it stays cached across code changes.
# Adds ~400 MB to the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-impress poppler-utils fonts-noto-cjk fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the dependency manifest first so the layer cache survives
# code-only changes.  pyproject.toml + the .[dev] / .[pdf] extras live
# in backend/.
COPY backend/pyproject.toml ./

# Install runtime deps + production WSGI server.
# .[dev] is intentionally NOT installed — pytest etc are dev-only.
# anthropic + openai (Qwen SDK) ship as core deps so the AI assistant
# works in production.
# .[pdf] = Playwright：没有它线上 PDF 导出 100% 失败，且 HTML/site 导出的
# Mermaid 图与 KaTeX 公式会静默降级成源码面板（ImportError 分支无任何告警）。
RUN pip install --upgrade pip && \
    pip install -e .[pdf] && \
    pip install gunicorn whitenoise[brotli]

# Chromium for Playwright (PDF 渲染 + mermaid/KaTeX 离线预渲染)。
# --with-deps 同时装齐 chromium 的系统依赖库；约增 ~400 MB，与 LibreOffice
# 层一样是导出功能的运行时地基。放在代码 COPY 之前以最大化层缓存。
RUN playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# Now the actual code.  Anything below this line invalidates the
# layer cache on every code change — that's intentional.
COPY backend/ ./

# collectstatic writes Django admin + DRF CSS/JS into /app/staticfiles
# which WhiteNoise serves at /static/.  Done at build time so the
# image is self-contained and ready to start.
ENV DJANGO_COLLECTSTATIC_ON_BUILD=1 \
    SECRET_KEY=build-time-key \
    DEBUG=False
RUN python manage.py collectstatic --noinput || \
    echo "(collectstatic skipped — will retry on first boot)"
ENV SECRET_KEY=

# Strip build deps to keep the runtime image small.
RUN apt-get purge -y build-essential gcc && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8002

# Default command — gunicorn.  The celery container overrides this.
CMD ["gunicorn", "jianzhai.wsgi:application", \
     "--bind", "0.0.0.0:8002", \
     "--workers", "3", \
     "--threads", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
