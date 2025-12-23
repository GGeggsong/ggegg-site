/* Vocabulary Gacha - Stable Version (UTF-8)
   - Load pool from Google Sheets published CSV
   - Random pick and play YouTube Shorts embed
   - Render pool table + manual play
*/

console.log("Vocabulary Gacha JS loaded");

const SHEETS = {
  lunch:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNonIemQcLNNBZEmsVGc3TF8XWTZ_TXSCQfHdH5O6aNKLEavds1H376_3T8UGHl-bbJXInAFMHivZH/pub?output=csv",
  night:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT78dT_LHyajgTDK1xmJmKKkBRE3n0oFeNOsRgvylJuYnw048c4gpcqsE8MIeCkgKt19CO5I6rEETCl/pub?output=csv"
};

// ===== State =====
let pool = [];
let lastIndex = -1;
let currentPoolKey = "";

// ===== DOM (IDs must exist in HTML) =====
const statusEl = document.getElementById("status");
const playerEl = document.getElementById("player");
const tableEl = document.getElementById("poolTable");

// ===== Helpers =====
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function _clearPlayerInternal() {
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
  url = String(url).trim();

  // shorts
  let m = url.match(/youtube\.com\/shorts\/([^?&/]+)/i);
  if (m) return "https://www.youtube.com/embed/" + m[1] + "?autoplay=1&rel=0";

  // youtu.be
  m = url.match(/youtu\.be\/([^?&/]+)/i);
  if (m) return "https://www.youtube.com/embed/" + m[1] + "?autoplay=1&rel=0";

  // watch?v=
  m = url.match(/[?&]v=([^?&/]+)/i);
  if (m) return "https://www.youtube.com/embed/" + m[1] + "?autoplay=1&rel=0";

  return "";
}

/*
  CSV parsing:
  Your sheet currently looks simple, but may contain commas.
  We'll parse CSV with a minimal quoted-field parser.
*/
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // double quote inside quoted field => ""
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

  // Drop header row
  const dataLines = lines.slice(1);

  const items = [];
  for (const line of dataLines) {
    const cols = parseCsvLine(line);

    const food = (cols[0] || "").trim();
    const url = (cols[1] || "").trim();
    const partner = (cols[2] || "").trim();

    if (!food || !url) continue;

    items.push({ food, url, partner });
  }
  return items;
}

// ===== Public functions used by onclick in HTML =====
window.loadPool = function (type) {
  if (!SHEETS[type]) {
    setStatus("球池類型錯誤");
    return;
  }

  currentPoolKey = type;
  pool = [];
  lastIndex = -1;
  if (tableEl) tableEl.innerHTML = "";
  _clearPlayerInternal();
  setStatus("載入球池中...");

  fetch(SHEETS[type], { cache: "no-store" })
    .then(res => res.text())
    .then(text => {
      console.log("CSV preview:", text.slice(0, 120));

      pool = parseCsv(text);

      renderTable();
      setStatus("已載入 " + pool.length + " 筆（" + (type === "lunch" ? "午餐" : "消夜") + "球池）");
    })
    .catch(err => {
      console.error(err);
      setStatus("讀取失敗（若看到 CORS，下一步要用 Worker 代理）");
    });
};

window.spin = function () {
  if (!pool || pool.length === 0) {
    setStatus("請先選擇球池");
    return;
  }

  let i;
  do {
    i = Math.floor(Math.random() * pool.length);
  } while (pool.length > 1 && i === lastIndex);

  lastIndex = i;

  const item = pool[i];
  const embed = toEmbed(item.url);

  if (!embed) {
    setStatus("此筆網址無法解析成可嵌入格式");
    return;
  }

  playerEl.src = embed;
  setStatus("播放中...");
};

window.clearPlayer = function () {
  _clearPlayerInternal();
  setStatus(currentPoolKey ? "已清空播放器" : "尚未載入球池");
};

window.playIndex = function (idx) {
  const item = pool[idx];
  if (!item) return;

  const embed = toEmbed(item.url);
  if (!embed) {
    setStatus("此筆網址無法解析成可嵌入格式");
    return;
  }

  playerEl.src = embed;
  setStatus("播放：「" + item.food + "」");
};

// ===== Table render =====
function renderTable() {
  if (!tableEl) return;
  tableEl.innerHTML = "";

  if (!pool || pool.length === 0) return;

  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    const tr = document.createElement("tr");

    tr.innerHTML =
      "<td>" + escapeHtml(item.food) + "</td>" +
      "<td>" + escapeHtml(item.partner || "-") + "</td>" +
      "<td><button onclick=\"playIndex(" + i + ")\">播放</button></td>" +
      "<td><a href=\"" + escapeHtml(item.url) + "\" target=\"_blank\" rel=\"noopener\">YouTube</a></td>";

    tableEl.appendChild(tr);
  }
}

// Initial status
setStatus("尚未載入球池");
