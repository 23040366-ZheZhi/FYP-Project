// /public/scripts/plotindivE_noninteractive.js
let chart = null;
let intervalTimer = null;  // for bar slideshow
let timeoutTimer = null;   // for line slideshow steps

const ctx = document.getElementById("chart")?.getContext("2d");
const msg = document.getElementById("msg");

const BAR_COLOR = "skyblue";
const INTERVAL_MS = 10000;

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function showMsg(text) {
  if (!msg) return;
  msg.textContent = text || "";
  msg.style.display = text ? "block" : "none";
}

function toNum(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function monthIndex(m) {
  return MONTH_ORDER.indexOf(String(m || "").trim());
}

function destroy() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function stopTimers() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

async function loadGraphSettings() {
  const res = await fetch("/api/graph-settings");
  if (!res.ok) throw new Error(`graph-settings HTTP ${res.status}`);
  return await res.json(); // { yearMode, graphType, individualMode }
}

async function loadElectricBuilding() {
  const res = await fetch("/api/electric-building");
  if (!res.ok) throw new Error(`electric-building HTTP ${res.status}`);
  return await res.json(); // { yearMode, latestYear, previousYear, data:[...] }
}

function getBuildingKeys(sampleRow) {
  return Object.keys(sampleRow).filter(k => !["year", "month"].includes(k));
}

// ✅ nice distributed colours for many lines (22 buildings ok)
function colorForIndex(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 45%)`;
}

/* =========================
   BAR MODE (month slideshow)
   ========================= */

// returns { labels:[buildings], values:[numbers|null], hasAny:boolean }
function buildMonthFrame(rows, buildingKeys, year, month) {
  const row = rows.find(r => r.year === year && r.month === month);

  const labels = [];
  const values = [];

  for (const b of buildingKeys) {
    labels.push(b.trim());
    const n = toNum(row?.[b]);
    values.push(Number.isFinite(n) && n !== 0 ? n : null); // ✅ skip 0
  }

  return { labels, values, hasAny: values.some(v => v != null) };
}

function renderBarMonth(year, month, frame) {
  destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: frame.labels,
      datasets: [{
        label: `${month} ${year}`,
        data: frame.values,
        backgroundColor: BAR_COLOR,
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
          text: `Electricity — ${month} ${year}`,
          font: { size: 16, weight: "bold" }
        },
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const v = c.parsed.y;
              return v == null ? "-" : `${v.toLocaleString()} kWh`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 60 } },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Electricity (kWh)" }
        }
      }
    }
  });
}

function buildTimelineBar(rows, yearMode, latestYear, previousYear) {
  let allowedYears;
  if (yearMode === "both") allowedYears = [previousYear, latestYear];
  else if (yearMode === "previous") allowedYears = [previousYear];
  else allowedYears = [latestYear];

  const seen = new Set();
  const points = [];

  for (const r of rows) {
    if (!allowedYears.includes(r.year)) continue;
    const mi = monthIndex(r.month);
    if (mi < 0) continue;

    const key = `${r.year}-${mi}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push({ year: r.year, month: MONTH_ORDER[mi], mi });
  }

  points.sort((a, b) => (a.year - b.year) || (a.mi - b.mi));

  if (yearMode === "both") {
    const lastCurr = [...points].reverse().find(p => p.year === latestYear);
    if (lastCurr) {
      const stopAt = points.findIndex(p => p.year === lastCurr.year && p.mi === lastCurr.mi);
      return points.slice(0, stopAt + 1);
    }
  }

  return points;
}

function autoplayBar(rows, buildingKeys, yearMode, latestYear, previousYear) {
  stopTimers();
  showMsg("");

  const timeline = buildTimelineBar(rows, yearMode, latestYear, previousYear);
  if (!timeline.length) {
    showMsg("No valid months found to autoplay.");
    return;
  }

  let i = 0;

  const showNext = () => {
    while (i < timeline.length) {
      const { year, month } = timeline[i++];
      const frame = buildMonthFrame(rows, buildingKeys, year, month);
      if (!frame.hasAny) continue; // ✅ skip empty month
      renderBarMonth(year, month, frame);
      return true;
    }
    return false;
  };

  if (!showNext()) {
    showMsg("No valid data to display.");
    return;
  }

  intervalTimer = setInterval(() => {
    const more = showNext();
    if (!more) stopTimers();
  }, INTERVAL_MS);
}

/* =========================
   LINE MODE (year slideshow)
   ========================= */

