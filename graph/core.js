"use strict";

// 章節範囲から人物関係グラフ（SVG）を作る処理。DOM に依存しないので Node でも検証できる。

const PATTERN = /^\s*([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-(\d+)(?:\.(\d+))?)?\s*$/;

// 系図グループ。範囲が Matthew 1 / Luke 3 から始まらない場合は Jesus・Mary・Mary の配偶者以外を除外する
const GENEALOGY = "Genealogy of Jesus";
const GENEALOGY_KEEP = ["jesus_905", "mary_1938"];

const arr = (x) => (Array.isArray(x) ? x : []);

function parseRange(text) {
  const m = PATTERN.exec(text);
  if (!m) throw new Error("形式が不正です。例: Acts.16.11-18");
  const [, book, ch, v, a, b] = m;
  const start = { ch: +ch, v: v ? +v : 1 };
  let end;
  if (!v) end = { ch: +ch, v: Infinity };
  else if (a === undefined) end = { ch: +ch, v: +v };
  else if (b === undefined) end = { ch: +ch, v: +a };
  else end = { ch: +a, v: +b };
  return { book, start, end };
}

const cmp = (x, y) => x.ch - y.ch || x.v - y.v;
const indexBy = (rows, key) => new Map(rows.map((r) => [r[key], r]));

// data = { verses, people, places, events, groups }（people/places/events は Map 化済み）
function prepare(raw) {
  return {
    verses: raw.verses,
    people: indexBy(raw.people, "personLookup"),
    places: indexBy(raw.places, "placeLookup"),
    events: indexBy(raw.events, "eventID"),
    genealogy: new Set(arr((raw.groups.find((g) => g.groupName === GENEALOGY) || {}).members)),
  };
}

function selectVerses(data, text) {
  const { book, start, end } = parseRange(text);
  const verses = data.verses.filter((verse) => {
    const [b, ch, v] = verse.osisRef.split(".");
    if (b.toLowerCase() !== book.toLowerCase()) return false;
    const pos = { ch: +ch, v: +v };
    return cmp(pos, start) >= 0 && cmp(pos, end) <= 0;
  });
  if (!verses.length) throw new Error("該当する節がありません: " + text);
  const startsInGenealogy =
    (book.toLowerCase() === "matt" && start.ch === 1) || (book.toLowerCase() === "luke" && start.ch === 3);
  return { verses, startsInGenealogy };
}

function buildModel(data, text) {
  const { verses, startsInGenealogy } = selectVerses(data, text);

  // 系図の除外ルール
  const keepSet = new Set(GENEALOGY_KEEP);
  for (const k of GENEALOGY_KEEP) for (const p of arr((data.people.get(k) || {}).partners)) keepSet.add(p);
  const rangePeople = [];
  for (const v of verses) for (const k of arr(v.people)) if (!rangePeople.includes(k)) rangePeople.push(k);
  // 系図の人物は、範囲内の他の人物と家族関係（父母・子・配偶者・きょうだい）があるときだけ残す
  // （Acts の Adam / God のように無関係に名前だけ出てくる人物を除くため）
  const hasKin = (k) => {
    const p = data.people.get(k);
    return [...arr(p.father), ...arr(p.mother), ...arr(p.children), ...arr(p.partners), ...arr(p.siblings)]
      .some((x) => x !== k && rangePeople.includes(x));
  };
  const keep = (k) => data.people.has(k) && (startsInGenealogy || !data.genealogy.has(k) || keepSet.has(k) || hasKin(k));

  const nodes = new Map();   // personLookup -> node
  const add = (k, kind) => {
    if (!keep(k)) return false;
    if (!nodes.has(k)) {
      const p = data.people.get(k);
      nodes.set(k, { key: k, name: p.displayTitle || p.name, gender: p.gender,
        birthYear: p.birthYear, deathYear: p.deathYear, kind });
    }
    return true;
  };

  for (const k of rangePeople) add(k, "range");

  // 親（一次ソースの father / mother を優先）と、異父・異母きょうだいのもう一方の親
  const forcedPartners = [];
  for (const k of rangePeople) {
    if (!nodes.has(k)) continue;
    const p = data.people.get(k);
    for (const f of arr(p.father)) add(f, "parent");
    for (const m of arr(p.mother)) add(m, "parent");
    for (const [field, own, other] of [["halfSiblingsSameFather", "father", "mother"],
                                      ["halfSiblingsSameMother", "mother", "father"]]) {
      for (const h of arr(p[field])) {
        const half = data.people.get(h);
        if (!half) continue;
        for (const o of arr(half[other])) {
          if (arr(p[other]).includes(o) || !add(o, "parent")) continue;
          for (const c of arr(p[own])) if (nodes.has(c)) forcedPartners.push([c, o]);
        }
      }
    }
  }

  // 辺
  const edges = [];
  const seen = new Set();
  const addEdge = (a, b, type) => {
    const id = type === "parent" ? a + ">" + b : [a, b].sort().join("~") + type;
    if (a === b || seen.has(id)) return;
    seen.add(id);
    edges.push({ from: a, to: b, type });
  };
  for (const n of nodes.values()) {
    const p = data.people.get(n.key);
    for (const f of [...arr(p.father), ...arr(p.mother)]) if (nodes.has(f)) addEdge(f, n.key, "parent");
    for (const q of arr(p.partners)) if (nodes.has(q)) addEdge(n.key, q, "partner");
  }
  for (const [a, b] of forcedPartners) addEdge(a, b, "partner");
  const parentsOf = (k) => edges.filter((e) => e.type === "parent" && e.to === k).map((e) => e.from);
  for (const n of nodes.values()) {
    for (const s of arr(data.people.get(n.key).siblings)) {
      if (!nodes.has(s) || parentsOf(n.key).some((x) => parentsOf(s).includes(x))) continue;
      addEdge(n.key, s, "sibling");
    }
  }

  // 場所：出生地・没地は人物に付随
  const placeNodes = new Map();
  const placeEdges = [];
  const addPlace = (k) => {
    if (!placeNodes.has(k)) placeNodes.set(k, { key: k, name: data.places.get(k).displayTitle });
  };
  for (const n of nodes.values()) {
    const p = data.people.get(n.key);
    for (const [field, label] of [["birthPlace", "出生"], ["deathPlace", "没"]]) {
      for (const pl of arr(p[field])) if (data.places.has(pl)) { addPlace(pl); placeEdges.push({ person: n.key, place: pl, label }); }
    }
  }

  for (const n of nodes.values()) {
    n.places = ["出生", "没"].map((l) => {
      const ps = placeEdges.filter((e) => e.person === n.key && e.label === l).map((e) => data.places.get(e.place).displayTitle);
      return ps.length ? l + ": " + ps.join("/") : "";
    }).filter(Boolean).join("  ");
  }

  // 出来事：範囲内の節が属する event ごとに、その節の場所をまとめる
  const events = new Map();
  const inEvent = new Set();
  for (const v of verses) {
    for (const id of arr(v.event)) {
      const e = data.events.get(id);
      if (!e) continue;
      if (!events.has(id)) events.set(id, { id, title: e.title, verses: [], places: [] });
      const ev = events.get(id);
      ev.verses.push(v.osisRef);
      for (const pl of arr(v.places)) if (data.places.has(pl) && !ev.places.includes(pl)) { ev.places.push(pl); inEvent.add(pl); }
    }
  }
  const eventList = [...events.values()].map((e) => ({
    title: e.title,
    range: e.verses.length > 1 ? e.verses[0] + " – " + e.verses[e.verses.length - 1].split(".").slice(1).join(".") : e.verses[0],
    places: e.places.map((k) => data.places.get(k).displayTitle),
  }));
  const otherPlaces = [];
  for (const v of verses) for (const pl of arr(v.places)) {
    if (data.places.has(pl) && !inEvent.has(pl) && !otherPlaces.includes(pl)) otherPlaces.push(pl);
  }

  return { title: text.trim(), nodes: [...nodes.values()], edges, placeNodes: [...placeNodes.values()], placeEdges,
    events: eventList, otherPlaces: otherPlaces.map((k) => data.places.get(k).displayTitle) };
}

// ---- レイアウト（世代ごとの段組み） ----
const NODE_W = 190, NODE_H = 58, GAP_X = 24, GAP_Y = 80, MARGIN = 30;

function layout(model) {
  const { nodes, edges } = model;
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const gen = new Map(nodes.map((n) => [n.key, 0]));
  for (let i = 0; i < 30; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.type === "parent" && gen.get(e.to) < gen.get(e.from) + 1) { gen.set(e.to, gen.get(e.from) + 1); changed = true; }
      if (e.type === "partner") {
        const g = Math.max(gen.get(e.from), gen.get(e.to));
        if (gen.get(e.from) !== g || gen.get(e.to) !== g) { gen.set(e.from, g); gen.set(e.to, g); changed = true; }
      }
    }
    if (!changed) break;   // 親子の循環があっても 30 回で打ち切る
  }

  const rows = [];
  for (const n of nodes) if (connected.has(n.key)) (rows[gen.get(n.key)] = rows[gen.get(n.key)] || []).push(n);
  const pos = new Map();
  const partnersOf = (k) => edges.filter((e) => e.type === "partner" && (e.from === k || e.to === k)).map((e) => (e.from === k ? e.to : e.from));
  let y = MARGIN + 30;
  const xs = [];
  const placed = [];
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r]) continue;
    // 親の平均位置で並べ、配偶者は隣に寄せる
    const bary = (n) => {
      const ps = edges.filter((e) => e.type === "parent" && e.to === n.key && pos.has(e.from)).map((e) => pos.get(e.from).x);
      return ps.length ? ps.reduce((a, b) => a + b) / ps.length : Infinity;
    };
    const sorted = [...rows[r]].sort((a, b) => bary(a) - bary(b));
    const ordered = [];
    for (const n of sorted) {
      if (ordered.includes(n)) continue;
      ordered.push(n);
      for (const q of partnersOf(n.key)) { const m = sorted.find((s) => s.key === q); if (m && !ordered.includes(m)) ordered.push(m); }
    }
    ordered.forEach((n, i) => pos.set(n.key, { x: MARGIN + i * (NODE_W + GAP_X), y }));
    xs.push(ordered.length);
    placed.push(ordered);
    y += NODE_H + GAP_Y;
  }
  // 行ごとに中央揃え
  const maxCols = Math.max(1, ...xs, 1);
  const treeW = maxCols * (NODE_W + GAP_X) - GAP_X;
  placed.forEach((row) => {
    const shift = (treeW - (row.length * (NODE_W + GAP_X) - GAP_X)) / 2;
    row.forEach((n) => { pos.get(n.key).x += shift; });
  });

  // 関係を持たない人物は下にまとめて並べる
  const lone = nodes.filter((n) => !connected.has(n.key));
  const cols = Math.max(1, Math.min(6, Math.max(maxCols, 4)));
  const loneTop = y;
  lone.forEach((n, i) => pos.set(n.key, { x: MARGIN + (i % cols) * (NODE_W + GAP_X), y: loneTop + Math.floor(i / cols) * (NODE_H + 20) }));
  if (lone.length) y = loneTop + Math.ceil(lone.length / cols) * (NODE_H + 20) + 30;

  // 場所ノード（出生地・没地）
  const placePos = new Map();
  const placeList = [];
  const pcols = Math.max(cols, 4);
  placeList.forEach((p, i) => placePos.set(p.key, { x: MARGIN + (i % pcols) * (NODE_W + GAP_X), y: y + Math.floor(i / pcols) * (NODE_H + 20) }));
  const placeTop = y;
  if (placeList.length) y += Math.ceil(placeList.length / pcols) * (NODE_H + 20) + 30;

  const width = MARGIN * 2 + Math.max(treeW, cols * (NODE_W + GAP_X) - GAP_X, 600);
  return { pos, placePos, placeTop, loneTop: lone.length ? loneTop : null, eventsTop: y, width };
}

