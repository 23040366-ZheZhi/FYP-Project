// /public/scripts/plotindivE_noninteractive.js
let chart = null;
let intervalTimer = null;  // bar slideshow
let timeoutTimer = null;   // line slideshow

const ctx = document.getElementById("chart")?.getContext("2d");
const msg = document.getElementById("msg");

const BAR_COLOR = "yellow";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

/* =========================
   Helpers
   ========================= */

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
  if (intervalTimer) clearInterval(intervalTimer);
  if (timeoutTimer) clearTimeout(timeoutTimer);
  intervalTimer = null;
  timeoutTimer = null;
}

function fmtNum(n) {
  return Number(n).toLocaleString();
}

/* =========================
   Summary box
   ========================= */

const canvasEl = document.getElementById("chart");
let summaryBox = document.getElementById("electricSummary");

function ensureSummaryBox() {
  if (summaryBox) return summaryBox;

  summaryBox = document.createElement("div");
  summaryBox.id = "electricSummary";
  summaryBox.style.margin = "10px 0 12px";
  summaryBox.style.padding = "10px 12px";
  summaryBox.style.border = "1px solid rgba(0,0,0,0.12)";
  summaryBox.style.borderRadius = "10px";
  summaryBox.style.background = "rgba(255,255,255,0.85)";
  summaryBox.style.backdropFilter = "blur(4px)";
  summaryBox.style.fontSize = "14px";
  summaryBox.style.lineHeight = "1.35";

  if (canvasEl?.parentNode) {
    canvasEl.parentNode.insertBefore(summaryBox, canvasEl);
  }

  return summaryBox;
}

function setSummaryHTML(html) {
  const box = ensureSummaryBox();
  box.innerHTML = html || "";
  box.style.display = html ? "block" : "none";
}

/* =========================
   API loaders
   ========================= */

async function loadGraphSettings() {
  const res = await fetch("/api/graph-settings");
  if (!res.ok) throw new Error(`graph-settings HTTP ${res.status}`);
  return await res.json();
}

async function loadElectricBuilding() {
  const res = await fetch("/api/electric-building");
  if (!res.ok) throw new Error(`electric-building HTTP ${res.status}`);
  return await res.json(); // ✅ expects { yearCount, allowedYears, data }
}

function getBuildingKeys(sampleRow) {
  return Object.keys(sampleRow).filter(k => !["year", "month"].includes(k));
}

function colorForIndex(i, total) {
  const hue = Math.round((i * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 45%)`;
}

/* =========================
   BAR MODE (slideshow by month across allowed years)
   ========================= */

function buildMonthFrame(rows, buildingKeys, year, month) {
  const row = rows.find(r => Number(r.year) === Number(year) && String(r.month).trim() === String(month).trim());

  const labels = [];
  const values = [];

  for (const b of buildingKeys) {
    labels.push(b.trim());
    const n = toNum(row?.[b]);
    values.push(Number.isFinite(n) && n !== 0 ? n : null);
  }

  return { labels, values, hasAny: values.some(v => v != null) };
}

function renderBarMonth(year, month, frame) {
  destroy();

  let max = null;
  let min = null;

  frame.values.forEach((v, i) => {
    if (v == null) return;
    const building = frame.labels[i];
    if (!max || v > max.v) max = { v, building };
    if (!min || v < min.v) min = { v, building };
  });

  if (max && min) {
    setSummaryHTML(
      `<b>Highest</b>: ${max.building} — ${fmtNum(max.v)} kWh <span style="opacity:.75">(at ${month} ${year})</span><br>` +
      `<b>Lowest</b>: ${min.building} — ${fmtNum(min.v)} kWh <span style="opacity:.75">(at ${month} ${year})</span>`
    );
  } else {
    setSummaryHTML("");
  }

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: frame.labels,
      datasets: [{
        label: `${month} ${year}`,
        data: frame.values,
        backgroundColor: BAR_COLOR,
        barThickness: 18,
        maxBarThickness: 26,
        categoryPercentage: 0.95,
        barPercentage: 0.95
      }]
    },
  options: {
  responsive: true,
  maintainAspectRatio: false,

  layout: {
    padding: {
      bottom: 70
    }
  },

  plugins: {
    title: {
      display: true,
      text: `Electricity — ${month} ${year}`,
      font: {
        size: 16,
        weight: "900"
      }
    },
    legend: {
      display: false
    }
  },

  scales: {
    x: {
      ticks: {
        autoSkip: false,
        maxRotation: 0,
        minRotation: 0,
        font: {
          size: 10
        },
        padding: 8,
        callback: function (value) {
          const label = this.getLabelForValue(value);
          const words = String(label).split(" ");
          const lines = [];

          for (let i = 0; i < words.length; i += 2) {
            lines.push(words.slice(i, i + 2).join(" "));
          }
          return lines;
        }
      }
    },

    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: "Electricity (kWh)",
        font: {
          size: 14,
          weight: "800"
        }
      }
    }
  }
}
}); 
}

 

function buildTimelineBar(rows, allowedYears) {
  const years = [...new Set(allowedYears)]
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  const seen = new Set();
  const points = [];

  for (const r of rows) {
    const y = Number(r.year);
    if (!years.includes(y)) continue;

    const mi = monthIndex(r.month);
    if (mi < 0) continue;

    const key = `${y}-${mi}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push({ year: y, month: MONTH_ORDER[mi], mi });
  }

  return points.sort((a, b) => (a.year - b.year) || (a.mi - b.mi));
}

