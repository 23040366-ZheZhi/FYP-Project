// /public/scripts/plotindivW.js
let chartA = null;
let chartB = null;

// ✅ slideshow timers (same style as electricity)
let intervalTimer = null; // bar slideshow
let timeoutTimer = null;  // line slideshow

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
    rotateMs: 10000
  };

  /* =========================
     Helpers
     ========================= */

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

  // expects "25-Jan" (YY-Mon)
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

  function destroy(which) {
    if (which === "A" && chartA) { chartA.destroy(); chartA = null; }
    if (which === "B" && chartB) { chartB.destroy(); chartB = null; }
  }

  function stopTimers() {
    if (intervalTimer) clearInterval(intervalTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    intervalTimer = null;
    timeoutTimer = null;
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json(); // includes graphType + rotateSeconds
  }

  async function loadWaterData() {
    const res = await fetch("/api/water-individual");
    if (!res.ok) throw new Error(`Water-individual HTTP ${res.status}`);
    return await res.json(); // { allowedYears, data:[header,...] }
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

  /* =========================
     Dataset styling (match elect)
     ========================= */

  function styleFor(color) {
    if (meta.graphType === "line") {
      return {
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.3,
        pointRadius: 3
      };
    }

    return {
      backgroundColor: color,
      borderRadius: 0,
      barThickness: "flex",
      maxBarThickness: 28,
      categoryPercentage: 0.72,
      barPercentage: 0.9
    };
  }

  function buildDatasets(buildingKey, allowedYears) {
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

      // keep 0 as "no plot"
      seriesByYear.get(info.year)[info.idx] = (val !== 0 ? val : null);
    }

    // only keep months that have ANY data in ANY selected year
    const labels = [];
    const monthIndices = [];
    for (let i = 0; i < 12; i++) {
      const anyHas = yearsToShow.some(y => seriesByYear.get(y)[i] != null);
      if (anyHas) {
        labels.push(MONTHS[i]);
        monthIndices.push(i);
      }
    }

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

  /* =========================
     Render
     ========================= */

  function renderChart(which, ctx, building) {
    const { labels, datasets } = buildDatasets(building.key, meta.allowedYears || []);

    if (!labels.length || !datasets.length || allEmptyOrZero(datasets)) {
      setMsg(which, `No meaningful data for ${building.name} (all 0/empty).`);
      destroy(which);
      return;
    }

    setMsg(which, "");
    destroy(which);

    const chart = new Chart(ctx, {
      type: meta.graphType,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: false,
        layout: { padding: { top: 12, right: 18, bottom: 18, left: 18 } },
        plugins: {
          title: {
            display: true,
            text: building.name,
            font: { size: 16, weight: "bold" },
            padding: { top: 6, bottom: 12 }
          },
          legend: {
            display: true,
            position: "bottom",
            labels: { padding: 12 }
          },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} m³`
            }
          }
        },
        scales: {
          x: { offset: true, grid: { offset: true }, ticks: { padding: 6 } },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Water Consumption (m³)" },
            ticks: { padding: 6 }
          }
        }
      }
    });

    if (which === "A") chartA = chart;
    else chartB = chart;
  }

  /* =========================
     ✅ Slideshow (same timer style as electricity)
     - Bar: intervalTimer
     - Line: timeoutTimer
     - rotates building selections (does not touch routes)
     ========================= */

  function pickNextPair(currentAKey, currentBKey) {
    if (!buildings.length) return { a: currentAKey, b: currentBKey };

    const idxA = Math.max(0, buildings.findIndex(b => b.key === currentAKey));
    const idxB = Math.max(0, buildings.findIndex(b => b.key === currentBKey));

    const nextA = buildings[(idxA + 1) % buildings.length].key;
    const nextB = buildings[(idxB + 1) % buildings.length].key;

    // avoid A == B when possible
    if (buildings.length > 1 && nextA === nextB) {
      const altB = buildings[(idxB + 2) % buildings.length].key;
      return { a: nextA, b: altB };
    }

    return { a: nextA, b: nextB };
  }

  function applyPair(pair) {
    selectA.value = pair.a;
    selectB.value = pair.b;

    const bA = buildings.find(b => b.key === selectA.value) || buildings[0];
    const bB = buildings.find(b => b.key === selectB.value) || buildings[0];

    renderChart("A", ctxA, bA);
    renderChart("B", ctxB, bB);
  }

  function startAutoplay() {
    stopTimers();

    // if only 1 building, no point autoplay
    if (buildings.length < 2) return;

    const step = () => {
      const pair = pickNextPair(selectA.value, selectB.value);
      applyPair(pair);
      return true;
    };

    // first step after delay (optional)
    if (meta.graphType === "bar") {
      intervalTimer = setInterval(() => {
        step();
      }, meta.rotateMs);
    } else {
      const loop = () => {
        timeoutTimer = setTimeout(() => {
          step();
          loop();
        }, meta.rotateMs);
      };
      loop();
    }
  }

  /* =========================
     Init
     ========================= */

  async function init() {
    const [data, settings] = await Promise.all([loadWaterData(), loadGraphSettings()]);

    if (!data || !Array.isArray(data.data) || data.data.length < 2) {
      setMsg("A", "No data returned.");
      setMsg("B", "No data returned.");
      return;
    }

    meta.graphType = settings?.graphType || "bar";
    meta.allowedYears = Array.isArray(data.allowedYears) ? data.allowedYears : [];
    meta.rotateMs = Math.max(5000, Number(settings?.rotateSeconds || 10) * 1000);

    const header = data.data[0];
    const rows = data.data.slice(1);

    monthKey = Object.keys(header)[0];
    globalRows = rows;

    if (!meta.allowedYears.length) {
      setMsg("A", "No years available from API.");
      setMsg("B", "No years available from API.");
      return;
    }

    buildings = Object.entries(header)
      .filter(([k]) => k !== monthKey)
      .map(([k, name]) => ({ key: k, name: String(name).trim() }))
      .filter(b => b.name);

    if (!buildings.length) {
      setMsg("A", "No building columns found.");
      setMsg("B", "No building columns found.");
      return;
    }

    fillDropdown(selectA);
    fillDropdown(selectB);

    // defaults
    selectA.value = buildings[0].key;
    selectB.value = buildings[1]?.key || buildings[0].key;

    // first render
    applyPair({ a: selectA.value, b: selectB.value });

    // manual handlers still work (and restart autoplay)
    selectA.addEventListener("change", () => {
      const b = buildings.find(x => x.key === selectA.value);
      if (b) renderChart("A", ctxA, b);
      startAutoplay();
    });

    selectB.addEventListener("change", () => {
      const b = buildings.find(x => x.key === selectB.value);
      if (b) renderChart("B", ctxB, b);
      startAutoplay();
    });

    // ✅ start autoplay using intervalTimer/timeoutTimer (NO route changes)
    startAutoplay();
  }

  init().catch(err => {
    console.error(err);
    setMsg("A", "Failed to load water data.");
    setMsg("B", "Failed to load water data.");
  });
}
