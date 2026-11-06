"""Create a dashboard for the FAIR Climate Matchmaker space.

The space https://w3id.org/spaces/fairclimatematchmaker states each of its views as a
published grlc query nanopublication. This object says which of those queries to show, on
which page and how, so the content stays in the nanopublication network and only the
arrangement lives here.

    python scripts/create_matchmaker_site.py <folder-with-the-brand-files>
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

PROFILE = "https://w3id.org/ro/terms/cca/dashboard-profile/0.1"
SPACE = "https://w3id.org/spaces/fairclimatematchmaker"

QUERIES = {
    "cca_fsr": "https://w3id.org/np/RAwhCOVgo8-hj3YhFRoFX4b-flQpnOiZ1PyXJOd59sOf0/get-cca-fsr",
    "recommended": "https://w3id.org/np/RA8piV4ERrDNzrDP1xAEo4QIupiK9hmdbh7r3jbKAguyU/get-recommended-fsrs",
    "user_stories": "https://w3id.org/np/RAfyDmxn_LMbSEH5mg-9FAFAJ5ar3sdRu-xPDALR-_Pbo/get-all-us",
}

TITLE = "FAIR Climate Matchmaker (dashboard composed from FAIR Digital Objects)"
DESCRIPTION = (
    "A reading of the FAIR Climate Matchmaker space (" + SPACE + ") whose arrangement is "
    "described by this Research Object: which published queries to run, on which page, and "
    "how to show their results. The content is not copied here - each panel runs a grlc query "
    "nanopublication against the nanopublication network when the page is opened, so what a "
    "visitor reads is whatever the community has published by then. Experimental, FAIR2Adapt."
)

COMPOSITION = [
    (SCHEMA + "additionalType", CCA + "Dashboard"),
    ("http://purl.org/dc/terms/conformsTo", PROFILE),
    (SCHEMA + "about", SPACE),
    (CCA + "accepts", CCA + "Query"),

    (CCA + "page1", CCA + "OverviewPage"),
    (CCA + "page1Title", "FAIR Climate Matchmaker"),
    (CCA + "page1Panel1", CCA + "NoticeView"),
    (CCA + "page1Panel2", CCA + "HeroView"),
    (CCA + "page1Panel3", CCA + "QueryView"),
    (CCA + "page1Panel3Query", QUERIES["cca_fsr"]),
    (CCA + "page1Panel3Layout", "cards"),
    (CCA + "page1Panel4", CCA + "LinksView"),

    (CCA + "page2", CCA + "CollectionPage"),
    (CCA + "page2Title", "Recommended resources"),
    (CCA + "page2Panel1", CCA + "QueryView"),
    (CCA + "page2Panel1Query", QUERIES["recommended"]),

    (CCA + "page3", CCA + "CollectionPage"),
    (CCA + "page3Title", "What people need"),
    (CCA + "page3Panel1", CCA + "QueryView"),
    (CCA + "page3Panel1Query", QUERIES["user_stories"]),
    (CCA + "page3Panel1Layout", "cards"),

    (CCA + "page4", CCA + "DetailsPage"),
    (CCA + "page4Title", "About"),
    (CCA + "page4Panel1", CCA + "TextView"),
    (CCA + "page4Panel2", CCA + "MetadataView"),
    (CCA + "page4Panel3", CCA + "ResourcesView"),
]

BRAND = {
    "theme.json": CCA + "Theme",
    "logo.png": CCA + "Logo",
    "background.png": CCA + "BackgroundImage",
    "notice.md": CCA + "Notice",
    "footer.md": CCA + "Footer",
}


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    login()
    ro = rohub.ros_create(title=TITLE, research_areas=["Earth Sciences"],
                          description=DESCRIPTION, access_mode="PUBLIC")
    print("Matchmaker dashboard:", pid(ro.identifier))

    annotate(ro.identifier, COMPOSITION)
    print("  wrote", len(COMPOSITION), "statements")

    for name, role in BRAND.items():
        path = folder / name
        if not path.exists():
            print("  missing:", path)
            continue
        resource = retry(rohub.ros_add_internal_resource, ro.identifier, res_type="Other",
                         file_path=str(path), title=name)
        annotate(ro.identifier, [(SCHEMA + "additionalType", role)], resource=resource.identifier)
        print("  file:", name)
        time.sleep(3)

    resource = retry(rohub.ros_add_external_resource, ro.identifier, res_type="Other",
                     input_url=SPACE, title="The space this dashboard reads")
    annotate(ro.identifier, [(SCHEMA + "additionalType", CCA + "Space")],
             resource=resource.identifier)
    print("  space linked:", SPACE)


if __name__ == "__main__":
    main()
