export function plotChart(ctx, labels, values2024, values2025, buildingName) {
    if (window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "2024", data: values2024, backgroundColor: "skyblue" },
                { label: "2025", data: values2025, backgroundColor: "lightgreen" }
            ]
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
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}
export async function plotSpecificBuilding(ctx, buildingKey, jsonPath = "/output/1.1_Individual Pod.json") {
    const res = await fetch(jsonPath);
    const data = await res.json();
    const buildingName = data[0][buildingKey];

    const data2024Rows = data.slice(1, 13);
    const data2025Rows = data.slice(15, 27);

    const labels = data2024Rows.map(row => row["CY2024 Elect"]);
    const values2024 = data2024Rows.map(row => Number(row[buildingKey]?.replace(/,/g,"")) || 0);
    const raw2025 = data2025Rows.map(row => Number(row[buildingKey]?.replace(/,/g,"")) || 0);
    const values2025 = labels.map((_, i) => raw2025[i + 1] || 0);

    plotChart(ctx, labels, values2024, values2025, buildingName);
}