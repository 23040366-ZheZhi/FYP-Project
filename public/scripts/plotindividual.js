let chart;

const ctx = document.getElementById("chart").getContext("2d");
const buildingSelect = document.getElementById("buildingSelect");

const COLOR_CURRENT = "#1e88e5";   // blue
const COLOR_PREVIOUS = "#43a047";  // green

async function loadData() {
  const res = await fetch("/api/electric-building");
  return await res.json();
}

function getBuildings(sampleRow) {
  return Object.keys(sampleRow)
    .filter(k => !["year", "month"].includes(k))
    .map(k => ({
      label: k.trim(),   // shown in dropdown
      key: k             // REAL key in JSON (with space)
    }));
}


function populateDropdown(buildings) {
  buildingSelect.innerHTML = "";
  buildings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.key;       // use REAL key
    opt.textContent = b.label;
    buildingSelect.appendChild(opt);
  });
}


function plot(data, building, meta) {
  if (chart) chart.destroy();

  // Step 1: build raw month list
  const allMonths = [...new Set(data.map(r => r.month))];

  // Step 2: build raw datasets
  const prevData = allMonths.map(
    m => data.find(r => r.month === m && r.year === meta.previousYear)?.[building] ?? null
  );

  const currData = allMonths.map(
    m => data.find(r => r.month === m && r.year === meta.latestYear)?.[building] ?? null
  );

  // Step 3: remove empty months
  const labels = [];
  const prevFiltered = [];
  const currFiltered = [];

  allMonths.forEach((month, i) => {
    const hasPrev = prevData[i] && prevData[i] !== 0;
    const hasCurr = currData[i] && currData[i] !== 0;

    if (hasPrev || hasCurr) {
      labels.push(month);
      prevFiltered.push(prevData[i]);
      currFiltered.push(currData[i]);
    }
  });

  // Step 4: build datasets
  const datasets = [];

  if (meta.yearMode !== "current") {
    datasets.push({
      label: `${meta.previousYear}`,
      data: prevFiltered,
      backgroundColor: "#43a047"
    });
  }

  if (meta.yearMode !== "previous") {
    datasets.push({
      label: `${meta.latestYear}`,
      data: currFiltered,
      backgroundColor: "#1e88e5"
    });
  }

  // Step 5: render chart
  chart = new Chart(ctx, {
    type: "bar", // 👈 BAR GRAPH
    data: { labels, datasets },
    options: {
      responsive: true,
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
  const result = await loadData();
  const { data, yearMode, latestYear, previousYear } = result;

  // Build buildings list from FIRST ROW
  const buildings = getBuildings(data[0]);
  populateDropdown(buildings);

  // ✅ FORCE SELECT FIRST BUILDING (ECMC)
  buildingSelect.value = buildings[0].key;

  // ✅ DRAW CHART IMMEDIATELY
  plot(data, buildings[0].key, { yearMode, latestYear, previousYear });

  // Change handler
  buildingSelect.addEventListener("change", () =>
    plot(data, buildingSelect.value, { yearMode, latestYear, previousYear })
  );
}


init();
