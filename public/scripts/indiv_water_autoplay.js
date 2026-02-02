

let chart = null;
let intervalTimer = null; 
let timeoutTimer  = null; 

const canvas = document.getElementById("chart");
const ctx = canvas?.getContext("2d");
const msgBox = document.getElementById("msg"); 


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

function destroy() {
  if (chart) { chart.destroy(); chart = null; }
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


let summaryBox = document.getElementById("waterSummary");

function ensureSummaryBox() {
  if (summaryBox) return summaryBox;

  summaryBox = document.createElement("div");
  summaryBox.id = "waterSummary";
  summaryBox.style.margin = "10px 0 12px";
  summaryBox.style.padding = "10px 12px";
  summaryBox.style.border = "1px solid rgba(0,0,0,0.12)";
  summaryBox.style.borderRadius = "10px";
  summaryBox.style.background = "rgba(255,255,255,0.85)";
  summaryBox.style.backdropFilter = "blur(4px)";
  summaryBox.style.fontSize = "14px";
  summaryBox.style.lineHeight = "1.35";

  if (canvas?.parentNode) canvas.parentNode.insertBefore(summaryBox, canvas);
  return summaryBox;
}

function setSummaryHTML(html) {
  const box = ensureSummaryBox();
  box.innerHTML = html || "";
  box.style.display = html ? "block" : "none";
}


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

  const label = `${m[2].slice(0, 3)} ${year}`;
  return { year, month, mi, label };
}


async function loadGraphSettings() {
  const res = await fetch("/api/graph-settings");
  if (!res.ok) throw new Error(`graph-settings HTTP ${res.status}`);
  return await res.json(); 
}

async function loadData() {
  const res = await fetch("/api/water-individual");
  if (!res.ok) throw new Error(`water-individual HTTP ${res.status}`);
  return await res.json(); 
}


function getMeta(headerRow) {
  const keys = Object.keys(headerRow || {});
  const firstColKey = keys[0];
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

function colorForIndex(i, total) {
  const hue = Math.round((i * 360) / Math.max(1, total));
  return `hsl(${hue}, 70%, 45%)`;
}


function renderBarMonth(titleLabel, buildingNames, values) {
  destroy();

  const hasAny = values.some(v => v != null);
  if (!hasAny) {
    setSummaryHTML("");
    return false;
  }

  let maxPoint = null;
  let minPoint = null;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;

    const building = buildingNames[i];
    if (!maxPoint || v > maxPoint.v) maxPoint = { v, building };
    if (!minPoint || v < minPoint.v) minPoint = { v, building };
  }

  if (maxPoint && minPoint) {
    setSummaryHTML(
      `<b>Highest</b>: ${maxPoint.building} — ${fmtNum(maxPoint.v)} m³ <span style="opacity:.75">(at ${titleLabel})</span><br>` +
      `<b>Lowest</b>: ${minPoint.building} — ${fmtNum(minPoint.v)} m³ <span style="opacity:.75">(at ${titleLabel})</span>`
    );
  } else {
    setSummaryHTML("");
  }

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

      layout: {
        padding: { bottom: 70 }
      },

      plugins: {
        title: {
          display: true,
          text: `Water — ${titleLabel}`,
          font: { size: 16, weight: "900" }
        },
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const v = c.parsed.y;
              return v == null ? "-" : `${v.toLocaleString()} m³`;
            }
          }
        }
      },

      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 },
            padding: 14,
            callback: function (value) {
              const label = String(this.getLabelForValue(value) ?? "");
              const words = label.split(" ").filter(Boolean);

              if (words.length <= 2) return label;

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
            text: "Water (m³)",
            font: { size: 14, weight: "900" }
          }
        }
      }
    }
  });
    return true;
}  



function autoplayBars(timeline, rows, firstColKey, buildingKeys, buildingNames, rotateMs) {
  stopTimers();
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

  intervalTimer = setInterval(() => {
    if (!showNext()) stopTimers();
  }, rotateMs);
}


