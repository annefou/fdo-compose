"""Create the CS4-shaped example: a hub whose whole website is described by the object.

This mirrors the Portugal adaptation hub WP4 built (fdo-knowledge-dashboard): the same
three publication FDOs, the same brand. The difference is where the site lives. There,
the pages, the texts, the colours and the logos are a YAML file and an assets folder in
a repository; here they are the Research Object:

* the pages and the panels on them are annotations, so the composition travels with the object;
* the words come from the object itself - its title and description - with annotations for
  what a crate cannot say (which part of the heading is highlighted, the notice, the footer);
* the look is a theme.json resource;
* the logo, the background and the partner logos are image resources.

A curator changes the hub in ROHub, by editing the object or replacing a file. Nothing
is rebuilt and no code changes.

    python scripts/create_cs4_site.py <folder-with-the-brand-files>

The folder holds theme.json, logo.png, background.png and partner-*.png.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

PROFILE = "https://w3id.org/ro/terms/cca/dashboard-profile/0.1"

MEMBERS = [
    "https://w3id.org/ro-id/c594948e-cf4f-44ce-b96e-097e6ba5cd8e",
    "https://w3id.org/ro-id/10f2756e-a221-4754-8b90-d088ab4409e5",
    "https://w3id.org/ro-id/1bffc87b-d080-41ec-96b5-5f46ecbd76db",
]

TITLE = "Portugal Adaptation Knowledge Dashboard (composed from FAIR Digital Objects)"
DESCRIPTION = (
    "A hub for climate adaptation knowledge in Portugal whose website is described by this "
    "Research Object: its pages and panels are annotations, its words and colours are files, and "
    "the publications it lists are its resources. It carries the same three publication FAIR "
    "Digital Objects and the same brand as the CS4 prototype, so that the two can be compared."
)

COMPOSITION = [
    (SCHEMA + "additionalType", CCA + "Dashboard"),
    ("http://purl.org/dc/terms/conformsTo", PROFILE),
    (CCA + "accepts", CCA + "Publication"),
    (CCA + "heroTitle", "Your guide to climate adaptation in Portugal"),
    (CCA + "heroHighlight", "Portugal"),
    (CCA + "ask", "Ask a question…"),
    (CCA + "notice", "Prototype under development, based on the CS4 designed pages: "
                     "metadata of selected research objects from ROHub."),
    (CCA + "footerStatement1", "Knowledge from records — every value is what a record states"),
    (CCA + "footerStatement2", "FAIR by design — findable, accessible, interoperable, reusable"),
    (CCA + "footerStatement3", "Live — read from ROHub each time the page is opened, never rebuilt"),

    (CCA + "page1", CCA + "OverviewPage"),
    (CCA + "page1Title", "Home"),
    (CCA + "page1Panel1", CCA + "NoticeView"),
    (CCA + "page1Panel2", CCA + "HeroView"),
    (CCA + "page1Panel3", CCA + "TopicsView"),
    (CCA + "page1Panel4", CCA + "CategoriesView"),
    (CCA + "page1Panel5", CCA + "LinksView"),

    (CCA + "page2", CCA + "CollectionPage"),
    (CCA + "page2Title", "Resources"),
    (CCA + "page2Panel1", CCA + "MembersView"),

    (CCA + "page3", CCA + "DetailsPage"),
    (CCA + "page3Title", "About"),
    (CCA + "page3Panel1", CCA + "TextView"),
    (CCA + "page3Panel2", CCA + "MetadataView"),
    (CCA + "page3Panel3", CCA + "ResourcesView"),
]

#: file name -> the role it plays in the site
BRAND = {
    "theme.json": CCA + "Theme",
    "logo.png": CCA + "Logo",
    "background.png": CCA + "BackgroundImage",
    "partner-ce3c.png": CCA + "Partner",
    "partner-fair2adapt.png": CCA + "Partner",
    "partner-adaptation-hubs.png": CCA + "Partner",
}


def main() -> None:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    login()
    ro = rohub.ros_create(title=TITLE, research_areas=["Earth Sciences"],
                          description=DESCRIPTION, access_mode="PUBLIC")
    print("CS4 hub:", pid(ro.identifier))

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
        print("  file:", name, "->", role.rsplit("/", 1)[-1])
        time.sleep(3)

    for n, member in enumerate(MEMBERS, start=1):
        resource = retry(rohub.ros_add_external_resource, ro.identifier, res_type="Paper",
                         input_url=member, title=f"Publication {n} in this hub")
        annotate(ro.identifier, [(SCHEMA + "additionalType", CCA + "Member")],
                 resource=resource.identifier)
        print("  member:", member)
        time.sleep(3)


if __name__ == "__main__":
    main()
