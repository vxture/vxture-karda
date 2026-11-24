// Self-contained browser UI. Source text is always rendered with textContent.
const NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);
const words = { project: "\u9879\u76ee", document: "\u6587\u6863", section: "\u7ae0\u8282", missing: "Top5 \u672a\u547d\u4e2d", hit: "Top5 \u5df2\u547d\u4e2d", unknown: "\u672a\u77e5\u9898\uff1a\u5019\u9009\u4e0d\u7b49\u4e8e\u53ef\u4f5c\u7b54", source: "\u6253\u5f00\u539f\u516c\u544a\u6216\u9644\u4ef6", pending: "\u672a\u4eba\u5de5\u88c1\u51b3" };
const sources = [...DATA.sources].sort((a, b) => a.projectFamilyId.localeCompare(b.projectFamilyId) || a.publishedOn.localeCompare(b.publishedOn) || a.id.localeCompare(b.id));
const families = [...new Set(sources.map(s => s.projectFamilyId))];
const nodes = [], edges = [], sourceMap = new Map(sources.map(s => [s.id, s]));
let selectedId = "", selectedCase = DATA.cases[0], view = { x: 0, y: 0, w: 1440, h: 850 };
function svg(tag, attrs, text) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); if (text !== undefined) el.textContent = text; return el; }
function button(text, action, className = "evidence-button") { const el = document.createElement("button"); el.textContent = text; el.className = className; el.addEventListener("click", action); return el; }
for (const family of families) {
  const indexes = sources.map((s, i) => s.projectFamilyId === family ? i : -1).filter(i => i >= 0);
  const x = 160 + indexes.reduce((a, b) => a + b, 0) / indexes.length * 270;
  nodes.push({ id: family, kind: "project", family, label: sourceMap.get(sources[indexes[0]].id).projectNumber, x, y: 80 });
  const option = document.createElement("option"); option.value = family; option.textContent = sources[indexes[0]].projectNumber; $("project-filter").append(option);
}
sources.forEach((s, i) => {
  const x = 160 + i * 270;
  nodes.push({ id: s.id, kind: "document", family: s.projectFamilyId, sourceId: s.id, label: s.title, subtitle: s.publishedOn + " / " + s.kind, x, y: 220 });
  edges.push([s.projectFamilyId, s.id]);
  s.sections.forEach((p, j) => { const id = JSON.stringify([s.id, p.id]);
    nodes.push({ id, kind: "section", family: s.projectFamilyId, sourceId: s.id, section: p, label: p.label, subtitle: p.id, x, y: 350 + j * 76 }); edges.push([s.id, id]);
  });
});
const byId = new Map(nodes.map(n => [n.id, n]));
$("summary").textContent = families.length + " " + words.project + " / " + sources.length + " " + words.document + " / " + nodes.filter(n => n.kind === "section").length + " " + words.section;
$("provenance").textContent = "Corpus SHA256: " + DATA.corpusSha256 + "\nDataset SHA256: " + DATA.datasetSha256 + "\n" + DATA.cases.length + " drafts / " + words.pending;
for (const c of DATA.cases) { const option = document.createElement("option"); option.value = c.id; option.textContent = c.id + " / " + c.question; $("case-select").append(option); }
function focusCase() {
  $("question").textContent = selectedCase.question; $("answer").textContent = selectedCase.expectedAnswer ?? words.unknown;
  const row = DATA.results.find(r => r.id === selectedCase.id), expected = selectedCase.evidence;
  $("case-status").textContent = expected.length ? "Top5: " + row.hitCount + "/" + row.expectedEvidence + " / " + words.pending : words.unknown;
  $("supports").replaceChildren();
  for (const e of expected) { const id = JSON.stringify([e.sourceId, e.sectionId]), hit = row.retrieved.includes(id);
    $("supports").append(button((hit ? words.hit : words.missing) + " / " + sourceMap.get(e.sourceId).title + " / " + e.sectionId, () => choose(id), "evidence-button" + (hit ? "" : " missing")));
  }
}
function choose(id) {
  selectedId = id; const n = byId.get(id); if (!n) return;
  $("detail-title").textContent = n.label; $("detail-links").replaceChildren(); $("excerpt").hidden = true;
  const s = sourceMap.get(n.sourceId);
  if (s) {
    $("detail-meta").textContent = s.edition + "\n" + s.id;
    const a = document.createElement("a"); a.textContent = words.source; a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer"; $("detail-links").append(a);
    if (n.section) { $("excerpt").textContent = s.text.slice(n.section.start, n.section.end); $("excerpt").hidden = false;
      $("detail-meta").textContent += " / UTF-16 [" + n.section.start + ", " + n.section.end + ")";
    } else for (const p of s.sections) $("detail-links").append(button(p.label, () => choose(JSON.stringify([s.id, p.id]))));
  } else { $("detail-meta").textContent = n.family; for (const d of sources.filter(s => s.projectFamilyId === n.family)) $("detail-links").append(button(d.title, () => choose(d.id))); }
  $("selection-status").textContent = words[n.kind] + ": " + n.label; draw();
}
function draw() {
  const focusedId = document.activeElement?.closest("[data-node]")?.getAttribute("data-node");
  const family = $("project-filter").value, q = $("search").value.trim().toLocaleLowerCase();
  const allowedSections = nodes.filter(n => n.kind === "section" && (!family || n.family === family) && (!q || (sourceMap.get(n.sourceId).title + n.label + sourceMap.get(n.sourceId).text.slice(n.section.start, n.section.end)).toLocaleLowerCase().includes(q)));
  const visible = new Set(allowedSections.flatMap(n => [n.id, n.sourceId, n.family]));
  const expected = new Set(selectedCase.evidence.map(e => JSON.stringify([e.sourceId, e.sectionId]))), row = DATA.results.find(r => r.id === selectedCase.id);
  const graph = $("graph"); graph.replaceChildren();
  for (const [a, b] of edges) if (visible.has(a) && visible.has(b)) {
    const from = byId.get(a), to = byId.get(b);
    graph.append(svg("path", { d: `M ${from.x} ${from.y + 25} C ${from.x} ${from.y + 85}, ${to.x} ${to.y - 85}, ${to.x} ${to.y - 25}`, class: "edge" + (expected.has(b) ? " active" : "") }));
  }
  for (const n of nodes.filter(n => visible.has(n.id))) {
    const g = svg("g", { class: "node " + n.kind + (expected.has(n.id) ? " expected" + (!row.retrieved.includes(n.id) ? " missing" : "") : "") + (selectedId === n.id ? " selected" : ""), transform: `translate(${n.x},${n.y})`, role: "button", tabindex: "0", "aria-label": words[n.kind] + ": " + n.label, "aria-pressed": selectedId === n.id, "data-node": n.id });
    g.append(svg("rect", { x: -115, y: -27, width: 230, height: 54, rx: 10 }), svg("title", {}, n.label), svg("text", { x: -101, y: -2 }, [...n.label].slice(0, 16).join("") + ([...n.label].length > 16 ? "..." : "")), svg("text", { x: -101, y: 17, class: "sub" }, n.subtitle ?? words.project));
    g.addEventListener("click", () => choose(n.id));
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(n.id); } }); graph.append(g);
  }
  $("empty").hidden = visible.size > 0;
  $("graph-status").textContent = visible.size + " \u4e2a\u8282\u70b9 / \u62d6\u62fd\u7a7a\u767d\u5904\u5e73\u79fb / Tab + Enter \u67e5\u770b\u8bc1\u636e";
  applyView();
  if (focusedId) [...graph.querySelectorAll("[data-node]")].find(el => el.getAttribute("data-node") === focusedId)?.focus();
}
function applyView() { $("graph").setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`); }
function zoom(factor) { const w = Math.max(360, Math.min(2880, view.w * factor)), h = w * 850 / 1440; view = { x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h }; applyView(); }
$("zoom-in").addEventListener("click", () => zoom(.8)); $("zoom-out").addEventListener("click", () => zoom(1.25));
$("fit").addEventListener("click", () => { view = { x: 0, y: 0, w: 1440, h: 850 }; applyView(); });
$("case-select").addEventListener("change", () => { selectedCase = DATA.cases.find(c => c.id === $("case-select").value); $("project-filter").value = ""; $("search").value = ""; focusCase(); draw(); });
$("search").addEventListener("input", draw); $("project-filter").addEventListener("change", draw);
let drag = null;
$("graph").addEventListener("pointerdown", e => { if (e.target.closest("[data-node]")) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; $("graph").setPointerCapture(e.pointerId); });
$("graph").addEventListener("pointermove", e => { if (!drag) return; const box = $("graph").getBoundingClientRect(), scale = Math.min(box.width / view.w, box.height / view.h); view.x = drag.vx - (e.clientX - drag.x) / scale; view.y = drag.vy - (e.clientY - drag.y) / scale; applyView(); });
$("graph").addEventListener("pointerup", () => { drag = null; }); $("graph").addEventListener("pointercancel", () => { drag = null; });
focusCase(); draw();
