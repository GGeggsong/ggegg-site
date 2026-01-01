/* =========================
  Google Sheet（CSV）
  - 仍保留自動讀取：不需要手動維護歌曲清單
  - 但在程式內轉成 songs 物件結構（符合你指定的資料結構）
========================= */
const APP_VERSION = "2026-01-01.13";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSt7Ov63JtfrisM5cW9wsb_5q9wagU0ZQgIv6WF5lDxCuFIqr_7CkyaH_rWgyUYQkpbNRauDoANi1YH/pub?output=csv";

/* =========================
   DOM
========================= */
const songSelect = document.getElementById("songSelect");
const songSearch = document.getElementById("songSearch");
const songList = document.getElementById("songList"); // 若頁面有一排按鈕的容器
const favToggleBtn = document.getElementById("favToggleBtn");

// 學習模式（Tabs / Segmented control）
const currentSongEl = document.getElementById("currentSong");
const modeTabsEl = document.getElementById("modeTabs");
const modeBtnNoun = document.getElementById("modeNoun");
const modeBtnVerb = document.getElementById("modeVerb");
const modeBtnAdj = document.getElementById("modeAdj");

const loadBtn = document.getElementById("loadBtn");
const pauseBtn = document.getElementById("pauseBtn");
const syncBtn = document.getElementById("syncBtn");
const timeBtn = document.getElementById("timeBtn"); // （已停用）顯示左邊時間
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const loopBtn = document.getElementById("loopBtn");
const repeatOneBtn = document.getElementById("repeatOneBtn");
// 同步偏移控制（可選）
const offsetPlusBtn = document.getElementById("offsetPlusBtn");
const offsetMinusBtn = document.getElementById("offsetMinusBtn");
const offsetDisplay = document.getElementById("offsetDisplay");

let mvFrame = document.getElementById("mvPlayer");
const vocabFrame = document.getElementById("vocabPlayer");
let vocabReady = false;
let pendingVocabId = null;

// Playlist UI（若頁面有）
const nowQueueList = document.getElementById("nowQueueList");
const myPlaylistSelect = document.getElementById("myPlaylistSelect");
const playMyPlaylistBtn = document.getElementById("playMyPlaylistBtn");
// My Playlist 管理 UI（需要你在 HTML 加上這些 ID）
const myPlaylistNameInput = document.getElementById("myPlaylistNameInput");
const createMyPlaylistBtn = document.getElementById("createMyPlaylistBtn");
const addCurrentToMyPlaylistBtn = document.getElementById("addCurrentToMyPlaylistBtn");
const removeCurrentFromMyPlaylistBtn = document.getElementById("removeCurrentFromMyPlaylistBtn");
const deleteMyPlaylistBtn = document.getElementById("deleteMyPlaylistBtn");
const myPlaylistList = document.getElementById("myPlaylistList");
const myPlaylistMsg = document.getElementById("myPlaylistMsg");

// My Playlist Dialog（可選，用原生 <dialog> 做小視窗）
const playlistDialog = document.getElementById("playlistDialog");
const openPlaylistDialogBtn = document.getElementById("openPlaylistDialogBtn");
const closePlaylistDialogBtn = document.getElementById("closePlaylistDialogBtn");
// Dialog 內選歌（需要你在 HTML 加上這些 ID）
const dialogMyPlaylistSelect = document.getElementById("dialogMyPlaylistSelect");
const dialogSongSearch = document.getElementById("dialogSongSearch");
const dialogSongSelect = document.getElementById("dialogSongSelect");
const addSelectedToMyPlaylistBtn = document.getElementById("addSelectedToMyPlaylistBtn");

/* =========================
   Optional YouTube API player (僅用來讀取時間，不改變原本播放流程)
========================= */
let ytReady = false;
let mvPlayerObj = null;
let mvReady = false;
let pendingMvId = null; // 下一個要顯示在左邊的影片ID（只用 API 切換，不換 src）
let syncOffset = 0; // 右邊延遲秒數（初始 0.5s）
let leftSwitchToken = 0;

// 這個 flag：當 iframe 已載好，但 API 還沒 ready 時，先記起來等 API ready 再建 player
let pendingMvPlayerInit = false;

// debug interval（每秒 log 左側時間）
let timeLogInterval = null;
const DEBUG_TIMELOG = false; // 預設關閉，避免 console 一直刷與觸發 YouTube 內部噪音

// 確保 iframe_api 有載入（不要求你改 HTML）
(() => {
  try {
    if (window.YT && window.YT.Player) return;
    const exists = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (exists) return;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  } catch {}
})();

/* =========================
   State
========================= */
// 你指定的資料結構（由 CSV 生成）
// const songs = {
//   "ATTITUDE / IVE": {
//     noun: { left: "...", right: "..." },
//     verb: { left: "...", right: "..." },
//     adj:  { left: "...", right: "..." }
//   }
// };
let songs = {};
let songKeys = []; // Object.keys(songs) 的快取（用於 prev/next）
let filteredSongKeys = null; // 搜尋結果（只影響 dropdown 顯示）
let currentIndex = 0; // 對 songKeys 的 index
let currentMode = "noun"; // noun | verb | adj
let loopEnabled = false; // repeat all
let repeatOneEnabled = false; // repeat one
let loadedKey = null; // 兩段式：同一首同詞性只需載入一次
let loadedOnceForKey = false;
const LS_LOOP = "voca_song_loop";
const LS_REPEAT_ONE = "voca_song_repeat_one";
const LS_FAVORITES = "voca_song_favorites";
const MAX_FAVORITES = 5;
const EMPTY_FAV_HINT = "⭐ 點擊歌曲旁的星號，加入我的快捷歌";

// 系統播放清單（Queue）
let currentQueue = []; // array of songKey
let currentQueueIndex = 0;

// 我的播放清單（localStorage）
const LS_MY_PLAYLISTS = "voca_song_my_playlists";

function loadMyPlaylists() {
  try {
    const raw = localStorage.getItem(LS_MY_PLAYLISTS);
    const obj = JSON.parse(raw || "{}");
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    return {};
  }
}

function saveMyPlaylists(obj) {
  try {
    localStorage.setItem(LS_MY_PLAYLISTS, JSON.stringify(obj || {}));
  } catch {}
}

