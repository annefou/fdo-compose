"""Rendering a dashboard FDO as two pages."""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .site import Dashboard, short

HERE = Path(__file__).parent
PAGES = [("index.html", "object.html.j2"), ("dashboard.html", "dashboard.html.j2")]


def environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(HERE / "templates"),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["short"] = short
    env.filters["basename"] = lambda u: (u or "").rstrip("/").rsplit("/", 1)[-1]
    return env


def render(dashboard: Dashboard, out: Path) -> list[Path]:
    env = environment()
    out.mkdir(parents=True, exist_ok=True)
    shutil.copytree(HERE / "static", out / "static", dirs_exist_ok=True)
    built = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")

    written = []
    for filename, template in PAGES:
        path = out / filename
        path.write_text(env.get_template(template).render(d=dashboard, built=built, page=filename))
        written.append(path)
    return written
