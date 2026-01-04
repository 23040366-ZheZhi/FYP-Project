// ======================= /public/scripts/plotwaste.js (WASTE COMPARISON) =======================
// ✅ compares previous vs current when yearMode === "both"
// ✅ only 2 colors: previous green, current skyblue
// ✅ aligns months together (Jan..Dec)
// ✅ keeps totals display
// ✅ keeps safe destroy logic
// ✅ keeps auto-rotate (only once)

let chart;

const COLOR_PREVIOUS = "#43a047";
const COLOR_CURRENT  = "skyblue";

const canvas   = document.getElementById("wasteChart");
const selector = document.getElementById("datasetSelector");
const totalsDiv = document.getElementById("totalsDisplay");
const msgBox   = document.getElementById("msgBox");

if (!canvas || !selector) {
  console.warn("plotwaste.js: required DOM not found, skipping");
} else {
  const ctx = canvas.getContext("2d");

  function showMsg(text) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.display = text ? "block" : "none";
  }

  function toNumber(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return NaN;

    if (s.includes("%")) {
      const n = Number(s.replace("%", "").trim());
      return Number.isFinite(n) ? n : NaN;
    }

    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function parseWasteLabel(label) {
    // expects "Jan-2024"
    const s = String(label ?? "").trim();
    const m = s.match(/^([A-Za-z]{3})-(\d{4})$/);
    if (!m) return null;

    const mon = m[1].toLowerCase();
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const monthIndex = map[mon];
    if (monthIndex === undefined) return null;

    return { monthIndex, year: Number(m[2]) };
  }

  const MONTHS_FULL = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  async function loadWaste() {
    showMsg("");
    const res = await fetch("/api/waste-detailed");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json(); // {monthly, totals, yearMode, latestYear, previousYear}
  }

  function updateTotals(fyTotals, field) {
    if (!totalsDiv) return;

    const lines = fyTotals.map(row => {
      const fy = row["General & Recyclable Waste"]; // "FY2024"
      const val = row[field] ?? "-";
      return `${fy}: ${val}`;
    });

    totalsDiv.textContent = lines.join(" | ");
  }

  function render(meta, monthlyData, fyTotals, field, labelText) {
    if (chart) chart.destroy();

    // build arrays for prev/curr aligned by month
    const prevArr = Array(12).fill(null);
    const currArr = Array(12).fill(null);

    for (const row of monthlyData) {
      const info = parseWasteLabel(row["General & Recyclable Waste"]);
      if (!info) continue;

      const val = toNumber(row[field]);
      if (!Number.isFinite(val)) continue;

      if (info.year === meta.previousYear) prevArr[info.monthIndex] = val;
      if (info.year === meta.latestYear)   currArr[info.monthIndex] = val;
    }

    // choose datasets based on yearMode
    if (meta.yearMode !== "both") {
      const yearToShow = (meta.yearMode === "previous") ? meta.previousYear : meta.latestYear;
      const arr = (meta.yearMode === "previous") ? prevArr : currArr;

      const labels = [];
      const data = [];
      for (let i = 0; i < 12; i++) {
        if (arr[i] != null) {
          labels.push(MONTHS_FULL[i]);
          data.push(arr[i]);
        }
      }

      if (!labels.length) {
        showMsg("No valid waste data to display.");
        return;
      }

      chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: String(yearToShow),
            data,
            backgroundColor: (yearToShow === meta.previousYear) ? COLOR_PREVIOUS : COLOR_CURRENT
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: labelText, font: { size: 18 } },
            legend: { display: true, position: "top" },
            tooltip: {
              callbacks: {
                label: c => {
                  const v = c.parsed.y;
                  const unit = field === "field4" || field === "field5" ? "%" : "kg";
                  return `${c.dataset.label}: ${v?.toLocaleString() ?? "-"} ${unit}`;
                }
              }
            }
          },
          scales: { y: { beginAtZero: true } }
        }
      });

      return;
    }

    // BOTH mode (2 datasets, months aligned)
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
      showMsg("No valid waste data to display.");
      return;
    }

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: String(meta.previousYear), data: prevData, backgroundColor: COLOR_PREVIOUS },
          { label: String(meta.latestYear),   data: currData, backgroundColor: COLOR_CURRENT }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: labelText, font: { size: 18 } },
          legend: { display: true, position: "top" },
          tooltip: {
            callbacks: {
              label: c => {
                const v = c.parsed.y;
                const unit = field === "field4" || field === "field5" ? "%" : "kg";
                return `${c.dataset.label}: ${v?.toLocaleString() ?? "-"} ${unit}`;
              }
            }
          }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  async function init() {
    try {
      const result = await loadWaste();

      if (!result || !Array.isArray(result.monthly) || !Array.isArray(result.totals)) {
        showMsg("Waste API error: invalid data format.");
        console.error("Invalid API result:", result);
        return;
      }

      const meta = {
        yearMode: result.yearMode || "current",
        latestYear: result.latestYear,
        previousYear: result.previousYear
      };

      const monthlyData = result.monthly;
      const fyTotals = result.totals;

      if (!monthlyData.length) {
        showMsg("No waste monthly data returned.");
        return;
      }

      const draw = () => {
        showMsg("");
        const field = selector.value;
        const labelText = selector.options[selector.selectedIndex].text;

        updateTotals(fyTotals, field);
        render(meta, monthlyData, fyTotals, field, labelText);
      };

      selector.addEventListener("change", draw);
      draw();

    } catch (err) {
      console.error(err);
      showMsg("Failed to load waste data.");
    }
  }

  init();

  // ✅ auto-rotate
  (function () {
    const routes = ["/", "/electgraph", "/solargraph", "/watergraph", "/wastegraph"];
    const delay = 30000;

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const index = routes.indexOf(path);
    if (index === -1) return;

    setTimeout(() => {
      window.location.href = routes[(index + 1) % routes.length];
    }, delay);
  })();
}
