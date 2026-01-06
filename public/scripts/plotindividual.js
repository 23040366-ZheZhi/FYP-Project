let chart;

const ctx = document.getElementById("chart")?.getContext("2d");
const buildingSelect = document.getElementById("buildingSelect");
const msgBox = document.getElementById("msgBox");

const COLOR_CURRENT = "skyblue";
const COLOR_PREVIOUS = "#43a047";

function showMsg(text) {
  if (!msgBox) return;
  msgBox.textContent = text;
  msgBox.style.display = text ? "block" : "none";
}

async function loadData() {
  const res = await fetch("/api/electric-building");
  if (!res.ok) throw new Error(`Electric-building HTTP ${res.status}`);
  return await res.json();
}

async function loadGraphSettings() {
  const res = await fetch("/api/graph-settings");
  if (!res.ok) throw new Error(`Graph-settings HTTP ${res.status}`);
  return await res.json();
}

function getBuildings(sampleRow) {
  return Object.keys(sampleRow)
    .filter(k => !["year", "month"].includes(k))
    .map(k => ({
      label: k.trim(),
      key: k
    }));
}

function populateDropdown(buildings) {
  buildingSelect.innerHTML = "";
  buildings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.key;
    opt.textContent = b.label;
    buildingSelect.appendChild(opt);
  });
}

function toNum(v) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function styleFor(color, graphType) {
  if (graphType === "line") {
    return {
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.3,
      pointRadius: 3
    };
  }
  return { backgroundColor: color };
}

function plot(rows, buildingKey, meta) {
  if (!ctx) return;
  if (chart) chart.destroy();

  const allMonths = [...new Set(rows.map(r => r.month))];

  const prevData = allMonths.map(m => {
    const raw = rows.find(r => r.month === m && r.year === meta.previousYear)?.[buildingKey];
    const n = toNum(raw);
    return (Number.isFinite(n) && n !== 0) ? n : null;
  });

  const currData = allMonths.map(m => {
    const raw = rows.find(r => r.month === m && r.year === meta.latestYear)?.[buildingKey];
    const n = toNum(raw);
    return (Number.isFinite(n) && n !== 0) ? n : null;
  });

  const labels = [];
  const prevFiltered = [];
  const currFiltered = [];

  allMonths.forEach((month, i) => {
    const hasPrev = prevData[i] !== null;
    const hasCurr = currData[i] !== null;

    if (hasPrev || hasCurr) {
      labels.push(month);
      prevFiltered.push(prevData[i]);
      currFiltered.push(currData[i]);
    }
  });

  if (!labels.length) {
    showMsg("No valid data found for this building.");
    return;
  }

  const datasets = [];

  if (meta.yearMode !== "current") {
    datasets.push({
      label: `${meta.previousYear}`,
      data: prevFiltered,
      ...styleFor(COLOR_PREVIOUS, meta.graphType)
    });
  }

  if (meta.yearMode !== "previous") {
    datasets.push({
      label: `${meta.latestYear}`,
      data: currFiltered,
      ...styleFor(COLOR_CURRENT, meta.graphType)
    });
  }

  chart = new Chart(ctx, {
    type: meta.graphType,
    data: { labels, datasets },
    options: {
      responsive: true,
      spanGaps: false,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: c =>
              `${c.dataset.label}: ${c.parsed.y?.toLocaleString() ?? "-"} kWh`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Electricity (kWh)" }
        }
      }
    }
  });
}


async function init() {
  try {
    showMsg("");

    const [result, settings] = await Promise.all([
      loadData(),
      loadGraphSettings()
    ]);

    const { data, yearMode, latestYear, previousYear } = result;
    const graphType = settings?.graphType || "bar";

    const buildings = getBuildings(data[0]);
    populateDropdown(buildings);

    buildingSelect.value = buildings[0].key;

    const meta = { yearMode, latestYear, previousYear, graphType };

    plot(data, buildings[0].key, meta);

    buildingSelect.addEventListener("change", () => {
      plot(data, buildingSelect.value, meta);
    });

  } catch (e) {
    console.error(e);
    showMsg("Failed to load electricity building data.");
  }
}

init();
