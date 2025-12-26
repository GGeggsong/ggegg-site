// Google Sheet 設定
const SHEET_ID = "2PACX-1vRc4ss6hwZjGeuHOfZZiUjmiMyeqiNKPlObaVBHBajwETaekwmk5WyoxDQXDDH7KpJ46j6CwWbSK632";
const README_GID = "0"; // README 分頁 gid

// DOM
const buttonsContainer = document.getElementById("categoryButtons");
const tableBody = document.getElementById("tableBody");

// 若頁面沒有統計列，動態建立
let statsBar = document.getElementById("vocaStats");
if (!statsBar) {
  statsBar = document.createElement("div");
  statsBar.id = "vocaStats";
  statsBar.style.margin = "8px 0 12px";
  statsBar.style.fontWeight = "600";
  // 插在按鈕列後、表格前
  buttonsContainer?.parentNode?.insertBefore(statsBar, tableBody.parentNode);
}

// 產生 CSV 下載網址（用 pub? 而非 pubhtml）
function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${gid}&single=true&output=csv`;
}

// 解析 CSV 成物件陣列（支援引號與逗號）
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const splitComma = (line) =>
    line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) =>
      v
        .trim()
        .replace(/^"(.*)"$/, "$1") // 去掉包住的雙引號
        .replace(/""/g, '"') // 轉義成單一 "
    );

  const headers = splitComma(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitComma(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i]?.trim() || ""));
    return obj;
  });
}

// README 三欄：tag, gid, label
function parseReadmeTable(csvText) {
  return csvText
    .trim()
    .split("\n")
    .map((line) => {
      const [tag, gid, label] = line.split(",").map((v) => v.trim());
      return { tag, gid, label };
    })
    .filter((row) => row.tag && row.gid && row.label);
}

// 動態產生分類按鈕
function renderButtons(categories) {
  buttonsContainer.innerHTML = "";
  categories.forEach((cat, idx) => {
    const btn = document.createElement("button");
    btn.textContent = cat.label;
    btn.onclick = () => loadCategory(cat, btn);
    if (idx === 0) btn.classList.add("active");
    buttonsContainer.appendChild(btn);
  });
}

// 渲染表格
function renderTable(rows) {
  tableBody.innerHTML = "";

  // 重新設定表頭：7 欄（含泰文、影片/連結）
  const table = tableBody.closest("table");
  const theadRow = table?.querySelector("thead tr");
  if (theadRow) {
    theadRow.innerHTML = `
      <th>中文</th>
      <th>English</th>
      <th>日文假名</th>
      <th>日文漢字</th>
      <th>韓文</th>
      <th>泰文</th>
      <th>影片 / 連結</th>
    `;
  }

  // 將欄位名稱正規化（去除空白、括號與非字母數字，轉小寫）
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // 依欄位鍵名清單取得值，若有括號/空白等也能匹配
  const getVal = (row, targetKeys) => {
    const targetsNorm = targetKeys.map(normalize);
    for (const [rawKey, val] of Object.entries(row)) {
      if (!val) continue;
      const nk = normalize(rawKey);
      // 1) normalized 比對（英數標題）
      if (targetsNorm.includes(nk)) return val;
      // 2) 原始字串包含/等於（處理中文或含符號標題）
      for (const tk of targetKeys) {
        if (!tk) continue;
        const rawTrim = rawKey.trim();
        if (rawTrim === tk || rawTrim.includes(tk)) return val;
      }
    }
    return "";
  };

  rows.forEach((row) => {
    const zh = getVal(row, ["Chinese (ZH)", "word_zh", "中文", "zh", "Chinese"]);
    const en = getVal(row, ["English (EN)", "word_en", "English", "英文", "en"]);

    const jpKana = getVal(row, ["Japanese Kana (JA)", "kana", "jp_kana", "jp_k", "假名"]);
    const jpKanji =
      getVal(row, ["Japanese Kanji (JA)", "kanji", "jp_kanji", "Japanese", "日文", "日語", "日本語"]) ||
      getVal(row, ["word_jp", "jp"]);

    const kr = getVal(row, ["Korean (KO)", "word_kr", "한국어", "韓文", "kr", "Korean"]);
    const th = getVal(row, ["Thai (TH)", "thai", "th", "泰文", "泰語"]);

    // 收集所有 URL 類欄位（值以 http 開頭，含多語 URL 欄），以語別縮寫／組合標籤呈現
    const linkFragments = [];
    let videoCount = 0;
    const labelFromKey = (key) => {
      const k = key.toLowerCase();
      if (k.includes("yt") || k.includes("you")) {
        videoCount += 1;
        return "VIDEO";
      }
      if (k.includes("zh・en・ja") || k.includes("zh en ja")) return "ZH+EN+JA";
      if (k.includes("zh・en・ko") || k.includes("zh en ko")) return "ZH+EN+KO";
      if (k.includes("zh・en・th") || k.includes("zh en th")) return "ZH+EN+TH";
      if (k.includes("zh・ko・ja") || k.includes("zh ko ja")) return "ZH+KO+JA";
      if (k.includes("zh・ko・th") || k.includes("zh ko th")) return "ZH+KO+TH";
      if (k.includes("zh")) return "ZH";
      if (k.includes("en")) return "EN";
      if (k.includes("ja")) return "JA";
      if (k.includes("ko")) return "KO";
      if (k.includes("th")) return "TH";
      return "LINK";
    };
    const displayMap = {
      ZH: "ZH (中)",
      EN: "EN (英)",
      JA: "JA (日)",
      KO: "KO (韓)",
      TH: "TH (泰)",
      "ZH+EN+JA": "ZH/EN/JA (中/英/日)",
      "ZH+EN+KO": "ZH/EN/KO (中/英/韓)",
      "ZH+EN+TH": "ZH/EN/TH (中/英/泰)",
      "ZH+KO+JA": "ZH/KO/JA (中/韓/日)",
      "ZH+KO+TH": "ZH/KO/TH (中/韓/泰)",
      VIDEO: "🎧 影片",
      LINK: "🔗 連結",
    };
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && v.startsWith("http")) {
        const baseLabel = labelFromKey(k);
        const text = displayMap[baseLabel] || baseLabel;
        linkFragments.push(
          `<a href="${v}" target="_blank" rel="noopener noreferrer">${text}</a>`
        );
      }
    }
    const totalLinks = linkFragments.length;
    const summaryLabel =
      totalLinks === 0
        ? ""
        : videoCount > 0
        ? "🎧"
        : "連結";
    const linkCell =
      totalLinks === 0
        ? ""
        : `
          <button class="voca-link-toggle" type="button" onclick="window.toggleVocaLinks(this)">
            ${summaryLabel}
          </button>
          <div class="voca-link-panel" style="display:none;">
            ${linkFragments.join("<br>")}
          </div>
        `;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${zh}</td>
      <td>${en}</td>
      <td>${jpKana}</td>
      <td>${jpKanji}</td>
      <td>${kr}</td>
      <td>${th}</td>
      <td>${linkCell}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// 載入指定分類
async function loadCategory(category, activeButton) {
  document.querySelectorAll("#categoryButtons button").forEach((b) => b.classList.remove("active"));
  activeButton.classList.add("active");

  const url = csvUrl(category.gid);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取分類 ${category.label} 失敗: ${res.status} ${res.statusText}`);
  const csvText = await res.text();
  const rows = parseCSV(csvText);
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  console.log(`[voca] loaded ${category.label}`, {
    url,
    status: res.status,
    rows: rows.length,
    sample: rows[0],
    headers,
  });
  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="7">此分類沒有資料或 CSV 解析為空，請檢查分頁欄位</td></tr>`;
    return;
  }
  renderTable(rows);
  if (statsBar) {
    statsBar.textContent = `${category.label}：${rows.length} 筆單字`;
  }
}

// 初始化：讀 README → 產生按鈕 → 預設載入第一個分類
async function init() {
  const res = await fetch(csvUrl(README_GID));
  if (!res.ok) throw new Error(`取 README 失敗: ${res.status} ${res.statusText}`);
  const csvText = await res.text();

  const categories = parseReadmeTable(csvText);
  if (!categories.length) {
    alert("README 分頁沒有讀到任何分類設定");
    return;
  }

  renderButtons(categories);
  loadCategory(categories[0], buttonsContainer.children[0]);
}

init();

// 簡易展開/收合連結面板
window.toggleVocaLinks = function (btn) {
  const panel = btn.nextElementSibling;
  if (!panel) return;
  const isOpen = panel.style.display === "block";
  panel.style.display = isOpen ? "none" : "block";
};
