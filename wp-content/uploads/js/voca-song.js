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
const songList = document.getElementById("songList"); // 若頁面有一排按鈕的容器

const loadBtn = document.getElementById("loadBtn");
const pauseBtn = document.getElementById("pauseBtn");
const syncBtn = document.getElementById("syncBtn");
const timeBtn = document.getElementById("timeBtn"); // 顯示左邊時間
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

/* =========================
   Optional YouTube API player (僅用來讀取時間，不改變原本播放流程)
========================= */
let ytReady = false;
let mvPlayerObj = null;
let mvReady = false;
let pendingMvId = null; // 下一個要顯示在左邊的影片ID（只用 API 切換，不換 src）
let syncOffset = 0; // 右邊延遲秒數（初始 0.5s）

// 這個 flag：當 iframe 已載好，但 API 還沒 ready 時，先記起來等 API ready 再建 player
let pendingMvPlayerInit = false;

// debug interval（每秒 log 左側時間）
let timeLogInterval = null;

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
let songs = [];
let currentIndex = 0;
let loopEnabled = false; // repeat all
let repeatOneEnabled = false; // repeat one
let loadedKey = null; // 兩段式：同一首同詞性只需載入一次
let loadedOnceForKey = false;
const LS_LOOP = "voca_song_loop";
const LS_REPEAT_ONE = "voca_song_repeat_one";

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

function playBoth() {
  // 左邊：只用 API 播放（核心原則）
  if (mvReady && mvPlayerObj && mvPlayerObj.playVideo) {
    try { mvPlayerObj.playVideo(); } catch {}
  }
  postPlay(vocabFrame);
}

function pauseBoth() {
  if (mvReady && mvPlayerObj && mvPlayerObj.pauseVideo) {
    try { mvPlayerObj.pauseVideo(); } catch {}
  }
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
}

function goToIndex(nextIndex, { autoPlay = false } = {}) {
  if (!songs.length) return;
  currentIndex = Math.max(0, Math.min(nextIndex, songs.length - 1));
  if (songSelect) songSelect.value = songs[currentIndex].song_id;
  loadCurrent({ resetTwoStep: true });
  if (autoPlay) requestAutoPlayAfterSwitch();
}

