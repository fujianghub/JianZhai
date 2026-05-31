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

WORKDIR /app

# Copy only the dependency manifest first so the layer cache survives
# code-only changes.  pyproject.toml + the .[dev] / .[pdf] extras live
# in backend/.
COPY backend/pyproject.toml ./

# Install runtime deps + production WSGI server.
# .[dev] is intentionally NOT installed — pytest etc are dev-only.
# anthropic + openai (Qwen SDK) ship as core deps so the AI assistant
# works in production.
RUN pip install --upgrade pip && \
    pip install -e . && \
    pip install gunicorn whitenoise[brotli]

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