// ---- SVG 生成 ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FILL = { Male: "#dbeafe", Female: "#fce7f3" };
const STROKE = { Male: "#3b82f6", Female: "#ec4899" };

function life(n) {
  const b = n.birthYear, d = n.deathYear;
  if (b == null && d == null) return "";
  const f = (y) => (y == null ? "?" : y < 0 ? Math.abs(y) + " BC" : "AD " + y);
  return f(b) + " – " + f(d);
}

function toSvg(model) {
  const L = layout(model);
  const out = [];
  const cx = (p) => p.x + NODE_W / 2;

  // 辺（ノードより先に描く）
  for (const e of model.edges) {
    const a = L.pos.get(e.from), b = L.pos.get(e.to);
    if (e.type === "parent") {
      const y1 = a.y + NODE_H, y2 = b.y, my = (y1 + y2) / 2;
      out.push(`<path d="M${cx(a)},${y1} C${cx(a)},${my} ${cx(b)},${my} ${cx(b)},${y2}" fill="none" stroke="#555" stroke-width="1.5"/>`);
    } else if (e.type === "partner") {
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      if (l.y === r.y && r.x - l.x === NODE_W + GAP_X) {
        out.push(`<line x1="${l.x + NODE_W}" y1="${l.y + NODE_H / 2}" x2="${r.x}" y2="${r.y + NODE_H / 2}" stroke="#c0392b" stroke-width="3"/>`);
      } else {
        const t = Math.min(a.y, b.y) - 24;
        out.push(`<path d="M${cx(a)},${a.y} C${cx(a)},${t} ${cx(b)},${t} ${cx(b)},${b.y}" fill="none" stroke="#c0392b" stroke-width="2.5"/>`);
      }
    } else {
      out.push(`<path d="M${cx(a)},${a.y + NODE_H} Q${(cx(a) + cx(b)) / 2},${a.y + NODE_H + 40} ${cx(b)},${b.y + NODE_H}" fill="none" stroke="#888" stroke-dasharray="5 4"/>`);
    }
  }
  // 人物
  for (const n of model.nodes) {
    const p = L.pos.get(n.key);
    const dashed = n.kind === "parent" ? ' stroke-dasharray="4 3"' : "";
    out.push(`<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="6" fill="${FILL[n.gender] || "#eee"}" stroke="${STROKE[n.gender] || "#888"}" stroke-width="1.5"${dashed}/>`);
    out.push(`<text x="${cx(p)}" y="${p.y + 20}" font-size="${n.name.length > 24 ? 11 : n.name.length > 18 ? 12.5 : 14}" font-weight="bold" text-anchor="middle">${esc(n.name)}</text>`);
    if (n.places) out.push(`<text x="${cx(p)}" y="${p.y + 51}" font-size="9" fill="#2e8b57" text-anchor="middle">${esc(n.places.length > 40 ? n.places.slice(0, 39) + "…" : n.places)}</text>`);
    if (life(n)) out.push(`<text x="${cx(p)}" y="${p.y + 36}" font-size="10" fill="#555" text-anchor="middle">${esc(life(n))}</text>`);
  }
  // 出来事・その他の場所
  let y = L.eventsTop;
  const line = (text, opt = "") => { out.push(`<text x="${MARGIN}" y="${y}" ${opt.includes("font-size") ? "" : 'font-size="13"'} ${opt}>${esc(text)}</text>`); y += 20; };
  if (model.events.length) {
    line("出来事 (Events)", 'font-weight="bold" font-size="15"');
    for (const e of model.events) {
      line("■ " + e.title + "  (" + e.range + ")", 'font-weight="bold"');
      if (e.places.length) line("    場所: " + e.places.join(", "), 'fill="#2e8b57"');
    }
    y += 10;
  }
  if (model.otherPlaces.length) {
    line("その他の場所", 'font-weight="bold" font-size="15"');
    line("    " + model.otherPlaces.join(", "));
  }
  const height = Math.ceil(y + MARGIN);
  const head = `<text x="${MARGIN}" y="22" font-size="16" font-weight="bold">${esc(model.title)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${height}" viewBox="0 0 ${L.width} ${height}" font-family="Helvetica, Arial, sans-serif">` +
    `<rect width="100%" height="100%" fill="#fff"/>${head}${out.join("")}</svg>`;
}

const api = { prepare, buildModel, toSvg };
if (typeof module !== "undefined") module.exports = api; else window.GraphCore = api;
