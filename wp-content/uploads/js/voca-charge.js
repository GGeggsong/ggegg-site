import {
  getInit,
  getLetters,
  getByLetter,
  search,
  getMeta
} from "./voca-charge_api.js";

// 版本號（避免因瀏覽器快取導致舊版 voca-charge_api.js 尚未帶出 APP_VERSION export 而整個掛掉）
const APP_VERSION = "2026-01-02.01";
console.log("[voca-charge] loaded", { v: APP_VERSION });

const elLetters = document.querySelector("#letters");
const elList = document.querySelector("#list");
const elTitle = document.querySelector("#title");
const elSearch = document.querySelector("#search");
const elSearchBtn = document.querySelector("#searchBtn");
const elTotal = document.querySelector("#total");
const elSub = document.querySelector("#subcount");

// ===== State =====
const state = {
  // sort
  // 預設排序：English A→Z
  sortKey: "en", // null | en | zh | img | note
  sortDir: "asc", // asc | desc

  // view
  mode: "letter", // letter | search
  lastLetter: null,
  lastLetterRows: [],
  rows: []
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

/* ===== 表格 Render ===== */
function getSortedRows(rows) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  const { sortKey, sortDir } = state;
  if (!sortKey) return arr;

  const dir = sortDir === "desc" ? -1 : 1;
  return arr.sort((a, b) => {
    const av = String(a?.[sortKey] ?? "");
    const bv = String(b?.[sortKey] ?? "");
    return dir * collator.compare(av, bv);
  });
}

function setSort(key) {
  if (!key) return;
  if (state.sortKey !== key) {
    state.sortKey = key;
    state.sortDir = "asc";
    return;
  }
  state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
}

