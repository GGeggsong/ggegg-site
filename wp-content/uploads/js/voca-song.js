/* =========================
   Google Sheet（CSV）
========================= */
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSt7Ov63JtfrisM5cW9wsb_5q9wagU0ZQgIv6WF5lDxCuFIqr_7CkyaH_rWgyUYQkpbNRauDoANi1YH/pub?output=csv";

/* =========================
   DOM
========================= */
const songSelect = document.getElementById("songSelect");
const typeSelect = document.getElementById("typeSelect");

const loadBtn = document.getElementById("loadBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const loopBtn = document.getElementById("loopBtn");

const mvFrame = document.getElementById("mvPlayer");
const vocabFrame = document.getElementById("vocabPlayer");

const checklistEl = document.getElementById("songChecklist");
const playlistNameInput = document.getElementById("playlistName");
const savePlaylistBtn = document.getElementById("savePlaylistBtn");

const playlistSelect = document.getElementById("playlistSelect");
const loadPlaylistBtn = document.getElementById("loadPlaylistBtn");
const deletePlaylistBtn = document.getElementById("deletePlaylistBtn");

const nowPlaylistNameEl = document.getElementById("nowPlaylistName");
const nowPlaylistListEl = document.getElementById("nowPlaylistList");

/* =========================
   State
========================= */
let songs = [];
let activePlaylist = null;       // {id,name,items:[{song_id,type}],index}
let loopEnabled = false;

// 「手動模式」：true = 用上面的 songSelect/typeSelect
//              false = 用 activePlaylist
let manualMode = true;

// 兩段式：同一首同一詞性，只需要「載入一次」
// 第二次按播放才 postMessage play
let loadedKey = null;
let loadedOnceForKey = false;

/* =========================
   localStorage keys
========================= */
const LS_PLAYLISTS = "voca_song_playlists";
const LS_ACTIVE = "voca_song_active";
const LS_LOOP = "voca_song_loop";

/* =========================
   Labels (Bilingual)
========================= */
const TYPE_LABEL = {
  noun: "名詞 / Noun",
  verb: "動詞 / Verb",
  adj:  "形容詞 / Adjective",
};

/* =========================
   CSV parse (robust)
========================= */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];

    if (c === '"' && inQuotes && n === '"') {
      cell += '"'; i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(cell); cell = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && n === "\n") i++;
      row.push(cell);
      if (row.length > 1) rows.push(row);
      row = []; cell = "";
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  const header = rows[0].map(h => (h || "").trim());
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => o[h] = (r[i] || "").trim());
    return o;
  });
}

/* =========================
   YouTube helpers
========================= */
function getYouTubeId(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/shorts\/([^/]+)/);
      if (m) return m[1];
      const e = u.pathname.match(/\/embed\/([^/]+)/);
      if (e) return e[1];
    }
  } catch {}
  return "";
}

function buildEmbedSrc(videoId, { mute = false } = {}) {
  if (!videoId) return "";
  const base = `https://www.youtube.com/embed/${videoId}`;
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  if (mute) params.set("mute", "1");
  return `${base}?${params.toString()}`;
}

function postPlay(iframeEl) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "playVideo", args: [] }),
      "*"
    );
  } catch {}
}

function playBoth() {
  postPlay(mvFrame);
  postPlay(vocabFrame);
}

/* =========================
   Storage helpers
========================= */
function getPlaylists() {
  return JSON.parse(localStorage.getItem(LS_PLAYLISTS) || "[]");
}
function savePlaylists(pls) {
  localStorage.setItem(LS_PLAYLISTS, JSON.stringify(pls));
}
function saveActive() {
  if (activePlaylist) localStorage.setItem(LS_ACTIVE, JSON.stringify(activePlaylist));
  else localStorage.removeItem(LS_ACTIVE);
}

/* =========================
   Render UI
========================= */
function renderMyPlaylists() {
  playlistSelect.innerHTML = "";
  const pls = getPlaylists();
  pls.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    playlistSelect.appendChild(opt);
  });

  if (!pls.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（尚無清單 / No playlist）";
    playlistSelect.appendChild(opt);
  }
}

