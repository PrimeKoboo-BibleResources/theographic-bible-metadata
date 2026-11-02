"use strict";

// 入力例: "Acts.16.11-18" / "Acts.16.11-17.5" / "Acts.16.11" / "Acts.16"
const PATTERN = /^\s*([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-(\d+)(?:\.(\d+))?)?\s*$/;

// 正本の json/modified2 を /var/www/html/theo/data/json/ に置いて、そのまま読む
const DATA_BASE = "../data/json/";

// 一次ソースとして出力するフィールド（modified2 の他のフィールドは出さない）
const PERSON_FIELDS = ["displayTitle", "name", "surname", "birthPlace", "deathPlace",
  "birthYear", "deathYear", "gender", "father", "mother", "siblings",
  "halfSiblingsSameFather", "halfSiblingsSameMother", "partners", "children", "eastons"];
const PLACE_FIELDS = ["displayTitle", "kjvName", "esvName", "otherNames",
  "latitude", "longitude", "featureType", "featureSubType", "eastons"];

const $ = (id) => document.getElementById(id);
let dataPromise = null;

const indexBy = (rows, key) => new Map(rows.map((r) => [r[key], r]));

function loadData() {
  if (!dataPromise) {
    const get = (n) => fetch(DATA_BASE + n + ".json").then((r) => {
      if (!r.ok) throw new Error(n + ".json の取得に失敗しました");
      return r.json();
    });
    dataPromise = Promise.all([get("verses"), get("people"), get("places"), get("easton")])
      .then(([verses, people, places, easton]) => ({
        verses,
        people: indexBy(people, "personLookup"),
        places: indexBy(places, "placeLookup"),
        eastons: indexBy(easton, "index"),
      }));
  }
  return dataPromise;
}

// 参照文字列を [開始 ref, 終了 ref]（ch/verse の数値組）に変換する
function parseRange(text) {
  const m = PATTERN.exec(text);
  if (!m) throw new Error("形式が不正です。例: Acts.16.11-18");
  const [, book, ch, v, a, b] = m;
  const start = { ch: +ch, v: v ? +v : 1 };
  let end;
  if (!v) end = { ch: +ch, v: Infinity };                    // 章全体
  else if (a === undefined) end = { ch: +ch, v: +v };         // 1節のみ
  else if (b === undefined) end = { ch: +ch, v: +a };         // 同一章内の範囲
  else end = { ch: +a, v: +b };                               // 章をまたぐ範囲
  return { book, start, end };
}

const cmp = (x, y) => x.ch - y.ch || x.v - y.v;

function extract(data, text) {
  const { book, start, end } = parseRange(text);
  const hits = data.verses.filter((verse) => {
    const [b, ch, v] = verse.osisRef.split(".");
    if (b.toLowerCase() !== book.toLowerCase()) return false;
    const pos = { ch: +ch, v: +v };
    return cmp(pos, start) >= 0 && cmp(pos, end) <= 0;
  });
  if (!hits.length) throw new Error("該当する節がありません: " + text);

  return hits.map((verse) => ({
    osisRef: verse.osisRef,
    people: (verse.people || []).map((k) => expandPerson(data, data.people.get(k))),
    places: (verse.places || []).map((k) => expandPlace(data, data.places.get(k))),
  }));
}

// 節から直接参照された人物・場所は一次ソースなので全フィールドを出力する。
// 配列フィールドの各要素は参照先を検索し、「get」指定のフィールドだけにする。
const PERSON_REFS = ["father", "mother", "siblings", "halfSiblingsSameFather",
  "halfSiblingsSameMother", "partners", "children"];

const personGet = (data, k) => {
  const p = data.people.get(k);
  return { displayTitle: p.displayTitle, name: p.name };
};
const placeGet = (data, k) => {
  const p = data.places.get(k);
  return { displayTitle: p.displayTitle, latitude: p.latitude, longitude: p.longitude };
};

// eastons は easton.json の index への参照。辞書の見出しと本文に展開する
const eastonsOf = (data, keys) => keys.map((k) => {
  const e = data.eastons.get(k);
  return { termLabel: e.termLabel, dictText: e.dictText };
});

const pick = (record, fields) =>
  Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));

function expandPerson(data, person) {
  const out = pick(person, PERSON_FIELDS);
  for (const f of PERSON_REFS) if (out[f]) out[f] = out[f].map((k) => personGet(data, k));
  for (const f of ["birthPlace", "deathPlace"]) if (out[f]) out[f] = out[f].map((k) => placeGet(data, k));
  if (out.eastons) out.eastons = eastonsOf(data, out.eastons);
  return out;
}

function expandPlace(data, place) {
  const out = pick(place, PLACE_FIELDS);
  if (out.otherNames) out.otherNames = out.otherNames.map((k) => placeGet(data, k));
  if (out.eastons) out.eastons = eastonsOf(data, out.eastons);
  return out;
}

async function run() {
  $("msg").textContent = "";
  try {
    const result = extract(await loadData(), $("q").value);
    $("out").textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    $("msg").textContent = e.message;
  }
}

$("f").addEventListener("submit", (e) => { e.preventDefault(); run(); });
$("copy").addEventListener("click", () => navigator.clipboard.writeText($("out").textContent));
$("dl").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([$("out").textContent], { type: "application/json" }));
  a.download = $("q").value.trim() + ".json";
  a.click();
});
run();