function setMyPlaylistMsg(text = "") {
  if (!myPlaylistMsg) return;
  myPlaylistMsg.classList.add("hint");
  // 提示文字放大一點，避免使用者看不到步驟引導
  myPlaylistMsg.style.fontSize = "15px";
  myPlaylistMsg.style.lineHeight = "1.6";
  myPlaylistMsg.style.fontWeight = "800";
  myPlaylistMsg.style.color = "#b45309"; // amber-700（醒目但不像錯誤）
  // 純文字提示：不要框框/底色/色條
  myPlaylistMsg.style.background = "transparent";
  myPlaylistMsg.style.border = "none";
  myPlaylistMsg.style.borderLeft = "none";
  myPlaylistMsg.style.borderRadius = "0";
  myPlaylistMsg.style.padding = "0";
  myPlaylistMsg.style.marginTop = "8px";
  myPlaylistMsg.style.cursor = "default";
  myPlaylistMsg.style.boxShadow = "none";
  myPlaylistMsg.textContent = text;
  myPlaylistMsg.style.display = text ? "block" : "none";
}

function isPlaylistDialogOpen() {
  return !!(playlistDialog && playlistDialog.open);
}

function setSelectedPlaylistName(name) {
  if (myPlaylistSelect) myPlaylistSelect.value = name || "";
  if (dialogMyPlaylistSelect) dialogMyPlaylistSelect.value = name || "";
}

function getSelectedMyPlaylistName() {
  // 小視窗優先（避免「主畫面選哪個」造成使用者混亂）
  if (isPlaylistDialogOpen() && dialogMyPlaylistSelect) return dialogMyPlaylistSelect.value || "";
  if (myPlaylistSelect) return myPlaylistSelect.value || "";
  if (dialogMyPlaylistSelect) return dialogMyPlaylistSelect.value || "";
  return "";
}

function isCustomPlaylistName(name) {
  return !!name && name !== "__favorites__";
}

function getCurrentSongKeySafe() {
  return getCurrentSongKey();
}

function renderMyPlaylistList() {
  if (!myPlaylistList) return;
  const name = getSelectedMyPlaylistName();
  myPlaylistList.innerHTML = "";

  if (!name) {
    myPlaylistList.innerHTML = `
      <div class="hint" style="font-size:15px;line-height:1.6;font-weight:800;color:#b45309;background:transparent;border:none;border-left:none;border-radius:0;padding:0;margin-top:8px;cursor:default;box-shadow:none;">
        請先選擇一個播放清單
      </div>
    `;
    return;
  }

  let keys = [];
  if (name === "__favorites__") {
    keys = loadFavorites();
  } else {
    const pls = loadMyPlaylists();
    keys = pls && Array.isArray(pls[name]) ? pls[name] : [];
  }

  if (!keys.length) {
    myPlaylistList.innerHTML = `<div class="hint">（清單是空的）</div>`;
    return;
  }

  keys.forEach((key, idx) => {
    const row = document.createElement("div");
    row.className = "queue-item";
    row.style.cursor = "pointer";
    row.innerHTML = `<span class="queue-item-title"></span><span class="queue-item-badge"></span>`;
    row.querySelector(".queue-item-title").textContent = key;
    row.querySelector(".queue-item-badge").textContent = String(idx + 1);
    row.addEventListener("click", () => {
      // 點清單內歌曲：跳播到該首（不需要先按播放）
      const i = songKeys.indexOf(key);
      if (i < 0) return;
      const wasPlaying = isLeftPlaying();
      currentIndex = i;
      if (songSelect) songSelect.value = key;
      setCurrentSongLabel();
      updateFavToggleBtn();
      loadCurrent({ resetTwoStep: true });
      updateLoadBtnText();
      if (wasPlaying) requestAutoPlayAfterSwitch();
    });
    myPlaylistList.appendChild(row);
  });
}

function createMyPlaylist(name) {
  const pls = loadMyPlaylists();
  if (pls[name]) {
    setMyPlaylistMsg("已存在同名清單");
    return false;
  }
  pls[name] = [];
  saveMyPlaylists(pls);
  setMyPlaylistMsg("已建立清單");
  renderMyPlaylistSelect();
  setSelectedPlaylistName(name);
  renderMyPlaylistList();
  return true;
}

function addSongToPlaylist(name, songKey) {
  if (!isCustomPlaylistName(name)) return;
  const pls = loadMyPlaylists();
  const arr = pls && Array.isArray(pls[name]) ? pls[name] : [];
  const existed = arr.includes(songKey);
  if (!existed) arr.push(songKey);
  pls[name] = arr;
  saveMyPlaylists(pls);
  setMyPlaylistMsg(existed ? "此歌曲已在清單中" : "已加入歌曲");
  renderMyPlaylistList();
}

function removeSongFromPlaylist(name, songKey) {
  if (!isCustomPlaylistName(name)) return;
  const pls = loadMyPlaylists();
  const arr = pls && Array.isArray(pls[name]) ? pls[name] : [];
  const next = arr.filter((k) => k !== songKey);
  pls[name] = next;
  saveMyPlaylists(pls);
  setMyPlaylistMsg("已移除歌曲");
  renderMyPlaylistList();
}

function deleteMyPlaylist(name) {
  if (!isCustomPlaylistName(name)) return;
  const pls = loadMyPlaylists();
  if (pls && pls[name]) {
    delete pls[name];
    saveMyPlaylists(pls);
  }
  setMyPlaylistMsg("已刪除清單");
  renderMyPlaylistSelect();
  if (myPlaylistSelect) myPlaylistSelect.value = "";
  renderMyPlaylistList();
}

function getQueueIndexOfSong(songKey) {
  return currentQueue.indexOf(songKey);
}

function syncQueueIndexToCurrentSong() {
  const key = getCurrentSongKey();
  const idx = getQueueIndexOfSong(key);
  if (idx >= 0) currentQueueIndex = idx;
}

function renderQueue() {
  if (!nowQueueList) return;
  nowQueueList.innerHTML = "";

  if (!currentQueue.length) {
    const li = document.createElement("li");
    li.className = "queue-item is-current";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.innerHTML = `<span class="queue-item-title">Queue 為空（請選我的播放清單後播放）</span><span class="queue-item-badge">NOW</span>`;
    nowQueueList.appendChild(li);
    return;
  }

  currentQueue.forEach((key, i) => {
    const li = document.createElement("li");
    li.className = "queue-item" + (i === currentQueueIndex ? " is-current" : "");
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.dataset.index = String(i);
    li.innerHTML = `<span class="queue-item-title"></span><span class="queue-item-badge"></span>`;
    li.querySelector(".queue-item-title").textContent = key;
    li.querySelector(".queue-item-badge").textContent = i === currentQueueIndex ? "NOW" : "NEXT";
    nowQueueList.appendChild(li);
  });
}

