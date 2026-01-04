// 走 WordPress 同網域 proxy，避免瀏覽器 CORS 擋住直接呼叫 Apps Script。
// ✅ 若你把頁面輸出成「純靜態站」(沒有 WP)，則改用 JSONP 直接打 Apps Script（script tag 不受 CORS 限制）。
//
// 結論：
// - 有 WordPress：用 admin-ajax proxy（不依賴 REST）
// - 純靜態：用 JSONP（需要 GAS 支援 callback 參數）

export const APP_VERSION = "2026-01-02.05";

// 你的 GAS Web App /exec（靜態站 JSONP 會用到）
export const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbzHAxkg1lwl46q0ayjf14z9ZBto9C2OG9rdczknKKG_jtj_LLvHd3FHKmxxUXyoAJjK/exec";

function getWpBasePath() {
  // 1) 你可以手動指定（最穩）：window.VOCA_CHARGE_WP_BASE = "https://ggeggsong.com/"
  //    若 WP 裝在子目錄：window.VOCA_CHARGE_WP_BASE = "https://example.com/wordpress/"
  if (typeof window !== "undefined" && window.VOCA_CHARGE_WP_BASE) {
    return String(window.VOCA_CHARGE_WP_BASE);
  }

  // 2) WordPress 會在 head 放 <link rel="https://api.w.org/" href=".../wp-json/" />
  const el = document.querySelector('link[rel="https://api.w.org/"]');
  if (el?.href) return el.href.replace(/\/wp-json\/?$/i, "/");

  // 3) 嘗試從目前路徑推導子目錄（例如 /wordpress/）
  const m = location.pathname.match(/^(.*?\/)(wordpress\/)/i);
  if (m?.[0]) return `${location.origin}${m[0]}`; // already ends with /

  // 4) 最後 fallback：假設 WP 裝在網域根目錄
  return `${location.origin}/`;
}

function ajaxUrl(params) {
  const base = getWpBasePath();
  const url = new URL("wp-admin/admin-ajax.php", base);
  url.searchParams.set("action", "voca_charge_proxy");

  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  url.searchParams.set("v", APP_VERSION);
  return url.toString();
}

function jsonpUrl(params) {
  const url = new URL(GAS_BASE);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });
  url.searchParams.set("v", APP_VERSION);
  return url.toString();
}

function jsonpFetch(params) {
  // 需要 GAS 支援：callback=<fn> 時回傳 callback(JSON)
  return new Promise((resolve, reject) => {
    const cbName = `__vocaChargeJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(jsonpUrl(params));
    url.searchParams.set("callback", cbName);

    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("jsonp_timeout"));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[cbName]; } catch {}
      script.remove();
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("jsonp_error"));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

let wpAjaxAvailable = null; // null = unknown, true/false = cached

// 允許外部強制模式（靜態站建議用 jsonp，避免每次首次嘗試 wp-admin 造成 404 噪音）
// window.VOCA_CHARGE_MODE = "jsonp" | "ajax"
if (typeof window !== "undefined" && window.VOCA_CHARGE_MODE) {
  const m = String(window.VOCA_CHARGE_MODE).toLowerCase();
  if (m === "jsonp") wpAjaxAvailable = false;
  if (m === "ajax") wpAjaxAvailable = true;
}

async function apiGet(params) {
  // 先嘗試 WP ajax（同網域、不吃 CORS）。
  // 注意：靜態站常會殘留 <link rel="https://api.w.org/"> 造成誤判，
  // 所以這裡改成「嘗試→失敗就自動 fallback JSONP」。
  if (wpAjaxAvailable === false) {
    return await jsonpFetch(params);
  }

  try {
    const res = await fetch(ajaxUrl(params), { cache: "no-store" });
    if (!res.ok) throw new Error(`ajax_http_${res.status}`);

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json") && !ct.includes("text/json")) {
      throw new Error("ajax_not_json");
    }

    return await res.json();
  } catch {
    wpAjaxAvailable = false; // 一旦失敗（例如 404），後續一律走 JSONP，避免一直打 wp-admin 造成噪音/延遲
    // fallback：純靜態站用 JSONP 直接打 GAS
    return await jsonpFetch(params);
  }
}

console.log("[voca-charge_api] endpoints", {
  v: APP_VERSION,
  ajaxExample: ajaxUrl({ letters: 1 }),
  gasExample: jsonpUrl({ letters: 1 })
});

export async function getLetters() {
  return await apiGet({ letters: 1 });
}

export async function getInit() {
  return await apiGet({ init: 1 });
}

export async function getByLetter(letter) {
  return await apiGet({ letter });
}

export async function search(q) {
  return await apiGet({ q });
}

export async function getMeta() {
  return await apiGet({ meta: 1 });
}

// _memory_map：圖案綁定說明（key / image / note）
export async function getMemoryMap() {
  return await apiGet({ memory: 1 });
}