// ✅ month has at least 1 building with real data (not 0 / not empty)
function monthHasAnyData(rows, buildingKeys, year, month) {
  const row = rows.find(r => r.year === year && r.month === month);
  if (!row) return false;

  for (const k of buildingKeys) {
    const n = toNum(row?.[k]);
    if (Number.isFinite(n) && n !== 0) return true;
  }
  return false;
}

function buildTimelineForYear(rows, year, buildingKeys) {
  const seen = new Set();
  const points = [];

  for (const r of rows) {
    if (r.year !== year) continue;
    const mi = monthIndex(r.month);
    if (mi < 0) continue;

    // ✅ REMOVE months where ALL buildings are 0/empty
    if (!monthHasAnyData(rows, buildingKeys, year, MONTH_ORDER[mi])) continue;

    const key = `${year}-${mi}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push({
      year,
      mi,
      month: MONTH_ORDER[mi],
      label: `${MONTH_ORDER[mi]} ${year}`
    });
  }

  points.sort((a, b) => a.mi - b.mi);
  return points;
}

function renderLineYear(titleText, timeline, rows, buildingKeys) {
  destroy();

  if (!timeline.length) {
    showMsg("No valid months (all values are 0/empty).");
    return;
  }

  const labels = timeline.map(t => t.label);

  const datasets = buildingKeys.map((key, idx) => {
    const c = colorForIndex(idx, buildingKeys.length);

    const data = timeline.map(t => {
      const row = rows.find(r => r.year === t.year && r.month === t.month);
      const n = toNum(row?.[key]);
      return Number.isFinite(n) && n !== 0 ? n : null; // ✅ skip 0
    });

    return {
      label: key.trim(),
      data,
      borderColor: c,
      backgroundColor: c,
      fill: false,
      tension: 0.25,
      pointRadius: 2,
      pointHoverRadius: 4,
      spanGaps: false
    };
  }).filter(ds => ds.data.some(v => v != null));

  if (!datasets.length) {
    showMsg("No valid data (all buildings are 0/empty).");
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
          text: titleText,
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
              return v == null ? "" : `${c.dataset.label}: ${v.toLocaleString()} kWh`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Electricity (kWh)" } },
        x: { ticks: { autoSkip: true, maxRotation: 0 } }
      }
    }
  });
}

function autoplayLine(rows, buildingKeys, yearMode, latestYear, previousYear) {
  stopTimers();
  showMsg("");

  const showYear = (year, title) => {
    const timeline = buildTimelineForYear(rows, year, buildingKeys); // ✅ pruned
    if (!timeline.length) return false;
    renderLineYear(title, timeline, rows, buildingKeys);
    return true;
  };

  if (yearMode !== "both") {
    const year = (yearMode === "previous") ? previousYear : latestYear;
    const ok = showYear(year, `Electricity (Line) — ${year}`);
    if (!ok) showMsg("No valid months for this year.");
    return;
  }

  // ✅ both: previous year then current year (loop)
  const step = () => {
    const okPrev = showYear(previousYear, `Electricity (Line) — Previous Year (${previousYear})`);
    if (!okPrev) {
      showMsg("No valid data for previous year.");
      return;
    }

    timeoutTimer = setTimeout(() => {
      const okCurr = showYear(latestYear, `Electricity (Line) — Current Year (${latestYear})`);
      if (!okCurr) {
        showMsg("No valid data for current year.");
        return;
      }

      timeoutTimer = setTimeout(step, INTERVAL_MS);
    }, INTERVAL_MS);
  };

  step();
}

/* =========================
   INIT
   ========================= */

async function init() {
  try {
    showMsg("");

    if (!ctx) return;

    const [settings, meta] = await Promise.all([
      loadGraphSettings(),
      loadElectricBuilding()
    ]);

    const rows = meta?.data || [];
    const yearMode = meta?.yearMode || "current";
    const latestYear = meta?.latestYear ?? null;
    const previousYear = meta?.previousYear ?? null;

    if (!rows.length) {
      showMsg("No electricity individual data found.");
      return;
    }

    const buildingKeys = getBuildingKeys(rows[0]);
    if (!buildingKeys.length) {
      showMsg("No building columns found.");
      return;
    }

    const graphType = settings?.graphType || "bar";

    if (graphType === "line") {
      autoplayLine(rows, buildingKeys, yearMode, latestYear, previousYear);
      return;
    }

    autoplayBar(rows, buildingKeys, yearMode, latestYear, previousYear);

  } catch (e) {
    console.error(e);
    showMsg("Failed to load non-interactive electricity graph.");
  }
}

init();
