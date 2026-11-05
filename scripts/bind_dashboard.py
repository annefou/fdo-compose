"""Bind a dashboard template to one dataset: fork it in ROHub and say what it shows.

The fork is the dashboard a user opens. Its only difference from the template is
one annotation, ``schema:object`` = the PID of the Data FDO, plus whatever the
user changes afterwards (a colour, a colormap). Nothing is copied by hand and no
code changes: that is the point of the demonstration.

    python scripts/bind_dashboard.py <template-uuid> <dataset-pid> ["Title of the fork"]
"""

from __future__ import annotations

import sys

import rohub
from _rohub import CCA, SCHEMA, annotate, login, pid


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    template, dataset = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else None

    login()
    fork = rohub.ros_fork(template, title=title,
                          description=f"Dashboard bound to {dataset}. Forked from {pid(template)}.")
    fork_id = fork if isinstance(fork, str) else fork.identifier   # ros_fork returns the new identifier
    print("Dashboard instance:", pid(fork_id))

    annotate(fork_id, [(SCHEMA + "object", dataset)])
    print("  shows:", dataset)
    print("\nTo customise, annotate this fork further, for example:")
    print(f"  {CCA}colormap = viridis        (on the map panel resource)")
    print(f"  {CCA}primaryColorHex = be2e78  (on the fork itself; no '#', ROHub reads it as an IRI)")


if __name__ == "__main__":
    main()
