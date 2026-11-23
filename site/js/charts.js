import { assignColors, withAlpha } from './colors.js';
import { DEFAULT_COLOR, PLACEMENT_COLOR } from './constants.js';
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

export function formatRate(rate) {
    if (rate == null) return '—';
    const rounded = Math.round(rate * 10) / 10;
    const decimals = Number.isInteger(rounded) ? 0 : 1;
    return `${rounded.toLocaleString('fr-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} %`;
}

const forecastBandPlugin = {
    id: 'forecastBand',
    beforeDatasetsDraw(chart, _args, opts) {
        const flags = opts && opts.forecast;
        if (!Array.isArray(flags)) return;
        const first = flags.indexOf(true);
        if (first <= 0) return;

        const xScale = chart.scales.x;
        const { chartArea, ctx } = chart;
        const from = xScale.getPixelForValue(first - 1);
        const to = xScale.getPixelForValue(flags.length - 1);

        ctx.save();
        ctx.fillStyle = 'rgba(12, 52, 85, 0.04)';
        ctx.fillRect(from, chartArea.top, to - from, chartArea.bottom - chartArea.top);
        ctx.font = '600 13px Geist, system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#7f8c8d';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(opts.label || 'Prévisionnel', to - 8, chartArea.top + 8);
        ctx.restore();
    },
};

export function createCohortChart(canvasId, { years, forecast, areas, placed, rates }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !years.length) return null;
    canvas.parentElement.style.height = '440px';

    const dashForecastSegment = (ctx) => (forecast[ctx.p1DataIndex] ? [6, 5] : undefined);
    const pointRadius = (ctx) => (forecast[ctx.dataIndex] ? 4 : 5);

    const datasets = areas.map((area, idx) => ({
        label: area.label,
        data: area.data,
        stack: 'finissants',
        borderColor: area.color,
        backgroundColor: withAlpha(area.color, 0.18),
        borderWidth: 2,
        fill: idx === 0 ? 'origin' : '-1',
        tension: 0.25,
        pointRadius,
        pointHoverRadius: 7,
        pointBackgroundColor: (ctx) => (forecast[ctx.dataIndex] ? '#ffffff' : area.color),
        pointBorderColor: area.color,
        pointBorderWidth: 2,
        segment: { borderDash: dashForecastSegment },
        datalabels: { display: false },
    }));

    const placedIndex = datasets.length;
    datasets.push({
        label: placed.label,
        data: placed.data,
        stack: 'places',
        borderColor: PLACEMENT_COLOR,
        backgroundColor: PLACEMENT_COLOR,
        borderWidth: 2,
        fill: false,
        tension: 0.25,
        spanGaps: false,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: PLACEMENT_COLOR,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        datalabels: {
            anchor: 'center',
            // Angles datalabels : 90 = sous le point, 45 = bas-droite, 135 = bas-gauche.
            // Les points aux extrémités décalent leur étiquette vers l'intérieur pour
            // ne pas déborder sur les graduations.
            align: (ctx) => {
                if (ctx.dataIndex === 0) return 45;
                if (ctx.dataIndex === years.length - 1) return 135;
                return 90;
            },
            offset: 8,
            clamp: true,
            color: '#0C3455',
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            borderRadius: 4,
            padding: { top: 3, bottom: 3, left: 6, right: 6 },
            font: { size: 14, weight: '600' },
            display: (ctx) => rates[ctx.dataIndex] != null,
            formatter: (_v, ctx) => formatRate(rates[ctx.dataIndex]),
        },
    });

    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        plugins: [ChartDataLabels, forecastBandPlugin],
        data: { labels: years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 8, right: 8 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15, usePointStyle: true, color: '#2c3e50', font: { size: 16 } },
                },
                tooltip: {
                    ...TOOLTIP_BASE,
                    callbacks: {
                        title: (items) => {
                            const i = items[0].dataIndex;
                            return forecast[i] ? `${years[i]} (prévisionnel)` : String(years[i]);
                        },
                        label: (c) => {
                            const v = c.parsed.y;
                            if (v == null) return null;
                            if (c.datasetIndex === placedIndex) {
                                const rate = rates[c.dataIndex];
                                return `${c.dataset.label} : ${v}${rate != null ? ` — ${formatRate(rate)}` : ''}`;
                            }
                            return `${c.dataset.label} : ${v} finissant${v > 1 ? 's' : ''}`;
                        },
                        // Le total n'a d'intérêt que si plusieurs programmes s'empilent.
                        footer: (items) => {
                            if (areas.length < 2) return '';
                            const i = items[0].dataIndex;
                            let total = 0;
                            for (const area of areas) {
                                if (area.data[i] == null) return '';
                                total += area.data[i];
                            }
                            return `Total : ${total} finissant${total > 1 ? 's' : ''}`;
                        },
                    },
                },
                forecastBand: { forecast, label: 'Prévisionnel' },
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: "Nombre d'étudiants" },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: { color: '#7f8c8d', precision: 0, font: { size: 16 } },
                },
                x: {
                    title: { display: true, text: 'Année' },
                    grid: { display: false },
                    ticks: { color: '#7f8c8d', font: { size: 16 } },
                },
            },
            animation: ANIMATION,
        },
    });
}

