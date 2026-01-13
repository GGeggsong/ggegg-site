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
  const impactViewsEl = document.getElementById("impactViews");
  const impactCO2El = document.getElementById("impactCO2");

  if (!tableBody || !btnLunch || !btnNight) return;

  /* ===== CSV parser ===== */
  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function normKey(s) {
    return String(s || "")
      .replace(/\uFEFF/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "");
  }

  function safeNum(v) {
    const n = Number(String(v || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  /* ===== 全站碳排計算 ===== */
  const CO2_PER_VIEW_KG = 0.06;

  async function calcImpact() {
    let totalViews = 0;

    await Promise.all(
      Object.values(SHEETS).map(url =>
        fetch(url, { cache: "no-store" })
          .then(r => r.text())
          .then(text => {
            const lines = text.split("\n").filter(l => l.trim());
            const headers = parseCsvLine(lines[0]);
            const idx = {};
            headers.forEach((h, i) => idx[normKey(h)] = i);

            lines.slice(1).forEach(line => {
              const cols = parseCsvLine(line);
              if (String(cols[idx.enabled]).toUpperCase() !== "TRUE") return;
              totalViews += safeNum(cols[idx.views]);
            });
          })
      )
    );

    impactViewsEl.textContent = totalViews.toLocaleString();
    impactCO2El.textContent = (totalViews * CO2_PER_VIEW_KG).toFixed(1);
  }

  /* ===== 表格 ===== */
  function loadSheet(type) {
    tableBody.innerHTML = "";
    fetch(SHEETS[type], { cache: "no-store" })
      .then(r => r.text())
      .then(text => {
        const lines = text.split("\n").filter(l => l.trim());
        const headers = parseCsvLine(lines[0]);
        const idx = {};
        headers.forEach((h, i) => idx[normKey(h)] = i);

        lines.slice(1).forEach(line => {
          const cols = parseCsvLine(line);
          if (String(cols[idx.enabled]).toUpperCase() !== "TRUE") return;

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${cols[idx.item] || ""}</td>
            <td><a href="${cols[idx.yt_url] || cols[idx.yturl] || cols[idx.yt_url]}" target="_blank">YouTube</a></td>
            <td class="views">${cols[idx.views] || "0"}</td>
            <td>${cols[idx.merchant] || "—"}</td>
            <td>—</td>
          `;
          tableBody.appendChild(tr);
        });
      });
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

  /* ===== init ===== */
  calcImpact();
  btnLunch.classList.add("active");
  loadSheet("lunch");
});
