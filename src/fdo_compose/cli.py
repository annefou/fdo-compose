"""Command line: build the two pages of a dashboard FAIR Digital Object.

    fdo-compose https://w3id.org/ro-id/<uuid> -o site
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .render import render
from .site import build


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="fdo-compose", description=__doc__)
    parser.add_argument("pid", help="PID of the dashboard FDO in ROHub")
    parser.add_argument("-o", "--out", type=Path, default=Path("site"), help="output folder")
    parser.add_argument("--cache", type=Path, default=Path(".fdo-cache"),
                        help="recorded folder holding the crates, so a build can be repeated offline")
    parser.add_argument("--refresh", action="store_true", help="fetch the crates again")
    args = parser.parse_args(argv)

    dashboard = build(args.pid, args.cache, refresh=args.refresh)
    written = render(dashboard, args.out)
    print(f"{dashboard.name}: {len(dashboard.panels)} panels"
          f"{', bound to ' + dashboard.dataset.pid if dashboard.dataset else ', template (no dataset)'}")
    for path in written:
        print(" ", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
