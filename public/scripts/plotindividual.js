// /public/scripts/plotindivE_compare.js
let chartA = null;
let chartB = null;

const COLOR_CURRENT  = "yellow";
const COLOR_PREVIOUS = "#edd60e";

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
    yearMode: "current",
    latestYear: null,
    previousYear: null,
    rows: [],
    buildings: []
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
    return await res.json(); // expects { data, yearMode, latestYear, previousYear }
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Graph-settings HTTP ${res.status}`);
    return await res.json();
  }

  function getBuildings(sampleRow) {
    return Object.keys(sampleRow)
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

  // keep bars squarish like your current one:
  // - borderRadius: 0
  // - do NOT set huge rounding
  // - set barThickness moderately (optional)
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

    // ✅ let Chart.js auto-fit bars when there are 2 datasets
    barThickness: "flex",
    maxBarThickness: 28,

    // ✅ creates “space” between month groups + between the 2 bars
    categoryPercentage: 0.72,
    barPercentage: 0.9
  };
}


  function buildSeries(buildingKey, year) {
    // all months in correct order (Jan..Dec) if your data month is "January" etc.
    // If your month is already in order, we keep your original behavior:
    const allMonths = [...new Set(state.rows.map(r => r.month))];

    const data = allMonths.map(m => {
      const raw = state.rows.find(r => r.month === m && r.year === year)?.[buildingKey];
      const n = toNum(raw);
      return (Number.isFinite(n) && n !== 0) ? n : null; // don't plot 0
    });

    return { allMonths, data };
  }

  function filterEmptyMonths(months, prevArr, currArr) {
    const labels = [];
    const prevFiltered = [];
    const currFiltered = [];

    months.forEach((m, i) => {
      const hasPrev = prevArr[i] != null;
      const hasCurr = currArr[i] != null;
      if (hasPrev || hasCurr) {
        labels.push(m);
        prevFiltered.push(prevArr[i]);
        currFiltered.push(currArr[i]);
      }
    });

    return { labels, prevFiltered, currFiltered };
  }

  function destroy(which) {
    if (which === "A" && chartA) { chartA.destroy(); chartA = null; }
    if (which === "B" && chartB) { chartB.destroy(); chartB = null; }
  }

  function render(which, ctx, building) {
    const { allMonths, data: prevData } = buildSeries(building.key, state.previousYear);
    const { data: currData } = buildSeries(building.key, state.latestYear);

    const { labels, prevFiltered, currFiltered } =
      filterEmptyMonths(allMonths, prevData, currData);

    if (!labels.length) {
      setMsg(which, "No valid data found for this building.");
      destroy(which);
      return;
    }

    setMsg(which, "");
    destroy(which);

    const datasets = [];

    if (state.yearMode !== "current") {
      datasets.push({
        label: String(state.previousYear),
        data: prevFiltered,
        ...styleFor(COLOR_PREVIOUS)
      });
    }

    if (state.yearMode !== "previous") {
      datasets.push({
        label: String(state.latestYear),
        data: currFiltered,
        ...styleFor(COLOR_CURRENT)
      });
    }

    const chart = new Chart(ctx, {
      type: state.graphType,
      data: { labels, datasets },
      options: {
  responsive: true,
  maintainAspectRatio: false,
  spanGaps: false,

  // ✅ breathing space around the plot area
  layout: {
    padding: { top: 12, right: 18, bottom: 18, left: 18 }
  },

  plugins: {
    title: {
      display: true,
      text: building.name,
      font: { size: 16, weight: "bold" },
      padding: { top: 6, bottom: 12 } // ✅ space between title and chart
    },

    legend: {
      display: true,
      position: "bottom",
      labels: { padding: 12 } // ✅ space around legend items
    },

    tooltip: {
      callbacks: {
        label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} kWh`
      }
    }
  },

  scales: {
    x: {
      offset: true,          // ✅ space left/right so bars aren’t hugging edges
      grid: { offset: true },
      ticks: { padding: 6 }  // ✅ space between labels and axis
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
      const { data, yearMode, latestYear, previousYear } = result;

      state.rows = data;
      state.yearMode = yearMode;
      state.latestYear = latestYear;
      state.previousYear = previousYear;
      state.graphType = settings?.graphType || "bar";

      const buildings = getBuildings(data[0]);
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