const forecastTagPlugin = {
    id: 'forecastTag',
    afterDraw(chart, _args, opts) {
        if (!opts || !opts.display) return;
        const { chartArea, ctx } = chart;
        ctx.save();
        ctx.font = '600 13px Geist, system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#7f8c8d';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(opts.label || 'Prévisionnel', chartArea.right, chartArea.top);
        ctx.restore();
    },
};

// Repère de la taille de la cohorte : encre sobre, pour que les aires de placement
// gardent les couleurs de programme.
const COHORT_LINE_COLOR = '#0C3455';

// Progression du placement d'une cohorte au fil de la saison : les stages obtenus
// s'empilent par programme, mois après mois, sous le trait des finissants à
// atteindre. `totals` porte le cumul tous programmes confondus (null = mois pas
// encore connu), `undetermined` signale une cohorte sans détail mensuel.
export function createPlacementProgressChart(canvasId, {
    months, areas, totals, finissants, finissantsLabel, undetermined, forecast,
}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !finissants || !months.length) return null;
    canvas.parentElement.style.height = '420px';

    const lastKnown = totals.reduce((acc, v, i) => (v != null ? i : acc), -1);
    const rateAt = (i) => (totals[i] != null && finissants ? (totals[i] / finissants) * 100 : null);
    const showLabel = (i) => totals[i] != null && (!undetermined || i === lastKnown);
    // Sans détail mensuel, tout ce qui précède le total de mars est une droite
    // tracée entre zéro et ce total : à ne pas donner à lire comme une mesure.
    const interpolated = (i) => undetermined && i !== lastKnown;

    const datasets = areas.map((area, idx) => ({
        label: area.label,
        data: area.cumul,
        stack: 'placement',
        borderColor: area.color,
        backgroundColor: withAlpha(area.color, 0.18),
        borderWidth: 2,
        borderDash: undetermined ? [6, 5] : undefined,
        fill: idx === 0 ? 'origin' : '-1',
        cubicInterpolationMode: 'monotone',
        spanGaps: false,
        pointRadius: (ctx) => (undetermined && ctx.dataIndex !== lastKnown ? 0 : 4),
        pointHoverRadius: 7,
        pointBackgroundColor: area.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        // Seule l'aire du dessus porte des étiquettes : ses points sont posés au
        // sommet de la pile, donc sur le cumul tous programmes confondus.
        datalabels: idx === areas.length - 1 ? {
            // Angles datalabels : 270 = au-dessus du point, 315 = haut-droite,
            // 225 = haut-gauche. Les points des extrémités rentrent vers
            // l'intérieur pour ne pas déborder du cadre.
            align: (ctx) => {
                if (ctx.dataIndex === 0) return 315;
                if (ctx.dataIndex === months.length - 1) return 225;
                return 270;
            },
            offset: 6,
            clamp: true,
            color: COHORT_LINE_COLOR,
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            borderRadius: 4,
            padding: { top: 3, bottom: 3, left: 6, right: 6 },
            font: { size: 14, weight: '600' },
            display: (ctx) => (showLabel(ctx.dataIndex) ? 'auto' : false),
            formatter: (_v, ctx) => {
                const i = ctx.dataIndex;
                if (!showLabel(i)) return null;
                const rate = rateAt(i);
                return i === lastKnown && rate != null ? `${totals[i]} — ${formatRate(rate)}` : String(totals[i]);
            },
        } : { display: false },
    }));

    const cohortIndex = datasets.length;
    datasets.push({
        label: finissantsLabel,
        data: months.map(() => finissants),
        stack: 'cohorte',
        borderColor: COHORT_LINE_COLOR,
        backgroundColor: COHORT_LINE_COLOR,
        borderWidth: 2,
        borderDash: forecast ? [6, 5] : [2, 4],
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        datalabels: { display: false },
    });

    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        plugins: [ChartDataLabels, forecastTagPlugin],
        data: { labels: months, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 24, right: 16 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15, usePointStyle: true, color: '#2c3e50', font: { size: 16 } },
                },
                forecastTag: { display: !!forecast, label: 'Prévisionnel' },
                tooltip: {
                    ...TOOLTIP_BASE,
                    // Le trait des finissants est un repère : il n'a rien à dire de plus
                    // que le pied d'infobulle, qui rappelle déjà la taille de la cohorte.
                    // Sur une cohorte sans détail mensuel, les mois intermédiaires sont
                    // interpolés : une seule ligne, qui le dit, au lieu de faux chiffres.
                    filter: (item) => {
                        if (item.datasetIndex === cohortIndex) return false;
                        if (interpolated(item.dataIndex)) return item.datasetIndex === 0;
                        return true;
                    },
                    callbacks: {
                        label: (c) => {
                            if (interpolated(c.dataIndex)) return 'Détail par mois non disponible';
                            const cumul = c.parsed.y;
                            if (cumul == null) return null;
                            const area = areas[c.datasetIndex];
                            const mois = area && area.mensuel ? area.mensuel[c.dataIndex] : null;
                            const suffix = mois ? ` (+${mois} ce mois)` : '';
                            return `${c.dataset.label} : ${cumul} placé${cumul > 1 ? 's' : ''}${suffix}`;
                        },
                        // Sur un mois encore vide, seul le trait des finissants est
                        // survolé : le filtre ne laisse alors aucune ligne.
                        footer: (items) => {
                            if (items.length === 0) return '';
                            const i = items[0].dataIndex;
                            if (totals[i] == null || interpolated(i)) return '';
                            const rate = rateAt(i);
                            return `Total : ${totals[i]} sur ${finissants} finissants${rate != null ? ` — ${formatRate(rate)}` : ''}`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    suggestedMax: Math.ceil(finissants * 1.08),
                    title: { display: true, text: 'Stages obtenus (cumulatif)' },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: { color: '#7f8c8d', precision: 0, font: { size: 16 } },
                },
                x: {
                    title: { display: true, text: 'Mois' },
                    grid: { display: false },
                    ticks: { color: '#7f8c8d', font: { size: 16 } },
                },
            },
            animation: ANIMATION,
        },
    });
}