function loadQueue(queue) {
  // queue: array of songKey
  const q = Array.isArray(queue) ? queue : [];
  // 只保留存在於 songs 的 key
  currentQueue = q.filter((k) => typeof k === "string" && k in songs);
  currentQueueIndex = 0;
  renderQueue();
}

function playAtIndex(index) {
  const i = Number(index);
  if (!Number.isFinite(i)) return;
  if (!currentQueue.length) return;
  if (i < 0 || i >= currentQueue.length) return;

  const songKey = currentQueue[i];
  const idx = songKeys.indexOf(songKey);
  if (idx < 0) return;

  currentQueueIndex = i;
  renderQueue();

  // 這裡只「外層呼叫」既有的換歌與自動播放邏輯
  currentIndex = idx;
  if (songSelect) songSelect.value = songKey;
  setCurrentSongLabel();
  updateFavToggleBtn();
  loadCurrent({ resetTwoStep: true });
  updateLoadBtnText();
  requestAutoPlayAfterSwitch();
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(LS_FAVORITES);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}

function saveFavorites(arr) {
  try {
    localStorage.setItem(LS_FAVORITES, JSON.stringify(arr));
  } catch {}
}

function isFavorite(songKey) {
  if (!songKey) return false;
  return loadFavorites().includes(songKey);
}

function getFavTargetSongKey() {
  // 星號按鈕的目標：以 dropdown 目前顯示的值為準（搜尋時也合理）
  // 不存在才退回「當前歌曲」
  const v = songSelect && songSelect.value ? songSelect.value : null;
  return v || getCurrentSongKey();
}

function toggleFavorite(songKey) {
  if (!songKey) return;
  const favs = loadFavorites();
  const idx = favs.indexOf(songKey);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    // newest first
    favs.unshift(songKey);
    // cap
    while (favs.length > MAX_FAVORITES) favs.pop();
  }
  saveFavorites(favs);
  renderFavorites();
  updateFavToggleBtn();
}

function updateFavToggleBtn() {
  if (!favToggleBtn) return;
  const key = getFavTargetSongKey();
  const fav = isFavorite(key);
  favToggleBtn.textContent = fav ? "★" : "☆";
  favToggleBtn.title = fav ? "移除我的快捷歌" : "加入我的快捷歌";
}

/* =========================
   Labels (Bilingual)
========================= */
const TYPE_LABEL = {
  noun: "名詞 / Noun",
  verb: "動詞 / Verb",
  adj: "形容詞 / Adjective",
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
      cell += '"';
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && n === "\n") i++;
      row.push(cell);
      if (row.length > 1) rows.push(row);
      row = [];
      cell = "";
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
  const header = rows[0].map((h) => (h || "").trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = (r[i] || "").trim()));
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
  const origin = window.location?.origin || "";
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    ...(origin ? { origin } : {}),
  });
  if (mute) params.set("mute", "1");
  return `${base}?${params.toString()}`;
}

/* =========================
   Player controls (postMessage)
========================= */
function postPlay(iframeEl) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "playVideo", args: [] }),
      "*"
    );
  } catch {}
}

function postPause(iframeEl) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
      "*"
    );
  } catch {}
}

function postSeek(iframeEl, seconds = 0) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
      "*"
    );
  } catch {}
}

function postCueById(iframeEl, videoId) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "cueVideoById", args: [videoId] }),
      "*"
    );
  } catch {}
}

function postMute(iframeEl) {
  try {
    iframeEl.contentWindow.postMessage(
      JSON.stringify({ event: "command", func: "mute", args: [] }),
      "*"
    );
  } catch {}
}

function playBoth() {
  // 左邊：優先用 API；若 player 尚未 ready 或 API 失敗，fallback 用 postMessage
  let playedLeft = false;
  if (mvPlayerObj && mvPlayerObj.playVideo) {
    try {
      mvPlayerObj.playVideo();
      playedLeft = true;
    } catch {}
  }
  if (!playedLeft && mvFrame) postPlay(mvFrame);
  postPlay(vocabFrame);
}

function pauseBoth() {
  let pausedLeft = false;
  if (mvPlayerObj && mvPlayerObj.pauseVideo) {
    try {
      mvPlayerObj.pauseVideo();
      pausedLeft = true;
    } catch {}
  }
  if (!pausedLeft && mvFrame) postPause(mvFrame);
  postPause(vocabFrame);
}

function syncBoth() {
  const t = getMvCurrentTime();
  if (t === null) {
    alert("無法取得左邊影片時間，請先按播放一次讓影片載入再試。");
    console.warn("[voca-song] syncBoth: no currentTime (API not ready / mv not ready)");
    return;
  }
  const target = Math.max(0, t - syncOffset); // 右邊慢 syncOffset 秒，避免超前
  console.log("[voca-song] sync to left time =", t, "-> right seek =", target, "offset =", syncOffset);

  postSeek(vocabFrame, target);
}

/* =========================
   UI helpers
========================= */
function setLoopBtnText() {
  if (!loopBtn) return;
  loopBtn.innerHTML = loopEnabled
    ? "整體循環：開<br>(Repeat All: On)"
    : "整體循環：關<br>(Repeat All: Off)";
}

function setRepeatOneBtnText() {
  if (!repeatOneBtn) return;
  repeatOneBtn.innerHTML = repeatOneEnabled
    ? "單曲循環：開<br>(Repeat One: On)"
    : "單曲循環：關<br>(Repeat One: Off)";
}

function resetTwoStep() {
  loadedKey = null;
  loadedOnceForKey = false;
  updateLoadBtnText();
}

function getCurrentSongKey() {
  return songKeys[currentIndex] || null;
}

function getVisibleSongKeys() {
  const base = filteredSongKeys && filteredSongKeys.length ? filteredSongKeys : songKeys;
  const cur = getCurrentSongKey();
  // 只影響 dropdown 顯示，但不要因為搜尋把「目前選歌」擠掉導致選擇被改變
  if (cur && !base.includes(cur)) return [cur, ...base];
  return base;
}

function getSongEntry(songKey) {
  return songKey ? songs[songKey] : null;
}

function setCurrentSongLabel() {
  if (!currentSongEl) return;
  const key = getCurrentSongKey();
  const MODE_ZH = { noun: "名詞", verb: "動詞", adj: "形容詞" };
  const modeZh = MODE_ZH[currentMode] || currentMode;
  currentSongEl.textContent = key
    ? `🎵 當前歌曲：${key} ｜ 📚 學習模式：${modeZh}`
    : `🎵 當前歌曲：— ｜ 📚 學習模式：${modeZh}`;
}

