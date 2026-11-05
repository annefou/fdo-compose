"""Shared helpers for building dashboard FAIR Digital Objects in ROHub.

What we learned building these (ROHub, November 2026):

* An annotation is a flat ``{"property": <IRI>, "value": <IRI or literal>}`` pair
  applied to the RO (no ``resources``) or to named resources. A JSON-LD graph in
  ``body_specification_json`` returns HTTP 500, and the multipart ``.ttl`` route
  returns 201 but its triples never reach the crate.
* Nested values are therefore impossible: no ``additionalProperty`` with a
  ``PropertyValue`` inside. Settings are flat predicates (``cca:colormap``).
* A value starting with ``#`` is turned into an IRI in ROHub's own namespace
  (``#1d6886`` becomes ``http://w3id.org/ro-id/rohub/model#1d6886``), so colours
  are written without the hash. See COLOUR note in create_dashboard_template.py.
* A folder must exist before a resource is added to it, and ROHub needs a few
  seconds after creating it; ``retry`` covers that.
"""

from __future__ import annotations

import time
from pathlib import Path

import rohub

CCA = "https://w3id.org/ro/terms/cca/"
SCHEMA = "https://schema.org/"
HOME = Path.home()


def login() -> None:
    rohub.login(username=(HOME / "rohub_username").read_text().strip(),
                password=(HOME / "rohub_pwd").read_text().strip())


def retry(fn, *args, attempts: int = 4, wait: int = 10, **kwargs):
    """ROHub rejects writes for a few seconds after a structural change."""
    for attempt in range(1, attempts + 1):
        try:
            return fn(*args, **kwargs)
        except SystemExit as err:
            if attempt == attempts:
                raise
            print(f"  attempt {attempt} failed ({err}); retrying in {wait}s")
            time.sleep(wait)


def annotate(ro_id: str, pairs: list[tuple[str, str]], resource: str | None = None):
    """Attach flat property/value pairs to the RO, or to one of its resources."""
    body = [{"property": p, "value": v} for p, v in pairs]
    kwargs = {"resources": [resource]} if resource else {}
    return retry(rohub.ros_add_annotations, ro_id, body_specification_json=body, **kwargs)


def pid(ro_id: str) -> str:
    return f"https://w3id.org/ro-id/{ro_id}"
