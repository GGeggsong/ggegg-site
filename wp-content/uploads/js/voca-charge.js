import {
  getInit,
  getLetters,
  getByLetter,
  search,
  getMeta,
  getMemoryMap
} from "./voca-charge_api.js";

// 版本號（避免因瀏覽器快取導致舊版 voca-charge_api.js 尚未帶出 APP_VERSION export 而整個掛掉）
const APP_VERSION = "2026-01-02.06";
console.log("[voca-charge] loaded", { v: APP_VERSION });

const elLetters = document.querySelector("#letters");
const elList = document.querySelector("#list");
const elTitle = document.querySelector("#title");
const elSearch = document.querySelector("#search");
const elSearchBtn = document.querySelector("#searchBtn");
const elTotal = document.querySelector("#total");
const elSub = document.querySelector("#subcount");

function titleForLetter(L) {
  const s = String(L || "").trim();
  if (!s) return "載入中…";
  if (s.toLowerCase() === "other") return "其他（Other）";
  return `字母 ${s}`;
}

// ===== Memory Map UI (圖案綁定說明) =====
let memoryMapCache = null;
let memoryMapLoading = null;

function ensureMemoryMapUi() {
  // 插入「圖案綁定說明」按鈕（若頁面沒寫死在 HTML，也能自動補上）
  let btn = document.getElementById("memoryMapBtn");
  if (!btn) {
    const bar = document.createElement("div");
    bar.style.margin = "8px 0 0";
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.style.alignItems = "center";

    btn = document.createElement("button");
    btn.id = "memoryMapBtn";
    btn.type = "button";
    btn.textContent = "圖案綁定說明";

    const hint = document.createElement("span");
    hint.style.opacity = "0.7";
    hint.style.fontSize = "13px";
    hint.textContent = "（點 emoji 也可打開）";

    bar.appendChild(btn);
    bar.appendChild(hint);

    // 優先插在搜尋 bar 後面
    const searchBar = document.querySelector(".bar");
    if (searchBar?.parentNode) {
      searchBar.parentNode.insertBefore(bar, searchBar.nextSibling);
    } else if (elList?.parentNode) {
      elList.parentNode.insertBefore(bar, elList);
    } else {
      document.body.appendChild(bar);
    }
  }

  // 建 modal（避免依賴 HTML）
  if (!document.getElementById("memoryMapModal")) {
    const overlay = document.createElement("div");
    overlay.id = "memoryMapModal";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.45)";
    overlay.style.display = "none";
    overlay.style.zIndex = "99999";
    overlay.style.padding = "24px";
    overlay.style.boxSizing = "border-box";

    const panel = document.createElement("div");
    panel.style.maxWidth = "900px";
    panel.style.margin = "0 auto";
    panel.style.background = "#fff";
    panel.style.borderRadius = "12px";
    panel.style.boxShadow = "0 20px 60px rgba(0,0,0,.25)";
    panel.style.overflow = "hidden";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "12px 16px";
    header.style.borderBottom = "1px solid #eee";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = "圖案綁定說明（_memory_map）";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "關閉";

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.style.padding = "12px 16px 16px";

    const searchWrap = document.createElement("div");
    searchWrap.style.display = "flex";
    searchWrap.style.gap = "8px";
    searchWrap.style.alignItems = "center";
    searchWrap.style.marginBottom = "10px";

    const input = document.createElement("input");
    input.id = "memoryMapSearch";
    input.placeholder = "搜尋 key / Note";
    input.style.flex = "1";
    input.style.padding = "8px 10px";

    const meta = document.createElement("div");
    meta.id = "memoryMapMeta";
    meta.style.opacity = "0.7";
    meta.style.fontSize = "13px";

    searchWrap.appendChild(input);
    searchWrap.appendChild(meta);

    const tableWrap = document.createElement("div");
    tableWrap.id = "memoryMapTable";
    tableWrap.style.maxHeight = "70vh";
    tableWrap.style.overflow = "auto";
    tableWrap.style.border = "1px solid #eee";
    tableWrap.style.borderRadius = "10px";

    body.appendChild(searchWrap);
    body.appendChild(tableWrap);

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() { overlay.style.display = "none"; }
    closeBtn.onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display !== "none") close();
    });
  }

  btn.onclick = () => openMemoryMapModal();

  // 點 emoji 圖案也可打開（事件代理）
  elList?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.closest && t.closest(".imgBtn")) {
      openMemoryMapModal();
    }
  });
}

