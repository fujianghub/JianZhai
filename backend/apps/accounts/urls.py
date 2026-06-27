from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .captcha import get_captcha
from .hero import hero_batch_import, hero_settings
from .views import (
    UserTagViewSet,
    UserViewSet,
    avatar_me,
    change_email_me,
    change_password_me,
    change_username_me,
    csrf,
    login_view,
    logout_view,
    me,
    session,
    system_info,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"user-tags", UserTagViewSet, basename="user-tag")

urlpatterns = [
    path("csrf/", csrf, name="auth-csrf"),
    path("session/", session, name="auth-session"),
    path("captcha/", get_captcha, name="auth-captcha"),
    path("login/", login_view, name="auth-login"),
    path("logout/", logout_view, name="auth-logout"),
    path("me/", me, name="auth-me"),
    path("me/avatar/", avatar_me, name="auth-avatar"),
    # v0.9.9 — self-service credential rotation
    path("me/change-password/", change_password_me, name="auth-change-password"),
    path("me/change-email/", change_email_me, name="auth-change-email"),
    path("me/change-username/", change_username_me, name="auth-change-username"),
    path("system-info/", system_info, name="auth-system-info"),
    # Hero quote management — auth required; staff for writes.
    path("hero/", hero_settings, name="auth-hero-settings"),
    path("hero/batch/", hero_batch_import, name="auth-hero-batch"),
    path("", include(router.urls)),
]
