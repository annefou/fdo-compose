# fdo-compose

Render a **dashboard FAIR Digital Object** as a web page.

The dashboard is an object in ROHub, not a configuration file in this repository: its panels,
their order, the renderer each one asks for, its style and the dataset it shows are annotations
on the Research Object. `fdo-compose` reads them with
[fdo-consume](https://github.com/FAIR2Adapt/fdo-consume) and writes two pages:

1. **the FAIR Digital Object** — what the dashboard says about itself, every value traced to the crate;
2. **the dashboard it describes** — the same composition actually drawn.

Live example (FAIR2Adapt, experimental):

| Object | PID |
| --- | --- |
| Dataset FDO (Sentinel-3 Synergy on HEALPix, GRID4EARTH) | `https://w3id.org/ro-id/8b5d51c7-f33d-47e9-9aaf-c9b624b43ef4` |
| Dashboard template (no dataset: says what it accepts) | `https://w3id.org/ro-id/e57645d9-6754-40cd-ae58-9739d65667c1` |
| Dashboard instance (fork of the template, bound to the dataset) | `https://w3id.org/ro-id/0391206f-3399-458f-b6b8-f6048c36c5b5` |

## Build

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install git+https://github.com/annefou/fdo-consume.git@cca-dashboard-profile
pip install -e .
fdo-compose https://w3id.org/ro-id/0391206f-3399-458f-b6b8-f6048c36c5b5 -o site --refresh
```

`--refresh` fetches the crates from ROHub; without it the build repeats offline from `.fdo-cache`,
which holds each crate exactly as ROHub generated it.

## How a dashboard is written in ROHub

A dashboard is data, so it is written as a spec rather than as code. Two tools do the work,
and the gotchas are documented in `scripts/_rohub.py`:

| Tool | What it does |
| --- | --- |
| `scripts/publish.py <spec.yaml>` | create an object in ROHub from a spec, or update the one the spec names (`--dry-run` first) |
| `scripts/fork.py <uuid> <spec.yaml>` | fork an object, drop the brand it inherited, write the new one |

A spec says the title and description, the annotations that compose the object, the files it
carries and the objects it points at; `cca:` and `schema:` prefixes are expanded. `examples/`
holds the spec of every dashboard listed above, and `examples/brand/` their words and colours.
The images belong to other projects, so they are fetched rather than committed:
`examples/brand/fetch-images.sh`.

Re-running a spec updates the object: ROHub keeps the newest value of a property. It cannot
remove one, so a statement is withdrawn by stating a newer value (`cca:page4 = cca:Hidden`).

A ROHub annotation is a flat `{property, value}` pair on the Research Object or one of its
resources. It cannot carry a nested entity, so a panel is written as numbered predicates
(`cca:panel1`, `cca:panel1Renderer`, `cca:panel1Colormap`) rather than as a panel entity with its
own fields. Lifting that limit is the main request to ROHub; everything else here works today.

`profiles/cca-dashboard-0.1.yaml` is the profile map that reads those terms. It also lives in
[annefou/fdo-consume](https://github.com/annefou/fdo-consume/tree/cca-dashboard-profile), ready
for a pull request to FAIR2Adapt once the terms are agreed. The profile IRI it selects on,
`https://w3id.org/ro/terms/cca/dashboard-profile/0.1`, is a draft and is **not published yet**.

## Status

Experimental, built for the FAIR2Adapt discussion on composing dashboards from FDOs
(WP2 profile, WP4 dashboards). The renderers are deliberately thin: the map panel embeds the
existing FAIR2Adapt viewer, the variables panel reads the STAC item, the claims panel is empty
until nanopublications cite the dataset PID.
