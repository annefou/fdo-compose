"""Fork a hub in ROHub, rebrand it and give it a different collection.

The point of the exercise: a second hub that shares nothing with the first except the
template it was forked from. Its look is different because its files are different, its
collection mixes publications with datasets, and no code was touched.

    python scripts/fork_hub.py <hub-uuid> <folder-with-the-new-brand> "<new title>" <member-pid> ...

Resources copied by the fork that the new brand replaces (theme, logo, background, the old
members) are removed first, so the fork states one thing, not two.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import requests
import rohub
from rohub import settings
from _rohub import CCA, SCHEMA, annotate, login, pid, retry

BRAND = {"theme.json": CCA + "Theme", "logo.png": CCA + "Logo",
         "background.png": CCA + "BackgroundImage"}
# A fork inherits every resource. The brand of the parent must go, or the new hub shows
# the old one's logos; the members stay, and new ones are added beside them.
REPLACED = ("theme.json", "logo.png", "background.png", "partner-", "notice.md", "footer.md")


def headers() -> dict:
    return {"Authorization": f"{settings.TOKEN_TYPE.capitalize()} {settings.ACCESS_TOKEN}"}


def resources(ro_id: str) -> list[dict]:
    url = settings.API_URL + f"ros/{ro_id}/resources/?size=100"
    return requests.get(url, headers=headers(), timeout=60).json().get("results", [])


def main() -> None:
    if len(sys.argv) < 5:
        raise SystemExit(__doc__)
    source, folder, title = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    members = sys.argv[4:]

    login()
    fork = rohub.ros_fork(source, title=title,
                          description=("A hub forked from " + pid(source) + " and rebranded: the same "
                                       "composition, different files, and a collection that mixes "
                                       "publications with datasets. Nothing in the viewer changed."))
    fork_id = fork if isinstance(fork, str) else fork.identifier
    print("fork:", pid(fork_id))
    time.sleep(5)

    for resource in resources(fork_id):
        name = (resource.get("name") or "").lower()
        if any(word in name for word in REPLACED):
            rohub.resource_delete(resource["identifier"])
            print("  removed:", resource.get("name"))
            time.sleep(2)

    for name, role in BRAND.items():
        path = folder / name
        if not path.exists():
            continue
        resource = retry(rohub.ros_add_internal_resource, fork_id, res_type="Other",
                         file_path=str(path), title=name)
        annotate(fork_id, [(SCHEMA + "additionalType", role)], resource=resource.identifier)
        print("  file:", name)
        time.sleep(3)

    for n, member in enumerate(members, start=1):
        resource = retry(rohub.ros_add_external_resource, fork_id, res_type="Dataset",
                         input_url=member, title=f"Member {n} of this hub")
        annotate(fork_id, [(SCHEMA + "additionalType", CCA + "Member")], resource=resource.identifier)
        print("  member:", member)
        time.sleep(3)


if __name__ == "__main__":
    main()
