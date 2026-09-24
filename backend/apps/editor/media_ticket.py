"""Media ticket — a second, read-only credential for ``/media/*``.

Why it exists (2026-09-24): author HTML is rendered inside sandboxed iframes
without ``allow-same-origin`` (``SandboxedHtmlFrame``), and standalone HTML /
SVG attachments are served with ``CSP: sandbox``. Documents in an *opaque
origin* send only ``SameSite=None`` cookies with their subresource requests
(Chrome: ``Sec-Fetch-Site: cross-site``, no Referer — verified with Playwright),
so the ``Lax`` session cookie never reaches ``forward_auth`` and every
``<img src="/media/…">`` inside an HTML document answered 401 since the media
gate went live (2026-09-10).

Rather than weakening the session cookie to ``SameSite=None`` (which would
ship it with every cross-site request and drop the CSRF defence-in-depth for
the whole API), authenticated users get a *ticket* cookie:

- ``Path=/media`` → never sent to ``/api``; it can only ever buy media reads;
- ``SameSite=None; Secure; HttpOnly`` → reaches opaque-origin subresource
  requests; JS cannot read it;
- signed (``TimestampSigner``), 2 h lifetime, bound to the user's
  ``session_auth_hash`` → a password change invalidates it; refreshed by
  :class:`apps.accounts.middleware.MediaTicketMiddleware`, deleted on logout.

``media_auth.resolve_media_user`` consults the ticket only when the request
carries no session user, and the audience / ReadGrant decision itself is
unchanged (``media_access_status``).

Trust boundary: a third-party page can embed ``<img src="https://site/media/
<uuid>.png">`` and the victim's browser will attach the ticket, so the image
renders *inside the attacker's page* — but cross-origin pixels are unreadable
without CORS and the uuid paths are unguessable. ``Cross-Origin-Resource-
Policy: same-site`` cannot be used to close that gap: it would also block our
own opaque-origin sandbox (it is ``cross-site`` to the browser).
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.core import signing

log = logging.getLogger(__name__)

COOKIE_NAME = "jz_media"
COOKIE_PATH = "/media"
TICKET_MAX_AGE_S = 2 * 60 * 60
"""Lifetime of a ticket. Short by design: a leaked ticket is worth at most 2 h."""
TICKET_REFRESH_AFTER_S = 60 * 60
"""Middleware re-issues once the ticket is older than this (half the lifetime),
so an active session never runs into the expiry."""
_SALT = "jz-media-ticket"
_HASH_PREFIX = 16


def _signer() -> signing.TimestampSigner:
    return signing.TimestampSigner(salt=_SALT)


def _payload(user) -> str:
    return f"{user.pk}:{user.get_session_auth_hash()[:_HASH_PREFIX]}"


def issue(user) -> str:
    """Signed ticket value for ``user`` (must be authenticated + active)."""
    return _signer().sign(_payload(user))


def is_fresh(value: str | None) -> bool:
    """True when ``value`` is a valid ticket younger than the refresh threshold."""
    if not value:
        return False
    try:
        _signer().unsign(value, max_age=TICKET_REFRESH_AFTER_S)
        return True
    except signing.BadSignature:
        return False


def resolve(value: str | None):
    """User the ticket stands for, or ``None`` for anything not verifiable.

    Never raises: expired, tampered, unknown / inactive user and a stale
    session-auth hash (password changed) all yield ``None``."""
    if not value:
        return None
    try:
        payload = _signer().unsign(value, max_age=TICKET_MAX_AGE_S)
    except signing.BadSignature:
        return None
    uid, _, hash_prefix = payload.partition(":")
    if not uid.isdigit() or not hash_prefix:
        return None
    user = get_user_model().objects.filter(pk=int(uid), is_active=True).first()
    if user is None:
        return None
    if user.get_session_auth_hash()[:_HASH_PREFIX] != hash_prefix:
        return None
    return user


def set_cookie(response, user) -> None:
    """Attach a fresh ticket cookie to ``response``.

    ``secure=True`` unconditionally: ``SameSite=None`` cookies are dropped by
    browsers without it, and Chrome accepts Secure cookies on http://localhost
    and 127.0.0.1 (dev / the Caddy replica) as potentially-trustworthy origins."""
    response.set_cookie(
        COOKIE_NAME,
        issue(user),
        max_age=TICKET_MAX_AGE_S,
        path=COOKIE_PATH,
        secure=True,
        httponly=True,
        samesite="None",
    )


def delete_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, samesite="None")
