let chart;


const WASTE_COLORS = [
  "#1B5E20", 
  "#2E7D32", 
  "#4CAF50", 
  "#6D4C41", 
  "#8D6E63" 
];



const canvas    = document.getElementById("wasteChart");
const selector  = document.getElementById("datasetSelector");
const totalsDiv = document.getElementById("totalsDisplay");
const msgBox    = document.getElementById("msgBox");

if (!canvas || !selector) {
  console.warn("plotwaste.js: required DOM not found, skipping");
} else {
  const ctx = canvas.getContext("2d");

  const MONTHS_FULL = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  function showMsg(text) {
    if (!msgBox) return;
    msgBox.textContent = text || "";
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
   
    const s = String(label ?? "").trim();
    const m = s.match(/^([A-Za-z]{3})-(\d{4})$/);
    if (!m) return null;

    const mon = m[1].toLowerCase();
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const monthIndex = map[mon];
    if (monthIndex === undefined) return null;

    return { monthIndex, year: Number(m[2]) };
  }

  async function loadWasteDetailed() {
    const res = await fetch("/api/waste-detailed");
    if (!res.ok) throw new Error(`Waste HTTP ${res.status}`);
    return await res.json(); 
  }

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json(); 
  }

  function updateTotals(fyTotals, field) {
    if (!totalsDiv) return;

    const lines = (fyTotals || []).map(row => {
      const fy = row["General & Recyclable Waste"];
      const val = row[field] ?? "-";
      return `${fy}: ${val}`;
    });

    totalsDiv.textContent = lines.join(" | ");
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

  function unitFor(field) {
    return (field === "field4" || field === "field5") ? "%" : "kg";
  }

  function renderChart(monthlyRows, allowedYears, meta, field, titleText) {
    if (chart) chart.destroy();

    const yearsToShow = [...new Set(allowedYears)]
      .filter(Number.isInteger)
      .sort((a, b) => a - b);

    if (!yearsToShow.length) {
      showMsg("No waste years found.");
      return;
    }

    // Create 12-month arrays for each year
    const seriesByYear = new Map();
    yearsToShow.forEach(y => seriesByYear.set(y, Array(12).fill(null)));

    
    for (const row of monthlyRows) {
      const info = parseWasteLabel(row["General & Recyclable Waste"]);
      if (!info) continue;
      if (!seriesByYear.has(info.year)) continue;

      const val = toNumber(row[field]);
      if (!Number.isFinite(val)) continue;

      seriesByYear.get(info.year)[info.monthIndex] = val;
    }

    
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
      showMsg("No valid waste data to display.");
      return;
    }

    // Datasets (1–5 years)
    const datasets = yearsToShow.map((year, idx) => {
      const arr12 = seriesByYear.get(year);
      const data = monthIndices.map(i => arr12[i]);

      const color = WASTE_COLORS[idx % WASTE_COLORS.length];
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
                return `${c.dataset.label}: ${Number.isFinite(v) ? v.toLocaleString() : "-"} ${unitFor(field)}`;
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
      showMsg("");

      const [waste, settings] = await Promise.all([
        loadWasteDetailed(),
        loadGraphSettings()
      ]);

      if (!waste || !Array.isArray(waste.monthly) || !Array.isArray(waste.totals)) {
        showMsg("Waste API error: invalid data format.");
        console.error("Invalid waste result:", waste);
        return;
      }

      const meta = {
        graphType: settings?.graphType || "bar",
        yearCount: Number(settings?.yearCount || waste.yearCount || 1)
      };

      updateTotals(waste.totals, selector.value);

      const draw = () => {
        showMsg("");
        const field = selector.value;
        const titleText = selector.options[selector.selectedIndex].text;

        updateTotals(waste.totals, field);
        renderChart(waste.monthly, waste.allowedYears || [], meta, field, titleText);
      };

      selector.addEventListener("change", draw);
      draw();

    } catch (err) {
      console.error(err);
      showMsg("Failed to load waste data.");
    }
  }

  init();
}
