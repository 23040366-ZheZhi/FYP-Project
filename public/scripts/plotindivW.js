// scripts/plotindivW.js
export function plotChart(ctx, dataRows, xKey, yKey, buildingName) {
    if (window.myChart) window.myChart.destroy();

    // Extract X-axis labels (months)
    const labels = dataRows.map(row => row[xKey]);

    // Extract Y-axis values and convert to number
    const values = dataRows.map(row => Number(row[yKey]?.replace(/,/g,"")) || 0);

    window.myChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: buildingName,
                data: values,
                backgroundColor: "skyblue"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: buildingName,
                    font: { size: 18 }
                },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${context.parsed.y.toLocaleString()}`
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: "Month", font: { size: 14 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Water Consumption (kWh)", font: { size: 14 } },
                    grid: { color: "rgba(0,0,0,0.05)" }
                }
            }
        }
    });
}
