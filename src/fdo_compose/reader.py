"""Reading the objects: ROHub for the crates, fdo-consume for what they say.

Nothing here knows what a dashboard looks like. It fetches the RO-Crate of a
PID, keeps it in a recorded folder so a build can be repeated offline, and hands
it to fdo-consume, which reads it through the draft dashboard profile map
(cca-dashboard-0.1).
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

from fdo_consume import consume, describe

ROHUB_PID = re.compile(r"^https://w3id\.org/ro-id/([0-9a-f-]{36})$")
CRATE = "https://api.rohub.org/api/ros/{uuid}/crate/download/"
CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
TIMEOUT = 90


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=TIMEOUT) as response:  # noqa: S310 (https only)
        return response.read()


def cache(pid: str, folder: Path, refresh: bool = False) -> str:
    """Record the crate of `pid` in `folder` (the layout fdo-consume reads offline)."""
    match = ROHUB_PID.match(pid)
    if not match:
        raise SystemExit(f"not a ROHub PID: {pid}")
    name = match.group(1)[:8]
    index_path = folder / "pids.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    crate = folder / "objects" / name / "ro-crate-metadata.json"
    if refresh or not crate.exists():
        crate.parent.mkdir(parents=True, exist_ok=True)
        crate.write_bytes(fetch(CRATE.format(uuid=match.group(1))))
    index[pid] = {"fixture": name}
    folder.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, indent=1))
    return name


def read_dashboard(pid: str, folder: Path, refresh: bool = False) -> dict:
    """The dashboard's own statement about itself, as the contract asks for it."""
    cache(pid, folder, refresh)
    result = consume(pid, "dashboard-site-v1", recorded_dir=str(folder), contracts=str(CONTRACTS))
    binding = result.binding or {}
    fields = dict(binding.get("object", {}).get("fields", {}))
    fields["_usable"] = result.is_usable
    fields["_statuses"] = {k: (v.get("status") if isinstance(v, dict) else v)
                           for k, v in (result.statuses or {}).items()}
    fields["_diagnostics"] = [d.get("message") for d in (result.diagnostics or [])]
    return fields


def read_object(pid: str, folder: Path, refresh: bool = False) -> dict:
    """Any other object (the dataset the dashboard shows), as fdo-consume describes it."""
    cache(pid, folder, refresh)
    return dict(describe(pid, recorded_dir=str(folder)).descriptor)


def read_json(url: str) -> dict | None:
    """A STAC item or collection, read for the detail a crate does not carry."""
    try:
        return json.loads(fetch(url))
    except Exception:            # noqa: BLE001 - a missing or broken service must not fail a build
        return None
