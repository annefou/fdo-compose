"""Write the composition of a dashboard onto a Research Object in ROHub.

Annotations are additive in ROHub, so applying a composition twice would leave the
old statements behind. This script removes the object's annotations first and then
writes the set below, which makes the composition reproducible: run it again after
editing this file and the object matches it.

    python scripts/apply_dashboard.py <uuid> [template|instance]

Resource roles (the input dataset, the logo, the theme) are matched by resource
title, so they survive the wipe.
"""

from __future__ import annotations

import sys

import requests
import rohub
from rohub import settings
from _rohub import CCA, SCHEMA, annotate, login, pid


def headers() -> dict:
    """The Authorization header the rohub library builds for its own calls."""
    return {"Authorization": f"{settings.TOKEN_TYPE.capitalize()} {settings.ACCESS_TOKEN}"}

PROFILE = "https://w3id.org/ro/terms/cca/dashboard-profile/0.1"

#: The composition every dashboard of this kind has. A fork adds only its input.
COMPOSITION = [
    (SCHEMA + "additionalType", CCA + "Dashboard"),
    ("http://purl.org/dc/terms/conformsTo", PROFILE),
    (CCA + "accepts", CCA + "GeospatialDataset"),
    (CCA + "primaryColorHex", "1d6886"),

    # Page 1: what this is, in words and in numbers, with the claims and the way on
    (CCA + "page1", CCA + "OverviewPage"),
    (CCA + "page1Title", "Overview"),
    (CCA + "page1Panel1", CCA + "TextView"),
    (CCA + "page1Panel2", CCA + "StatsView"),
    (CCA + "page1Panel2Stats", "datasets,variables,claims,resources"),
    (CCA + "page1Panel3", CCA + "ClaimsView"),
    (CCA + "page1Panel4", CCA + "LinksView"),

    # Page 2: the data itself
    (CCA + "page2", CCA + "MapPage"),
    (CCA + "page2Title", "Explore the data"),
    (CCA + "page2Panel1", CCA + "MapView"),
    (CCA + "page2Panel1Renderer", CCA + "plugin/healpix-map"),
    (CCA + "page2Panel1Colormap", "thermal"),
    (CCA + "page2Panel2", CCA + "VariablesView"),

    # Page 3: where it came from
    (CCA + "page3", CCA + "DetailsPage"),
    (CCA + "page3Title", "About the dataset"),
    (CCA + "page3Panel1", CCA + "MetadataView"),
]

#: Resource title (lowercased, matched by substring) -> the role it plays.
ROLES = {
    "input dataset": CCA + "InputDataset",
    "theme.json": CCA + "Theme",
    "logo.png": CCA + "Logo",
    "background": CCA + "BackgroundImage",
}


def wipe_annotations(ro_id: str) -> int:
    """Remove every annotation of the object, so the composition can be rewritten."""
    url = settings.API_URL + f"ros/{ro_id}/annotations/?size=200"
    listing = requests.get(url, headers=headers(), timeout=60).json()
    removed = 0
    for annotation in listing.get("results", []):
        response = requests.delete(settings.API_URL + f"annotations/{annotation['identifier']}/",
                                   headers=headers(), timeout=60)
        if response.status_code not in (200, 202, 204):
            print("  could not remove", annotation["identifier"], response.status_code)
            continue
        removed += 1
    return removed


def resources(ro_id: str) -> list[dict]:
    url = settings.API_URL + f"ros/{ro_id}/resources/?size=100"
    return requests.get(url, headers=headers(), timeout=60).json().get("results", [])


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    ro_id = sys.argv[1]

    login()
    print("object:", pid(ro_id))
    print("  removed", wipe_annotations(ro_id), "annotations")

    annotate(ro_id, COMPOSITION)
    print("  wrote", len(COMPOSITION), "statements")

    for resource in resources(ro_id):
        title = (resource.get("name") or "").lower()
        role = next((r for key, r in ROLES.items() if key in title), None)
        if not role:
            continue
        annotate(ro_id, [(SCHEMA + "additionalType", role)], resource=resource["identifier"])
        print("  role:", role.rsplit("/", 1)[-1], "->", resource.get("name"))
        if role.endswith("InputDataset"):
            annotate(ro_id, [(SCHEMA + "object", resource.get("url") or resource.get("name"))])


if __name__ == "__main__":
    main()
