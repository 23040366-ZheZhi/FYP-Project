
let chartA = null;
let chartB = null;

const ELECTRIC_COLORS = [
  "#cfab0a", 
  "#FB8C00",
  "#E53935",
  "#8E24AA",
  "#3949AB"
];

const canvasA = document.getElementById("buildingChartA");
const canvasB = document.getElementById("buildingChartB");
const selectA = document.getElementById("buildingSelectA");
const selectB = document.getElementById("buildingSelectB");
const msgA    = document.getElementById("msgA");
const msgB    = document.getElementById("msgB");

if (!canvasA || !canvasB || !selectA || !selectB) {
  console.warn("plotindivE_compare.js: required DOM not found");
} else {
  const ctxA = canvasA.getContext("2d");
  const ctxB = canvasB.getContext("2d");

  const state = {
    graphType: "bar",
    rows: [],
    buildings: [],
    allowedYears: []
  };

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

  async function loadData() {
    const res = await fetch("/api/electric-building");
    if (!res.ok) throw new Error(`Electric-building HTTP ${res.status}`);
    return await res.json();
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Graph-settings HTTP ${res.status}`);
    return await res.json();
  }

  function getBuildings(sampleRow) {
    return Object.keys(sampleRow || {})
      .filter(k => !["year", "month"].includes(k))
      .map(k => ({ key: k, name: k.trim() }));
  }

  function fillDropdown(selectEl, buildings) {
    selectEl.innerHTML = "";
    for (const b of buildings) {
      const opt = document.createElement("option");
      opt.value = b.key;
      opt.textContent = b.name;
      selectEl.appendChild(opt);
    }
  }

  function styleFor(color) {
    if (state.graphType === "line") {
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

  function getAllMonths() {
    
    return [...new Set(state.rows.map(r => r.month))];
  }

  function buildDataForYear(buildingKey, year, allMonths) {
    return allMonths.map(m => {
      const raw = state.rows.find(r => r.month === m && Number(r.year) === Number(year))?.[buildingKey];
      const n = toNum(raw);
      return (Number.isFinite(n) && n !== 0) ? n : null; 
    });
  }

  function filterEmptyMonths(months, seriesByYear) {
    const keepIdx = months
      .map((m, i) => ({ m, i }))
      .filter(({ i }) => seriesByYear.some(arr => arr[i] != null));

    const labels = keepIdx.map(x => x.m);
    const filtered = seriesByYear.map(arr => keepIdx.map(x => arr[x.i]));

    return { labels, filtered };
  }

  function destroy(which) {
    if (which === "A" && chartA) { chartA.destroy(); chartA = null; }
    if (which === "B" && chartB) { chartB.destroy(); chartB = null; }
  }

  function render(which, ctx, building) {
    const allMonths = getAllMonths();
    if (!allMonths.length || !state.allowedYears.length) {
      setMsg(which, "No data available.");
      destroy(which);
      return;
    }

    
    const yearsToShow = [...new Set(state.allowedYears)]
      .filter(Number.isInteger)
      .sort((a, b) => a - b);

    const rawSeries = yearsToShow.map(y => buildDataForYear(building.key, y, allMonths));

    
    const { labels, filtered } = filterEmptyMonths(allMonths, rawSeries);

    if (!labels.length) {
      setMsg(which, "No valid data found for this building.");
      destroy(which);
      return;
    }

    
    const datasets = [];
    const latestIndex = yearsToShow.length - 1;

    yearsToShow.forEach((year, idx) => {
      const data = filtered[idx];
      const hasAnyPoint = data.some(v => Number.isFinite(v));
      if (!hasAnyPoint) return;

     
      const colorIndex = latestIndex - idx;
      const color = ELECTRIC_COLORS[colorIndex % ELECTRIC_COLORS.length];

      datasets.push({
        label: String(year),
        data,
        ...styleFor(color)
      });
    });

    if (!datasets.length) {
      setMsg(which, "No valid data to display.");
      destroy(which);
      return;
    }

    setMsg(which, "");
    destroy(which);

    const chart = new Chart(ctx, {
      type: state.graphType,
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
              label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} kWh`
            }
          }
        },
        scales: {
          x: {
            offset: true,
            grid: { offset: true },
            ticks: { padding: 6 }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Electricity (kWh)" },
            ticks: { padding: 6 }
          }
        }
      }
    });

    if (which === "A") chartA = chart;
    else chartB = chart;
  }

  async function init() {
    try {
      setMsg("A", "");
      setMsg("B", "");

      const [result, settings] = await Promise.all([loadData(), loadGraphSettings()]);

      if (!result || !Array.isArray(result.data) || !result.data.length) {
        setMsg("A", "No electricity building data returned.");
        setMsg("B", "No electricity building data returned.");
        return;
      }

      state.rows = result.data;
      state.allowedYears = Array.isArray(result.allowedYears) ? result.allowedYears : [];
      state.graphType = settings?.graphType || "bar";

      const buildings = getBuildings(result.data[0]);
      state.buildings = buildings;

      fillDropdown(selectA, buildings);
      fillDropdown(selectB, buildings);

      selectA.value = buildings[0]?.key || "";
      selectB.value = buildings[1]?.key || buildings[0]?.key || "";

      const getB = (key) => buildings.find(b => b.key === key) || buildings[0];

      render("A", ctxA, getB(selectA.value));
      render("B", ctxB, getB(selectB.value));

      selectA.addEventListener("change", () => render("A", ctxA, getB(selectA.value)));
      selectB.addEventListener("change", () => render("B", ctxB, getB(selectB.value)));

    } catch (e) {
      console.error(e);
      setMsg("A", "Failed to load electricity building data.");
      setMsg("B", "Failed to load electricity building data.");
    }
  }

  init();
}