function setModeTabsState() {
  const entry = getSongEntry(getCurrentSongKey());
  const has = (m) => !!(entry && entry[m] && entry[m].left && entry[m].right);

  const setBtn = (btn, mode) => {
    if (!btn) return;
    btn.disabled = !has(mode);
    btn.classList.toggle("active", currentMode === mode);
    btn.setAttribute("aria-selected", currentMode === mode ? "true" : "false");
  };

  setBtn(modeBtnNoun, "noun");
  setBtn(modeBtnVerb, "verb");
  setBtn(modeBtnAdj, "adj");
}

function ensureModeAvailableOrFallback() {
  const entry = getSongEntry(getCurrentSongKey());
  const ok = (m) => !!(entry && entry[m] && entry[m].left && entry[m].right);
  if (ok(currentMode)) return;
  if (ok("noun")) currentMode = "noun";
  else if (ok("verb")) currentMode = "verb";
  else if (ok("adj")) currentMode = "adj";
}

function goToIndex(nextIndex, { autoPlay = false } = {}) {
  if (!songKeys.length) return;
  currentIndex = Math.max(0, Math.min(nextIndex, songKeys.length - 1));
  if (songSelect) songSelect.value = getCurrentSongKey() || "";
  setCurrentSongLabel();
  updateFavToggleBtn();
  syncQueueIndexToCurrentSong();
  renderQueue();
  ensureModeAvailableOrFallback();
  setModeTabsState();
  loadCurrent({ resetTwoStep: true });
  if (autoPlay) requestAutoPlayAfterSwitch();
}

function updateLoadBtnText() {
  if (!loadBtn) return;
  // 用 <br> 讓「按兩次」換行
  loadBtn.innerHTML = loadedOnceForKey
    ? "▶ 播放（Play）<br>再按一次開始播放"
    : "▶ 播放（Play）<br>按兩次 (twice click)";
}

function switchMode(nextMode, { keepPlaying = true } = {}) {
  const entry = getSongEntry(getCurrentSongKey());
  if (!entry || !entry[nextMode] || !entry[nextMode].right) return;
  const wasPlaying = keepPlaying ? isLeftPlaying() : false;
  currentMode = nextMode;
  setModeTabsState();
  setCurrentSongLabel();
  // 不重置兩段式：保持播放狀態（若當下正在播）
  loadCurrent({ resetTwoStep: false });
  if (wasPlaying) requestAutoPlayAfterSwitch();
}

/* =========================
   Auto play after switch
========================= */
let autoPlayAfterSwitch = false;
let autoPlayTries = 0;
let lastEndedAt = 0;

function isLeftPlaying() {
  try {
    if (!mvReady || !mvPlayerObj || !mvPlayerObj.getPlayerState) return false;
    return mvPlayerObj.getPlayerState() === YT.PlayerState.PLAYING;
  } catch {
    return false;
  }
}

function requestAutoPlayAfterSwitch() {
  autoPlayAfterSwitch = true;
  autoPlayTries = 0;

  const tick = () => {
    if (!autoPlayAfterSwitch) return;
    autoPlayTries += 1;

    playBoth(); // 左邊用 API；右邊用 postMessage

    if (autoPlayTries >= 6) {
      autoPlayAfterSwitch = false;
      return;
    }
    setTimeout(tick, 700);
  };

  setTimeout(tick, 300);
}

function handleLeftEnded() {
  // 避免 ENDED 事件連續觸發
  const now = Date.now();
  if (now - lastEndedAt < 1200) return;
  lastEndedAt = now;

  // 單曲循環優先
  if (repeatOneEnabled) {
    try {
      if (mvReady && mvPlayerObj && mvPlayerObj.seekTo) mvPlayerObj.seekTo(0, true);
    } catch {}
    postSeek(vocabFrame, 0);
    requestAutoPlayAfterSwitch();
    return;
  }

  // 若有系統 Queue：播完自動播下一首（到尾是否回頭由整體循環決定）
  if (currentQueue && currentQueue.length) {
    const next = currentQueueIndex + 1;
    if (next < currentQueue.length) {
      playAtIndex(next);
      return;
    }
    // queue 到尾
    if (loopEnabled) {
      playAtIndex(0);
    }
    return;
  }

  // 整體循環：播完下一首（到尾回第一首）；關閉則播完就停
  if (!loopEnabled) return;

  if (!songKeys.length) return;
  const next = currentIndex + 1 >= songKeys.length ? 0 : currentIndex + 1;
  goToIndex(next, { autoPlay: true });
}

/* =========================
   YT Player lifecycle (穩定核心)
========================= */
function destroyMvPlayer() {
  // 核心原則：左邊永遠只建立一次 player，不 destroy、不替換 iframe
  mvReady = false;
  pendingMvPlayerInit = false;
  if (timeLogInterval) {
    clearInterval(timeLogInterval);
    timeLogInterval = null;
  }
}

function ensureLeftEmbedReady(firstMvId) {
  // 若你的 HTML 本來就是 <iframe id="mvPlayer">，而且沒有 enablejsapi，YT 可能無法控制。
  // 我們只允許「第一次」補一次 src（之後換歌只用 API，不再改 src）。
  try {
    if (!mvFrame) mvFrame = document.getElementById("mvPlayer");
    if (!mvFrame) return;
    if (mvFrame.tagName !== "IFRAME") return; // div 讓 YT.Player 自己建 iframe

    const src = mvFrame.getAttribute("src") || "";
    if (!src || !src.includes("enablejsapi=1")) {
      mvFrame.setAttribute("src", buildEmbedSrc(firstMvId, { mute: false }));
    }
  } catch {}
}

function requestLeftSwitch(mvId) {
  // 單一入口：任何情況要切左邊影片，都走這裡
  pendingMvId = mvId;
  ensureLeftEmbedReady(mvId);
  initMvPlayer();

  const myToken = ++leftSwitchToken;
  let tries = 0;
  const maxTries = 25; // ~5s

  const attempt = () => {
    if (myToken !== leftSwitchToken) return; // 有更新的切歌需求就取消舊的
    tries += 1;
    if (!mvPlayerObj) {
      if (tries < maxTries) return void setTimeout(attempt, 200);
      console.warn("[voca-song] leftSwitch: no player", { mvId });
      return;
    }

    try { if (mvPlayerObj.stopVideo) mvPlayerObj.stopVideo(); } catch {}

    try {
      if (mvPlayerObj.cueVideoById) mvPlayerObj.cueVideoById(mvId);
      else if (mvPlayerObj.loadVideoById) mvPlayerObj.loadVideoById(mvId);
    } catch (e) {
      try { if (mvPlayerObj.loadVideoById) mvPlayerObj.loadVideoById(mvId); } catch {}
      console.warn("[voca-song] leftSwitch: cue/load failed", e);
    }

    // 若尚未 ready，繼續嘗試（YT 有時候 ready flag 慢半拍）
    if (!mvReady && tries < maxTries) return void setTimeout(attempt, 200);
  };

  setTimeout(attempt, 0);
}

