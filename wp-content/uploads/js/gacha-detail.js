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

  /* =========================
     CSV 解析（可吃 \r\n）
  ========================= */
  function parseCSV(text) {
    // 先統一換行，避免 \r 殘留
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(value);
        value = "";
      } else if (ch === "\n" && !inQuotes) {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += ch;
      }
    }
    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }
    return rows;
  }

  /* =========================
     按鈕 loading
  ========================= */
  function setLoading(on) {
    btnLunch.classList.toggle("loading", on);
    btnNight.classList.toggle("loading", on);
  }

  /* =========================
     載入 Sheet
  ========================= */
  function loadSheet(type) {
    setLoading(true);
    tableBody.innerHTML = "";

    fetch(SHEETS[type])
      .then(r => r.text())
      .then(text => {
        const rows = parseCSV(text);

        rows.slice(1).forEach(cols => {
          if (!cols[0]) return;

          const name   = String(cols[0] ?? "").trim();
          const ytUrl  = String(cols[1] ?? "").trim();
          const vendor = String(cols[2] ?? "").trim();
          const views  = String(cols[3] ?? "").trim();

          const donateTriggered =
            String(cols[5] ?? "").trim().toUpperCase() === "TRUE";

          // 關鍵：trim 後再判斷（避免 \r / 假空白）
          const receiptUrl = String(cols[6] ?? "").trim();

          // 狀態：收據 > 達標 > 進行中
          let statusHtml = `<span class="status running">進行中</span>`;
          if (receiptUrl) {
            statusHtml = `
              <a href="${receiptUrl}" target="_blank" rel="noopener" class="status done">
                ✅ 已完成捐款（查看收據）
              </a>
            `;
          } else if (donateTriggered) {
            statusHtml = `<span class="status triggered">🟡 已達捐款門檻</span>`;
          }

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${name}</td>
            <td>
              ${ytUrl
                ? `<a href="${ytUrl}" target="_blank" rel="noopener">YouTube</a>`
                : `<span style="color:#aaa;">—</span>`
              }
            </td>
            <td class="views">${views}</td>
            <td>${vendor}</td>
            <td>${statusHtml}</td>
          `;
          tableBody.appendChild(tr);
        });
      })
      .catch(err => {
        console.error("Sheet 載入失敗", err);
        tableBody.innerHTML = `
          <tr><td colspan="5" style="color:#999;">資料載入失敗</td></tr>
        `;
      })
      .finally(() => setLoading(false));
  }

  /* =========================
     切換按鈕
  ========================= */
  btnLunch.addEventListener("click", () => {
    if (btnLunch.classList.contains("active")) return;
    btnLunch.classList.add("active");
    btnNight.classList.remove("active");
    loadSheet("lunch");
  });

  btnNight.addEventListener("click", () => {
    if (btnNight.classList.contains("active")) return;
    btnNight.classList.add("active");
    btnLunch.classList.remove("active");
    loadSheet("night");
  });

  // 初始
  btnLunch.classList.add("active");
  loadSheet("lunch");
});
