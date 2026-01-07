// /public/scripts/plotindivW_noninteractive.js
let chart = null;
let timer = null;

const canvas = document.getElementById("chart");
const ctx = canvas?.getContext("2d");
const msgBox = document.getElementById("msg"); // ✅ your HTML uses id="msg"

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const ABBR_TO_FULL = {
  jan: "January", feb: "February", mar: "March", apr: "April",
  may: "May", jun: "June", jul: "July", aug: "August",
  sep: "September", oct: "October", nov: "November", dec: "December"
};

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

// "25-Jan" -> { year: 2025, month: "January", mi: 0, label: "Jan 2025" }
function parseMonthCell(val) {
  const s = String(val || "").trim();
  const m = s.match(/^(\d{2})-([A-Za-z]{3})$/);
  if (!m) return null;

  const yy = Number(m[1]);
  const abbr = m[2].toLowerCase();
  const month = ABBR_TO_FULL[abbr];
  if (!month) return null;

  const year = 2000 + yy;
  const mi = MONTH_ORDER.indexOf(month);
  if (mi < 0) return null;

  const label = `${m[2].slice(0,3)} ${year}`;
  return { year, month, mi, label };
}

function destroy() {
  if (chart) { chart.destroy(); chart = null; }
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

async function loadGraphSettings() {
  const res = await fetch("/api/graph-settings");
  if (!res.ok) throw new Error(`graph-settings HTTP ${res.status}`);
  return await res.json(); // { graphType, yearMode, individualMode }
}

async function loadData() {
  const res = await fetch("/api/water-individual");
  if (!res.ok) throw new Error(`water-individual HTTP ${res.status}`);
  return await res.json(); // [headerRow, ...rows]
}

// ✅ keys are field1, field2... (field1 = month)
// ✅ REAL building names are headerRow[field2], headerRow[field3]...
function getMeta(headerRow) {
  const keys = Object.keys(headerRow || {});
  const firstColKey = keys[0]; // usually "field1"
  const buildingKeys = keys.slice(1);

  const buildingNames = buildingKeys.map(k => String(headerRow[k] || k).trim());
  return { firstColKey, buildingKeys, buildingNames };
}

function buildTimeline(rows, firstColKey) {
  const points = [];
  const seen = new Set();

  for (const r of rows) {
    const p = parseMonthCell(r?.[firstColKey]);
    if (!p) continue;

    const key = `${p.year}-${p.mi}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push(p);
  }

  points.sort((a, b) => (a.year - b.year) || (a.mi - b.mi));
  return points;
}

function findRow(rows, firstColKey, year, month) {
  for (const r of rows) {
    const p = parseMonthCell(r?.[firstColKey]);
    if (!p) continue;
    if (p.year === year && p.month === month) return r;
  }
  return null;
}

// ✅ distinct color per building (works for 22 buildings)
function colorForIndex(i, total) {
  const hue = Math.round((i * 360) / Math.max(1, total));
  return `hsl(${hue}, 70%, 45%)`;
}

// =====================
// ✅ LINE MODE (ONE CHART, ALL BUILDINGS LINES)
// =====================
function renderLineChart(timeline, rows, firstColKey, buildingKeys, buildingNames) {
  destroy();
  stopTimer();

  const labels = timeline.map(t => t.label);

  const datasets = buildingKeys.map((k, i) => {
    const c = colorForIndex(i, buildingKeys.length);

    const data = timeline.map(t => {
      const row = findRow(rows, firstColKey, t.year, t.month);
      const n = toNum(row?.[k]);
      // skip 0 / invalid
      return Number.isFinite(n) && n !== 0 ? n : null;
    });

    return {
      label: buildingNames[i],
      data,
      borderColor: c,
      backgroundColor: c,
      fill: false,
      tension: 0.25,
      pointRadius: 2,
      pointHoverRadius: 4,
      spanGaps: false
    };
  }).filter(ds => ds.data.some(v => v != null)); // remove all-null buildings

  if (!datasets.length) {
    showMsg("No valid data (all values are 0/invalid).");
    return;
  }

  showMsg("");

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        title: {
          display: true,
          text: "Water — Individual Buildings (Line)",
          font: { size: 16, weight: "bold" }
        },
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12 }
        },
        tooltip: {
          callbacks: {
            label: c => {
              const v = c.parsed.y;
              return v == null ? "" : `${c.dataset.label}: ${v.toLocaleString()} m³`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Water (m³)" } },
        x: { ticks: { autoSkip: true, maxRotation: 0 } }
      }
    }
  });
}

// =====================
// ✅ BAR MODE (AUTOPLAY BY MONTH)
// =====================
function renderBarMonth(titleLabel, buildingNames, values) {
  destroy();

  const hasAny = values.some(v => v != null);
  if (!hasAny) return false;

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: buildingNames,
      datasets: [{
        label: titleLabel,
        data: values,
        backgroundColor: "skyblue",
        borderRadius: 0,
        barThickness: 18,
        maxBarThickness: 26,
        categoryPercentage: 0.95,
        barPercentage: 0.95
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Water — ${titleLabel}`,
          font: { size: 16, weight: "bold" }
        },
        legend: { display: false }
      },
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 60 } },
        y: { beginAtZero: true, title: { display: true, text: "Water (m³)" } }
      }
    }
  });

  return true;
}

function autoplayBars(timeline, rows, firstColKey, buildingKeys, buildingNames) {
  stopTimer();
  showMsg("");

  let i = 0;

  const showNext = () => {
    while (i < timeline.length) {
      const t = timeline[i++];
      const row = findRow(rows, firstColKey, t.year, t.month);
      if (!row) continue;

      const values = buildingKeys.map(k => {
        const n = toNum(row?.[k]);
        return Number.isFinite(n) && n !== 0 ? n : null;
      });

      const ok = renderBarMonth(t.label, buildingNames, values);
      if (ok) return true;
    }
    return false;
  };

  if (!showNext()) {
    showMsg("No valid data to display.");
    return;
  }

  timer = setInterval(() => {
    const more = showNext();
    if (!more) stopTimer();
  }, 10000);
}

async function init() {
  try {
    if (!ctx) return;

    showMsg("");

    const [settings, arr] = await Promise.all([loadGraphSettings(), loadData()]);
    if (!Array.isArray(arr) || arr.length < 2) {
      showMsg("No individual water data found.");
      return;
    }

    const headerRow = arr[0];
    const rows = arr.slice(1);

    const { firstColKey, buildingKeys, buildingNames } = getMeta(headerRow);
    if (!firstColKey || !buildingKeys.length) {
      showMsg("No building columns found.");
      return;
    }

    const timeline = buildTimeline(rows, firstColKey);
    if (!timeline.length) {
      showMsg("No valid months found.");
      return;
    }

    if (settings?.graphType === "line") {
      renderLineChart(timeline, rows, firstColKey, buildingKeys, buildingNames);
    } else {
      autoplayBars(timeline, rows, firstColKey, buildingKeys, buildingNames);
    }

  } catch (e) {
    console.error(e);
    showMsg("Failed to load non-interactive water graph.");
  }
}

init();