function initMvPlayer() {
  if (!ytReady || !window.YT || !YT.Player) {
    // API 還沒 ready，先標記等一下建
    pendingMvPlayerInit = true;
    return;
  }

  // 如果已經有 player 了，就不要重建
  if (mvPlayerObj) return;

  try {
    mvPlayerObj = new YT.Player("mvPlayer", {
      events: {
        onReady: () => {
          mvReady = true;

          // 若有待切換影片，交給單一入口處理（含重試）
          if (pendingMvId) requestLeftSwitch(pendingMvId);

          // debug：每秒 log 左邊時間（預設關閉）
          if (DEBUG_TIMELOG && !timeLogInterval) {
            timeLogInterval = setInterval(() => {
              const t = getMvCurrentTime();
              if (t !== null) console.log("[voca-song] mv currentTime =", t);
            }, 1000);
          }
        },
        onStateChange: (e) => {
          if (e && e.data === YT.PlayerState.ENDED) {
            console.log("[voca-song] left ended");
            handleLeftEnded();
          }
        },
      },
    });
  } catch (e) {
    console.warn("[voca-song] YT initMvPlayer failed", e);
  }
}

/* =========================
   Apply iframes
========================= */
function applyIframes(songKey, mode) {
  const entry = getSongEntry(songKey);
  if (!entry || !entry[mode]) return null;
  const leftUrl = entry[mode].left;
  const rightUrl = entry[mode].right;
  const mvId = getYouTubeId(leftUrl);
  const vocabId = getYouTubeId(rightUrl);

  if (!mvId) {
    console.warn("[voca-song] missing left videoId", { songKey, mode, leftUrl });
    alert("這首歌的左邊 MV 連結缺少或格式不正確（無法取得影片ID）。請換一首歌或修正資料。");
    return null;
  }
  if (!vocabId) {
    console.warn("[voca-song] missing right videoId", { songKey, mode, rightUrl });
    alert("這首歌的右邊單字影片連結缺少或格式不正確（無法取得影片ID）。請換一個模式或修正資料。");
    return null;
  }

  const key = `${songKey}__${mode}__${mvId}__${vocabId}`;
  if (key !== loadedKey) {
    // 左邊：單一入口切歌（含重試/stop/fallback）
    requestLeftSwitch(mvId);

    // 右邊：避免每次換歌都 reload iframe（會導致 YouTube embed console 每次噴一次）
    pendingVocabId = vocabId;
    if (!vocabReady || !vocabFrame.getAttribute("src")) {
      vocabFrame.src = buildEmbedSrc(vocabId, { mute: true });
      vocabReady = true;
    } else {
      postCueById(vocabFrame, vocabId);
      postMute(vocabFrame);
    }

    loadedKey = key;
    loadedOnceForKey = false;
    updateLoadBtnText();
  }
  return key;
}

function loadCurrent({ resetTwoStep: doReset = false } = {}) {
  if (doReset) resetTwoStep();
  const songKey = getCurrentSongKey();
  if (!songKey) return;
  ensureModeAvailableOrFallback();
  setModeTabsState();
  applyIframes(songKey, currentMode);
}

/* =========================
   YouTube IFrame API callback
========================= */
function onYouTubeIframeAPIReady() {
  ytReady = true;

  // 如果 iframe 已經換好在等 API，就補建
  if (pendingMvPlayerInit) {
    pendingMvPlayerInit = false;
    initMvPlayer();
  } else {
    // 初次進頁面：有 pendingMvId（或左邊本來就有 src）就建一次
    if (pendingMvId || (mvFrame && mvFrame.getAttribute && mvFrame.getAttribute("src"))) initMvPlayer();
  }
}

// 讓 callback 在全域可被呼叫（有些 bundler / scope 會吃掉）
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

/* =========================
   Get current time (穩定版)
========================= */
function getMvCurrentTime() {
  try {
    if (!mvReady || !mvPlayerObj || !mvPlayerObj.getCurrentTime) return null;
    const t = mvPlayerObj.getCurrentTime();
    return isNaN(t) ? null : t;
  } catch (e) {
    // YouTube embed 有時會丟內部錯誤，這裡吃掉避免 console 一直紅
    return null;
  }
}

/* =========================
   Render songs (select + buttons)
========================= */
function renderSongSelect() {
  if (!songSelect) return;
  songSelect.innerHTML = "";
  const q = (songSearch && songSearch.value ? songSearch.value : "").trim();
  const isSearching = !!q;

  const visible = getVisibleSongKeys();

  // 搜尋中：先放一個提示 option，避免「預選第一筆」導致使用者點同一個選項不觸發 change
  if (isSearching) {
    const hint = document.createElement("option");
    hint.value = "";
    hint.disabled = true;
    hint.selected = true;
    hint.textContent =
      visible.length > 0
        ? `🔍 搜尋結果：${visible.length}，請選擇`
        : "🔍 沒有符合的歌曲";
    songSelect.appendChild(hint);
  }

  visible.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    songSelect.appendChild(opt);
    // 非搜尋中：保持顯示當前歌曲
    if (!isSearching && key === getCurrentSongKey()) opt.selected = true;
  });
}

function renderSongButtons() {
  // 快捷列：只顯示使用者自己加入的（localStorage）
  renderFavorites();
}

