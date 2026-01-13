/* Vocabulary Gacha - with Impact Counter */

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

const impactViewsEl = document.getElementById("impactViews");
const impactHoursEl = document.getElementById("impactHours");

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

/* ===== CSV parser（與 detail.js 同邏輯） ===== */
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

function normKey(s) {
  return String(s || "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "");
}

/* =========================
   Impact Counter（核心新增）
========================= */
const MINUTES_PER_VIEW = 5;

function loadImpactCounter() {
  let totalViews = 0;
  let loaded = 0;

  Object.values(SHEETS).forEach(url => {
    fetch(url, { cache: "no-store" })
      .then(r => r.text())
      .then(text => {
        const lines = text
          .replace(/\uFEFF/g, "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .split("\n")
          .filter(l => l.trim().length > 0);

        if (lines.length <= 1) return;

        const headers = parseCsvLine(lines[0]);
        const headerIndex = {};
        headers.forEach((h, i) => {
          headerIndex[normKey(h)] = i;
        });

        lines.slice(1).forEach(line => {
          const cols = parseCsvLine(line);

          const enabled =
            String(cols[headerIndex[normKey("enabled")]] || "")
              .trim()
              .toUpperCase() === "TRUE";
          if (!enabled) return;

          const v = Number(
            cols[headerIndex[normKey("views")]] || 0
          );
          if (!isNaN(v)) totalViews += v;
        });
      })
      .finally(() => {
        loaded++;
        if (loaded === Object.keys(SHEETS).length) {
          const savedHours = Math.round((totalViews * MINUTES_PER_VIEW) / 60);
          if (impactViewsEl) impactViewsEl.textContent = totalViews.toLocaleString();
          if (impactHoursEl) impactHoursEl.textContent = savedHours.toLocaleString();
        }
      });
  });
}

/* =========================
   Public API（原本功能）
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
      const lines = text.split("\n").filter(l => l.trim());
      const headers = parseCsvLine(lines[0]);
      const idx = {};
      headers.forEach((h, i) => idx[h] = i);

      lines.slice(1).forEach(line => {
        const cols = parseCsvLine(line);
        if (String(cols[idx.enabled]).toUpperCase() !== "TRUE") return;
        pool.push({
          item: cols[idx.Item],
          ytUrl: cols[idx.YT_URL],
          merchant: cols[idx.merchant],
          merchantUrl: cols[idx.merchant_url]
        });
      });

      renderTable();
      setStatus(`已載入 ${pool.length} 筆`);
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
      <td>${p.merchantUrl
        ? `<a href="${escapeHtml(p.merchantUrl)}" target="_blank">${escapeHtml(p.merchant)}</a>`
        : escapeHtml(p.merchant || "—")}
      </td>
      <td><button onclick="playIndex(${i})">播放</button></td>
      <td><a href="${escapeHtml(p.ytUrl)}" target="_blank">YT</a></td>
    `;
    tableEl.appendChild(tr);
  });
}

/* =========================
   Init
========================= */
setStatus("尚未載入球池");
loadImpactCounter();
