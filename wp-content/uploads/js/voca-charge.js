import {
  getLetters,
  getByLetter,
  search,
  getMeta
} from "./voca-charge_api.js";

const elLetters = document.querySelector("#letters");
const elList = document.querySelector("#list");
const elTitle = document.querySelector("#title");
const elSearch = document.querySelector("#search");
const elSearchBtn = document.querySelector("#searchBtn");
const elTotal = document.querySelector("#total");
const elSub = document.querySelector("#subcount");

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
function renderTable(rows) {
  elList.innerHTML = "";

  // 表頭
  const header = document.createElement("div");
  header.className = "row header";
  header.innerHTML = `
    <div class="cell">English</div>
    <div class="cell">Chinese</div>
    <div class="cell">Image</div>
    <div class="cell">Note</div>
  `;
  elList.appendChild(header);

  if (!rows || rows.length === 0) {
    elList.innerHTML += `<div class="empty">沒有資料</div>`;
    return;
  }

  rows.forEach(item => {
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

/* ===== Init ===== */
async function init() {
  // 總單字數（一定顯示）
  try {
    const meta = await getMeta();
    elTotal.textContent = `📚 總單字數：${meta?.total ?? 0}`;
  } catch {
    elTotal.textContent = `📚 總單字數：0`;
  }

  const lettersRes = await getLetters();
  elLetters.innerHTML = "";

  lettersRes.letters.forEach(L => {
    const btn = document.createElement("button");
    btn.textContent = L;

    btn.onclick = async () => {
      elTitle.textContent = `字母 ${L}`;
      const res = await getByLetter(L);
      elSub.textContent = `本頁單字數：${res.count}`;
      renderTable(res.data);
    };

    elLetters.appendChild(btn);
  });

  elLetters.querySelector("button")?.click();
}

/* ===== 搜尋 ===== */
elSearchBtn.onclick = async () => {
  const q = elSearch.value.trim();
  if (!q) return;

  elTitle.textContent = `搜尋：${q}`;
  elSub.textContent = "";

  const res = await search(q);
  renderTable(res.data);
};


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
