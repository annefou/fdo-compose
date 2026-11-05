"""Create the CS4-shaped example: a hub whose pages are described by the object.

This mirrors the Portugal adaptation hub WP4 designed (fdo-knowledge-dashboard,
config/portugal-dashboard.yaml): the same three publication FDOs, but the site is
not configured in a repository — it is the Research Object created here. Its pages,
their panels and its style are annotations; its members are resources, so a curator
adds a publication to the hub by adding a resource in ROHub.

    python scripts/create_cs4_site.py
"""

from __future__ import annotations

import time

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

PROFILE = "https://w3id.org/ro/terms/cca/dashboard-profile/0.1"

MEMBERS = [
    "https://w3id.org/ro-id/c594948e-cf4f-44ce-b96e-097e6ba5cd8e",
    "https://w3id.org/ro-id/10f2756e-a221-4754-8b90-d088ab4409e5",
    "https://w3id.org/ro-id/1bffc87b-d080-41ec-96b5-5f46ecbd76db",
]

TITLE = "Portugal adaptation knowledge hub (FAIR2Adapt CS4, composed from FDOs)"
DESCRIPTION = (
    "A hub for climate adaptation knowledge in Portugal, described entirely by this object: "
    "the pages, the panels on each page and the look are annotations, and the publications it "
    "lists are its resources. It carries the same three publication FAIR Digital Objects as the "
    "CS4 prototype, so that the two can be compared: there, the site is configured in a "
    "repository; here, a curator changes the hub by changing this object in ROHub."
)

COMPOSITION = [
    (SCHEMA + "additionalType", CCA + "Dashboard"),
    ("http://purl.org/dc/terms/conformsTo", PROFILE),
    (CCA + "accepts", CCA + "Publication"),
    (CCA + "primaryColorHex", "286d32"),          # the green of the CS4 design
    (CCA + "accentColorHex", "1dc690"),

    (CCA + "page1", CCA + "OverviewPage"),
    (CCA + "page1Title", "Your guide to climate adaptation in Portugal"),
    (CCA + "page1Panel1", CCA + "TextView"),
    (CCA + "page1Panel2", CCA + "StatsView"),
    (CCA + "page1Panel2Stats", "datasets,claims,resources"),
    (CCA + "page1Panel3", CCA + "LinksView"),

    (CCA + "page2", CCA + "CollectionPage"),
    (CCA + "page2Title", "Publications in this hub"),
    (CCA + "page2Panel1", CCA + "MembersView"),

    (CCA + "page3", CCA + "DetailsPage"),
    (CCA + "page3Title", "About this hub"),
    (CCA + "page3Panel1", CCA + "MetadataView"),
]


def main() -> None:
    login()
    ro = rohub.ros_create(title=TITLE, research_areas=["Earth Sciences"],
                          description=DESCRIPTION, access_mode="PUBLIC")
    print("CS4 hub:", pid(ro.identifier))

    annotate(ro.identifier, COMPOSITION)
    print("  wrote", len(COMPOSITION), "statements")

    for n, member in enumerate(MEMBERS, start=1):
        resource = retry(rohub.ros_add_external_resource, ro.identifier, res_type="Paper",
                         input_url=member, title=f"Publication {n} in this hub")
        annotate(ro.identifier, [(SCHEMA + "additionalType", CCA + "Member")],
                 resource=resource.identifier)
        print("  member:", member)
        time.sleep(3)


if __name__ == "__main__":
    main()
