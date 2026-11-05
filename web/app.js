/**
 * Reads a FAIR Digital Object from ROHub and renders the dashboard it describes.
 *
 * Nothing is generated ahead of time: the page fetches the RO-Crate ROHub serves
 * for a PID, reads the dashboard terms from it and draws the pages. Change the
 * object in ROHub, reload, and the dashboard changes.
 *
 * The vocabulary is the draft dashboard profile (cca-dashboard-0.1), the same map
 * fdo-consume uses on the publishing side.
 */

const CCA = "https://w3id.org/ro/terms/cca/";
const SCHEMA = "https://schema.org/";
const CRATE = (uuid) => `https://api.rohub.org/api/ros/${uuid}/crate/download/`;
const VIEWER = "https://f2a.plan4all.eu/#";
const EMBED = "https://platform.sciencelive4all.org/embed/view?uri=";
const RO_PID = /^https:\/\/w3id\.org\/ro-id\/([0-9a-f-]{36})$/;

/** The viewer reads its settings after "::" in the hash. */
const VIEWER_SETTINGS = { colormap: "colormap", variable: "varname", invert: "invertcolormap",
                          min: "boundlow", max: "boundhigh", projection: "projection" };

function viewerUrl(store, settings = {}) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(settings)) {
    const key = VIEWER_SETTINGS[name.toLowerCase()];
    if (key && value) params.set(key, value);
  }
  const query = params.toString();
  return VIEWER + store + (query ? "::" + query : "");
}

const PANEL_LABELS = {
  HeroView: "",
  NoticeView: "",
  AskView: "",
  TopicsView: "Explore resources by topic",
  CategoriesView: "Browse our resources",
  PartnersView: "",
  TextView: "About",
  StatsView: "In numbers",
  LinksView: "Where to go next",
  EmbedView: "Service",
  MapView: "Map",
  VariablesView: "Variables",
  ClaimsView: "Claims",
  MembersView: "In this collection",
  MetadataView: "About this object",
  ResourcesView: "Files and links",
};

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
};

const short = (iri) => (iri || "").replace(/\/$/, "").split("/").pop();
const idOf = (value) => (value && typeof value === "object" ? value["@id"] : value);
const asList = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/** Every value an entity states for a term, whether the crate compacted the key or not. */
function term(entity, iri) {
  const compact = iri.startsWith(SCHEMA) ? iri.slice(SCHEMA.length) : null;
  const values = [...asList(entity[iri]), ...(compact ? asList(entity[compact]) : [])];
  return values.map(idOf).filter((v) => v !== undefined && v !== null);
}
/**
 * The value an object states for a term. ROHub annotations are append-only and a fork
 * inherits its parent's, so the way to change a statement is to add a newer one: the
 * last value wins. (Override semantics belong in the profile; this is the reading that
 * makes editing possible today.)
 */
const one = (entity, iri) => {
  const values = term(entity, iri);
  return values[values.length - 1];
};

const crates = new Map();

function objectOf(pid) {
  if (!crates.has(pid)) crates.set(pid, crateOf(pid).then(readObject));
  return crates.get(pid);
}

async function crateOf(pid) {
  const match = RO_PID.exec(pid.trim());
  if (!match) throw new Error(`not a ROHub PID: ${pid}`);
  const response = await fetch(CRATE(match[1]));
  if (!response.ok) throw new Error(`ROHub returned ${response.status} for ${pid}`);
  const crate = await response.json();
  const graph = crate["@graph"] || [];
  const root = graph.find((e) => e["@id"] === "./") || {};
  return { pid, root, graph };
}

/** The resources of an object, with the terms a dashboard cares about. */
function resources({ root, graph }) {
  const parts = new Set(term(root, SCHEMA + "hasPart"));
  return graph
    .filter((e) => parts.has(e["@id"]) && !asList(e["@type"]).includes("Dataset"))
    .map((e) => ({
      id: e["@id"],
      name: e.name || e["@id"],
      url: one(e, SCHEMA + "contentUrl") || e["@id"],
      mediaType: one(e, SCHEMA + "encodingFormat"),
      role: one(e, SCHEMA + "additionalType"),
    }));
}

