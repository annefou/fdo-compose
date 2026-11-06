"""Fork an object in ROHub and give the fork its own brand and members.

Forking copies everything, including the parent's logo, colours and notice, so a fork
that is not rebranded shows the wrong one. This removes the brand it inherited, writes
the new one from a spec, and adds whatever the fork should point at.

    python scripts/fork.py <source-uuid> ../examples/lifewatch-fork.yaml

The spec is the same shape publish.py uses; `title` and `description` become the fork's,
`files` replace the parent's brand, `external` are added beside the members it inherited,
and `annotations` are written last, so they override what the parent said.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import requests
import rohub
import yaml
from rohub import settings
from _rohub import SCHEMA, annotate, login, pid, retry
from publish import expand, pairs

#: resources of the parent that a fork must not keep
INHERITED_BRAND = ("theme.json", "logo.png", "background.png", "partner-", "notice.md", "footer.md")


def headers() -> dict:
    return {"Authorization": f"{settings.TOKEN_TYPE.capitalize()} {settings.ACCESS_TOKEN}"}


def resources(ro_id: str) -> list[dict]:
    url = settings.API_URL + f"ros/{ro_id}/resources/?size=100"
    return requests.get(url, headers=headers(), timeout=60).json().get("results", [])


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    source, spec_path = sys.argv[1], Path(sys.argv[2])
    spec = yaml.safe_load(spec_path.read_text())
    folder = spec_path.parent

    login()
    fork = rohub.ros_fork(source, title=spec["title"], description=spec.get("description", ""))
    fork_id = fork if isinstance(fork, str) else fork.identifier
    print("fork:", pid(fork_id))
    time.sleep(5)

    for resource in resources(fork_id):
        name = (resource.get("name") or "").lower()
        if any(word in name for word in INHERITED_BRAND):
            rohub.resource_delete(resource["identifier"])
            print("  removed inherited:", resource.get("name"))
            time.sleep(2)

    for path, role in (spec.get("files") or {}).items():
        source_file = folder / path
        if not source_file.exists():
            print("  missing file:", source_file)
            continue
        resource = retry(rohub.ros_add_internal_resource, fork_id, res_type="Other",
                         file_path=str(source_file), title=source_file.name)
        if role:
            annotate(fork_id, [(SCHEMA + "additionalType", expand(role))], resource=resource.identifier)
        print("  file:", source_file.name)
        time.sleep(3)

    for item in (spec.get("external") or []):
        resource = retry(rohub.ros_add_external_resource, fork_id,
                         res_type=item.get("type", "Other"), input_url=item["url"],
                         title=item.get("title", item["url"]))
        properties = pairs(item.get("properties"))
        if item.get("role"):
            properties.append((SCHEMA + "additionalType", expand(item["role"])))
        if properties:
            annotate(fork_id, properties, resource=resource.identifier)
        print("  link:", item["url"])
        time.sleep(3)

    statements = pairs(spec.get("annotations"))
    if statements:
        annotate(fork_id, statements)
        print("  wrote", len(statements), "statements")

    print("\n", pid(fork_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