function getCurrentSelection() {
  const songBySelect = songs.find((s) => s.song_id === songSelect.value);
  const song = songBySelect || songs[currentIndex];
  const type = typeSelect.value;
  return { song, type };
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

  // 整體循環：播完下一首（到尾回第一首）；關閉則播完就停
  if (!loopEnabled) return;

  if (!songs.length) return;
  const next = currentIndex + 1 >= songs.length ? 0 : currentIndex + 1;
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

          // 若有待切換影片，這裡 cue 一次（不自動播放）
          if (pendingMvId && mvPlayerObj && mvPlayerObj.cueVideoById) {
            try { mvPlayerObj.cueVideoById(pendingMvId); } catch {}
          }

          // debug：每秒 log 左邊時間（你要留就留）
          if (!timeLogInterval) {
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
function applyIframes(song, type) {
  const mvId = getYouTubeId(song.mv_url);
  const vocabUrl =
    type === "noun"
      ? song.noun_video
      : type === "verb"
      ? song.verb_video
      : song.adj_video;
  const vocabId = getYouTubeId(vocabUrl);

  const key = `${song.song_id}__${type}__${mvId}__${vocabId}`;

  if (key !== loadedKey) {
    // 左邊核心原則：永遠只建立一次 player；換歌只用 API cueVideoById，不換 src
    pendingMvId = mvId;
    ensureLeftEmbedReady(mvId);
    initMvPlayer();
    if (mvReady && mvPlayerObj && mvPlayerObj.cueVideoById) {
      try { mvPlayerObj.cueVideoById(mvId); } catch (e) { console.warn("[voca-song] cueVideoById failed", e); }
    }

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
  if (!mvReady || !mvPlayerObj || !mvPlayerObj.getCurrentTime) return null;
  const t = mvPlayerObj.getCurrentTime();
  return isNaN(t) ? null : t;
}

/* =========================
   Render songs (select + buttons)
========================= */
function renderSongSelect() {
  if (!songSelect) return;
  songSelect.innerHTML = "";
  songs.forEach((song, idx) => {
    const opt = document.createElement("option");
    opt.value = song.song_id;
    opt.textContent = `${song.song_title} / ${song.artist || ""}`;
    songSelect.appendChild(opt);
    if (idx === currentIndex) opt.selected = true;
  });
}

function renderSongButtons() {
  if (!songList) return;
  songList.innerHTML = "";
  songs.forEach((song, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "song-btn";
    btn.textContent = `${song.song_title} / ${song.artist || ""}`;
    btn.onclick = () => {
      const wasPlaying = isLeftPlaying();
      currentIndex = idx;
      if (songSelect) songSelect.value = song.song_id;
      loadCurrent({ resetTwoStep: true });
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
  const { song, type } = getCurrentSelection();
  if (!song) return;

  applyIframes(song, type);

  // 兩段式：第一次只載入；第二次才播放（避免自動播放限制造成你誤判）
  if (loadedOnceForKey) {
    playBoth();
  } else {
    loadedOnceForKey = true;
  }
};

if (pauseBtn) {
  pauseBtn.onclick = () => pauseBoth();
}

if (syncBtn) {
  syncBtn.onclick = () => syncBoth();
}

// 偏移調整按鈕
function updateOffsetDisplay() {
  if (offsetDisplay) offsetDisplay.textContent = syncOffset.toFixed(1) + "s";
}

if (offsetPlusBtn) {
  offsetPlusBtn.onclick = () => {
    syncOffset += 0.5;
    updateOffsetDisplay();
  };
}

if (offsetMinusBtn) {
  offsetMinusBtn.onclick = () => {
    syncOffset = Math.max(0, syncOffset - 0.5);
    updateOffsetDisplay();
  };
}

// 初始化偏移顯示
updateOffsetDisplay();

if (timeBtn) {
  timeBtn.onclick = () => {
    const t = getMvCurrentTime();
    if (t === null) {
      alert("無法取得左邊影片時間，請先按播放一次讓影片載入再試。若仍不行，請重新整理頁面。");
      console.warn("[voca-song] left time btn: no currentTime (mv not ready)");
      return;
    }
    alert(`左邊影片目前秒數：${t.toFixed(2)}`);
    console.log("[voca-song] left time btn =", t);
  };
}

nextBtn.onclick = () => {
  if (!songs.length) return;
  const wasPlaying = isLeftPlaying();
  if (currentIndex + 1 >= songs.length) {
    if (!loopEnabled) return;
    currentIndex = 0;
  } else {
    currentIndex += 1;
  }
  goToIndex(currentIndex, { autoPlay: wasPlaying });
};

prevBtn.onclick = () => {
  if (!songs.length) return;
  const wasPlaying = isLeftPlaying();
  if (currentIndex - 1 < 0) {
    if (!loopEnabled) return;
    currentIndex = songs.length - 1;
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
    const wasPlaying = isLeftPlaying();
    const idx = songs.findIndex((s) => s.song_id === songSelect.value);
    if (idx >= 0) currentIndex = idx;
    loadCurrent({ resetTwoStep: true });
    if (wasPlaying) requestAutoPlayAfterSwitch();
  });
}

if (typeSelect) {
  typeSelect.addEventListener("change", () => {
    resetTwoStep();
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
  songs = rowsToObjects(rows).filter((s) => s.song_id);

  if (!songs.length) return;
  currentIndex = 0;

  renderSongSelect();
  renderSongButtons();
  hideLegacyPlaylistUI();

  console.log("[voca-song] init ok", { songs: songs.length });

  // 進頁先載入第一首（不自動播放）
  loadCurrent({ resetTwoStep: true });
}
init();