/** What the object says it is, and what it shows: the dashboard's own statements. */
function readObject(fetched) {
  const { pid, root } = fetched;
  const parts = resources(fetched);
  const type = term(root, SCHEMA + "additionalType").map(short);

  const pages = [];
  for (let n = 1; n <= 9; n += 1) {
    const kind = one(root, `${CCA}page${n}`);
    if (!kind) continue;
    pages.push({
      kind: short(kind),
      title: one(root, `${CCA}page${n}Title`) || PANEL_LABELS[short(kind)] || short(kind),
      panels: panelsOf(root, `page${n}`),
    });
  }
  const loose = panelsOf(root, "");
  if (!pages.length && loose.length) pages.push({ kind: "Page", title: "Dashboard", panels: loose });

  const marked = parts.find((p) => (p.role || "").endsWith("InputDataset"))?.url;
  const members = parts.filter((p) => RO_PID.test(p.url) && !(p.role || "").endsWith("Member"));
  // A dashboard bound to one object: the marked resource, what the root states, or - so that a
  // swap made by hand in ROHub still works - a single Research Object among the resources.
  const input = marked || one(root, SCHEMA + "object") || (members.length === 1 ? members[0].url : null);

  const iadopt = fetched.graph
    .filter((e) => asList(e["@type"]).some((t) => String(t).includes("iadopt/ont/Variable")))
    .map((e) => ({
      iri: (e["@id"] || "").replace(/^https:\/\/ror\.org\//, ""),
      label: e["rdfs:label"] || e.label || e.name,
    }))
    .filter((v) => v.label);

  const subjects = fetched.graph
    .filter((e) => {
      const types = asList(e["@type"]).map(String);
      return types.some((t) => t.endsWith("DefinedTerm") || t.endsWith("#FieldOfResearch"));
    })
    .map((e) => e.name).filter(Boolean);

  const keywords = [...asList(root.keywords), ...asList(root["https://schema.org/keywords"])]
    .flatMap((k) => String(idOf(k) || "").split(/\s*[,;]\s*/))
    .map((k) => k.trim()).filter((k) => k && k.length < 40);

  return {
    pid,
    iadopt,
    keywords: [...new Set([...keywords, ...subjects])],
    roTypes: asList(root["@type"]).map((t) => String(t)),
    name: root.name || pid,
    description: root.description || "",
    licence: idOf(root.license),
    profile: idOf(root.conformsTo) || one(root, "http://purl.org/dc/terms/conformsTo"),
    type,
    accepts: short(one(root, CCA + "accepts")),
    colour: one(root, CCA + "primaryColorHex"),

    members: parts.filter((p) => RO_PID.test(p.url) && p.url !== marked).map((p) => p.url),
    claims: parts.filter((p) => p.url.includes("/np/")).map((p) => p.url),
    stacUrl: parts.find((p) => p.mediaType === "application/geo+json")?.url,
    storeUrl: parts.find((p) => p.mediaType === "application/vnd+zarr")?.url,
    parts,
    pages,
    input,
    isDashboard: type.includes("Dashboard"),
  };
}

function panelsOf(root, prefix) {
  const panels = [];
  for (let n = 1; n <= 9; n += 1) {
    const key = prefix ? `${prefix}Panel${n}` : `panel${n}`;
    const kind = one(root, CCA + key);
    if (!kind) continue;
    const settings = {};
    for (const [property, value] of Object.entries(root)) {
      const match = property.startsWith(CCA + key) && property !== CCA + key
        ? property.slice((CCA + key).length) : null;
      if (match && match !== "Renderer") settings[match[0].toLowerCase() + match.slice(1)] = idOf(value);
    }
    panels.push({ kind: short(kind), renderer: short(one(root, `${CCA}${key}Renderer`)), settings });
  }
  return panels;
}

/** Every member of a collection, read once and kept. */
async function readMembers(object) {
  if (!object.membersRead) {
    object.membersRead = Promise.all(object.members.map((pid) => objectOf(pid).catch(() => null)))
      .then((list) => list.filter(Boolean));
  }
  return object.membersRead;
}

/** The kind of object, by the last part of the type IRI the crate states. */
const TYPE_LABELS = {
  BibliographyResearchObject: "Publications",
  BibliographyCentricResearchObject: "Publications",
  Publication: "Publications",
  ExecutableResearchObject: "Workflows",
  GeospatialDataset: "Datasets",
  Dashboard: "Dashboards",
  ResearchObject: "Research objects",
};

function kindOf(object) {
  const names = [...object.type, ...(object.roTypes || [])].map((t) => short(String(t).split("#").pop()));
  const match = names.find((n) => TYPE_LABELS[n]);
  return TYPE_LABELS[match] || "Other objects";
}

/** The sentence a nanopublication states, with who signed it and when. */
async function readNanopub(uri) {
  try {
    const trig = await fetch(uri, { headers: { Accept: "application/trig" } }).then((r) => r.text());
    const label = /rdfs:label\s+"((?:[^"\\]|\\.)*)"/.exec(trig);
    const name = /foaf:name\s+"((?:[^"\\]|\\.)*)"/.exec(trig);
    const date = /dct:created\s+"([0-9-]{10})/.exec(trig);
    const text = label ? label[1].replace(/^AIDA sentence:\s*/, "") : null;
    return { text, author: name ? name[1] : null, date: date ? date[1] : null };
  } catch {
    return {};
  }
}

