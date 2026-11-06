"""Create or update a FAIR Digital Object in ROHub from a specification file.

A dashboard is data, not code: what it contains belongs in a spec that anyone can read
and change, not in a Python script per dashboard. This tool takes such a spec and writes
it to ROHub - the annotations that compose the object, the files it carries, and the
objects it points at.

    python scripts/publish.py ../examples/portugal-hub.yaml            # create
    python scripts/publish.py ../examples/portugal-hub.yaml --dry-run  # show what it would do
    python scripts/publish.py ../examples/portugal-hub.yaml --ro <uuid>   # update that object

A spec looks like this (prefixes cca: and schema: are expanded):

    title: FAIR Climate Matchmaker
    description: >
      A reading of the FAIR Climate Matchmaker space ...
    research_areas: [Earth Sciences]
    access: PUBLIC
    annotations:
      schema:additionalType: cca:Dashboard
      cca:page1: cca:OverviewPage
      cca:page1Title: Home
    files:                       # paths relative to the spec; the value is the role
      brand/matchmaker/theme.json: cca:Theme
    external:                    # things the object points at
      - url: https://w3id.org/ro-id/c594948e-cf4f-44ce-b96e-097e6ba5cd8e
        title: Publication 1 in this hub
        role: cca:Member

Keep the identifier ROHub gives you in the spec as `id:` and the next run updates that
object instead of creating another. ROHub keeps only the newest value of a property, so
re-running a spec is the way to change a statement; it cannot remove one.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests
import rohub
import yaml
from rohub import settings
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

PREFIXES = {
    "cca:": CCA,
    "schema:": SCHEMA,
    "dct:": "http://purl.org/dc/terms/",
    "dcat:": "http://www.w3.org/ns/dcat#",
    "odrl:": "http://www.w3.org/ns/odrl/2/",
}


def expand(value: str) -> str:
    """cca:Dashboard -> https://w3id.org/ro/terms/cca/Dashboard; anything else unchanged."""
    for prefix, base in PREFIXES.items():
        if isinstance(value, str) and value.startswith(prefix):
            return base + value[len(prefix):]
    return value


def pairs(mapping: dict) -> list[tuple[str, str]]:
    return [(expand(k), expand(str(v))) for k, v in (mapping or {}).items()]


def already_there(ro_id: str) -> tuple[set[str], set[str]]:
    """The names and the URLs of the resources the object already carries.

    Re-running a spec should change an object, not grow it: ROHub would happily add a
    second theme.json beside the first.
    """
    url = settings.API_URL + f"ros/{ro_id}/resources/?size=200"
    headers = {"Authorization": f"{settings.TOKEN_TYPE.capitalize()} {settings.ACCESS_TOKEN}"}
    try:
        results = requests.get(url, headers=headers, timeout=60).json().get("results", [])
    except Exception:                       # noqa: BLE001 - a listing we cannot read adds nothing
        return set(), set()
    return ({(r.get("name") or "").lower() for r in results},
            {(r.get("url") or "").rstrip("/") for r in results})


def main() -> int:
    parser = argparse.ArgumentParser(prog="publish.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", type=Path, help="the specification file")
    parser.add_argument("--ro", help="update this object instead of creating one")
    parser.add_argument("--dry-run", action="store_true", help="say what would be written")
    args = parser.parse_args()

    spec = yaml.safe_load(args.spec.read_text())
    folder = args.spec.parent
    ro_id = args.ro or spec.get("id")
    statements = pairs(spec.get("annotations"))
    files = spec.get("files") or {}
    external = spec.get("external") or []

    print(("update " + ro_id) if ro_id else "create", "from", args.spec.name)
    print(f"  title: {spec.get('title')}")
    print(f"  {len(statements)} statements, {len(files)} files, {len(external)} external resources")
    if args.dry_run:
        for prop, value in statements:
            print(f"    {prop.rsplit('/', 1)[-1]:<22} {value}")
        for path, role in files.items():
            print(f"    file {path} -> {role}")
        for item in external:
            print(f"    link {item['url']} -> {item.get('role', '-')}")
        missing = [p for p in files if not (folder / p).exists()]
        if missing:
            print("  MISSING FILES:", ", ".join(missing))
        return 1 if missing else 0

    login()
    if not ro_id:
        created = rohub.ros_create(title=spec["title"],
                                   research_areas=spec.get("research_areas", ["Earth Sciences"]),
                                   description=spec.get("description", ""),
                                   access_mode=spec.get("access", "PUBLIC"))
        ro_id = created.identifier
        print("  created", pid(ro_id), "- put this in the spec as `id:`")

    if statements:
        annotate(ro_id, statements)
        print("  wrote", len(statements), "statements")

    names, urls = already_there(ro_id)
    for path, role in files.items():
        source = folder / path
        if not source.exists():
            print("  missing file:", source)
            continue
        if source.name.lower() in names:
            print("  file already there:", source.name)
            continue
        resource = retry(rohub.ros_add_internal_resource, ro_id, res_type="Other",
                         file_path=str(source), title=source.name)
        if role:
            annotate(ro_id, [(SCHEMA + "additionalType", expand(role))], resource=resource.identifier)
        print("  file:", source.name, "->", role or "(no role)")
        time.sleep(3)

    for item in external:
        if item["url"].rstrip("/") in urls:
            print("  link already there:", item["url"])
            continue
        resource = retry(rohub.ros_add_external_resource, ro_id,
                         res_type=item.get("type", "Other"), input_url=item["url"],
                         title=item.get("title", item["url"]))
        properties = pairs(item.get("properties"))
        if item.get("role"):
            properties.append((SCHEMA + "additionalType", expand(item["role"])))
        if properties:
            annotate(ro_id, properties, resource=resource.identifier)
        print("  link:", item["url"])
        time.sleep(3)

    print("\n", pid(ro_id))
    print(" https://annefou.github.io/fdo-compose/?fdo=" + pid(ro_id).replace(":", "%3A").replace("/", "%2F"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
