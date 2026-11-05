"""Create a dashboard template FDO in ROHub: annotations only, no resources.

The template says how to display a *kind* of object, not which object. Binding
it to a dataset is a separate step (bind_dashboard.py), so one template serves
every dataset of that kind.

Everything a machine reads is an annotation on the Research Object, so it is
visible in ROHub without downloading anything. Panels are numbered predicates
(``cca:panel1``, ``cca:panel2``) because a ROHub annotation is a flat
property/value pair: it cannot create a panel entity with its own fields. That
limitation is what we are asking ROHub to lift; until then, numbering keeps the
order explicit and readable.

    python scripts/create_dashboard_template.py
"""

from __future__ import annotations

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid

TITLE = "Dashboard template: geospatial dataset on HEALPix (FAIR2Adapt, experimental)"
DESCRIPTION = (
    "A dashboard FAIR Digital Object that says how to display a geospatial dataset FDO "
    "described by STAC, not which one: the panels, their order, the renderer each asks for "
    "and the style are annotations on this object. To use it, fork it and annotate the fork "
    "with schema:object = the PID of the dataset FDO."
)

# COLOUR: a value starting with '#' is read by ROHub as a relative IRI and comes back as
# http://w3id.org/ro-id/rohub/model#1d6886, so colours are written without the hash.
ANNOTATIONS = [
    (SCHEMA + "additionalType", CCA + "Dashboard"),
    (CCA + "accepts", CCA + "GeospatialDataset"),
    (CCA + "panel1", CCA + "MapView"),
    (CCA + "panel1Renderer", CCA + "plugin/healpix-map"),
    (CCA + "panel1Colormap", "thermal"),
    (CCA + "panel2", CCA + "VariablesView"),
    (CCA + "panel3", CCA + "ClaimsView"),
    (CCA + "primaryColorHex", "1d6886"),
]


def main() -> None:
    login()
    ro = rohub.ros_create(title=TITLE, research_areas=["Earth Sciences"],
                          description=DESCRIPTION, access_mode="PUBLIC")
    print("Dashboard template:", pid(ro.identifier))
    annotate(ro.identifier, ANNOTATIONS)
    for prop, value in ANNOTATIONS:
        print(f"  {prop.rsplit('/', 1)[-1]:<18} {value}")


if __name__ == "__main__":
    main()
