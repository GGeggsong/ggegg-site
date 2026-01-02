// 走 WordPress 同網域 proxy，避免瀏覽器 CORS 擋住直接呼叫 Apps Script
function getWpRestRoot() {
  // WP 會在頁面 head 放 <link rel="https://api.w.org/" href=".../wp-json/" />
  const el = document.querySelector('link[rel="https://api.w.org/"]');
  return el?.href || `${location.origin}/wp-json/`;
}

export const API_BASE = new URL("voca/v1/charge", getWpRestRoot()).toString();

// 用來辨識目前前端載入版本 + 讓 API request 帶版本參數（便於除錯/必要時破快取）
export const APP_VERSION = "2026-01-02.01";

function withVersion(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(APP_VERSION)}`;
}

export async function getLetters() {
  const res = await fetch(withVersion(`${API_BASE}?letters=1`));
  return await res.json();
}

export async function getInit() {
  const res = await fetch(withVersion(`${API_BASE}?init=1`));
  return await res.json();
}

export async function getByLetter(letter) {
  const res = await fetch(withVersion(`${API_BASE}?letter=${letter}`));
  return await res.json();
}

export async function search(q) {
  const res = await fetch(withVersion(`${API_BASE}?q=${encodeURIComponent(q)}`));
  return await res.json();
}

export async function getMeta() {
  const res = await fetch(withVersion(`${API_BASE}?meta=1`));
  return await res.json();
}