/**
 * The look of a dashboard: a theme.json resource if the object has one, else the
 * annotations on the object. The file exists because ROHub lets a user add or replace
 * a resource in its interface, but not edit an annotation.
 */
function fileFor(object, role, pattern) {
  return object.parts.find((p) => (p.role || "").endsWith(role) || pattern.test(p.name || ""));
}

async function readTheme(object) {
  const file = fileFor(object, "Theme", /theme\.json$/i);
  if (file) {
    try {
      const theme = await fetch(file.url).then((r) => r.json());
      if (theme && typeof theme === "object") return theme;
    } catch { /* a theme that cannot be read is simply not applied */ }
  }
  return object.colour ? { primaryColor: "#" + object.colour } : {};
}

function applyTheme(theme, object) {
  const root = document.documentElement.style;
  if (theme.primaryColor) root.setProperty("--primary", theme.primaryColor);
  if (theme.accentColor) root.setProperty("--accent", theme.accentColor);
  if (theme.backgroundColor) root.setProperty("--bg", theme.backgroundColor);
  if (theme.fontFamily) root.setProperty("--sans", theme.fontFamily);

  // The brand is made of files: a user replaces them in ROHub, nothing else changes.
  const header = document.querySelector(".bar");
  const logo = fileFor(object, "Logo", /^logo\.(png|jpe?g|svg|webp)$/i);
  const slot = document.getElementById("logo");
  slot.replaceChildren();
  if (logo) slot.append(el("img", { src: logo.url, alt: "" }));
  const background = fileFor(object, "BackgroundImage", /^background\.(png|jpe?g|webp)$/i);
  header.style.backgroundImage = background
    ? `linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.6)), url("${background.url}")`
    : "";
  header.style.backgroundSize = background ? "cover" : "";
  header.style.backgroundPosition = background ? "center" : "";
}

// --- rendering ---------------------------------------------------------------

function card(title, ...body) {
  return el("section", { class: "card" }, title ? el("h2", {}, title) : null, ...body);
}

