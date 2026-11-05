"""Attach claim nanopublications to a dataset FDO in ROHub.

A claim is an external resource of the Research Object, pointing at the
nanopublication, annotated so that a reader knows it is a claim about this
dataset rather than any other kind of link.

    python scripts/add_claims.py <dataset-uuid> <nanopub-uri> [<nanopub-uri> ...]
"""

from __future__ import annotations

import sys
import time

import rohub
from _rohub import CCA, SCHEMA, annotate, login, retry

NANOPUB_TYPE = "http://www.nanopub.org/nschema#Nanopublication"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    dataset, nanopubs = sys.argv[1], sys.argv[2:]

    login()
    for n, uri in enumerate(nanopubs, start=1):
        resource = retry(rohub.ros_add_external_resource, dataset, res_type="Other",
                         input_url=uri, title=f"Claim {n} (nanopublication)")
        annotate(dataset, [
            (SCHEMA + "additionalType", CCA + "Claim"),
            ("http://purl.org/dc/terms/conformsTo", NANOPUB_TYPE),
        ], resource=resource.identifier)
        print("claim:", resource.identifier, "->", uri)
        time.sleep(3)


if __name__ == "__main__":
    main()
