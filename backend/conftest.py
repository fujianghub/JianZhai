"""Shared pytest fixtures.

Several hot paths now cache results (AISettings singleton, public aggregate
endpoints). The cache backend is process-wide and is NOT rolled back with the
test database, so a value cached in one test could leak into the next. Clear
it around every test to keep them isolated.
"""
from __future__ import annotations

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()
