"""Turning a dashboard FDO into the two pages of the example site."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .reader import read_dashboard, read_json, read_nanopub_label, read_object

CCA = "https://w3id.org/ro/terms/cca/"
VIEW_LABELS = {
    CCA + "MapView": "Map",
    CCA + "VariablesView": "Variables",
    CCA + "ClaimsView": "Claims",
    CCA + "TableView": "Table",
    CCA + "FigureView": "Figure",
}
#: viewer that draws a Zarr store in the browser (FAIR2Adapt / Plan4All deployment)
VIEWER = "https://f2a.plan4all.eu/#"


def short(iri: str | None) -> str:
    return (iri or "").rstrip("/").rsplit("/", 1)[-1]


@dataclass
class Panel:
    number: int
    kind: str
    renderer: str | None
    settings: dict[str, str]

    @property
    def label(self) -> str:
        return VIEW_LABELS.get(self.kind, short(self.kind) or "Panel")


@dataclass
class Dataset:
    pid: str
    name: str = ""
    description: str = ""
    licence: str | None = None
    parts: list[dict] = field(default_factory=list)
    stac: dict | None = None
    claims: list[dict] = field(default_factory=list)

    @property
    def stac_url(self) -> str | None:
        return next((p["url"] for p in self.parts if p.get("media_type") == "application/geo+json"), None)

    @property
    def store_url(self) -> str | None:
        return next((p["url"] for p in self.parts if p.get("media_type") == "application/vnd+zarr"), None)

    @property
    def bands(self) -> list[str]:
        props = (self.stac or {}).get("properties", {})
        return [b.get("name") for b in props.get("bands", []) if b.get("name")]

    @property
    def lineage(self) -> str | None:
        return (self.stac or {}).get("properties", {}).get("processing:lineage")


@dataclass
class Dashboard:
    pid: str
    fields: dict
    panels: list[Panel]
    dataset: Dataset | None

    @property
    def name(self) -> str:
        return self.fields.get("title") or "Dashboard"

    @property
    def colour(self) -> str:
        return "#" + (self.fields.get("primary_color") or "1d6886")

    @property
    def accepts(self) -> str | None:
        return self.fields.get("accepts")

    @property
    def crate_url(self) -> str:
        return f"https://api.rohub.org/api/ros/{self.pid.rsplit('/', 1)[-1]}/crate/download/"


RO_PID = re.compile(r"^https://w3id\.org/ro-id/[0-9a-f-]{36}$")


def _input_resource(fields: dict) -> str | None:
    """The dataset a dashboard is bound to, as a resource of the dashboard itself.

    A resource marked ``cca:InputDataset`` wins. Failing that, any resource that is
    another Research Object counts as the input: ROHub's interface lets someone add or
    replace a resource but not annotate it, so a dashboard must still work when the
    dataset was swapped there by hand.
    """
    parts = fields.get("_parts", [])
    for part in parts:
        if (part.get("role") or "").endswith("InputDataset"):
            return part.get("url")
    for part in parts:
        if RO_PID.match(part.get("url") or ""):
            return part.get("url")
    return None


def build(pid: str, cache: Path, refresh: bool = False) -> Dashboard:
    fields = read_dashboard(pid, cache, refresh)

    panels = []
    for n in (1, 2, 3, 4, 5):
        kind = fields.get(f"panel{n}")
        if not kind:
            continue
        settings = {k.split("_", 1)[1]: v for k, v in fields.items()
                    if k.startswith(f"panel{n}_") and not k.endswith("_renderer") and v}
        panels.append(Panel(n, kind, fields.get(f"panel{n}_renderer"), settings))

    dataset = None
    shown = _input_resource(fields) or fields.get("shows")
    if shown:
        described = read_object(shown, cache, refresh)
        dataset = Dataset(
            pid=shown,
            name=described.get("name", ""),
            description=described.get("description", ""),
            licence=described.get("license"),
            parts=[p for p in described.get("parts", []) if p.get("url")],
        )
        if dataset.stac_url:
            dataset.stac = read_json(dataset.stac_url)
        for part in dataset.parts:
            if "/np/" in (part.get("url") or ""):
                dataset.claims.append({"url": part["url"],
                                       "label": read_nanopub_label(part["url"]) or part.get("name")})

    return Dashboard(pid=pid, fields=fields, panels=panels, dataset=dataset)
