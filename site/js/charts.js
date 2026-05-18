import { assignColors } from './colors.js';
import { escapeHTML } from './utils.js';

const TOOLTIP_BASE = {
    backgroundColor: 'rgba(0,0,0,0.8)',
    titleColor: 'white',
    bodyColor: 'white',
    borderColor: '#3498db',
    borderWidth: 1,
    cornerRadius: 8,
};

const ANIMATION = { duration: 800, easing: 'easeOutQuart' };

export function createAverageDisplay(canvasId, data, q) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;
    const decimals = q.decimals != null ? q.decimals : 2;
    const unit = q.unit || '';
    const formatted = data.mean.toFixed(decimals);
    const responseLabel = data.count > 1 ? 'réponses' : 'réponse';
    container.innerHTML = `
        <div class="chart-average">
            <div class="chart-average__value">${escapeHTML(formatted)}${unit ? `<span class="chart-average__unit">${escapeHTML(unit)}</span>` : ''}</div>
            <div class="chart-average__count">basée sur ${data.count} ${responseLabel}</div>
        </div>
    `;
}

export function createBarChart(canvasId, data, repondants, schemaColors) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (!data.length) return null;
    const labels = data.map((d) => d.value);
    const values = data.map((d) => d.count);
    const colors = assignColors(labels, schemaColors);

    return new Chart(ctx, {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels,
            datasets: [{
                label: 'Étudiants',
                data: values,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...TOOLTIP_BASE,
                    callbacks: {
                        label: (c) => {
                            const v = c.parsed.x;
                            const pct = repondants ? ((v / repondants) * 100).toFixed(1) : '—';
                            return `${v} étudiant(s) — ${pct} %`;
                        },
                    },
                },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#2c3e50',
                    formatter: (v) => repondants ? `${((v / repondants) * 100).toFixed(1)} %` : '',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    ticks: { color: '#7f8c8d', autoSkip: false },
                },
                x: {
                    grid: { display: true },
                    ticks: { color: '#7f8c8d' },
                    afterDataLimits: (axis) => { axis.max = axis.max * 1.05; },
                },
            },
            animation: ANIMATION,
        },
    });
}

export function createPieChart(canvasId, data, repondants, schemaColors) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (!data.length) return null;
    const sorted = [...data].sort((a, b) => String(a.value).localeCompare(String(b.value), 'fr', { sensitivity: 'base' }));
    const labels = sorted.map((d) => {
        const pct = repondants ? ((d.count / repondants) * 100).toFixed(1) : '—';
        return `${d.value} (${pct} %)`;
    });
    const values = sorted.map((d) => d.count);
    const colors = assignColors(sorted.map((d) => d.value), schemaColors);

    return new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: 'white', borderWidth: 3 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true, color: '#2c3e50' },
                },
                tooltip: TOOLTIP_BASE,
            },
            animation: ANIMATION,
        },
    });
}

export function createLineChart(canvasId, years, datasets, options = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const onlyOneYear = years.length < 2;
    const yLabel = options.yLabel || '% des répondants';
    const yFormatter = options.yFormatter || ((v) => v + ' %');
    const tooltipFormatter = options.tooltipFormatter || ((c) => `${c.dataset.label} : ${c.parsed.y} %`);
    const showLegend = options.showLegend !== false;
    return new Chart(ctx, {
        type: onlyOneYear ? 'bar' : 'line',
        data: { labels: years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: showLegend,
                    position: 'bottom',
                    labels: { padding: 15, usePointStyle: true, color: '#2c3e50' },
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    callbacks: { label: tooltipFormatter },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: yLabel },
                    ticks: { color: '#7f8c8d', callback: yFormatter },
                },
                x: {
                    title: { display: true, text: 'Année' },
                    ticks: { color: '#7f8c8d' },
                },
            },
            animation: ANIMATION,
        },
    });
}
