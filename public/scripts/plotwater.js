let chart;

const COLOR_PREVIOUS = "#43a047"; // green
const COLOR_CURRENT  = "skyblue"; // skyblue

const canvas  = document.getElementById("waterChart");
const selector = document.getElementById("datasetSelector");
const msgBox  = document.getElementById("msgBox");

if (!canvas || !selector) {
  console.warn("plotwater.js: water DOM not found, skipping");
} else {
  const ctx = canvas.getContext("2d");

  const MONTHS_FULL = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  // ---------- helpers ----------
  function showMsg(text) {
    if (!msgBox) return;
    msgBox.textContent = text || "";
    msgBox.style.display = text ? "block" : "none";
  }

  function toNum(v) {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function parseMonthIndex(label) {
    // supports "Jan-24" or "Jan"
    const s = String(label ?? "").trim().toLowerCase();
    const mon = s.slice(0, 3);
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    return (mon in map) ? map[mon] : null;
  }

  function yearFromLabel(label) {
    // supports "Jan-24"
    const m = String(label ?? "").match(/-(\d{2})$/);
    if (!m) return null;
    return 2000 + Number(m[1]);
  }

  // ✅ KEEP YOUR FILTERING RULES (based on field3)
  function applyYourFilters(rows) {
    return rows.filter(r => {
      if (!r.Water || r.Water === "Month") return false;

      const value = toNum(r.field3); // your rule: validate using field3
      if (!Number.isFinite(value)) return false;
      if (value === 0) return false;

      return true;
    });
  }

  async function loadWaterDetailed() {
    const res = await fetch("/api/water-detailed");
    if (!res.ok) throw new Error(`Water HTTP ${res.status}`);
    return await res.json(); // {yearMode, latestYear, previousYear, data}
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json(); // {yearMode, graphType}
  }

  function styleFor(meta, color) {
    if (meta.graphType === "line") {
      return {
        borderColor: color,
        backgroundColor: color,
        tension: 0.3,
        fill: false,
        pointRadius: 3
      };
    }
    return { backgroundColor: color };
  }

  function render(meta, rows, field, titleText) {
    if (chart) chart.destroy();

    const cleaned = applyYourFilters(rows);
    if (!cleaned.length) {
      showMsg("No valid water data after filtering.");
      return;
    }

    const prevArr = Array(12).fill(null);
    const currArr = Array(12).fill(null);

    for (const r of cleaned) {
      const idx = parseMonthIndex(r.Water);
      if (idx === null) continue;

      const val = toNum(r[field]);
      if (!Number.isFinite(val)) continue;

      // If label has year -> split into previous/current
      const y = yearFromLabel(r.Water);

      if (y != null) {
        if (y === meta.previousYear) prevArr[idx] = val;
        if (y === meta.latestYear)   currArr[idx] = val;
      } else {
        // If no year in label, API already filtered by yearMode
        if (meta.yearMode === "previous") prevArr[idx] = val;
        else currArr[idx] = val;
      }
    }

    // ========== single year ==========
    if (meta.yearMode !== "both") {
      const yearToShow = meta.yearMode === "previous" ? meta.previousYear : meta.latestYear;
      const arr = meta.yearMode === "previous" ? prevArr : currArr;

      const labels = [];
      const data = [];
      for (let i = 0; i < 12; i++) {
        if (arr[i] != null) {
          labels.push(MONTHS_FULL[i]);
          data.push(arr[i]);
        }
      }

      if (!labels.length) {
        showMsg("No valid water data to display.");
        return;
      }

      chart = new Chart(ctx, {
        type: meta.graphType,
        data: {
          labels,
          datasets: [{
            label: String(yearToShow),
            data,
            ...styleFor(meta, meta.yearMode === "previous" ? COLOR_PREVIOUS : COLOR_CURRENT)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: titleText, font: { size: 18 } },
            legend: { display: true, position: "top" },
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} m³`
              }
            }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "Water (m³)" } }
          }
        }
      });

      return;
    }

    // ========== BOTH mode ==========
    const labels = [];
    const prevData = [];
    const currData = [];

    for (let i = 0; i < 12; i++) {
      const hasPrev = prevArr[i] != null;
      const hasCurr = currArr[i] != null;

      if (hasPrev || hasCurr) {
        labels.push(MONTHS_FULL[i]);
        prevData.push(prevArr[i]);
        currData.push(currArr[i]);
      }
    }

    if (!labels.length) {
      showMsg("No valid water data to display.");
      return;
    }

    chart = new Chart(ctx, {
      type: meta.graphType,
      data: {
        labels,
        datasets: [
          { label: String(meta.previousYear), data: prevData, ...styleFor(meta, COLOR_PREVIOUS) },
          { label: String(meta.latestYear),   data: currData, ...styleFor(meta, COLOR_CURRENT) }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: titleText, font: { size: 18 } },
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} m³`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Water (m³)" } }
        }
      }
    });
  }

  async function init() {
    try {
      showMsg("");

      const [result, settings] = await Promise.all([
        loadWaterDetailed(),
        loadGraphSettings()
      ]);

      if (!result || !Array.isArray(result.data)) {
        showMsg("Water API error: invalid data format.");
        console.error("Invalid API result:", result);
        return;
      }

      const meta = {
        yearMode: settings?.yearMode || result.yearMode || "current",
        graphType: settings?.graphType || "bar",
        latestYear: result.latestYear,
        previousYear: result.previousYear
      };

      const titles = {
        field3: "Portable Water",
        field4: "NEWater",
        field5: "Total Water"
      };

      const draw = () => {
        showMsg("");
        const field = selector.value;
        render(meta, result.data, field, titles[field]);
      };

      selector.addEventListener("change", draw);
      draw();

    } catch (err) {
      console.error(err);
      showMsg("Failed to load water data.");
    }
  }

  window.addEventListener("water:render", () => {
  init();
  }, { once: true });


  // ✅ auto-rotate
  (function () {
    const routes = ["/", "/electgraph", "/solargraph", "/watergraph", "/waste"];
    const delay = 10000;

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const index = routes.indexOf(path);
    if (index === -1) return;

    setTimeout(() => {
      window.location.href = routes[(index + 1) % routes.length];
    }, delay);
  })();
}
