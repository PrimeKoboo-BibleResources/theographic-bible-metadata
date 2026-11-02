"use strict";

// 正本の json/modified2 を /var/www/html/theo/data/json/ に置いて、そのまま読む
const DATA_BASE = "../data/json/";
const $ = (id) => document.getElementById(id);
let dataPromise = null;
let currentSvg = "";

function loadData() {
  if (!dataPromise) {
    const get = (n) => fetch(DATA_BASE + n + ".json").then((r) => {
      if (!r.ok) throw new Error(n + ".json の取得に失敗しました");
      return r.json();
    });
    dataPromise = Promise.all(["verses", "people", "places", "events", "peopleGroups"].map(get))
      .then(([verses, people, places, events, groups]) =>
        GraphCore.prepare({ verses, people, places, events, groups }));
  }
  return dataPromise;
}

async function run() {
  $("msg").textContent = "";
  try {
    const data = await loadData();
    currentSvg = GraphCore.toSvg(GraphCore.buildModel(data, $("q").value));
    $("view").innerHTML = currentSvg;
  } catch (e) {
    $("msg").textContent = e.message;
  }
}

const fileName = (ext) => $("q").value.trim() + "." + ext;

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// SVG を canvas に描く。PNG / PDF はこの canvas から作る
function rasterize(scale) {
  const svg = $("view").querySelector("svg");
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * scale; c.height = h * scale;
      const g = c.getContext("2d");
      g.scale(scale, scale);
      g.drawImage(img, 0, 0);
      resolve({ canvas: c, w, h });
    };
    img.onerror = () => reject(new Error("画像への変換に失敗しました"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(currentSvg);
  });
}

// JPEG 1枚を貼った 1 ページの PDF を組み立てる（外部ライブラリ不要）
function buildPdf(jpeg, pxW, pxH, ptW, ptH) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let len = 0;
  const push = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  const content = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im0 Do Q`;
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  push("xref\n0 6\n0000000000 65535 f \n" + [1, 2, 3, 4, 5].map((n) => String(offsets[n]).padStart(10, "0") + " 00000 n \n").join(""));
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

$("f").addEventListener("submit", (e) => { e.preventDefault(); run(); });
$("svg").addEventListener("click", () => download(new Blob([currentSvg], { type: "image/svg+xml" }), fileName("svg")));
$("png").addEventListener("click", async () => {
  const { canvas } = await rasterize(2);
  canvas.toBlob((b) => download(b, fileName("png")), "image/png");
});
$("pdf").addEventListener("click", async () => {
  const { canvas, w, h } = await rasterize(2);
  const bin = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
  const jpeg = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  download(buildPdf(jpeg, canvas.width, canvas.height, Math.round(w * 0.75), Math.round(h * 0.75)), fileName("pdf"));
});
run();