function renderMemoryMapTable(rows, q) {
  const wrap = document.getElementById("memoryMapTable");
  const meta = document.getElementById("memoryMapMeta");
  if (!wrap || !meta) return;

  const query = String(q || "").trim().toLowerCase();
  const filtered = query
    ? rows.filter(r => {
        const hay = `${r.key || ""} ${r.note || ""}`.toLowerCase();
        return hay.includes(query);
      })
    : rows;

  meta.textContent = `共 ${rows.length} 筆${query ? `，符合 ${filtered.length} 筆` : ""}`;

  const esc = escapeHtml;
  const html = [
    `<div style="display:grid;grid-template-columns:1.2fr .6fr 2fr;border-bottom:1px solid #eee;background:#fafafa;font-weight:700">`,
    `<div style="padding:10px;border-right:1px solid #eee">key</div>`,
    `<div style="padding:10px;border-right:1px solid #eee">image</div>`,
    `<div style="padding:10px">Note</div>`,
    `</div>`,
    ...filtered.map(r => (
      `<div style="display:grid;grid-template-columns:1.2fr .6fr 2fr;border-bottom:1px solid #f2f2f2">` +
      `<div style="padding:10px;border-right:1px solid #f2f2f2">${esc(r.key)}</div>` +
      `<div style="padding:10px;border-right:1px solid #f2f2f2;font-size:18px">${esc(r.image)}</div>` +
      `<div style="padding:10px">${esc(r.note)}</div>` +
      `</div>`
    ))
  ].join("");

  wrap.innerHTML = html || `<div style="padding:12px;opacity:.7">沒有資料</div>`;
}

async function loadMemoryMap() {
  if (memoryMapCache) return memoryMapCache;
  if (memoryMapLoading) return await memoryMapLoading;

  memoryMapLoading = (async () => {
    const res = await getMemoryMap();
    if (!res?.ok) throw new Error(res?.error || "memory_map_failed");
    const rows = Array.isArray(res?.data) ? res.data : [];
    memoryMapCache = rows.map(r => ({
      key: r.key ?? "",
      image: r.image ?? "",
      note: r.note ?? ""
    }));
    return memoryMapCache;
  })();

  try {
    return await memoryMapLoading;
  } finally {
    memoryMapLoading = null;
  }
}

async function openMemoryMapModal() {
  ensureMemoryMapUi();
  const overlay = document.getElementById("memoryMapModal");
  const input = document.getElementById("memoryMapSearch");
  if (!overlay) return;

  overlay.style.display = "block";
  const wrap = document.getElementById("memoryMapTable");
  if (wrap) wrap.innerHTML = `<div style="padding:12px;opacity:.7">載入中…</div>`;

  try {
    const rows = await loadMemoryMap();
    renderMemoryMapTable(rows, input?.value);
    if (input) {
      input.oninput = () => renderMemoryMapTable(rows, input.value);
      setTimeout(() => input.focus(), 0);
    }
  } catch (e) {
    if (wrap) wrap.innerHTML = `<div style="padding:12px;opacity:.7">讀取失敗，請稍後再試</div>`;
  }
}

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
    const imgHtml = item.img
      ? `<button type="button" class="imgBtn" title="查看圖案綁定說明" style="all:unset;cursor:pointer;font-size:18px">${escapeHtml(item.img)}</button>`
      : ``;
    row.innerHTML = `
      <div class="cell en">${escapeHtml(item.en)}</div>
      <div class="cell">${escapeHtml(item.zh)}</div>
      <div class="cell img">${imgHtml}</div>
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

    elTitle.textContent = titleForLetter(L);
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

    elTitle.textContent = titleForLetter(first);
    elSub.textContent = `本頁單字數：${r?.firstData?.count ?? rows.length}`;
    renderTable(rows);
    console.log("[voca-charge] init ok (init=1)", { v: APP_VERSION, first, letters: (r?.letters || []).length });
    ensureMemoryMapUi();
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
    ensureMemoryMapUi();
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
