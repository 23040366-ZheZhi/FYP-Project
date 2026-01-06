let chart;

const COLOR_PREVIOUS = "#43a047";
const COLOR_CURRENT  = "skyblue";

const canvas = document.getElementById("buildingChart");
const select = document.getElementById("buildingSelect");
const msgBox = document.getElementById("msgBox");

if (!canvas || !select) {
  console.warn("plotindivW.js: required DOM not found");
} else {
  const ctx = canvas.getContext("2d");

  let globalRows = [];
  let buildings = [];
  let monthKey = "";
  let meta = { yearMode: "current", latestYear: null, previousYear: null, graphType: "bar" };

  function showMsg(t) {
    if (!msgBox) return;
    msgBox.textContent = t;
    msgBox.style.display = t ? "block" : "none";
  }

  function toNum(v) {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function parseLabel(val) {
    const s = String(val ?? "");
    const m = s.match(/^(\d{2})-([A-Za-z]{3})$/);
    if (!m) return null;

    const year = 2000 + Number(m[1]);
    const mon = m[2].toLowerCase();
    const map = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const idx = map[mon];
    if (idx === undefined) return null;

    return { year, idx };
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  async function loadGraphSettings() {
    const res = await fetch("/api/graph-settings");
    if (!res.ok) throw new Error(`Settings HTTP ${res.status}`);
    return await res.json();
  }

  async function load() {
    showMsg("");

    const [data, settings] = await Promise.all([
      fetch("/api/water-individual").then(r => r.json()),
      loadGraphSettings()
    ]);

    if (!Array.isArray(data) || data.length < 2) {
      showMsg("No data returned.");
      return;
    }

    meta.graphType = settings?.graphType || "bar";

    const header = data[0];
    const rows = data.slice(1);

    monthKey = Object.keys(header)[0];
    globalRows = rows;

    const years = rows.map(r => parseLabel(r[monthKey])?.year).filter(Boolean);
    meta.latestYear = Math.max(...years);
    meta.previousYear = meta.latestYear - 1;
    meta.yearMode = years.some(y => y === meta.previousYear) ? "both" : "current";

    buildings = Object.entries(header)
      .filter(([k]) => k !== monthKey)
      .map(([k, name]) => ({ key: k, name: String(name).trim() }));

    select.innerHTML = "";
    for (const b of buildings) {
      const opt = document.createElement("option");
      opt.value = b.key;
      opt.textContent = b.name;
      select.appendChild(opt);
    }

    render(buildings[0]);

    select.onchange = () => {
      const b = buildings.find(x => x.key === select.value);
      if (b) render(b);
    };
  }

  function styleFor(color) {
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

  function render(building) {
    if (chart) chart.destroy();

    const prev = Array(12).fill(null);
    const curr = Array(12).fill(null);

    for (const r of globalRows) {
      const info = parseLabel(r[monthKey]);
      if (!info) continue;

      const val = toNum(r[building.key]);
      if (!Number.isFinite(val)) continue;

      if (info.year === meta.previousYear) prev[info.idx] = val;
      if (info.year === meta.latestYear)   curr[info.idx] = val;
    }

    const labels = [];
    const prevData = [];
    const currData = [];

    for (let i = 0; i < 12; i++) {
      if (prev[i] != null || curr[i] != null) {
        labels.push(MONTHS[i]);
        prevData.push(prev[i]);
        currData.push(curr[i]);
      }
    }

    const datasets = [];

    if (meta.yearMode !== "current") {
      datasets.push({
        label: String(meta.previousYear),
        data: prevData,
        ...styleFor(COLOR_PREVIOUS)
      });
    }

    if (meta.yearMode !== "previous") {
      datasets.push({
        label: String(meta.latestYear),
        data: currData,
        ...styleFor(COLOR_CURRENT)
      });
    }

    chart = new Chart(ctx, {
      type: meta.graphType,
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: building.name, font: { size: 18 } },
          tooltip: {
            callbacks: {
              label: c => `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} m³`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Water Consumption (m³)" }
          }
        }
      }
    });
  }

  load().catch(e => {
    console.error(e);
    showMsg("Failed to load water data.");
  });
}
