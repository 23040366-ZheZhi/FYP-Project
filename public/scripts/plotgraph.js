let chart;

const COLOR_PREVIOUS = "#43a047"; // green
const COLOR_CURRENT  = "skyblue"; // skyblue

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

  // ✅ keep your rule: must have all 3 fields valid
  function isCompleteRow(r) {
    const a = toNum(r.field3);
    const b = toNum(r.field4);
    const c = toNum(r.field5);
    return !isNaN(a) && !isNaN(b) && !isNaN(c);
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

  function renderChart(filteredRows, field, titleText, meta) {
    if (chart) chart.destroy();

    // store month values for each year
    const prevArr = Array(12).fill(null);
    const currArr = Array(12).fill(null);

    for (const r of filteredRows) {
      const info = parseSolarLabel(r.Solar);
      if (!info) continue;

      const val = toNum(r[field]);
      if (!Number.isFinite(val)) continue;

      if (info.year === meta.previousYear) prevArr[info.monthIndex] = val;
      if (info.year === meta.latestYear)   currArr[info.monthIndex] = val;
    }

    // ========== single year ==========
    if (meta.yearMode !== "both") {
      const yearToShow = meta.yearMode === "previous" ? meta.previousYear : meta.latestYear;
      const arr = yearToShow === meta.previousYear ? prevArr : currArr;

      const labels = [];
      const data = [];
      for (let i = 0; i < 12; i++) {
        if (arr[i] != null) {
          labels.push(MONTHS_FULL[i]);
          data.push(arr[i]);
        }
      }

      if (!labels.length) {
        showMsg("No valid solar data to display (after filtering).");
        return;
      }

      chart = new Chart(ctx, {
        type: meta.graphType,
        data: {
          labels,
          datasets: [{
            label: String(yearToShow),
            data,
            ...styleFor(meta, yearToShow === meta.previousYear ? COLOR_PREVIOUS : COLOR_CURRENT)
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: titleText, font: { size: 18 } },
            legend: { display: true, position: "top" },
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} kWh`
              }
            }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "kWh" } }
          }
        }
      });

      return;
    }

    // ========== BOTH mode ==========
    const labels = [];
    const prevData = [];
    const currData = [];

    for (let i = 0; i < 12; i++) {
      const hasPrev = prevArr[i] != null;
      const hasCurr = currArr[i] != null;

      if (hasPrev || hasCurr) {
        labels.push(MONTHS_FULL[i]);
        prevData.push(prevArr[i]);
        currData.push(currArr[i]);
      }
    }

    if (!labels.length) {
      showMsg("No valid solar data to display (after filtering).");
      return;
    }

    chart = new Chart(ctx, {
      type: meta.graphType,
      data: {
        labels,
        datasets: [
          { label: String(meta.previousYear), data: prevData, ...styleFor(meta, COLOR_PREVIOUS) },
          { label: String(meta.latestYear),   data: currData, ...styleFor(meta, COLOR_CURRENT) }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: titleText, font: { size: 18 } },
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} kWh`
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

      const meta = {
        yearMode: settings?.yearMode || result.yearMode || "current",
        graphType: settings?.graphType || "bar",
        latestYear: result.latestYear,
        previousYear: result.previousYear
      };

      const filteredRows = result.data
        .filter(r => !isHeaderRow(r))
        .filter(isCompleteRow);

      if (!filteredRows.length) {
        showMsg("No valid solar data after filtering (need all 3 fields present).");
        return;
      }

      const titles = {
        field3: "Urban Renewables",
        field4: "Green House (kWh)",
        field5: "Total Solar Energy"
      };

      const draw = () => {
        showMsg("");
        const field = selector.value;
        renderChart(filteredRows, field, titles[field], meta);
      };

      selector.addEventListener("change", draw);
      draw();

    } catch (err) {
      console.error(err);
      showMsg("Failed to load solar data.");
    }
  }

  initSolar();
}
