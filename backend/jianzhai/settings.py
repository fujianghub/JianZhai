"""Django settings for the JianZhai project."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import dj_database_url
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# override=True: backend/.env wins over stale shell exports (e.g. old ALLOWED_HOSTS
# from a prior `source .env`). .env changes still require a full runserver restart.
load_dotenv(BASE_DIR / ".env", override=True)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


def _origin_from_url(url: str) -> str | None:
    parsed = urlparse(url.strip())
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def _merge_unique(base: list[str], *items: str | None) -> list[str]:
    out = list(base)
    for item in items:
        if item and item not in out:
            out.append(item)
    return out


SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
DEBUG = _env_bool("DEBUG", default=True)
ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

# v0.9.8 — private-blog mode. When ``true`` (production default for the
# friends-only deployment), every ``/api/v1/public/*`` endpoint requires a
# logged-in session; the frontend SPA's BlogLayout redirects anonymous
# visitors to /admin/login.  Local dev defaults to false so contributors
# don't need to log in just to view the homepage.
SITE_REQUIRE_LOGIN = _env_bool("SITE_REQUIRE_LOGIN", default=False)

# v0.9.9 — "root admin" identity. The user whose username matches this
# value is the only one who can disable / reset-password / demote OTHER
# superusers (including the default ``admin``). Other superusers can
# still manage non-superuser accounts but can't touch each other or the
# root. Defaults to ``fengfujiang`` to match the operator's request;
# can be overridden via env on multi-tenant deployments.
ROOT_ADMIN_USERNAME = os.environ.get("JIANZHAI_ROOT_ADMIN_USERNAME", "fengfujiang")

# Refuse to boot in production with the placeholder secret. JianZhai's primary
# deployment story is single-user localhost, but if someone moves it to a
# real host (DEBUG=False) and forgets to populate ``.env`` we'd otherwise
# happily sign session cookies with the development key — a textbook
# password-on-postit-note level of bad. Failing fast is the obviously-right
# answer; the operator sees the message and fixes it before any traffic
# touches the box.
if not DEBUG and SECRET_KEY == "dev-secret-change-me":
    raise RuntimeError(
        "SECRET_KEY is still the development placeholder while DEBUG=False. "
        "Set SECRET_KEY in backend/.env to a long random string (e.g. "
        "`python -c 'import secrets; print(secrets.token_urlsafe(50))'`) "
        "before deploying."
    )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # Third-party
    "rest_framework",
    "corsheaders",
    "django_filters",
    # Local apps
    "apps.accounts",
    "apps.knowledge",
    "apps.editor",
    "apps.versioning",
    "apps.linking",
    "apps.search",
    "apps.exporter",
    "apps.comments",
    "apps.tags",
    "apps.blog",
    "apps.ai",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "jianzhai.urls"
WSGI_APPLICATION = "jianzhai.wsgi.application"
ASGI_APPLICATION = "jianzhai.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://jianzhai:jianzhai@localhost:5432/jianzhai",
        ),
        conn_max_age=600,
    ),
}

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

# Celery
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]

# DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "ai_write": "30/min",
    },
}

# CORS
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS", ["http://localhost:3001"]
)
CORS_ALLOW_CREDENTIALS = True

# CSRF — Vite dev proxy preserves the browser Origin, so the SPA's origin must be trusted.
CSRF_TRUSTED_ORIGINS = _env_list(
    "CSRF_TRUSTED_ORIGINS",
    ["http://localhost:3001", "http://localhost:8002"],
)
CSRF_COOKIE_NAME = "csrftoken"

# Allow same-origin iframe embeds so the blog reader can <iframe> uploaded
# HTML/PDF attachments. Django defaults to DENY which blocks the preview.
X_FRAME_OPTIONS = "SAMEORIGIN"
CSRF_COOKIE_HTTPONLY = False  # SPA must read it to set the X-CSRFToken header
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = os.environ.get("LANGUAGE_CODE", "zh-hans")
TIME_ZONE = os.environ.get("TIME_ZONE", "Asia/Shanghai")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media")).resolve()

# Public blog URL for static-site export RSS (and similar absolute links).
SITE_PUBLIC_URL = os.environ.get("SITE_PUBLIC_URL", "http://localhost:3001")

# LAN / production: browser Origin must match CSRF_TRUSTED_ORIGINS (see docs).
# Prefer explicit JIANZHAI_PUBLIC_ORIGIN; else derive from SITE_PUBLIC_URL.
_public_origin_candidate = os.environ.get("JIANZHAI_PUBLIC_ORIGIN", "").strip()
_derived_public_origin = (
    _origin_from_url(_public_origin_candidate)
    if _public_origin_candidate
    else _origin_from_url(SITE_PUBLIC_URL)
)
if _derived_public_origin:
    CSRF_TRUSTED_ORIGINS = _merge_unique(CSRF_TRUSTED_ORIGINS, _derived_public_origin)
    CORS_ALLOWED_ORIGINS = _merge_unique(CORS_ALLOWED_ORIGINS, _derived_public_origin)
    _public_host = urlparse(_derived_public_origin).hostname
    if _public_host:
        ALLOWED_HOSTS = _merge_unique(ALLOWED_HOSTS, _public_host)

# Upload limits (matches non-functional requirements: 50MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
