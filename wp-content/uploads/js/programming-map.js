/* programming-map.js */
const PM_VERSION = "2026-01-25-guide-5";
console.log(`[Programming Map] v${PM_VERSION}`);
window.PROGRAMMING_MAP_VERSION = PM_VERSION;

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT64F40PaCRSWAtiouxUkwKwL7IVckSiDM622zJpt3BQ_vt_K55bugFQgxtJIHTwmtwGRrlqi7s5gxp/pub?output=csv";

let DATA = [];
const GUIDE_LIMIT = 5;

/* ---------- load CSV ---------- */
fetch(CSV_URL, { cache: "no-store" })
  .then(r => r.text())
  .then(t => init(parseCSV(t)));

/* ---------- CSV ---------- */
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines.shift().split(",");
  return lines.map(l => {
    const c = l.split(",");
    let o = {};
    header.forEach((h,i)=>o[h.trim()] = (c[i]||"").trim());
    return {
      id: Number(o.ID),
      category: o["主題分類"],
      title: o["文章標題"],
      medium: o["Medium_URL"]
    };
  });
}

/* ---------- init ---------- */
function init(rows) {
  DATA = rows
    .filter(d => d.title && d.medium && d.category === "生活與程式")
    .sort((a,b)=>a.id-b.id)
    .slice(0, GUIDE_LIMIT);   // ✅ 只取前五筆

  renderList();
}

/* ---------- render ---------- */
function renderList() {
  const body = document.getElementById("programming-map-body");
  body.innerHTML = "";

  DATA.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <a href="${d.medium}" target="_blank">
          ${d.title}
        </a>
      </td>
    `;
    body.appendChild(tr);
  });
}
