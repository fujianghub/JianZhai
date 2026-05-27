from __future__ import annotations


class VersionConflictError(Exception):
    """Raised when ``expected_version`` does not match the locked row."""

    def __init__(self, document) -> None:
        self.document = document
        super().__init__()
