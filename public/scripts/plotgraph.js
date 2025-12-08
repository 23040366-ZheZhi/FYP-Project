export function plotChart(ctx, data, xKey, yKey, chartLabel) {
    const labels = data.map(item => item[xKey]);
    const values = data.map(item => Number(item[yKey].replace(/,/g, ""))); // remove commas

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
            scales: { y: { beginAtZero: true } }
        }
    });
}