function renderChecklist() {
  checklistEl.innerHTML = "";
  songs.forEach(song => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <input type="checkbox" value="${song.song_id}">
      <span>${song.song_title}</span>
      <span class="badge">${song.lang || ""}</span>
    `;
    checklistEl.appendChild(row);
  });
}

function renderNowPlaylist() {
  nowPlaylistNameEl.textContent = "";
  nowPlaylistListEl.innerHTML = "";

  if (!activePlaylist || !activePlaylist.items?.length) {
    nowPlaylistNameEl.textContent = "（未使用播放清單 / No active playlist）";
    return;
  }

  nowPlaylistNameEl.textContent = activePlaylist.name;

  activePlaylist.items.forEach((item, idx) => {
    const song = songs.find(s => s.song_id === item.song_id);
    if (!song) return;

    const div = document.createElement("div");
    div.className = "item" + (idx === activePlaylist.index ? " active" : "");
    div.textContent = `${song.song_title} (${TYPE_LABEL[item.type] || item.type})`;

    // 點現在播放清單可直接跳播
    div.onclick = () => {
      activePlaylist.index = idx;
      manualMode = false;
      saveActive();
      loadCurrent({ resetTwoStep: true });
    };

    nowPlaylistListEl.appendChild(div);
  });
}

function setLoopBtnText() {
  loopBtn.textContent = loopEnabled
    ? "循環：開（Loop: On）"
    : "循環：關（Loop: Off）";
}

/* =========================
   Two-step reset
========================= */
function resetTwoStep() {
  loadedKey = null;
  loadedOnceForKey = false;
}

/* =========================
   Decide & load current
========================= */
function getCurrentSelection() {
  // 手動模式：永遠以 select 為準
  if (manualMode || !activePlaylist) {
    const song = songs.find(s => s.song_id === songSelect.value);
    const type = typeSelect.value;
    return { song, type, from: "manual" };
  }

  // 播放清單模式
  const item = activePlaylist.items[activePlaylist.index];
  const song = songs.find(s => s.song_id === item.song_id);
  const type = item.type;
  return { song, type, from: "playlist" };
}

function applyIframes(song, type) {
  const mvId = getYouTubeId(song.mv_url);

  const vocabUrl =
    type === "noun" ? song.noun_video :
    type === "verb" ? song.verb_video :
    song.adj_video;

  const vocabId = getYouTubeId(vocabUrl);

  // 組 key，讓兩段式只針對「同一首+同詞性」
  const key = `${song.song_id}__${type}__${mvId}__${vocabId}`;

  // 只要 key 變了，就視為換歌/換詞性 → 需要重新兩段式
  if (key !== loadedKey) {
    mvFrame.src = buildEmbedSrc(mvId, { mute: false });
    vocabFrame.src = buildEmbedSrc(vocabId, { mute: true });

    loadedKey = key;
    loadedOnceForKey = false;
  }

  return key;
}

function loadCurrent({ resetTwoStep: doReset = false } = {}) {
  if (doReset) resetTwoStep();

  const { song, type } = getCurrentSelection();
  if (!song) return;

  applyIframes(song, type);

  // 更新右側「目前播放清單」高亮
  renderNowPlaylist();
}

/* =========================
   Button handlers
========================= */
loadBtn.onclick = () => {
  const { song, type } = getCurrentSelection();
  if (!song) return;

  // 第一次：載入（loadedOnceForKey=false）
  // 第二次：同步播放
  applyIframes(song, type);

  if (loadedOnceForKey) {
    playBoth();
  } else {
    loadedOnceForKey = true;
  }

  renderNowPlaylist();
};

nextBtn.onclick = () => {
  if (!activePlaylist || !activePlaylist.items?.length) return;

  manualMode = false;
  activePlaylist.index++;

  if (activePlaylist.index >= activePlaylist.items.length) {
    if (!loopEnabled) {
      activePlaylist.index = activePlaylist.items.length - 1;
      return;
    }
    activePlaylist.index = 0;
  }

  saveActive();
  loadCurrent({ resetTwoStep: true });
};

prevBtn.onclick = () => {
  if (!activePlaylist || !activePlaylist.items?.length) return;

  manualMode = false;
  activePlaylist.index--;

  if (activePlaylist.index < 0) {
    if (!loopEnabled) {
      activePlaylist.index = 0;
      return;
    }
    activePlaylist.index = activePlaylist.items.length - 1;
  }

  saveActive();
  loadCurrent({ resetTwoStep: true });
};

loopBtn.onclick = () => {
  loopEnabled = !loopEnabled;
  localStorage.setItem(LS_LOOP, JSON.stringify(loopEnabled));
  setLoopBtnText();
};

/* =========================
   Playlist create / load / delete
========================= */
savePlaylistBtn.onclick = () => {
  const checked = [...checklistEl.querySelectorAll("input[type=checkbox]:checked")];
  if (!checked.length) {
    alert("請勾選歌曲 / Please select at least one song");
    return;
  }

  const type = typeSelect.value; // 以「當下詞性」存成清單
  const items = checked.map(c => ({ song_id: c.value, type }));

  const nameBase = (playlistNameInput.value || "未命名 / Untitled").trim();
  const name = `${nameBase}（${TYPE_LABEL[type]}）`;

  const pl = {
    id: "pl_" + Date.now(),
    name,
    items,
    index: 0
  };

  const pls = getPlaylists();
  pls.push(pl);
  savePlaylists(pls);
  renderMyPlaylists();

  // 直接切到這個播放清單
  activePlaylist = pl;
  manualMode = false;
  saveActive();
  loadCurrent({ resetTwoStep: true });
};

loadPlaylistBtn.onclick = () => {
  const id = playlistSelect.value;
  if (!id) return;

  const pl = getPlaylists().find(p => p.id === id);
  if (!pl) return;

  activePlaylist = pl;
  activePlaylist.index = 0;
  manualMode = false;

  saveActive();
  loadCurrent({ resetTwoStep: true });
};

deletePlaylistBtn.onclick = () => {
  const id = playlistSelect.value;
  if (!id) return;

  const pls = getPlaylists().filter(p => p.id !== id);
  savePlaylists(pls);

  // 如果刪的是目前 active，清掉 active 回手動
  if (activePlaylist && activePlaylist.id === id) {
    activePlaylist = null;
    manualMode = true;
    saveActive();
    resetTwoStep();
  }

  renderMyPlaylists();
  renderNowPlaylist();
};

/* =========================
   Manual mode switch (fix your issue)
========================= */
function switchToManualMode() {
  manualMode = true;
  activePlaylist = null;
  saveActive();
  resetTwoStep();
  renderNowPlaylist();
}

// 只要使用者動到選歌/詞性：保證手動模式生效（你剛說壞的點）
songSelect.addEventListener("change", switchToManualMode);
typeSelect.addEventListener("change", switchToManualMode);

/* =========================
   Init
========================= */
async function init() {
  loopEnabled = JSON.parse(localStorage.getItem(LS_LOOP) || "false");
  setLoopBtnText();

  const res = await fetch(SHEET_CSV_URL);
  const text = await res.text();
  const rows = parseCSV(text);
  songs = rowsToObjects(rows).filter(s => s.song_id);

  // songs 下拉
  songSelect.innerHTML = "";
  songs.forEach(song => {
    const opt = document.createElement("option");
    opt.value = song.song_id;
    opt.textContent = `${song.song_title} / ${song.artist || ""}`;
    songSelect.appendChild(opt);
  });

  // checklist
  renderChecklist();

  // playlists 下拉
  renderMyPlaylists();

  // restore active playlist（若有）
  const saved = localStorage.getItem(LS_ACTIVE);
  if (saved) {
    try {
      activePlaylist = JSON.parse(saved);
      manualMode = false;
    } catch {
      activePlaylist = null;
      manualMode = true;
    }
  }

  renderNowPlaylist();
  // 不自動載入影片（維持你「按兩次」的規則）
}
init();
