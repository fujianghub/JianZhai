from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    UserViewSet,
    csrf,
    avatar_me,
    login_view,
    logout_view,
    me,
    session,
    system_info,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")

urlpatterns = [
    path("csrf/", csrf, name="auth-csrf"),
    path("session/", session, name="auth-session"),
    path("login/", login_view, name="auth-login"),
    path("logout/", logout_view, name="auth-logout"),
    path("me/", me, name="auth-me"),
    path("me/avatar/", avatar_me, name="auth-avatar"),
    path("system-info/", system_info, name="auth-system-info"),
    path("", include(router.urls)),
]
