/* Vocabulary Gacha - Header-based Stable Version */

console.log("Vocabulary Gacha loaded");

/* =========================
   Google Sheet（CSV）
========================= */
const SHEETS = {
  lunch:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNonIemQcLNNBZEmsVGc3TF8XWTZ_TXSCQfHdH5O6aNKLEavds1H376_3T8UGHl-bbJXInAFMHivZH/pub?output=csv",
  night:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT78dT_LHyajgTDK1xmJmKKkBRE3n0oFeNOsRgvylJuYnw048c4gpcqsE8MIeCkgKt19CO5I6rEETCl/pub?output=csv"
};

/* =========================
   State
========================= */
let pool = [];
let lastIndex = -1;

/* =========================
   DOM
========================= */
const statusEl = document.getElementById("status");
const playerEl = document.getElementById("player");
const tableEl  = document.getElementById("poolTable");

/* =========================
   Helpers
========================= */
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function clearPlayer() {
  if (playerEl) playerEl.src = "";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toEmbed(url) {
  if (!url) return "";
  const m = url.match(/youtube\.com\/shorts\/([^?&/]+)/i);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : "";
}

/* =========================
   CSV Parser（原完整版本）
========================= */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map(s => String(s).trim());
}

function parseCsv(csvText) {
  const lines = String(csvText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(l => l.trim().length > 0);

  if (lines.length <= 1) return [];

  /* === 用 header 建 index map === */
  const headers = parseCsvLine(lines[0]);
  const headerIndex = {};
  headers.forEach((h, i) => {
    headerIndex[h] = i;
  });

  const required = ["Item", "YT_URL", "enabled"];
  for (const k of required) {
    if (!(k in headerIndex)) {
      console.error("Missing column:", k);
      return [];
    }
  }

  const items = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);

    const enabled =
      String(cols[headerIndex["enabled"]] || "")
        .trim()
        .toUpperCase() === "TRUE";

    if (!enabled) continue;

    const item = cols[headerIndex["Item"]] || "";
    const ytUrl = cols[headerIndex["YT_URL"]] || "";
    if (!item || !ytUrl) continue;

    items.push({
      item: item.trim(),
      ytUrl: ytUrl.trim(),
      merchant: (cols[headerIndex["merchant"]] || "").trim(),
      merchantUrl: (cols[headerIndex["merchant_url"]] || "").trim()
    });
  }

  return items;
}

/* =========================
   Public API
========================= */
window.loadPool = function(type) {
  if (!SHEETS[type]) return;

  pool = [];
  lastIndex = -1;
  tableEl.innerHTML = "";
  clearPlayer();
  setStatus("載入中...");

  fetch(SHEETS[type], { cache: "no-store" })
    .then(r => r.text())
    .then(text => {
      pool = parseCsv(text);
      renderTable();
      setStatus(`已載入 ${pool.length} 筆`);
    })
    .catch(err => {
      console.error(err);
      setStatus("載入失敗");
    });
};

window.spin = function() {
  if (!pool.length) return;

  let i;
  do {
    i = Math.floor(Math.random() * pool.length);
  } while (i === lastIndex && pool.length > 1);

  lastIndex = i;
  playerEl.src = toEmbed(pool[i].ytUrl);
};

window.playIndex = function(i) {
  playerEl.src = toEmbed(pool[i].ytUrl);
};

window.clearPlayer = clearPlayer;

/* =========================
   Table Render
========================= */
function renderTable() {
  tableEl.innerHTML = "";
  pool.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.item)}</td>
      <td>
        ${p.merchantUrl
          ? `<a href="${escapeHtml(p.merchantUrl)}" target="_blank">${escapeHtml(p.merchant)}</a>`
          : escapeHtml(p.merchant || "—")}
      </td>
      <td><button onclick="playIndex(${i})">播放</button></td>
      <td><a href="${escapeHtml(p.ytUrl)}" target="_blank">YT</a></td>
    `;
    tableEl.appendChild(tr);
  });
}

setStatus("尚未載入球池");
