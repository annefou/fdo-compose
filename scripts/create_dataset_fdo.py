"""Create a Data FDO in ROHub for a geospatial dataset described by STAC.

The dataset is a FAIR Digital Object in its own right: the STAC item and the
data store are resources of the Research Object, each with the properties a
reader needs, and the object says what kind of dataset it is. A dashboard never
points at a data URL; it points at this PID.

    python scripts/create_dataset_fdo.py sentinel-3-synergy
    python scripts/create_dataset_fdo.py sentinel-2-l2a

Created with it:
  https://w3id.org/ro-id/8b5d51c7-f33d-47e9-9aaf-c9b624b43ef4  (Sentinel-3 Synergy)
"""

from __future__ import annotations

import sys
import time

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

STAC = "https://stac-api.grid4earth.eu/collections"
DGGS_CONVENTION = "https://github.com/zarr-conventions/dggs/blob/v1/README.md"

DATASETS = {
    "sentinel-3-synergy": {
        "title": "Sentinel-3 Synergy radiances on HEALPix (GRID4EARTH, reprocessed)",
        "description": (
            "Data FAIR Digital Object for one Sentinel-3 Synergy overpass reprocessed onto HEALPix "
            "(level 15) by GRID4EARTH, served as a Zarr v3 store and described by a STAC item. "
            "Created to test dashboard composition from FAIR Digital Objects in FAIR2Adapt."),
        "item": (f"{STAC}/reprocessed-sentinel-3-synergy/items/"
                 "reprocessed-synergy_20260915T101708_psf_level15"),
        "store": ("https://data.grid4earth.eu/reprocessed/sentinel-3-synergy/"
                  "synergy_20260915T101708_psf_level15.zarr"),
    },
    "sentinel-2-l2a": {
        "title": "Sentinel-2 Level-2A surface reflectances on HEALPix (GRID4EARTH, converted)",
        "description": (
            "Data FAIR Digital Object for one Sentinel-2 Level-2A tile converted to HEALPix tiles "
            "(multi-resolution) by GRID4EARTH, served as a Zarr v3 store and described by a STAC item. "
            "Created to test dashboard composition from FAIR Digital Objects in FAIR2Adapt."),
        "item": (f"{STAC}/converted-healpix-tiled-sentinel-2-l2a-multires/items/"
                 "converted-healpix-tiled-S2B_MSIL2A_20260812T104619_R051_O49269_L7_C10943_mean-l20-l12-hcc"),
        "store": ("https://data.grid4earth.eu/converted-healpix-tiled/sentinel-2-l2a-multires/"
                  "mean-l20-l12-hcc/S2B_MSIL2A_20260812T104619_R051_O49269_L7_C10943.zarr"),
    },
}


def main() -> None:
    key = sys.argv[1] if len(sys.argv) > 1 else "sentinel-3-synergy"
    if key not in DATASETS:
        raise SystemExit(f"unknown dataset {key!r}; one of {', '.join(DATASETS)}")
    spec = DATASETS[key]

    login()
    ro = rohub.ros_create(title=spec["title"], research_areas=["Earth Sciences"],
                          description=spec["description"], access_mode="PUBLIC")
    print("Data FDO:", pid(ro.identifier))

    resources = [
        (spec["item"], "STAC item (describes the dataset)", [
            (SCHEMA + "encodingFormat", "application/geo+json"),
            ("http://purl.org/dc/terms/conformsTo", "https://api.stacspec.org/v1.0.0/core"),
        ]),
        (spec["store"], "Zarr v3 store on HEALPix (the data)", [
            (SCHEMA + "encodingFormat", "application/vnd+zarr"),
            (CCA + "spatialStructure", "discrete global grid (HEALPix)"),
            ("http://purl.org/dc/terms/conformsTo", DGGS_CONVENTION),
        ]),
    ]
    for url, title, props in resources:
        resource = retry(rohub.ros_add_external_resource, ro.identifier,
                         res_type="Dataset", input_url=url, title=title)
        annotate(ro.identifier, props, resource=resource.identifier)
        print("  resource:", resource.identifier, "|", title)
        time.sleep(3)

    annotate(ro.identifier, [
        (SCHEMA + "additionalType", CCA + "GeospatialDataset"),
        ("http://purl.org/dc/terms/conformsTo", "https://w3id.org/ro/terms/cca/dashboard-profile/0.1"),
    ])
    print("  typed as", CCA + "GeospatialDataset")


if __name__ == "__main__":
    main()
