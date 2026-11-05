"""Create a Data FDO in ROHub for a geospatial dataset described by STAC.

The dataset is a FAIR Digital Object in its own right: the STAC item and the
data store are resources of the Research Object, each with the properties a
reader needs, and the object says what kind of dataset it is. A dashboard never
points at a data URL; it points at this PID.

    python scripts/create_dataset_fdo.py

Created with it: https://w3id.org/ro-id/8b5d51c7-f33d-47e9-9aaf-c9b624b43ef4
(Sentinel-3 Synergy radiances on HEALPix, GRID4EARTH).
"""

from __future__ import annotations

import time

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

COLLECTION = "https://stac-api.grid4earth.eu/collections/reprocessed-sentinel-3-synergy"
ITEM = COLLECTION + "/items/reprocessed-synergy_20260915T101708_psf_level15"
ZARR = ("https://data.grid4earth.eu/reprocessed/sentinel-3-synergy/"
        "synergy_20260915T101708_psf_level15.zarr")

TITLE = "Sentinel-3 Synergy radiances on HEALPix (GRID4EARTH, reprocessed)"
DESCRIPTION = (
    "Data FAIR Digital Object for one Sentinel-3 Synergy overpass reprocessed onto HEALPix "
    "(level 15) by GRID4EARTH, served as a Zarr v3 store and described by a STAC item. "
    "Created to test dashboard composition from FAIR Digital Objects in FAIR2Adapt."
)

RESOURCES = [
    (ITEM, "STAC item (describes the dataset)", [
        (SCHEMA + "encodingFormat", "application/geo+json"),
        ("http://purl.org/dc/terms/conformsTo", "https://api.stacspec.org/v1.0.0/core"),
    ]),
    (ZARR, "Zarr v3 store on HEALPix (the data)", [
        (SCHEMA + "encodingFormat", "application/vnd+zarr"),
        (CCA + "spatialStructure", "discrete global grid (HEALPix)"),
        ("http://purl.org/dc/terms/conformsTo",
         "https://github.com/zarr-conventions/dggs/blob/v1/README.md"),
    ]),
]


def main() -> None:
    login()
    ro = rohub.ros_create(title=TITLE, research_areas=["Earth Sciences"],
                          description=DESCRIPTION, access_mode="PUBLIC")
    print("Data FDO:", pid(ro.identifier))

    for url, title, props in RESOURCES:
        resource = retry(rohub.ros_add_external_resource, ro.identifier,
                         res_type="Dataset", input_url=url, title=title)
        annotate(ro.identifier, props, resource=resource.identifier)
        print("  resource:", resource.identifier, "|", title)
        time.sleep(3)

    annotate(ro.identifier, [(SCHEMA + "additionalType", CCA + "GeospatialDataset")])
    print("  typed as", CCA + "GeospatialDataset")


if __name__ == "__main__":
    main()
