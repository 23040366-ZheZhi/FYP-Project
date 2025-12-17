export function plotChart(ctx, data, xKey, yKey, chartLabel) {
    if (!Array.isArray(data)) {
        console.error("plotChart(): data is not an array", data);
        return;
    }

    const labels = data.map(d => d[xKey]);
    const values = data.map(d =>
        Number(String(d[yKey] || "").replace(/,/g, ""))
    );

    if (window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: chartLabel,
                data: values,
                backgroundColor: "skyblue"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: chartLabel,
                    font: { size: 18 }
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}
