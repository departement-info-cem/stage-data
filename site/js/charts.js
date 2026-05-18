import { assignColors } from './colors.js';
import { DEFAULT_COLOR } from './constants.js';
import { escapeHTML } from './utils.js';

const TOOLTIP_BASE = {
    backgroundColor: 'rgba(0,0,0,0.8)',
    titleColor: 'white',
    bodyColor: 'white',
    borderColor: '#3498db',
    borderWidth: 1,
    cornerRadius: 8,
    titleFont: { size: 16 },
    bodyFont: { size: 16 },
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
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    if (!data.length) return null;

    const minHeightPerBar = 48;
    const containerHeight = Math.max(400, data.length * minHeightPerBar);
    canvas.parentElement.style.height = `${containerHeight}px`;
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
                    font: { size: 16 },
                    formatter: (v) => repondants ? `${((v / repondants) * 100).toFixed(1)} %` : '',
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    ticks: { color: '#7f8c8d', autoSkip: false, font: { size: 16 } },
                },
                x: {
                    grid: { display: true },
                    ticks: { color: '#7f8c8d', font: { size: 16 } },
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
            layout: { padding: { left: 12, right: 12, top: 6, bottom: 6 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        padding: 16,
                        usePointStyle: true,
                        boxWidth: 10,
                        boxHeight: 10,
                        color: '#0C3455',
                        font: { size: 16 },
                    },
                },
                tooltip: TOOLTIP_BASE,
            },
            animation: ANIMATION,
        },
    });
}

const columnTitlesPlugin = {
    id: 'columnTitles',
    afterDraw(chart, _args, opts) {
        if (!opts || !Array.isArray(opts.columns) || opts.columns.length === 0) return;
        const ctx = chart.ctx;
        const { chartArea } = chart;
        const n = opts.columns.length;
        ctx.save();
        ctx.font = '600 14px Geist, system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#0C3455';
        ctx.textBaseline = 'top';
        const top = Math.max(8, chartArea.top - 26);
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0.5 : i / (n - 1);
            const x = chartArea.left + (chartArea.right - chartArea.left) * t;
            ctx.textAlign = i === 0 ? 'left' : (i === n - 1 ? 'right' : 'center');
            ctx.fillText(String(opts.columns[i]), x, top);
        }
        ctx.restore();
    },
};

export function createSankeyChart(canvasId, data, columns, schemaColors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (!data || data.length === 0) return null;

    const parseKey = (key) => {
        const sep = key.indexOf('::');
        return { col: parseInt(key.slice(1, sep), 10), value: key.slice(sep + 2) };
    };

    const labels = {};
    const columnMap = {};
    const valueByKey = {};
    for (const flow of data) {
        for (const k of [flow.from, flow.to]) {
            if (labels[k]) continue;
            const { col, value } = parseKey(k);
            labels[k] = value;
            columnMap[k] = col;
            valueByKey[k] = value;
        }
    }

    const uniqueValues = Array.from(new Set(Object.values(valueByKey)));
    const valueColors = assignColors(uniqueValues, schemaColors);
    const colorByValue = new Map();
    uniqueValues.forEach((v, i) => colorByValue.set(v, valueColors[i]));
    const colorForKey = (key) => colorByValue.get(valueByKey[key]) || DEFAULT_COLOR;

    const minHeight = 360;
    const perFlow = 18;
    canvas.parentElement.style.height = `${Math.max(minHeight, 220 + data.length * perFlow)}px`;

    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'sankey',
        data: {
            datasets: [{
                data,
                labels,
                column: columnMap,
                colorFrom: (c) => colorForKey(c.dataset.data[c.dataIndex].from),
                colorTo: (c) => colorForKey(c.dataset.data[c.dataIndex].to),
                colorMode: 'gradient',
                borderWidth: 0,
                size: 'max',
                font: { size: 14, family: 'Geist, system-ui, sans-serif' },
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 36, bottom: 8, left: 8, right: 8 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...TOOLTIP_BASE,
                    callbacks: {
                        title: () => '',
                        label: (c) => {
                            const d = c.dataset.data[c.dataIndex];
                            const noun = d.flow > 1 ? 'étudiants' : 'étudiant';
                            return `${labels[d.from]} → ${labels[d.to]} : ${d.flow} ${noun}`;
                        },
                    },
                },
                columnTitles: { columns: columns || [] },
            },
            animation: ANIMATION,
        },
        plugins: [columnTitlesPlugin],
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
                    labels: { padding: 15, usePointStyle: true, color: '#2c3e50', font: { size: 16 } },
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
                    ticks: { color: '#7f8c8d', callback: yFormatter, font: { size: 16 } },
                },
                x: {
                    title: { display: true, text: 'Année' },
                    ticks: { color: '#7f8c8d', font: { size: 16 } },
                },
            },
            animation: ANIMATION,
        },
    });
}