function renderFavorites() {
  if (!songList) return;
  const favs = loadFavorites();
  songList.innerHTML = "";

  if (!favs.length) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.marginTop = "4px";
    hint.textContent = EMPTY_FAV_HINT;
    songList.appendChild(hint);
    return;
  }

  favs.slice(0, MAX_FAVORITES).forEach((key) => {
    const idx = songKeys.indexOf(key);
    if (idx < 0) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "song-btn";

    // 左側：歌名；右側：星號（點星不切歌）
    const label = document.createElement("span");
    label.textContent = key;

    const star = document.createElement("span");
    star.textContent = " ★";
    star.style.fontWeight = "700";
    star.style.marginLeft = "6px";
    star.style.cursor = "pointer";
    star.title = "移除我的快捷歌";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(key);
    });

    btn.appendChild(label);
    btn.appendChild(star);

    btn.onclick = () => {
      const wasPlaying = isLeftPlaying();
      currentIndex = idx;
      if (songSelect) songSelect.value = key;
      setCurrentSongLabel();
      updateFavToggleBtn();
      loadCurrent({ resetTwoStep: true });
      updateLoadBtnText();
      if (wasPlaying) requestAutoPlayAfterSwitch();
    };

    songList.appendChild(btn);
  });
}

// 隱藏舊的播放清單相關 UI（即使頁面仍存在也不顯示）
function hideLegacyPlaylistUI() {
  const ids = [
    "songChecklist",
    "playlistName",
    "savePlaylistBtn",
    "playlistSelect",
    "loadPlaylistBtn",
    "deletePlaylistBtn",
    "nowPlaylistName",
    "nowPlaylistList",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // 隱藏整個播放清單區塊（含標題）
  const sections = document.querySelectorAll(".sections");
  sections.forEach((sec) => (sec.style.display = "none"));
}

/* =========================
   Button handlers
========================= */
loadBtn.onclick = () => {
  // 兩段式：第一次只載入；第二次才播放（避免自動播放限制造成你誤判）
  // 注意：歌曲/模式切換時會 resetTwoStep()，所以這裡不再重置
  const songKey = getCurrentSongKey();
  if (!songKey) return;

  // 確保目前歌曲 + 目前模式的影片已載入（只換來源，不自動播放）
  loadCurrent({ resetTwoStep: false });

  if (loadedOnceForKey) {
    playBoth();
  } else {
    loadedOnceForKey = true;
  }
  updateLoadBtnText();
};

if (pauseBtn) {
  pauseBtn.onclick = () => pauseBoth();
}

if (syncBtn) {
  syncBtn.onclick = () => syncBoth();
}

// 偏移調整按鈕
const OFFSET_MIN = -5;
const OFFSET_MAX = 5;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function updateOffsetDisplay() {
  const sign = syncOffset > 0 ? "+" : "";
  const text = sign + syncOffset.toFixed(1) + "s";
  // 可能在 WP/區塊裡被複製導致同 ID 多個，保險起見全部更新
  const displays = document.querySelectorAll('[id="offsetDisplay"]');
  if (displays.length) {
    displays.forEach((el) => (el.textContent = text));
  } else if (offsetDisplay) {
    offsetDisplay.textContent = text;
  }
}

function applyOffset(delta) {
  syncOffset = clamp(syncOffset + delta, OFFSET_MIN, OFFSET_MAX);
  console.log("[voca-song] syncOffset =", syncOffset);
  updateOffsetDisplay();
}

// 可能有重複 ID：用事件委派確保點到哪個都有效
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.id === "offsetPlusBtn") applyOffset(+0.5);
  if (t.id === "offsetMinusBtn") applyOffset(-0.5);
});

// 若頁面真的只有單一元素，也保留 direct 綁定（沒壞處）
if (offsetPlusBtn) offsetPlusBtn.onclick = () => applyOffset(+0.5);
if (offsetMinusBtn) offsetMinusBtn.onclick = () => applyOffset(-0.5);

// 初始化偏移顯示
updateOffsetDisplay();

// 已拔掉「取左邊時間」功能：就算 HTML 還留著按鈕，也會自動移除，避免又跑出來。
if (timeBtn) {
  try {
    timeBtn.remove();
  } catch {
    timeBtn.style.display = "none";
  }
}

nextBtn.onclick = () => {
  if (!songKeys.length) return;
  const wasPlaying = isLeftPlaying();
  if (currentIndex + 1 >= songKeys.length) {
    if (!loopEnabled) return;
    currentIndex = 0;
  } else {
    currentIndex += 1;
  }
  goToIndex(currentIndex, { autoPlay: wasPlaying });
};

prevBtn.onclick = () => {
  if (!songKeys.length) return;
  const wasPlaying = isLeftPlaying();
  if (currentIndex - 1 < 0) {
    if (!loopEnabled) return;
    currentIndex = songKeys.length - 1;
  } else {
    currentIndex -= 1;
  }
  goToIndex(currentIndex, { autoPlay: wasPlaying });
};

loopBtn.onclick = () => {
  loopEnabled = !loopEnabled;
  localStorage.setItem(LS_LOOP, JSON.stringify(loopEnabled));
  setLoopBtnText();
};

if (repeatOneBtn) {
  repeatOneBtn.onclick = () => {
    repeatOneEnabled = !repeatOneEnabled;
    localStorage.setItem(LS_REPEAT_ONE, JSON.stringify(repeatOneEnabled));
    setRepeatOneBtnText();
  };
}

if (songSelect) {
  songSelect.addEventListener("change", () => {
    if (!songSelect.value) return; // 搜尋提示 option（disabled）不應觸發換歌
    const wasPlaying = isLeftPlaying();
    const idx = songKeys.findIndex((k) => k === songSelect.value);
    if (idx >= 0) currentIndex = idx;
    setCurrentSongLabel();
    updateFavToggleBtn();
    syncQueueIndexToCurrentSong();
    renderQueue();
    loadCurrent({ resetTwoStep: true });
    updateLoadBtnText();
    if (wasPlaying) requestAutoPlayAfterSwitch();
  });
}

if (favToggleBtn) {
  favToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 點星號只加/移除「dropdown 目前顯示的歌」，不切歌
    toggleFavorite(getFavTargetSongKey());
  });
}

if (songSearch) {
  songSearch.addEventListener("input", () => {
    const q = (songSearch.value || "").trim().toLowerCase();
    filteredSongKeys = q
      ? songKeys.filter((k) => k.toLowerCase().includes(q))
      : null;
    renderSongSelect();
    // 搜尋只改 dropdown 顯示；星號維持以 dropdown value（或 fallback 當前歌曲）更新
    updateFavToggleBtn();
  });
}

// 模式 tabs
if (modeBtnNoun) modeBtnNoun.addEventListener("click", () => !modeBtnNoun.disabled && switchMode("noun"));
if (modeBtnVerb) modeBtnVerb.addEventListener("click", () => !modeBtnVerb.disabled && switchMode("verb"));
if (modeBtnAdj) modeBtnAdj.addEventListener("click", () => !modeBtnAdj.disabled && switchMode("adj"));

