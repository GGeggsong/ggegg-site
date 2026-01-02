document.addEventListener("DOMContentLoaded", () => {
  const SHEETS = {
    lunch:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNonIemQcLNNBZEmsVGc3TF8XWTZ_TXSCQfHdH5O6aNKLEavds1H376_3T8UGHl-bbJXInAFMHivZH/pub?output=csv",
    night:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vT78dT_LHyajgTDK1xmJmKKkBRE3n0oFeNOsRgvylJuYnw048c4gpcqsE8MIeCkgKt19CO5I6rEETCl/pub?output=csv"
  };

  const tableBody = document.getElementById("tableBody");
  const btnLunch = document.getElementById("btn-lunch");
  const btnNight = document.getElementById("btn-night");
  if (!tableBody || !btnLunch || !btnNight) return;

  /* ===== 跟主頁一模一樣的 parser ===== */
  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => String(s).trim());
  }

  // 欄位名正規化（容忍大小寫/空白/隱藏字元）
  function normKey(s) {
    return String(s || "")
      .replace(/\uFEFF/g, "")      // BOM
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, ""); // 去除空白/符號（保留底線）
  }

  function setLoading(on) {
    btnLunch.classList.toggle("loading", on);
    btnNight.classList.toggle("loading", on);
  }

  function loadSheet(type) {
    setLoading(true);
    tableBody.innerHTML = "";

    fetch(SHEETS[type], { cache: "no-store" })
      .then(r => r.text())
      .then(text => {
        const lines = text
          .replace(/\uFEFF/g, "")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .split("\n")
          .filter(l => l.trim().length > 0);

        if (lines.length <= 1) return;

        /* === headerIndex（容錯版）：用正規化 key 建 map === */
        const headers = parseCsvLine(lines[0]);
        const headerIndex = {};
        headers.forEach((h, i) => {
          const k = normKey(h);
          if (k) headerIndex[k] = i; // 同名以最後一個為準
        });

        // 取值 helper：支援多個別名
        const col = (cols, keys) => {
          for (const key of keys) {
            const idx = headerIndex[normKey(key)];
            if (typeof idx === "number" && idx >= 0) return cols[idx] ?? "";
          }
          return "";
        };

        lines.slice(1).forEach(line => {
          const cols = parseCsvLine(line);

          const enabled =
            String(col(cols, ["enabled"]) || "")
              .trim()
              .toUpperCase() === "TRUE";
          if (!enabled) return;

          const item = col(cols, ["Item", "item"]) || "";
          const ytUrl = col(cols, ["YT_URL", "yt_url", "yturl"]) || "";
          const views = col(cols, ["views", "view", "viewscount"]) || "";

          const merchant = String(col(cols, ["merchant", "store", "shop"]) || "").trim();
          const merchantUrl = String(col(cols, ["merchant_url", "merchanturl", "store_url", "shop_url"]) || "").trim();

          const donateTriggered =
            String(col(cols, ["donate_triggered", "donatetriggered", "donate"]) || "")
              .trim()
              .toUpperCase() === "TRUE";
          const receiptUrl =
            String(col(cols, ["receipt_url", "receipturl", "receipt"]) || "").trim();

          if (!item) return;

          let statusHtml = `<span class="status running">進行中</span>`;
          if (receiptUrl) {
            statusHtml = `
              <a href="${receiptUrl}" target="_blank" class="status done">
                ✅ 已完成捐款（查看收據）
              </a>`;
          } else if (donateTriggered) {
            statusHtml = `<span class="status triggered">🟡 已達捐款門檻</span>`;
          }

          const merchantHtml = merchantUrl
            ? `<a href="${merchantUrl}" target="_blank">${merchant}</a>`
            : (merchant || "—");

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${item}</td>
            <td>${ytUrl ? `<a href="${ytUrl}" target="_blank">YouTube</a>` : "—"}</td>
            <td class="views">${views}</td>
            <td>${merchantHtml}</td>
            <td>${statusHtml}</td>
          `;
          tableBody.appendChild(tr);
        });
      })
      .finally(() => setLoading(false));
  }

  btnLunch.onclick = () => {
    btnLunch.classList.add("active");
    btnNight.classList.remove("active");
    loadSheet("lunch");
  };
  btnNight.onclick = () => {
    btnNight.classList.add("active");
    btnLunch.classList.remove("active");
    loadSheet("night");
  };

  btnLunch.classList.add("active");
  loadSheet("lunch");
});
