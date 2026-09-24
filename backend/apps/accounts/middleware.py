"""Request/response middleware for the accounts app."""

from __future__ import annotations

from apps.editor import media_ticket


class MediaTicketMiddleware:
    """Keep an authenticated browser holding a fresh media ticket.

    Sits after ``AuthenticationMiddleware``. On every response for a
    session-authenticated request whose ticket cookie is missing or older than
    :data:`media_ticket.TICKET_REFRESH_AFTER_S`, a new ``jz_media`` cookie is
    set (see :mod:`apps.editor.media_ticket` for why it exists). Issuing here,
    rather than inside each login path, means every way of becoming
    authenticated — password login today, any SSO / 2FA flow later — is
    covered, and users already logged in when this shipped pick a ticket up on
    their next API call without re-authenticating.

    Skipped for: requests without a session cookie (no DB hit for anonymous
    traffic), the ``forward_auth`` sub-request itself (its ``Set-Cookie`` never
    reaches the browser — Caddy only relays configured headers), and logout
    (which deletes the cookie instead).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._maybe_issue(request, response)
        except Exception:  # noqa: BLE001 — a ticket hiccup must never break a response
            pass
        return response

    @staticmethod
    def _maybe_issue(request, response) -> None:
        from django.conf import settings

        if settings.SESSION_COOKIE_NAME not in request.COOKIES:
            return
        path = request.path
        if path.endswith("/media-auth/") or path.endswith("/auth/logout/"):
            return
        if media_ticket.COOKIE_NAME in response.cookies:
            return  # a view already set / deleted it
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return
        if media_ticket.is_fresh(request.COOKIES.get(media_ticket.COOKIE_NAME)):
            return
        media_ticket.set_cookie(response, user)
