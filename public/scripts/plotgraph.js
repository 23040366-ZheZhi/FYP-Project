let chart;

const SOLAR_COLORS = [
  "#FFB300", // golden amber (bright, solar)
  "#FB8C00", // strong orange
  "#F4511E", // orange-red
  "#E53935", // red
  "#B71C1C"  // deep crimson
];



const canvas = document.getElementById("solarChart");
const selector = document.getElementById("datasetSelector");
const msgBox = document.getElementById("msgBox");

if (!canvas || !selector) {
  console.warn("plotgraph.js: solar DOM not found, skipping");
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
    return String(r?.Solar ?? "").toLowerCase() === "month";
  }

 function hasValueForField(r, field) {
  const v = toNum(r[field]);
  return Number.isFinite(v);
}


  function parseSolarLabel(label) {
    // expects "Jan-24"
    const s = String(label ?? "").trim();
    const m = s.match(/^([A-Za-z]{3})-(\d{2})$/);
    if (!m) return null;

    const mon = m[1].toLowerCase();
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const monthIndex = map[mon];
    if (monthIndex === undefined) return null;

    const year = 2000 + Number(m[2]);
    return { year, monthIndex };
  }

  async function loadSolarFromApi() {
    const res = await fetch("/api/solar-detailed");
    if (!res.ok) throw new Error(`Solar HTTP ${res.status}`);
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

  
function renderChart(rows, field, titleText, meta) {
  if (chart) chart.destroy();

  // years available in data
  const yearsFound = [...new Set(
    rows
      .map(r => parseSolarLabel(r.Solar)?.year)
      .filter(Number.isInteger)
  )].sort((a, b) => a - b);

  if (!yearsFound.length) {
    showMsg("No valid solar years found.");
    return;
  }

  const safeCount = Math.max(1, Math.min(meta.yearCount || 1, yearsFound.length, 5));
  const yearsToShow = yearsFound.slice(-safeCount);

  // build 12-month series per year
  const seriesByYear = new Map();
  yearsToShow.forEach(y => seriesByYear.set(y, Array(12).fill(null)));

  for (const r of rows) {
    const info = parseSolarLabel(r.Solar);
    if (!info) continue;
    if (!seriesByYear.has(info.year)) continue;

    const val = toNum(r[field]);
    if (!Number.isFinite(val)) continue;

    seriesByYear.get(info.year)[info.monthIndex] = val;
  }

  // build labels only for months that have ANY data
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
    showMsg("No valid solar data to display.");
    return;
  }

  // newest year = strongest colour
  const datasets = yearsToShow.map((year, idx) => {
    const arr12 = seriesByYear.get(year);
    const data = monthIndices.map(i => arr12[i]);

    const color = SOLAR_COLORS[idx % SOLAR_COLORS.length];
    return {
      label: String(year),
      data,
      ...styleFor(meta, color)
    };
  });

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
              return `${c.dataset.label}: ${Number.isFinite(v) ? v.toLocaleString() : "-"} kWh`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "kWh" } }
      }
    }
  });
}
  async function initSolar() {
  try {
    showMsg("");

    const [result, settings] = await Promise.all([
      loadSolarFromApi(),
      loadGraphSettings()
    ]);

    if (!result || !Array.isArray(result.data)) {
      showMsg("Solar API error: invalid data format.");
      console.error("Invalid solar API result:", result);
      return;
    }

    const filteredRowsBase = result.data.filter(r => !isHeaderRow(r));

    const meta = {
      graphType: settings?.graphType || "bar",
      yearCount: Number(settings?.yearCount || 1)
    };

    const titles = {
      field3: "Urban Renewables",
      field4: "Green House (kWh)",
      field5: "Total Solar Energy"
    };

    const draw = () => {
      showMsg("");
      const field = selector.value;

      const rows = filteredRowsBase.filter(r => hasValueForField(r, field));

      if (!rows.length) {
        showMsg("No valid solar data for this dataset (after filtering).");
        return;
      }

      renderChart(rows, field, titles[field], meta);
    };

    selector.addEventListener("change", draw);
    draw();

  } catch (err) {
    console.error(err);
    showMsg("Failed to load solar data.");
  }
}


  window.addEventListener("solar:render", () => {
  initSolar();
  }, { once: true });


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
}