function renderTable(rows) {
  state.rows = Array.isArray(rows) ? rows : [];
  elList.innerHTML = "";

  const sortMark = (key) => {
    if (state.sortKey !== key) return "";
    return state.sortDir === "asc" ? " ▲" : " ▼";
  };

  // 表頭
  const header = document.createElement("div");
  header.className = "row header";
  header.innerHTML = `
    <div class="cell" data-key="en" style="cursor:pointer" title="點擊排序">English${sortMark("en")}</div>
    <div class="cell" data-key="zh" style="cursor:pointer" title="點擊排序">Chinese${sortMark("zh")}</div>
    <div class="cell" data-key="img" style="cursor:pointer" title="點擊排序">Image${sortMark("img")}</div>
    <div class="cell" data-key="note" style="cursor:pointer" title="點擊排序">Note${sortMark("note")}</div>
  `;
  elList.appendChild(header);

  header.querySelectorAll("[data-key]").forEach(el => {
    el.addEventListener("click", () => {
      const key = el.getAttribute("data-key");
      setSort(key);
      renderTable(state.rows);
    });
  });

  const sorted = getSortedRows(state.rows);
  if (!sorted || sorted.length === 0) {
    elList.innerHTML += `<div class="empty">沒有資料</div>`;
    return;
  }

  sorted.forEach(item => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="cell en">${escapeHtml(item.en)}</div>
      <div class="cell">${escapeHtml(item.zh)}</div>
      <div class="cell img">${escapeHtml(item.img)}</div>
      <div class="cell">${escapeHtml(item.note)}</div>
    `;
    elList.appendChild(row);
  });
}

function showError(msg) {
  elList.innerHTML = "";
  elList.innerHTML = `<div class="empty">${escapeHtml(msg || "發生錯誤")}</div>`;
}

async function loadLetter(L) {
  try {
    state.mode = "letter";
    state.lastLetter = L;
    // 每次載入新資料都回到預設排序（English A→Z）
    state.sortKey = "en";
    state.sortDir = "asc";

    elTitle.textContent = `字母 ${L}`;
    const res = await getByLetter(L);

    const rows = Array.isArray(res?.data) ? res.data : [];
    state.lastLetterRows = rows;
    elSub.textContent = `本頁單字數：${res?.count ?? rows.length}`;
    renderTable(rows);
  } catch {
    elSub.textContent = "";
    showError("讀取失敗，請稍後再試");
  }
}

async function runSearch(q) {
  try {
    const query = String(q || "").trim();
    if (!query) return;

    state.mode = "search";
    // 每次載入新資料都回到預設排序（English A→Z）
    state.sortKey = "en";
    state.sortDir = "asc";
    elTitle.textContent = `搜尋：${query}`;
    elSub.textContent = "";

    const res = await search(query);
    const rows = Array.isArray(res?.data) ? res.data : [];
    elSub.textContent = `搜尋結果：${rows.length}`;
    renderTable(rows);
  } catch {
    elSub.textContent = "";
    showError("搜尋失敗，請稍後再試");
  }
}

/* ===== Init ===== */
async function init() {
  // 若這支 script 被意外載入到不含這些元素的頁面，直接跳出避免報錯
  if (!elLetters || !elList || !elTitle || !elSearch || !elSearchBtn || !elTotal || !elSub) return;

  // ===== 首屏優先走 init=1（一次拿 letters + meta + A）=====
  try {
    const r = await getInit();
    if (!r?.ok) throw new Error("init not ok");

    // meta
    elTotal.textContent = `📚 總單字數：${r?.meta?.total ?? 0}`;

    // letters
    elLetters.innerHTML = "";
    (r?.letters || []).forEach(L => {
      const btn = document.createElement("button");
      btn.textContent = L;
      btn.onclick = async () => {
        elSearch.value = "";
        await loadLetter(L);
      };
      elLetters.appendChild(btn);
    });

    // first data（避免再多打一個 letter）
    const first = (r?.firstLetter || (r?.letters || [])[0] || "A").toUpperCase();
    const rows = Array.isArray(r?.firstData?.data) ? r.firstData.data : [];

    state.mode = "letter";
    state.lastLetter = first;
    state.lastLetterRows = rows;
    state.sortKey = "en";
    state.sortDir = "asc";

    elTitle.textContent = `字母 ${first}`;
    elSub.textContent = `本頁單字數：${r?.firstData?.count ?? rows.length}`;
    renderTable(rows);
    console.log("[voca-charge] init ok (init=1)", { v: APP_VERSION, first, letters: (r?.letters || []).length });
    return;
  } catch {
    // fallback：走舊流程
  }

  // 總單字數（一定顯示）
  try {
    const meta = await getMeta();
    elTotal.textContent = `📚 總單字數：${meta?.total ?? 0}`;
  } catch {
    elTotal.textContent = `📚 總單字數：0`;
  }

  try {
    const lettersRes = await getLetters();
    elLetters.innerHTML = "";

    (lettersRes?.letters || []).forEach(L => {
      const btn = document.createElement("button");
      btn.textContent = L;

      btn.onclick = async () => {
        // 點字母時，清掉搜尋框避免混淆
        elSearch.value = "";
        await loadLetter(L);
      };

      elLetters.appendChild(btn);
    });

    elLetters.querySelector("button")?.click();
  } catch {
    showError("載入字母清單失敗，請稍後再試");
  }
}

/* ===== 搜尋 ===== */
elSearchBtn.onclick = async () => {
  const q = elSearch.value.trim();
  if (!q) return;
  await runSearch(q);
};

// Enter 觸發搜尋 + 輸入即時搜尋（防抖）
let searchTimer = null;
elSearch.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (searchTimer) clearTimeout(searchTimer);
  const q = elSearch.value.trim();
  if (!q) return;
  await runSearch(q);
});

elSearch.addEventListener("input", () => {
  if (searchTimer) clearTimeout(searchTimer);

  const q = elSearch.value.trim();
  if (!q) {
    // 清空搜尋時，回到最後一次字母瀏覽的結果
    if (state.lastLetter) {
      elTitle.textContent = `字母 ${state.lastLetter}`;
      elSub.textContent = `本頁單字數：${state.lastLetterRows.length}`;
      renderTable(state.lastLetterRows);
      state.mode = "letter";
    }
    return;
  }

  searchTimer = setTimeout(() => runSearch(q), 300);
});


(function () {
  const START_DATE = "2023-11-05"; // ← 改成你真正開始的日期
  const start = new Date(START_DATE);
  const today = new Date();

  // 清掉時間，只算日期
  start.setHours(0,0,0,0);
  today.setHours(0,0,0,0);

  const diffDays =
    Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;

  const el = document.getElementById("dayCount");
  if (el && diffDays > 0) {
    el.textContent = diffDays;
  }
})();

init();
