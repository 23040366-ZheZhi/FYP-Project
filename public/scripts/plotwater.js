let chart;

const WATER_COLORS = [
  "#0277BD", // deep blue
  "#039BE5", // light blue
  "#00ACC1", // cyan
  "#26A69A", // teal
  "#4DD0E1"  // aqua
];

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

  function isHeaderRow(r) {
    return String(r?.Water ?? "").toLowerCase() === "month";
  }

  function parseMonthIndex(label) {
    const s = String(label ?? "").trim().toLowerCase();
    const mon = s.slice(0, 3);
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    return (mon in map) ? map[mon] : null;
  }

  // ✅ keep your rule: field3 must be numeric and not 0 (even if user selects field4/field5)
  function passBaseRule(r) {
    const v = toNum(r.field3);
    if (!Number.isFinite(v)) return false;
    if (v === 0) return false;
    return true;
  }

  // ✅ selected field must be numeric (so dropdown changes work)
  function hasValueForField(r, field) {
    const v = toNum(r[field]);
    return Number.isFinite(v);
  }

  async function loadWaterFromApi() {
    const res = await fetch("/api/water-detailed");
    if (!res.ok) throw new Error(`Water HTTP ${res.status}`);
    return await res.json(); // { yearCount, allowedYears, data }
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json(); // { yearCount, graphType, ... }
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

  function renderChart(rows, allowedYears, field, titleText, meta) {
    if (chart) chart.destroy();

    const yearsToShow = [...new Set(allowedYears)]
      .filter(Number.isInteger)
      .sort((a, b) => a - b);

    if (!yearsToShow.length) {
      showMsg("No water years found.");
      return;
    }

    // Build 12-month array for each year we want to show
    const seriesByYear = new Map();
    yearsToShow.forEach(y => seriesByYear.set(y, Array(12).fill(null)));

    // Your file format: field1 appears only at first row of year block
    let activeYear = null;

    for (const r of rows) {
      if (isHeaderRow(r)) continue;

      if (r.field1 && /^\d{4}$/.test(String(r.field1).trim())) {
        activeYear = Number(r.field1);
      }
      if (!activeYear) continue;
      if (!seriesByYear.has(activeYear)) continue;

      const idx = parseMonthIndex(r.Water);
      if (idx === null) continue;

      const val = toNum(r[field]);
      if (!Number.isFinite(val)) continue;

      seriesByYear.get(activeYear)[idx] = val;
    }

    // Labels: only months that have ANY data across selected years
    const monthIndices = [];
    const labels = [];
    for (let i = 0; i < 12; i++) {
      const anyHas = yearsToShow.some(y => seriesByYear.get(y)[i] != null);
      if (anyHas) {
        monthIndices.push(i);
        labels.push(MONTHS_FULL[i]);
      }
    }

    if (!labels.length) {
      showMsg("No valid water data to display.");
      return;
    }

    const datasets = [];
yearsToShow.forEach((year, idx) => {
  const arr12 = seriesByYear.get(year);
  const data = monthIndices.map(i => arr12[i]);

  // ✅ if this year has NO valid numbers, skip it (no legend entry)
  const hasAnyPoint = data.some(v => Number.isFinite(v));
  if (!hasAnyPoint) return;

  const color = WATER_COLORS[idx % WATER_COLORS.length];
  datasets.push({
    label: String(year),
    data,
    ...styleFor(meta, color)
  });
});

// if everything got skipped
if (!datasets.length) {
  showMsg("No valid water data to display.");
  return;
}

    chart = new Chart(ctx, {
      type: meta.graphType,
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: titleText, font: { size: 18 } },
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              label: c => {
                const v = c.parsed?.y;
                return `${c.dataset.label}: ${Number.isFinite(v) ? v.toLocaleString() : "-"} m³`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Water (m³)" } }
        }
      }
    });
  }

  async function initWater() {
    try {
      showMsg("");

      const [result, settings] = await Promise.all([
        loadWaterFromApi(),
        loadGraphSettings()
      ]);

      if (!result || !Array.isArray(result.data)) {
        showMsg("Water API error: invalid data format.");
        console.error("Invalid API result:", result);
        return;
      }

      const meta = {
        graphType: settings?.graphType || "bar",
        yearCount: Number(settings?.yearCount || result.yearCount || 1)
      };

      const titles = {
        field3: "Portable Water",
        field4: "NEWater",
        field5: "Total Water"
      };

      const baseRows = result.data.filter(r => !isHeaderRow(r));

      const draw = () => {
        showMsg("");
        const field = selector.value;

        // ✅ apply your “base rule” + selected field rule
        const rows = baseRows
          .filter(passBaseRule)
          .filter(r => hasValueForField(r, field));

        if (!rows.length) {
          showMsg("No valid water data for this dataset (after filtering).");
          return;
        }

        renderChart(rows, result.allowedYears || [], field, titles[field], meta);
      };

      selector.addEventListener("change", draw);
      draw();

    } catch (err) {
      console.error(err);
      showMsg("Failed to load water data.");
    }
  }

  window.addEventListener("water:render", () => {
    initWater();
  }, { once: true });
}
// ✅ auto-rotate 
(function () {
  const routes = ["/", "/electgraph", "/solargraph", "/watergraph", "/waste"];
  const delay = 30000;

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const index = routes.indexOf(path);
  if (index === -1) return;

  setTimeout(() => {
    window.location.href = routes[(index + 1) % routes.length];
  }, delay);
})();
