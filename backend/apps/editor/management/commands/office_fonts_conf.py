"""Emit the static fontconfig snippet baked into the backend image.

    manage.py office_fonts_conf > infra/fonts/60-jianzhai-office.conf

The Dockerfile copies that file to /etc/fonts/conf.d/ so LibreOffice *and*
the Playwright/Chromium exporter share the extra font dir and the curated
CJK ``prefer`` aliases. Per-deck hard overrides are generated at conversion
time by ``apps.editor.services.office_fonts.prepare_fonts`` — this file is
only the system-wide baseline. Regenerate after editing ``FONT_RULES``.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.editor.services.office_fonts import render_static_fontconfig


class Command(BaseCommand):
    help = "Print the static fontconfig (infra/fonts/60-jianzhai-office.conf) derived from FONT_RULES."

    def add_arguments(self, parser):
        parser.add_argument("--dir", action="append", default=None,
                            help="font dir(s) to declare (default /usr/share/fonts/jianzhai)")

    def handle(self, *args, **opts):
        dirs = tuple(opts["dir"]) if opts["dir"] else ("/usr/share/fonts/jianzhai",)
        self.stdout.write(render_static_fontconfig(dirs), ending="")
