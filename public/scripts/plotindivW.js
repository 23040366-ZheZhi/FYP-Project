// /public/scripts/plotindivW.js
let chartA = null;
let chartB = null;

const WATER_COLORS = [
  "#1E88E5", // latest year (blue)
  "#43A047", // green
  "#FB8C00", // orange
  "#8E24AA", // purple
  "#E53935"  // red
];


const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// DOM
const canvasA = document.getElementById("buildingChartA");
const canvasB = document.getElementById("buildingChartB");
const selectA = document.getElementById("buildingSelectA");
const selectB = document.getElementById("buildingSelectB");
const msgA    = document.getElementById("msgA");
const msgB    = document.getElementById("msgB");

if (!canvasA || !canvasB || !selectA || !selectB) {
  console.warn("plotindivW.js: required DOM not found");
} else {
  const ctxA = canvasA.getContext("2d");
  const ctxB = canvasB.getContext("2d");

  // Data & meta
  let globalRows = [];
  let buildings = [];
  let monthKey = "";

  const meta = {
    graphType: "bar",
    allowedYears: [],   
  };

  // ---------- helpers ----------
  function setMsg(which, text) {
    const el = which === "A" ? msgA : msgB;
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
  }

  function toNum(v) {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  // expects "25-Jan" (your format)
  function parseLabel(val) {
    const s = String(val ?? "").trim();
    const m = s.match(/^(\d{2})-([A-Za-z]{3})$/);
    if (!m) return null;

    const year = 2000 + Number(m[1]);
    const mon = m[2].toLowerCase();
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const idx = map[mon];
    if (idx === undefined) return null;

    return { year, idx };
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json();
  }

  async function loadWaterData() {
    const res = await fetch("/api/water-individual");
    if (!res.ok) throw new Error(`Water-individual HTTP ${res.status}`);
    return await res.json();

  }

  function fillDropdown(selectEl) {
    selectEl.innerHTML = "";
    for (const b of buildings) {
      const opt = document.createElement("option");
      opt.value = b.key;
      opt.textContent = b.name;
      selectEl.appendChild(opt);
    }
  }

  // ---------- dataset styling ----------
function styleFor(color) {
  if (meta.graphType === "line") {
    return {
      borderColor: color,
      backgroundColor: color,
      tension: 0.3,
      fill: false,
      pointRadius: 3,
      pointHoverRadius: 4
    };
  }

  // BAR styling — make them fat and readable
  return {
    backgroundColor: color,
    borderRadius: 8,        // round corners a bit more
    barThickness: 40,       // ⬅️ THIS makes bars fat
    maxBarThickness: 50,    // prevents insane sizes on big screens
    categoryPercentage: 0.9,
    barPercentage: 1.0      // use full category width
  };
}


function buildDatasets(buildingKey, allowedYears) {
  // Create 12 slots per year
  const yearsToShow = [...new Set(allowedYears)]
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  const seriesByYear = new Map();
  yearsToShow.forEach(y => seriesByYear.set(y, Array(12).fill(null)));

  for (const r of globalRows) {
    const info = parseLabel(r[monthKey]); // {year, idx}
    if (!info) continue;
    if (!seriesByYear.has(info.year)) continue;

    const val = toNum(r[buildingKey]);
    if (!Number.isFinite(val)) continue;

    seriesByYear.get(info.year)[info.idx] = val;
  }

  // only keep months that have data in ANY selected year
  const labels = [];
  const monthIndices = [];
  for (let i = 0; i < 12; i++) {
    const anyHas = yearsToShow.some(y => seriesByYear.get(y)[i] != null);
    if (anyHas) {
      labels.push(MONTHS[i]);
      monthIndices.push(i);
    }
  }

  // datasets (skip years that have no data -> no legend)
  const datasets = [];

  yearsToShow.forEach((year, idx) => {
    const arr12 = seriesByYear.get(year);
    const data = monthIndices.map(i => arr12[i]);

    const hasAnyPoint = data.some(v => Number.isFinite(v));
    if (!hasAnyPoint) return; // ✅ hide empty year

    const color = WATER_COLORS[idx % WATER_COLORS.length];
    datasets.push({
      label: String(year),
      data,
      ...styleFor(color)
    });
  });

  return { labels, datasets };
}

  function allEmptyOrZero(datasets) {
    return datasets.every(ds => ds.data.every(v => v == null || v === 0));
  }

  // ---------- render ----------
  function renderChart(which, ctx, building) {
   const { labels, datasets } = buildDatasets(building.key, meta.allowedYears || []);


    // no data => show msg and destroy chart
    if (!labels.length || !datasets.length || allEmptyOrZero(datasets)) {
      setMsg(which, `No meaningful data for ${building.name} (all 0/empty).`);

      if (which === "A" && chartA) { chartA.destroy(); chartA = null; }
      if (which === "B" && chartB) { chartB.destroy(); chartB = null; }

      return;
    }

    setMsg(which, "");

    if (which === "A" && chartA) chartA.destroy();
    if (which === "B" && chartB) chartB.destroy();

    const chart = new Chart(ctx, {
      type: meta.graphType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false, // ✅ fixes skinny charts
        plugins: {
          title: {
            display: true,
            text: building.name,
            font: { size: 16, weight: "bold" }
          },
          legend: {
            display: true,
            labels: { boxWidth: 14, boxHeight: 14 }
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const v = c.parsed?.y;
                return `${c.dataset.label}: ${Number.isFinite(v) ? v.toLocaleString() : "-"} m³`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, minRotation: 0 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Water Consumption (m³)" }
          }
        }
      }
    });

    if (which === "A") chartA = chart;
    else chartB = chart;
  }

  // ---------- init ----------
  async function init() {
    // load both at once
    const [data, settings] = await Promise.all([
      loadWaterData(),
      loadGraphSettings()
    ]);

    // ✅ validate new API shape: { allowedYears, data: [...] }
  if (!data || !Array.isArray(data.data) || data.data.length < 2) {
    setMsg("A", "No data returned.");
    setMsg("B", "No data returned.");
  return;
}

  meta.graphType = settings?.graphType || "bar";
  meta.allowedYears = Array.isArray(data.allowedYears) ? data.allowedYears : [];

  const header = data.data[0];
  const rows = data.data.slice(1);


    monthKey = Object.keys(header)[0];
    globalRows = rows;

  if (!meta.allowedYears.length) {
    setMsg("A", "No years available from API.");
    setMsg("B", "No years available from API.");
  return;
}

    // building list from header
    buildings = Object.entries(header)
      .filter(([k]) => k !== monthKey)
      .map(([k, name]) => ({ key: k, name: String(name).trim() }))
      .filter(b => b.name);

    if (!buildings.length) {
      setMsg("A", "No building columns found.");
      setMsg("B", "No building columns found.");
      return;
    }

    // dropdowns
    fillDropdown(selectA);
    fillDropdown(selectB);

    // defaults
    selectA.value = buildings[0].key;
    selectB.value = buildings[1]?.key || buildings[0].key;

    // first render
    renderChart("A", ctxA, buildings.find(b => b.key === selectA.value) || buildings[0]);
    renderChart("B", ctxB, buildings.find(b => b.key === selectB.value) || buildings[0]);

    // handlers
    selectA.addEventListener("change", () => {
      const b = buildings.find(x => x.key === selectA.value);
      if (b) renderChart("A", ctxA, b);
    });

    selectB.addEventListener("change", () => {
      const b = buildings.find(x => x.key === selectB.value);
      if (b) renderChart("B", ctxB, b);
    });
  }

  init().catch(err => {
    console.error(err);
    setMsg("A", "Failed to load water data.");
    setMsg("B", "Failed to load water data.");
  });
}