// Queue UI：點擊項目跳播
if (nowQueueList) {
  nowQueueList.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest(".queue-item") : null;
    if (!el) return;
    const idxStr = el.dataset && el.dataset.index;
    if (idxStr == null) return;
    playAtIndex(Number(idxStr));
  });
}

// My Playlist：載入下拉 + 播放
function renderMyPlaylistSelect() {
  const pls = loadMyPlaylists();
  const names = Object.keys(pls || {});
  const fill = (sel) => {
    if (!sel) return;
    const prev = sel.value || "";
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "（尚未選擇）";
    sel.appendChild(empty);

    // 內建：我的快捷歌（favorites）
    const favOpt = document.createElement("option");
    favOpt.value = "__favorites__";
    favOpt.textContent = "⭐ 我的快捷歌";
    sel.appendChild(favOpt);

    names.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });

    // 保留選擇（若該值還存在）
    if (prev) sel.value = prev;
  };

  fill(myPlaylistSelect);
  fill(dialogMyPlaylistSelect);

  // 若其中一個有值、另一個沒值，做一次同步（避免小視窗看起來像沒選）
  const mainVal = myPlaylistSelect ? myPlaylistSelect.value || "" : "";
  const dlgVal = dialogMyPlaylistSelect ? dialogMyPlaylistSelect.value || "" : "";
  if (mainVal && dialogMyPlaylistSelect && !dlgVal) dialogMyPlaylistSelect.value = mainVal;
  if (dlgVal && myPlaylistSelect && !mainVal) myPlaylistSelect.value = dlgVal;
}

if (myPlaylistSelect) {
  myPlaylistSelect.addEventListener("change", () => {
    setMyPlaylistMsg("");
    if (dialogMyPlaylistSelect) dialogMyPlaylistSelect.value = myPlaylistSelect.value || "";
    renderMyPlaylistList();
    updatePlaylistActionStates();
  });
}

if (dialogMyPlaylistSelect) {
  dialogMyPlaylistSelect.addEventListener("change", () => {
    setMyPlaylistMsg("");
    if (myPlaylistSelect) myPlaylistSelect.value = dialogMyPlaylistSelect.value || "";
    renderMyPlaylistList();
    updatePlaylistActionStates();
  });
}

if (createMyPlaylistBtn) {
  createMyPlaylistBtn.addEventListener("click", () => {
    const name = (myPlaylistNameInput ? myPlaylistNameInput.value : "").trim();
    if (!name) {
      setMyPlaylistMsg("請輸入清單名稱");
      return;
    }
    createMyPlaylist(name);
    updatePlaylistActionStates();
  });
}

if (addCurrentToMyPlaylistBtn) {
  addCurrentToMyPlaylistBtn.addEventListener("click", () => {
    console.log("[voca-song] myPlaylist: add current clicked");
    const name = ensureCustomPlaylistSelectedOrAutoCreate();
    if (!isCustomPlaylistName(name)) {
      setMyPlaylistMsg("步驟 1：請先選擇/建立自訂清單（非 ⭐ 我的快捷歌）");
      return;
    }
    const key = getCurrentSongKeySafe();
    if (!key) {
      setMyPlaylistMsg("目前沒有可加入的歌曲");
      return;
    }
    addSongToPlaylist(name, key);
    renderMyPlaylistList();
    updatePlaylistActionStates();
  });
}

if (removeCurrentFromMyPlaylistBtn) {
  removeCurrentFromMyPlaylistBtn.addEventListener("click", () => {
    const name = ensureCustomPlaylistSelectedOrAutoCreate();
    if (!isCustomPlaylistName(name)) {
      setMyPlaylistMsg("步驟 1：請先選擇/建立自訂清單（非 ⭐ 我的快捷歌）");
      return;
    }
    const key = getCurrentSongKeySafe();
    if (!key) return;
    removeSongFromPlaylist(name, key);
    updatePlaylistActionStates();
  });
}

if (deleteMyPlaylistBtn) {
  deleteMyPlaylistBtn.addEventListener("click", () => {
    const name = getSelectedMyPlaylistName();
    if (!isCustomPlaylistName(name)) {
      setMyPlaylistMsg("步驟 1：請先選擇要刪除的自訂清單");
      return;
    }
    deleteMyPlaylist(name);
    updatePlaylistActionStates();
  });
}

// Dialog open/close（不影響原本版面：有放 dialog 才啟用）
let dialogFilteredSongKeys = null;

function renderDialogSongSelect() {
  if (!dialogSongSelect) return;
  const q = (dialogSongSearch && dialogSongSearch.value ? dialogSongSearch.value : "").trim().toLowerCase();
  dialogFilteredSongKeys = q ? songKeys.filter((k) => k.toLowerCase().includes(q)) : null;
  const keys = dialogFilteredSongKeys && dialogFilteredSongKeys.length ? dialogFilteredSongKeys : songKeys;

  dialogSongSelect.innerHTML = "";
  const hint = document.createElement("option");
  hint.value = "";
  hint.disabled = true;
  hint.selected = true;
  hint.textContent = keys.length ? `🔍 搜尋結果：${keys.length}，請選擇` : "🔍 沒有符合的歌曲";
  dialogSongSelect.appendChild(hint);

  keys.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    dialogSongSelect.appendChild(opt);
  });
}

function ensureCustomPlaylistSelectedOrAutoCreate() {
  let name = getSelectedMyPlaylistName();
  if (isCustomPlaylistName(name)) return name;

  // 允許：使用者直接輸入新清單名稱，然後按「加入」就自動建立並選取
  const typed = (myPlaylistNameInput ? myPlaylistNameInput.value : "").trim();
  if (!typed) return "";
  if (!isCustomPlaylistName(typed)) return "";

  const pls = loadMyPlaylists();
  if (pls && pls[typed]) {
    setSelectedPlaylistName(typed);
    renderMyPlaylistList();
    return typed;
  }

  const ok = createMyPlaylist(typed);
  if (ok) return typed;
  // 若同名已存在（createMyPlaylist 會回 false），再選一次避免卡住
  const pls2 = loadMyPlaylists();
  if (pls2 && pls2[typed]) {
    setSelectedPlaylistName(typed);
    renderMyPlaylistList();
    return typed;
  }
  return "";
}