// Cohortes passées, de la plus ancienne (pâle) à la plus récente (foncée) ; la
// cohorte en cours garde l'orange du placement, en trait épais.
const PACE_PAST_COLORS = ['#c9d3da', '#a9b7c2', '#8699a9', '#5f7788', '#3c5668'];

// Rythme de placement comparé : une courbe par cohorte, en part de la cohorte
// placée. C'est la normalisation par l'effectif qui rend les années comparables ;
// le pied d'infobulle chiffre l'avance ou le retard sur l'année précédente.
export function createPlacementPaceChart(canvasId, { months, series }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || series.length === 0 || !months.length) return null;
    canvas.parentElement.style.height = '440px';

    const currentIndex = series.length - 1;
    const pastCount = currentIndex;
    const colorOf = (i) => (i === currentIndex
        ? PLACEMENT_COLOR
        : PACE_PAST_COLORS[Math.max(0, PACE_PAST_COLORS.length - pastCount + i)]);

    const datasets = series.map((s, i) => {
        const current = i === currentIndex;
        const color = colorOf(i);
        return {
            label: `H${s.year}`,
            data: s.pct,
            borderColor: color,
            backgroundColor: current ? withAlpha(color, 0.12) : color,
            borderWidth: current ? 3 : (s.interpolated ? 1.5 : 2),
            borderDash: s.interpolated ? [4, 4] : undefined,
            fill: current ? 'origin' : false,
            cubicInterpolationMode: 'monotone',
            spanGaps: false,
            pointRadius: (ctx) => {
                if (s.interpolated) return ctx.dataIndex === s.lastKnownIndex ? 3 : 0;
                return current ? 4 : 3;
            },
            pointHoverRadius: 7,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: current ? 2 : 1,
            datalabels: current ? {
                align: (ctx) => (ctx.dataIndex === months.length - 1 ? 225 : 270),
                offset: 6,
                clamp: true,
                color: '#0C3455',
                backgroundColor: 'rgba(255, 255, 255, 0.88)',
                borderRadius: 4,
                padding: { top: 3, bottom: 3, left: 6, right: 6 },
                font: { size: 14, weight: '600' },
                // Une seule étiquette, au bout de la cohorte en cours : les autres
                // courbes se lisent à l'infobulle, sinon le graphique se noie.
                display: (ctx) => ctx.dataIndex === s.lastKnownIndex,
                formatter: (v) => formatRate(v),
            } : { display: false },
        };
    });

    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        plugins: [ChartDataLabels],
        data: { labels: months, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 24, right: 16 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15, usePointStyle: true, color: '#2c3e50', font: { size: 16 } },
                },
                tooltip: {
                    ...TOOLTIP_BASE,
                    // Une cohorte sans détail mensuel n'a de chiffre réel qu'en mars :
                    // ailleurs sa courbe est une interpolation, qu'on ne détaille pas.
                    filter: (item) => {
                        const s = series[item.datasetIndex];
                        return !s.interpolated || item.dataIndex === s.lastKnownIndex;
                    },
                    callbacks: {
                        label: (c) => {
                            const s = series[c.datasetIndex];
                            const pct = c.parsed.y;
                            if (pct == null) return null;
                            return `${c.dataset.label} : ${formatRate(pct)} (${s.cumul[c.dataIndex]} sur ${s.finissants})`;
                        },
                        footer: (items) => {
                            if (items.length === 0 || series.length < 2) return '';
                            const i = items[0].dataIndex;
                            const courante = series[currentIndex];
                            const precedente = series[currentIndex - 1];
                            if (courante.pct[i] == null || precedente.pct[i] == null) return '';
                            const ecart = courante.pct[i] - precedente.pct[i];
                            if (Math.abs(ecart) < 0.05) return `H${courante.year} : au même point que H${precedente.year}`;
                            const pts = Math.abs(ecart).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                            const sens = ecart > 0 ? "d'avance" : 'de retard';
                            return `H${courante.year} : ${pts} pts ${sens} sur H${precedente.year}`;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Part de la cohorte placée' },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    ticks: {
                        color: '#7f8c8d',
                        font: { size: 16 },
                        callback: (v) => `${v} %`,
                    },
                },
                x: {
                    title: { display: true, text: 'Mois' },
                    grid: { display: false },
                    ticks: { color: '#7f8c8d', font: { size: 16 } },
                },
            },
            animation: ANIMATION,
        },
    });
}
