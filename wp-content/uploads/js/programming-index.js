const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT64F40PaCRSWAtiouxUkwKwL7IVckSiDM622zJpt3BQ_vt_K55bugFQgxtJIHTwmtwGRrlqi7s5gxp/pub?output=csv";

let rows = [];
let byId = {};
const TAB_CONFIG = {
  explain: {
    label: "說明文章",
    categories: ["生活與程式"]
  },
  tools: {
    label: "程式工具",
    categories: ["程式工具"]
  }
};
let currentTabKey = "explain";

function normalizeHeader(name) {
  if (!name) return "";
  const normalized = name.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  if (lower.includes("延伸") && lower.includes("id")) return "延伸閱讀相關ID";
  if (lower.includes("主題") && lower.includes("關鍵")) return "主題關鍵字";
  if (lower.includes("文章") && lower.includes("標題")) return "文章標題";
  if (lower.includes("文章") && lower.includes("名稱")) return "文章標題";
  return normalized;
}

function parseCSV(text) {
  if (!text) return [];
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (text.startsWith("\uFEFF")) text = text.slice(1);

  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if (char === "\n" && !inQuotes) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== "" || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }

  while (rows.length && rows[0].every(cell => cell.trim() === "")) {
    rows.shift();
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(normalizeHeader);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] || "").trim();
    });
    return obj;
  });
}

function getPublishPlatforms(row) {
  const list = [];
  if (row.Medium_URL) list.push({ name: "Medium", url: row.Medium_URL });
  if (row["方格子_URL"]) list.push({ name: "方格子", url: row["方格子_URL"] });
  if (row.YouTube_URL) list.push({ name: "YouTube", url: row.YouTube_URL });
  return list;
}

function getArticleUrl(row) {
  return row["方格子_URL"] || row.Medium_URL || "#";
}

function getDisplayTitle(row) {
  return row["文章名稱"] || row["文章標題"] || row["文章名稱"] || "";
}

function renderPlatformLinks(container, row) {
  const platforms = getPublishPlatforms(row);
  container.innerHTML = "";
  if (platforms.length) {
    platforms.forEach((platform, index) => {
      const link = document.createElement("a");
      link.target = "_blank";
      link.rel = "noreferrer";
      link.href = platform.url || "#";
      if (platform.name === "YouTube") {
        const icon = document.createElement("span");
        icon.textContent = "▶";
        icon.style.color = "#c4302b";
        icon.style.fontWeight = "700";
        icon.style.fontSize = "1.1rem";
        link.appendChild(icon);
        link.setAttribute("aria-label", "YouTube 連結");
      } else {
        link.textContent = platform.name;
      }
      container.appendChild(link);
      if (index < platforms.length - 1) {
        container.appendChild(document.createTextNode(" / "));
      }
    });
  } else if (row["發布平台"]) {
    container.textContent = row["發布平台"];
  } else {
    container.textContent = "";
  }
}

function matchesCategories(value, categories) {
  if (!value) return false;
  const normalized = value
    .split(/[,/]/)
    .map(v => v.trim())
    .filter(Boolean);
  return categories.some(cat =>
    normalized.some(item => item === cat || item.includes(cat))
  );
}

/* H 欄：只抓數字（不管 , ; 全形） */
function parseHIds(v) {
  if (!v) return [];
  const m = String(v).match(/\d+/g);
  return m ? m : [];
}

/* G 欄：tag（空白分隔） */
function parseTags(v) {
  if (!v) return [];
  return v
    .split(/[\s,;，；]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

function collectRelatedIds(currentRow) {
  const set = new Set();

  // H 欄（手動）
  parseHIds(currentRow["延伸閱讀相關ID"]).forEach(id => set.add(id));

  // G 欄（tag 推導）
  const myTags = parseTags(currentRow["主題關鍵字"]);
  if (myTags.length) {
    rows.forEach(r => {
      if (r.ID === currentRow.ID) return;
      const tags = parseTags(r["主題關鍵字"]);
      if (tags.some(t => myTags.includes(t))) {
        set.add(r.ID);
      }
    });
  }

  set.delete(currentRow.ID);
  return [...set];
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const tab = TAB_CONFIG[currentTabKey] || TAB_CONFIG.explain;

  rows.forEach(row => {
    if (!row["文章標題"]) return;
    if (
      tab.categories.length &&
      !matchesCategories(row["主題分類"], tab.categories)
    ) {
      return;
    }

    const tr = document.createElement("tr");

    // 文章名稱
    const titleTd = document.createElement("td");
    const a = document.createElement("a");
    a.href = getArticleUrl(row);
    a.target = "_blank";
    a.textContent = getDisplayTitle(row);
    titleTd.appendChild(a);

    // 平台
    const platformTd = document.createElement("td");
    renderPlatformLinks(platformTd, row);

    // 延伸閱讀
    const relatedTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "查看";
    btn.onclick = () => openModal(row);
    relatedTd.appendChild(btn);

    tr.appendChild(titleTd);
    tr.appendChild(platformTd);
    tr.appendChild(relatedTd);

    tbody.appendChild(tr);
  });
}

function openModal(row) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("relatedBody");
  body.innerHTML = "";

  const ids = collectRelatedIds(row);

  if (!ids.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "沒有延伸閱讀";
    tr.appendChild(td);
    body.appendChild(tr);
  } else {
    ids.forEach(id => {
      const r = byId[id];
      if (!r) return;

      const tr = document.createElement("tr");

      const titleTd = document.createElement("td");
      const a = document.createElement("a");
      a.href = getArticleUrl(r);
      a.target = "_blank";
      a.textContent = getDisplayTitle(r);
      titleTd.appendChild(a);

      const platformTd = document.createElement("td");
      renderPlatformLinks(platformTd, r);

      tr.appendChild(titleTd);
      tr.appendChild(platformTd);
      body.appendChild(tr);
    });
  }

  modal.style.display = "block";
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

function highlightTab() {
  document.querySelectorAll("[data-tab-key]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.tabKey === currentTabKey);
  });
}

function setupTabs() {
  document.querySelectorAll("[data-tab-key]").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.tabKey;
      if (!TAB_CONFIG[key] || currentTabKey === key) return;
      currentTabKey = key;
      highlightTab();
      renderTable();
    });
  });
  highlightTab();
}

setupTabs();

fetch(CSV_URL)
  .then(r => r.text())
  .then(text => {
    rows = parseCSV(text);
    rows.forEach(r => {
      if (r.ID) byId[r.ID] = r;
    });
    renderTable();
  })
  .catch(err => console.error("CSV load error", err));
