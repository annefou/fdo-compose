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

const escapeHtml = (text) => String(text)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * ROHub descriptions are written in Markdown. This renders the part of it that appears
 * there - headings, emphasis, code, links and lists - after escaping the text, so nothing
 * a record states can inject markup.
 */
function markdown(text) {
  const inline = (line) => escapeHtml(line)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const html = [];
  let list = false;
  const closeList = () => { if (list) { html.push("</ul>"); list = false; } };

  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (!list) { html.push("<ul>"); list = true; }
      html.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("");
}

/** The same text with the Markdown taken out, for a one-line summary. */
const plain = (text) => String(text || "")
  .replace(/^#{1,6}\s+/gm, "").replace(/[*_`]/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
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

/** ROHub takes several seconds to generate a crate, so one visit reads each object once. */
function remember(pid, crate) {
  try {
    sessionStorage.setItem("crate:" + pid, JSON.stringify({ at: Date.now(), crate }));
  } catch { /* a full or disabled store simply means no memory */ }
}

function remembered(pid) {
  try {
    const kept = JSON.parse(sessionStorage.getItem("crate:" + pid) || "null");
    if (kept && Date.now() - kept.at < 30 * 60 * 1000) return kept.crate;
  } catch { /* unreadable store */ }
  return null;
}

async function crateOf(pid) {
  const match = RO_PID.exec(pid.trim());
  if (!match) throw new Error(`not a ROHub PID: ${pid}`);
  let crate = remembered(pid);
  if (!crate) {
    const response = await fetch(CRATE(match[1]));
    if (!response.ok) throw new Error(`ROHub returned ${response.status} for ${pid}`);
    crate = await response.json();
    remember(pid, crate);
  }
  const graph = crate["@graph"] || [];
  const root = graph.find((e) => e["@id"] === "./") || {};
  return { pid, root, graph };
}

/**
 * The resources of an object. ROHub puts files inside folders, which are themselves parts
 * of the crate, so this walks hasPart and keeps the leaves: the folders are the structure,
 * the files are what a dashboard can show.
 */
function resources({ root, graph }) {
  const byId = new Map(graph.map((e) => [e["@id"], e]));
  const found = [];
  const seen = new Set();

  const walk = (id, depth) => {
    if (depth > 4 || seen.has(id)) return;
    seen.add(id);
    const entity = byId.get(id);
    if (!entity) return;
    const children = term(entity, SCHEMA + "hasPart");
    if (children.length) {
      children.forEach((child) => walk(child, depth + 1));
      return;                       // a folder is structure, not a resource to show
    }
    found.push({
      id,
      name: entity.name || id,
      url: one(entity, SCHEMA + "contentUrl") || id,
      mediaType: one(entity, SCHEMA + "encodingFormat"),
      role: one(entity, SCHEMA + "additionalType"),
    });
  };

  term(root, SCHEMA + "hasPart").forEach((id) => walk(id, 0));
  return found;
}

/** What the object says it is, and what it shows: the dashboard's own statements. */
function readObject(fetched) {
  const { pid, root } = fetched;
  const parts = resources(fetched);
  const type = term(root, SCHEMA + "additionalType").map(short);

  const pages = [];
  for (let n = 1; n <= 9; n += 1) {
    const kind = one(root, `${CCA}page${n}`);
    if (!kind || kind.endsWith("Hidden")) continue;   // a later annotation can withdraw a page
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
    accepts: one(root, CCA + "accepts"),
    colour: one(root, CCA + "primaryColorHex"),
    //: dashboard FDOs offered for the members of this collection; each says what it accepts
    memberDashboards: term(root, CCA + "memberDashboard"),
    //: a dashboard this object asks to be shown with, whatever collection it is opened from
    ownDashboard: one(root, CCA + "dashboard"),

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

const KIND_ICONS = {
  Publications: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3 3v10h-8z" fill="none" stroke="currentColor"/><path d="M9 1.5v3h3M5.5 8h5M5.5 10.5h5" fill="none" stroke="currentColor"/></svg>',
  Datasets: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor"/></svg>',
  Workflows: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="5" height="3.5" fill="none" stroke="currentColor"/><rect x="9.5" y="9.5" width="5" height="3.5" fill="none" stroke="currentColor"/><path d="M6.5 4.3h4c.8 0 1.5.7 1.5 1.5v3.7" fill="none" stroke="currentColor"/></svg>',
  Dashboards: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" fill="none" stroke="currentColor"/><path d="M6 14h4M8 11.5V14" fill="none" stroke="currentColor"/></svg>',
};

function kindIcon(object) {
  const kind = kindOf(object);
  const svg = KIND_ICONS[kind];
  return svg
    ? el("span", { class: "kindicon", title: kind.replace(/s$/, ""), html: svg })
    : null;
}

function kindOf(object) {
  const names = [...object.type, ...(object.roTypes || [])].map((t) => short(String(t).split("#").pop()));
  const match = names.find((n) => TYPE_LABELS[n]);
  return TYPE_LABELS[match] || "Other objects";
}

/**
 * The record of a nanopublication, wherever a crate points at it. A
 * w3id.org/sciencelive/np/<id> address serves the platform's web page rather than the
 * record, so the record is read from w3id.org/np/<id>; both name the same nanopublication.
 */
const recordUri = (uri) => uri.replace(/^https:\/\/w3id\.org\/[a-z0-9-]+\/np\//, "https://w3id.org/np/");

/** The sentence a nanopublication states, with who signed it and when. */
async function readNanopub(uri) {
  try {
    const trig = await fetch(recordUri(uri), { headers: { Accept: "application/trig" } }).then((r) => r.text());
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
/** Does this object carry a look of its own? */
function hasBrand(object) {
  return Boolean(fileFor(object, "Theme", /^theme\.json$/i)
    || fileFor(object, "Logo", /^logo\.(png|jpe?g|svg|webp)$/i)
    || fileFor(object, "BackgroundImage", /^background\.(png|jpe?g|webp)$/i));
}

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
  let label = PANEL_LABELS[panel.kind] ?? panel.kind;
  if (label && currentPage && label.toLowerCase() === currentPage.title.toLowerCase()) label = "";
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
    // A dashboard bound to one dataset maps that one; a collection maps the datasets it
    // holds, and lets the reader choose between them.
    let dataset = object.dataset || object;
    if (!dataset.storeUrl && !RO_PID.test(dataset.pid || "")) dataset = object;
    if (!object.dataset && object.members.length) {
      const members = await readMembers(object);
      const mappable = members.filter((m) => m.storeUrl || m.iadopt?.length);
      if (!mappable.length) return note("None of the objects in this collection carries data a map can draw.");
      dataset = mappable[mapChoice] || mappable[0];
      if (mappable.length > 1) {
        const chooser = el("select", { class: "chooser" },
          mappable.map((m, i) => el("option", { value: String(i), ...(i === mapChoice ? { selected: "selected" } : {}) }, m.name)));
        chooser.addEventListener("change", () => {
          mapChoice = Number(chooser.value);
          openPage(currentPage.title);
        });
        section.append(el("p", {}, el("label", {}, "Dataset: "), chooser));
      }
    }
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
        el("li", {}, kindIcon(m), objectLink(m.pid, m.name, object.pid),
          m.description ? el("div", { class: "muted" }, m.description.slice(0, 180)) : null))));
      return;
    }
    const list = el("ul", { class: "members" });
    for (const member of object.members) {
      const item = el("li", {}, objectLink(member, member, object.pid));
      list.append(item);
      objectOf(member).then((described) => {
        item.replaceChildren(...[
          kindIcon(described),
          objectLink(member, described.name, object.pid),
          described.description ? el("div", { class: "muted" }, plain(described.description).slice(0, 180) + "…") : null,
        ].filter(Boolean));
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
    const image = fileFor(object.brand || object, "BackgroundImage", /^background\.(png|jpe?g|webp)$/i);
    if (image) {
      section.style.backgroundImage =
        `linear-gradient(to right, rgba(255,255,255,.92) 0%, rgba(255,255,255,.75) 45%, rgba(255,255,255,.25) 100%), url("${image.url}")`;
    }
    // The words are the object's own: its title and its description. Nothing here is
    // written in an annotation, and nothing is written in this viewer.
    section.append(el("h2", { class: "hero-title" }, object.name));
    if (object.description) section.append(el("p", { class: "hero-lead" }, plain(object.description)));
  } else if (panel.kind === "NoticeView") {
    // The text of a notice is a file in the object (notice.md), so a curator can change it.
    const file = fileFor(object.brand || object, "Notice", /^notice\.(md|txt)$/i);
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
    section.append(el("div", { class: "prose", html: markdown(text) }));
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
    ["Accepts", object.accepts ? el("code", {}, short(object.accepts)) : null],
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

/** The kind of thing an object is, in the profile's terms. */
function acceptsOf(object) {
  if (object.storeUrl || object.iadopt?.length) return CCA + "GeospatialDataset";
  if (kindOf(object) === "Publications") return CCA + "Publication";
  if (kindOf(object) === "Datasets") return CCA + "Dataset";
  return null;
}

/**
 * The composition an object is shown with: one it names itself, else one the collection
 * offers for objects of its kind - each candidate dashboard states what it accepts, so a
 * paper and a geospatial dataset in the same hub are shown differently.
 */
async function dashboardFor(object, from) {
  if (object.ownDashboard) {
    const own = await objectOf(object.ownDashboard).catch(() => null);
    if (own?.pages.length) return own;
  }
  if (!from) return null;
  const parent = await objectOf(from).catch(() => null);   // in flight since show() started
  const candidates = await Promise.all((parent?.memberDashboards || [])
    .map((pid) => objectOf(pid).catch(() => null)));
  const usable = candidates.filter((c) => c?.pages.length);
  const wanted = acceptsOf(object);
  return usable.find((c) => c.accepts && wanted && c.accepts.endsWith(short(wanted)))
    || usable.find((c) => !c.accepts)
    || null;
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

  // The collection this object was opened from is fetched at the same time, not after it.
  const fromEarly = wantedFrom();
  const parentPromise = fromEarly
    ? objectOf(fromEarly)
        .then((parent) => {
          // warm the compositions it offers, so choosing one costs no extra round trip
          (parent?.memberDashboards || []).forEach((pid) => objectOf(pid).catch(() => null));
          return parent;
        })
        .catch(() => null)
    : null;

  let object;
  try {
    object = readObject(await crateOf(pid));
  } catch (error) {
    main.replaceChildren(card("This object could not be read", el("p", {}, String(error.message))));
    return;
  }
  // A member opened from a collection stays inside that collection's site: it keeps the
  // hub's look unless it carries a brand of its own.
  const parent = parentPromise ? await parentPromise : null;
  const brand = hasBrand(object) ? object : (parent && hasBrand(parent) ? parent : object);
  object.brand = brand;
  const theme = await readTheme(brand);
  applyTheme(theme, brand);
  if (theme.colormap) object.themeColormap = theme.colormap;
  document.getElementById("title").textContent = object.name;
  document.getElementById("source").replaceChildren(link(object.pid, "source object in ROHub"));

  // The way back, when this object was opened from another one
  const from = wantedFrom();
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
  // A member opened from a collection is shown the way that collection says its members
  // are shown; failing that, the way this viewer shows an object of its kind.
  let pages = object.pages;
  if (!pages.length) {
    const template = await dashboardFor(object, from);
    if (template?.pages.length) {
      pages = template.pages;
      object.dataset = object;              // the member is what those pages show
    }
  }
  if (!pages.length) pages = defaultPages(object);

  // The description is the lead only when no page shows it: a member takes its pages from
  // a template, so this can only be decided once the pages are known.
  const shown = pages.some((page) => page.panels.some((panel) =>
    panel.kind === "TextView" || panel.kind === "HeroView"));
  if (object.description && !shown) {
    main.append(el("div", { class: "lead", html: markdown(object.description) }));
  }

  currentObject = object;
  currentPages = pages;
  pages.forEach((page, index) => {
    const anchor = el("a", { href: "#", class: index === 0 ? "on" : "" }, page.title);
    anchor.addEventListener("click", (event) => { event.preventDefault(); openPage(page.title); });
    nav.append(anchor);
  });
  drawPage(pages[0], object);

  readFooter(brand).then((lines) => { brand.footerLines = lines; renderFooter(brand); });
  renderFooter(brand);

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
let mapChoice = 0;
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
const wantedFrom = () => new URLSearchParams(location.search).get("from");
window.addEventListener("popstate", () => show(wanted()));
show(wanted());
