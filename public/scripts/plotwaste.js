export function plotWasteChart(ctx, data, yKey, chartLabel) {

  const labels = data.map(
    item => item["General & Recyclable Waste"]
  );

  const values = data.map(item => {
    const raw = item[yKey] || "0";
    if (raw.includes("%")) return Number(raw.replace("%", ""));
    return Number(raw.replace(/,/g, ""));
  });

  // ✅ SAFE destroy
  if (window.wasteChart instanceof Chart) {
    window.wasteChart.destroy();
  }

  // ✅ ALWAYS reassign to Chart instance
  window.wasteChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: chartLabel,
        data: values,
        backgroundColor: "#5DADE2"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: chartLabel
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
