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