function renderLineYear(year, timelineYear, rows, firstColKey, buildingKeys, buildingNames) {
  destroy();

  const labels = timelineYear.map(t => t.label);

  let maxPoint = null;
  let minPoint = null;

  const datasets = buildingKeys.map((k, i) => {
    const c = colorForIndex(i, buildingKeys.length);

    const data = timelineYear.map(t => {
      const row = findRow(rows, firstColKey, t.year, t.month);
      const n = toNum(row?.[k]);
      const v = Number.isFinite(n) && n !== 0 ? n : null;

      if (v != null) {
        const building = buildingNames[i] || k;
        const month = t.label;
        if (!maxPoint || v > maxPoint.v) maxPoint = { v, building, month };
        if (!minPoint || v < minPoint.v) minPoint = { v, building, month };
      }

      return v;
    });

    return {
      label: buildingNames[i] || k,
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
    showMsg(`No valid line data for ${year}.`);
    setSummaryHTML("");
    return false;
  }

  showMsg("");

  if (maxPoint && minPoint) {
    setSummaryHTML(
      `<b>Highest</b>: ${maxPoint.building} — ${fmtNum(maxPoint.v)} m³ <span style="opacity:.75">(at ${maxPoint.month})</span><br>` +
      `<b>Lowest</b>: ${minPoint.building} — ${fmtNum(minPoint.v)} m³ <span style="opacity:.75">(at ${minPoint.month})</span>`
    );
  } else {
    setSummaryHTML("");
  }

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
       layout: {
          padding: { bottom: 60 }   
      },
      interaction: { mode: "index", intersect: false },
      plugins: {
        title: {
          display: true,
          text: `Water — Individual Buildings (Line) — ${year}`,
          font: { size: 16, weight: "900" }
        },
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "rect",
            boxWidth: 12,
            boxHeight: 12
          }
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
        y: { beginAtZero: true, title: { display: true, text: "Water (m³)",weight:"800" } },
        x: { ticks: { autoSkip: true, maxRotation: 0 } }
      }
    }
  });

  return true;
}


function autoplayLineByYear(timeline, rows, firstColKey, buildingKeys, buildingNames, allowedYears, rotateMs) {
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
    
    if (index >= years.length) {
      stopTimers();
      return false;
    }

    const year = years[index++];
    const timelineYear = timeline.filter(t => t.year === year);

    
    if (!timelineYear.length) return showNextYear();

    const ok = renderLineYear(year, timelineYear, rows, firstColKey, buildingKeys, buildingNames);
    if (!ok) return showNextYear(); 

    return true;
  };

  if (!showNextYear()) {
    showMsg("No valid yearly line data to display.");
    return;
  }

  const step = () => {
    timeoutTimer = setTimeout(() => {
      if (showNextYear()) step();
    }, rotateMs);
  };

  step();
}


async function init() {
  try {
    if (!ctx) return;

    showMsg("");

    const [settings, result] = await Promise.all([loadGraphSettings(), loadData()]);

    const arr = result?.data;
    if (!Array.isArray(arr) || arr.length < 2) {
      showMsg("No individual water data found.");
      return;
    }

    const allowedYears = Array.isArray(result?.allowedYears) ? result.allowedYears : [];
    if (!allowedYears.length) {
      showMsg("No years available from API.");
      return;
    }

    const headerRow = arr[0];
    const rows = arr.slice(1);

    const { firstColKey, buildingKeys, buildingNames } = getMeta(headerRow);
    if (!firstColKey || !buildingKeys.length) {
      showMsg("No building columns found.");
      return;
    }

    let timeline = buildTimeline(rows, firstColKey);
    if (!timeline.length) {
      showMsg("No valid months found.");
      return;
    }

    
    timeline = timeline.filter(t => allowedYears.includes(t.year));
    if (!timeline.length) {
      showMsg("No months found for selected years.");
      return;
    }

    const rotateMs = Math.max(5000, Number(settings?.rotateSeconds || 10) * 1000);

    if (settings?.graphType === "line") {
      autoplayLineByYear(timeline, rows, firstColKey, buildingKeys, buildingNames, allowedYears, rotateMs);
    } else {
      autoplayBars(timeline, rows, firstColKey, buildingKeys, buildingNames, rotateMs);
    }

  } catch (e) {
    console.error(e);
    showMsg("Failed to load non-interactive water graph.");
  }
}

init();