function autoplayBar(rows, buildingKeys, allowedYears, rotateMs) {
  stopTimers();
  showMsg("");

  const timeline = buildTimelineBar(rows, allowedYears);
  if (!timeline.length) {
    showMsg("No valid months found.");
    return;
  }

  let i = 0;

  const showNext = () => {
    while (i < timeline.length) {
      const { year, month } = timeline[i++];
      const frame = buildMonthFrame(rows, buildingKeys, year, month);
      if (!frame.hasAny) continue;
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
    if (!showNext()) stopTimers();
  }, rotateMs);
}

/* =========================
   LINE MODE (slideshow by year across allowed years)
   ========================= */

function buildTimelineForYear(rows, year, buildingKeys) {
  const seen = new Set();
  const points = [];

  for (const r of rows) {
    if (Number(r.year) !== Number(year)) continue;

    const mi = monthIndex(r.month);
    if (mi < 0) continue;

    const hasAny = buildingKeys.some(k => {
      const n = toNum(r[k]);
      return Number.isFinite(n) && n !== 0;
    });
    if (!hasAny) continue;

    const key = `${year}-${mi}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push({
      year,
      month: MONTH_ORDER[mi],
      label: `${MONTH_ORDER[mi]} ${year}`
    });
  }

  return points.sort((a, b) => monthIndex(a.month) - monthIndex(b.month));
}

function renderLineYear(title, timeline, rows, buildingKeys) {
  destroy();

  let max = null;
  let min = null;

  const datasets = buildingKeys.map((k, i) => {
    const c = colorForIndex(i, buildingKeys.length);

    const data = timeline.map(t => {
      const row = rows.find(r => Number(r.year) === Number(t.year) && String(r.month).trim() === String(t.month).trim());
      const n = toNum(row?.[k]);
      const v = Number.isFinite(n) && n !== 0 ? n : null;

      if (v != null) {
        if (!max || v > max.v) max = { v, building: k, month: t.label };
        if (!min || v < min.v) min = { v, building: k, month: t.label };
      }

      return v;
    });

    return {
      label: k,
      data,
      borderColor: c,
      backgroundColor: c,
      tension: 0.25,
      pointRadius: 2,
      spanGaps: false
    };
  }).filter(ds => ds.data.some(v => v != null));

  if (!datasets.length) {
    showMsg("No valid data.");
    setSummaryHTML("");
    return;
  }

  showMsg("");

  if (max && min) {
    setSummaryHTML(
      `<b>Highest</b>: ${max.building} — ${fmtNum(max.v)} kWh <span style="opacity:.75">(at ${max.month})</span><br>` +
      `<b>Lowest</b>: ${min.building} — ${fmtNum(min.v)} kWh <span style="opacity:.75">(at ${min.month})</span>`
    );
  } else {
    setSummaryHTML("");
  }

  chart = new Chart(ctx, {
    type: "line",
    data: { labels: timeline.map(t => t.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title },
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "rect",
            boxWidth: 12,
            boxHeight: 12
          }
        }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Electricity (kWh)" } }
      }
    }
  });
}

/* =========================
   LINE MODE (slideshow by year across allowed years)
   - ✅ timeoutTimer
   - ✅ one year at a time
   - ✅ stops at latest year (no looping)
   ========================= */

function autoplayLine(rows, buildingKeys, allowedYears, rotateMs) {
  stopTimers();
  showMsg("");

  const years = [...new Set(allowedYears)]
    .filter(Number.isInteger)
    .sort((a, b) => a - b);

  if (!years.length) {
    showMsg("No years available.");
    return;
  }

  let index = 0;

  const showNextYear = () => {
    // ✅ STOP at latest year (no looping)
    if (index >= years.length) {
      stopTimers();
      return false;
    }

    const year = years[index++];
    const timeline = buildTimelineForYear(rows, year, buildingKeys);

    // skip years with no valid months
    if (!timeline.length) return showNextYear();

    renderLineYear(`Electricity (Line) — ${year}`, timeline, rows, buildingKeys);
    return true;
  };

  if (!showNextYear()) {
    showMsg("No valid yearly data to display.");
    return;
  }

  const step = () => {
    timeoutTimer = setTimeout(() => {
      if (showNextYear()) step();
    }, rotateMs);
  };

  step();
}


/* =========================
   INIT
   ========================= */

async function init() {
  try {
    if (!ctx) return;

    const [settings, meta] = await Promise.all([
      loadGraphSettings(),
      loadElectricBuilding()
    ]);

    const rows = meta?.data || [];
    const allowedYears = Array.isArray(meta?.allowedYears) ? meta.allowedYears : [];

    if (!rows.length) {
      showMsg("No electricity data found.");
      return;
    }
    if (!allowedYears.length) {
      showMsg("No years available from API.");
      return;
    }

    const rotateMs = Math.max(5000, Number(settings?.rotateSeconds || 10) * 1000);
    const buildingKeys = getBuildingKeys(rows[0]);

    if (settings?.graphType === "line") {
      autoplayLine(rows, buildingKeys, allowedYears, rotateMs);
    } else {
      autoplayBar(rows, buildingKeys, allowedYears, rotateMs);
    }

  } catch (e) {
    console.error(e);
    showMsg("Failed to load electricity graph.");
  }
}

init();