function updatePlaylistActionStates() {
  const name = getSelectedMyPlaylistName();
  const hasCustom = isCustomPlaylistName(name);
  const songPicked = !!(dialogSongSelect && dialogSongSelect.value);

  if (addSelectedToMyPlaylistBtn) addSelectedToMyPlaylistBtn.disabled = !hasCustom || !songPicked;
  if (addCurrentToMyPlaylistBtn) addCurrentToMyPlaylistBtn.disabled = !hasCustom;
  if (removeCurrentFromMyPlaylistBtn) removeCurrentFromMyPlaylistBtn.disabled = !hasCustom;
  if (deleteMyPlaylistBtn) deleteMyPlaylistBtn.disabled = !hasCustom;

  // 小提示：讓使用者知道下一步該做什麼（只在 dialog 開啟時提示）
  if (isPlaylistDialogOpen()) {
    if (!hasCustom) {
      setMyPlaylistMsg("步驟 1：先選擇「編輯清單」，或在「新清單」輸入名稱後按「＋建立清單」／直接按加入會自動建立。");
    } else if (!songPicked) {
      setMyPlaylistMsg("步驟 2：請在小視窗選擇要加入的歌曲（搜尋＋下拉）。");
    } else {
      setMyPlaylistMsg("");
    }
  }
}

function addSelectedSongToPlaylist() {
  const name = ensureCustomPlaylistSelectedOrAutoCreate();
  if (!isCustomPlaylistName(name)) {
    setMyPlaylistMsg("步驟 1：請先選擇/建立自訂清單（非 ⭐ 我的快捷歌）");
    return;
  }
  if (!dialogSongSelect) return;
  const key = dialogSongSelect.value;
  if (!key) {
    setMyPlaylistMsg("步驟 2：請先在小視窗選擇要加入的歌曲");
    return;
  }
  addSongToPlaylist(name, key);
  renderMyPlaylistList();
  updatePlaylistActionStates();
}

function openPlaylistDialog() {
  if (!playlistDialog) return;
  setMyPlaylistMsg("");
  renderMyPlaylistSelect();
  renderMyPlaylistList();
  // dialog 內可選歌（不綁主畫面目前歌曲）
  if (dialogSongSearch) dialogSongSearch.value = "";
  renderDialogSongSelect();
  // 預設把主畫面的清單選擇帶進來（但之後以小視窗為主）
  if (dialogMyPlaylistSelect && myPlaylistSelect && !dialogMyPlaylistSelect.value) {
    dialogMyPlaylistSelect.value = myPlaylistSelect.value || "";
  }
  updatePlaylistActionStates();
  if (typeof playlistDialog.showModal === "function") {
    playlistDialog.showModal();
  } else {
    // fallback（舊瀏覽器）：當成一般區塊顯示
    playlistDialog.setAttribute("open", "open");
  }
}

function closePlaylistDialog() {
  if (!playlistDialog) return;
  if (typeof playlistDialog.close === "function") playlistDialog.close();
  else playlistDialog.removeAttribute("open");
}

if (openPlaylistDialogBtn) {
  openPlaylistDialogBtn.addEventListener("click", () => openPlaylistDialog());
}
if (closePlaylistDialogBtn) {
  closePlaylistDialogBtn.addEventListener("click", () => closePlaylistDialog());
}

// 點 backdrop 關閉（dialog 內點擊不會關）
if (playlistDialog) {
  playlistDialog.addEventListener("click", (e) => {
    if (e.target === playlistDialog) closePlaylistDialog();
  });
}

if (dialogSongSearch) {
  dialogSongSearch.addEventListener("input", () => {
    renderDialogSongSelect();
    updatePlaylistActionStates();
  });
}

if (addSelectedToMyPlaylistBtn) {
  addSelectedToMyPlaylistBtn.addEventListener("click", () => {
    addSelectedSongToPlaylist();
  });
}

if (dialogSongSelect) {
  dialogSongSelect.addEventListener("change", () => updatePlaylistActionStates());
}

if (myPlaylistNameInput) {
  myPlaylistNameInput.addEventListener("input", () => updatePlaylistActionStates());
}

if (playMyPlaylistBtn) {
  playMyPlaylistBtn.addEventListener("click", () => {
    if (!myPlaylistSelect) return;
    const name = myPlaylistSelect.value;
    if (!name) return;
    let q = [];
    if (name === "__favorites__") {
      q = loadFavorites();
    } else {
      const pls = loadMyPlaylists();
      q = pls && Array.isArray(pls[name]) ? pls[name] : [];
    }
    loadQueue(q);
    playAtIndex(0);
  });
}

/* =========================
   Init
========================= */
async function init() {
  loopEnabled = JSON.parse(localStorage.getItem(LS_LOOP) || "false");
  setLoopBtnText();
  repeatOneEnabled = JSON.parse(localStorage.getItem(LS_REPEAT_ONE) || "false");
  setRepeatOneBtnText();

  const res = await fetch(SHEET_CSV_URL);
  const text = await res.text();
  const rows = parseCSV(text);
  const list = rowsToObjects(rows).filter((s) => s.song_id);

  // 轉成 songs 物件（key = "title / artist"）
  songs = {};
  list.forEach((s) => {
    const title = (s.song_title || "").trim();
    const artist = (s.artist || "").trim();
    const key = `${title} / ${artist || ""}`.trim().replace(/\s+\/\s*$/, "");

    const left = (s.mv_url || "").trim();
    const nounRight = (s.noun_video || "").trim();
    const verbRight = (s.verb_video || "").trim();
    const adjRight = (s.adj_video || "").trim();

    songs[key] = {
      noun: nounRight ? { left, right: nounRight } : null,
      verb: verbRight ? { left, right: verbRight } : null,
      adj: adjRight ? { left, right: adjRight } : null,
    };
  });

  songKeys = Object.keys(songs).filter(Boolean);
  if (!songKeys.length) return;
  currentIndex = 0;

  renderSongSelect();
  renderSongButtons(); // 快捷列（只顯示使用者自選）
  hideLegacyPlaylistUI();
  renderMyPlaylistSelect();
  renderMyPlaylistList();

  console.log("[voca-song] init ok", { v: APP_VERSION, songs: songKeys.length });

  // 系統 Queue：預設載入「全部歌曲」（你要的預設驗證）
  loadQueue(songKeys);
  syncQueueIndexToCurrentSong();
  renderQueue();

  // 進頁先載入第一首（不自動播放）
  loadCurrent({ resetTwoStep: true });
  setCurrentSongLabel();
  setModeTabsState();
  updateLoadBtnText();
  updateFavToggleBtn();
  renderFavorites();
  renderQueue();
  // 對外提供方法（方便你在 console 測）
  window.vocaSongQueue = { loadQueue, playAtIndex };
}
init();