function definitions(pairs) {
  const list = el("dl", { class: "meta" });
  for (const [key, value] of pairs) {
    if (value === undefined || value === null || value === "") continue;
    list.append(el("dt", {}, key), el("dd", {}, value));
  }
  return list;
}

const link = (href, text) => el("a", { href, target: "_blank", rel: "noreferrer" }, text || href);
/** A link to another object, keeping the trail back to the one we came from. */
const objectLink = (pid, text, from) => el("a", {
  href: `?fdo=${encodeURIComponent(pid)}` + (from ? `&from=${encodeURIComponent(from)}` : ""),
}, text || pid);

async function renderPanel(panel, object, into) {
  const label = PANEL_LABELS[panel.kind] ?? panel.kind;
  const section = card(label);
  into.append(section);
  if (object.datasetPromise && !object.dataset) {
    section.append(el("p", { class: "muted" }, "reading the dataset…"));
    await object.datasetPromise;
    section.replaceChildren(el("h2", {}, label));
  }

  const settings = Object.entries(panel.settings)
    .map(([k, v]) => `${k} = ${v}`).join(" · ");
  const note = (text) => section.append(el("p", { class: "muted" }, text));

  if (panel.kind === "MapView") {
    const dataset = object.dataset || object;
    // The viewer opens a Research Object PID directly, which is better than handing it a
    // store URL: it reads the crate itself, so the variables keep their names and units.
    const target = RO_PID.test(dataset.pid) ? dataset.pid : dataset.storeUrl;
    if (!target) return note("The object this panel points at has no data to draw.");
    const withTheme = { colormap: object.themeColormap, ...panel.settings };
    const url = viewerUrl(target, withTheme);
    section.append(el("iframe", { class: "map", src: url, title: `Map of ${dataset.name}` }));
    note(`renderer: ${panel.renderer || "any"}${settings ? " · " + settings : ""} — the settings travel to the viewer in the URL`);
    section.append(el("p", { class: "muted" }, link(url, "open the map in its own tab")));
  } else if (panel.kind === "VariablesView") {
    const dataset = object.dataset || object;
    if (dataset.iadopt?.length) {
      section.append(el("ul", { class: "vars" }, dataset.iadopt.map((v) =>
        el("li", {}, link(v.iri, v.label)))));
      return note("Each variable is an I-ADOPT decomposition published as a nanopublication: what is measured, of what, in what. A panel binds to these, not to the array name, so the same dashboard works on another city's data.");
    }
    if (!dataset.stacUrl) return note("The object this panel points at describes no variables.");
    const stac = await fetch(dataset.stacUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const bands = (stac?.properties?.bands || []).map((b) => b.name).filter(Boolean);
    if (!bands.length) return note("The STAC item lists no bands.");
    section.append(el("ul", { class: "cols" }, bands.map((b) => el("li", {}, el("code", {}, b)))));
    note("Read live from the STAC item the dataset points at. These are band names: this dataset carries no I-ADOPT decomposition, so a panel can only bind by name.");
  } else if (panel.kind === "ClaimsView") {
    const dataset = object.dataset || object;
    if (!dataset.claims.length) return note("No nanopublication is linked to this dataset yet.");
    for (const uri of dataset.claims) {
      const item = el("article", { class: "claim" }, el("p", { class: "muted" }, "reading the nanopublication…"));
      section.append(item);
      readNanopub(uri).then((np) => {
        item.replaceChildren(
          el("p", { class: "claim-text" }, np.text || "(this nanopublication states no sentence)"),
          el("p", { class: "muted" },
            np.author ? `${np.author}` : "",
            np.author && np.date ? " · " : "",
            np.date || "",
            " · ", link(uri, "the nanopublication"),
            " · ", link(EMBED + encodeURIComponent(uri), "full record in Science Live")));
      });
    }
    note("Each claim is a nanopublication the dataset links to; the text is read from the nanopublication itself.");
  } else if (panel.kind === "MembersView") {
    if (!object.members.length) return note("This object lists no members.");
    if (activeTopic || searchText) {
      const members = await readMembers(object);
      const keep = members.filter((m) =>
        (!activeTopic || (m.keywords || []).includes(activeTopic)) &&
        (!searchText || `${m.name} ${m.description} ${(m.keywords || []).join(" ")}`
          .toLowerCase().includes(searchText)));
      section.append(el("p", { class: "filter" },
        activeTopic ? `Topic: ${activeTopic} ` : `Search: ${searchText} `,
        el("button", { class: "clear", type: "button" }, "show all")));
      section.querySelector(".clear").addEventListener("click", () => {
        activeTopic = null;
        searchText = "";
        openPage(currentPage.title);
      });
      section.append(el("ul", { class: "members" }, keep.map((m) =>
        el("li", {}, objectLink(m.pid, m.name, object.pid),
          m.description ? el("div", { class: "muted" }, m.description.slice(0, 180)) : null))));
      return;
    }
    const list = el("ul", { class: "members" });
    for (const member of object.members) {
      const item = el("li", {}, objectLink(member, member, object.pid));
      list.append(item);
      objectOf(member).then((described) => {
        item.replaceChildren(objectLink(member, described.name, object.pid),
          described.description
            ? el("div", { class: "muted" }, described.description.slice(0, 180))
            : null);
      }).catch(() => {});
    }
    section.append(list);
    note("Each member is a FAIR Digital Object of its own; opening one renders it with the page kind that fits it.");
  } else if (panel.kind === "MetadataView") {
    const dataset = object.dataset || object;
    section.append(definitions([
      ["PID", link(dataset.pid)],
      ["Licence", dataset.licence || "not stated"],
      ["Resources", el("span", {}, dataset.parts.map((p) => el("div", {}, link(p.url, p.name),
        p.mediaType ? el("span", { class: "muted" }, ` ${p.mediaType}`) : null)))],
    ]));
  } else if (panel.kind === "HeroView") {
    section.classList.add("hero");
    const image = fileFor(object, "BackgroundImage", /^background\.(png|jpe?g|webp)$/i);
    if (image) {
      section.style.backgroundImage =
        `linear-gradient(to right, rgba(255,255,255,.92) 0%, rgba(255,255,255,.75) 45%, rgba(255,255,255,.25) 100%), url("${image.url}")`;
    }
    // The words are the object's own: its title and its description. Nothing here is
    // written in an annotation, and nothing is written in this viewer.
    section.append(el("h2", { class: "hero-title" }, object.name));
    if (object.description) section.append(el("p", { class: "hero-lead" }, object.description));
  } else if (panel.kind === "NoticeView") {
    // The text of a notice is a file in the object (notice.md), so a curator can change it.
    const file = fileFor(object, "Notice", /^notice\.(md|txt)$/i);
    if (!file) return section.remove();
    const text = await fetch(file.url).then((r) => r.text()).catch(() => "");
    if (!text.trim()) return section.remove();
    section.classList.add("notice");
    section.replaceChildren(el("p", {}, text.trim()));
  } else if (panel.kind === "AskView") {
    section.append(el("div", { class: "ask" },
      el("input", { type: "text", placeholder: "Search these resources…", id: "ask" })));
    const input = section.querySelector("#ask");
    input.addEventListener("input", () => {
      searchText = input.value.trim().toLowerCase();
      const collection = currentPages.find((p) => p.panels.some((x) => x.kind === "MembersView"));
      if (searchText && collection && collection.title !== currentPage.title) openPage(collection.title);
    });
    note("Searches the titles, descriptions and topics of the objects in this collection. No question-answering service is connected to this object.");
  } else if (panel.kind === "TopicsView") {
    const members = await readMembers(object);
    const counts = new Map();
    members.forEach((m) => (m.keywords || []).forEach((k) =>
      counts.set(k, (counts.get(k) || 0) + 1)));
    if (!counts.size) {
      return note("None of the objects in this collection states a keyword, so there is nothing to explore by topic yet.");
    }
    const sorted = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
    section.append(el("div", { class: "facets" }, sorted.map(([topic, n]) =>
      el("button", { class: "facet", type: "button", "data-topic": topic },
        el("strong", {}, topic), el("span", { class: "muted" }, `${n} ${n === 1 ? "object" : "objects"}`)))));
    section.querySelectorAll(".facet").forEach((button) => button.addEventListener("click", () => {
      activeTopic = activeTopic === button.dataset.topic ? null : button.dataset.topic;
      const collection = currentPages.find((p) => p.panels.some((x) => x.kind === "MembersView"));
      if (collection) openPage(collection.title);
    }));
  } else if (panel.kind === "CategoriesView") {
    const members = await readMembers(object);
    const counts = new Map();
    members.forEach((m) => {
      const label = kindOf(m);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    section.append(el("div", { class: "facets" }, [...counts].map(([label, n]) =>
      el("div", { class: "facet count" }, el("span", { class: "stat-value" }, String(n)), el("strong", {}, label)))));
    note(`${members.length} ${members.length === 1 ? "object" : "objects"} in all, counted from what each record states.`);
  } else if (panel.kind === "PartnersView") {
    const logos = object.parts.filter((p) => (p.role || "").endsWith("Partner"));
    if (!logos.length) return note("This object names no partners.");
    section.classList.add("partners");
    section.append(el("div", { class: "logos" }, logos.map((p) =>
      el("img", { src: p.url, alt: p.name, title: p.name }))));
  } else if (panel.kind === "ResourcesView") {
    const dataset = object.dataset || object;
    if (!dataset.parts.length) return note("This object has no resources.");
    section.append(el("ul", { class: "members" }, dataset.parts.map((p) =>
      el("li", {}, link(p.url, p.name), p.mediaType ? el("span", { class: "muted" }, ` ${p.mediaType}`) : null))));
  } else if (panel.kind === "TextView") {
    const text = panel.settings.text || object.description;
    if (!text) return note("This object states no description.");
    section.append(el("p", { class: "prose" }, text));
  } else if (panel.kind === "StatsView") {
    const dataset = object.dataset || object;
    const available = {
      datasets: [object.members.length || (object.input ? 1 : 0), "datasets"],
      variables: [dataset.iadopt?.length || dataset.bandCount || 0, "variables"],
      claims: [dataset.claims.length, "claims"],
      resources: [dataset.parts.length, "resources"],
      panels: [object.pages.reduce((n, page) => n + page.panels.length, 0), "panels"],
    };
    const wanted = (panel.settings.stats || "datasets,variables,claims,resources")
      .split(",").map((k) => k.trim()).filter((k) => k in available);
    section.append(el("div", { class: "stats" }, wanted.map((key) => {
      const [value, label] = available[key];
      return el("div", { class: "stat" }, el("span", { class: "stat-value" }, String(value)),
        el("span", { class: "stat-label" }, label));
    })));
    note("Counted from the object and the dataset it shows, each time the page is opened.");
  } else if (panel.kind === "LinksView") {
    const others = object.pages.filter((page) => page.title !== currentPage?.title);
    if (!others.length) return note("This dashboard has only one page.");
    section.append(el("div", { class: "cards" }, others.map((page) =>
      el("button", { class: "gocard", type: "button", "data-page": page.title },
        el("strong", {}, page.title),
        el("span", { class: "muted" }, page.panels.map((p) => PANEL_LABELS[p.kind] || p.kind).join(" · "))))));
    section.querySelectorAll(".gocard").forEach((button) => {
      button.addEventListener("click", () => openPage(button.dataset.page));
    });
  } else if (panel.kind === "EmbedView") {
    const url = panel.settings.url || object.parts.find((p) => (p.role || "").endsWith("Embed"))?.url;
    if (!url) return note("This panel names no service to embed.");
    section.append(el("iframe", { class: "service", src: url, title: panel.settings.title || "Embedded service" }));
    note(el("span", {}, "Embedded service: ", link(url)));
  } else {
    note(`This viewer has no renderer for ${panel.kind}.`);
  }
}

function describeObject(object) {
  const rows = [
    ["PID", link(object.pid)],
    ["Type", object.type.map((t) => el("code", {}, t))],
    ["Profile", object.profile ? el("code", {}, object.profile) : null],
    ["Accepts", object.accepts ? el("code", {}, object.accepts) : null],
    ["Licence", object.licence],
    ["Crate", link(CRATE(RO_PID.exec(object.pid)[1]), "the RO-Crate ROHub serves")],
  ];
  if (object.input) rows.push(["Shows", objectLink(object.input, object.dataset?.name || object.input)]);
  return card("What this object says", definitions(rows));
}

function compositionTable(object) {
  const table = el("table", { class: "panels" },
    el("thead", {}, el("tr", {}, el("th", {}, "Page"), el("th", {}, "Panel"),
      el("th", {}, "Renderer"), el("th", {}, "Settings"))));
  const body = el("tbody");
  object.pages.forEach((page) => {
    page.panels.forEach((panel, index) => {
      body.append(el("tr", {},
        el("td", {}, index === 0 ? page.title : ""),
        el("td", {}, el("code", {}, panel.kind)),
        el("td", {}, panel.renderer ? el("code", {}, panel.renderer) : "any"),
        el("td", {}, Object.entries(panel.settings).map(([k, v]) => el("code", {}, `${k} = ${v}`)))));
    });
  });
  table.append(body);
  return card("The composition it declares", table,
    el("p", { class: "muted" }, "Every row is an annotation on the Research Object in ROHub. Change one there and reload this page."));
}

/** What to show for an object that describes no pages of its own. */
function defaultPages(object) {
  const panel = (kind) => ({ kind, settings: {} });
  const geospatial = object.storeUrl || object.iadopt?.length;
  if (geospatial) {
    return [
      { title: "Overview", panels: [panel("TextView"), panel("StatsView"), panel("ClaimsView"), panel("LinksView")] },
      { title: "Explore the data", panels: [panel("MapView"), panel("VariablesView")] },
      { title: "About the dataset", panels: [panel("MetadataView"), panel("ResourcesView")] },
    ];
  }
  return [
    { title: "About", panels: [panel("TextView"), panel("MetadataView")] },
    { title: "Files and links", panels: [panel("ResourcesView")] },
    { title: "Claims", panels: [panel("ClaimsView")] },
  ];
}

/**
 * The footer of any dashboard: short statements the object makes about itself
 * (cca:footerStatement1..n, "Heading — text") and the partner logos it carries.
 */
async function readFooter(object) {
  const file = fileFor(object, "Footer", /^footer\.(md|txt)$/i);
  if (!file) return [];
  const text = await fetch(file.url).then((r) => r.text()).catch(() => "");
  return text.split("\n").map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

function renderFooter(object) {
  const slot = document.getElementById("footer-extra");
  slot.replaceChildren();

  const statements = (object.footerLines || []).map(String);
  if (statements.length) {
    slot.append(el("div", { class: "trust" }, statements.map((statement) => {
      const [heading, ...rest] = statement.split("—");
      return el("div", { class: "trust-item" },
        el("strong", {}, heading.trim()),
        rest.length ? el("span", { class: "muted" }, rest.join("—").trim()) : null);
    })));
  }

  const logos = object.parts.filter((p) => (p.role || "").endsWith("Partner"));
  if (logos.length) {
    slot.append(el("div", { class: "partners" },
      el("span", { class: "muted" }, "In collaboration with"),
      el("div", { class: "logos" }, logos.map((p) => el("img", { src: p.url, alt: p.name, title: p.name })))));
  }
}

async function show(pid) {
  const main = document.getElementById("main");
  const nav = document.getElementById("pages");
  main.replaceChildren(el("p", { class: "muted" }, "Reading " + pid + " from ROHub…"));
  nav.replaceChildren();

  let object;
  try {
    object = readObject(await crateOf(pid));
  } catch (error) {
    main.replaceChildren(card("This object could not be read", el("p", {}, String(error.message))));
    return;
  }
  const theme = await readTheme(object);
  applyTheme(theme, object);
  if (theme.colormap) object.themeColormap = theme.colormap;
  document.getElementById("title").textContent = object.name;
  document.getElementById("source").replaceChildren(link(object.pid, "source object in ROHub"));

  // The way back, when this object was opened from another one
  const from = new URLSearchParams(location.search).get("from");
  const trail = document.getElementById("trail");
  trail.replaceChildren();
  if (from) {
    const back = objectLink(from, "← back");
    trail.append(back);
    objectOf(from).then((parent) => back.replaceChildren(`← ${parent.name}`)).catch(() => {});
  }
  document.title = object.name;

  // The dataset is fetched in the background: the pages appear at once and each panel
  // waits only for what it needs.
  if (object.input) {
    object.datasetPromise = objectOf(object.input)
      .then((dataset) => { object.dataset = dataset; return dataset; })
      .catch(() => null);
  }

  main.replaceChildren();
  const pagesSay = (object.pages.length ? object.pages : []).some((page) =>
    page.panels.some((panel) => panel.kind === "TextView"));
  if (object.description && !pagesSay) main.append(el("p", { class: "lead" }, object.description));

  const pages = object.pages.length ? object.pages : defaultPages(object);

  currentObject = object;
  currentPages = pages;
  pages.forEach((page, index) => {
    const anchor = el("a", { href: "#", class: index === 0 ? "on" : "" }, page.title);
    anchor.addEventListener("click", (event) => { event.preventDefault(); openPage(page.title); });
    nav.append(anchor);
  });
  drawPage(pages[0], object);

  readFooter(object).then((lines) => { object.footerLines = lines; renderFooter(object); });
  renderFooter(object);

  const details = el("details", { class: "howto" }, el("summary", {}, "How this page is described"));
  details.append(el("p", { class: "muted" },
    "This viewer holds no configuration for any dashboard. It reads the RO-Crate that ROHub serves for the object " +
    "below and draws the pages, panels, settings and data that the annotations on that object state; change the " +
    "object in ROHub and reload. The terms it reads are those the draft profile map cca-dashboard-0.1 declares, " +
    "which fdo-consume uses on the publishing side."));
  details.append(describeObject(object));
  if (object.pages.length) details.append(compositionTable(object));
  document.getElementById("after").replaceChildren(details);
}

let activeTopic = null;
let searchText = "";
let currentObject = null;
let currentPages = [];
let currentPage = null;

function openPage(title) {
  const page = currentPages.find((p) => p.title === title) || currentPages[0];
  [...document.getElementById("pages").children].forEach((child) =>
    child.classList.toggle("on", child.textContent === page.title));
  window.scrollTo({ top: 0, behavior: "smooth" });
  drawPage(page, currentObject);
}

async function drawPage(page, object) {
  currentPage = page;
  const body = document.getElementById("page");
  body.replaceChildren(el("h2", { class: "pagetitle" }, page.title));
  await Promise.all(page.panels.map((panel) => renderPanel(panel, object, body)));
}

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "nanopub-embed-resize") return;
  document.querySelectorAll("figure.np iframe").forEach((frame) => {
    if (frame.contentWindow === event.source) frame.style.height = `${event.data.height}px`;
  });
});

const DEFAULT_PID = "https://w3id.org/ro-id/87e3dd69-0907-488f-9304-6280de312c78";
const wanted = () => new URLSearchParams(location.search).get("fdo") || DEFAULT_PID;
window.addEventListener("popstate", () => show(wanted()));
show(wanted());
