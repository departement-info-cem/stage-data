import { PROGRAM_ALL } from './constants.js';
import { assignColors } from './colors.js';
import {
    createAverageDisplay,
    createBarChart,
    createLineChart,
    createPieChart,
} from './charts.js';
import {
    allCompareQuestions,
    compareYearsForQuestion,
    getData,
    getRepondants,
    programColor,
    programLabel,
} from './state-queries.js';
import { escapeHTML } from './utils.js';

function createWrapper(qid, label) {
    const wrapper = document.createElement('section');
    wrapper.className = 'chart-wrapper';
    wrapper.innerHTML = `
        <header class="chart-header">
            <h2 class="chart-title">${escapeHTML(label)}</h2>
            <div class="chart-actions">
                <button type="button" class="export-btn" data-action="csv" data-qid="${qid}" title="Télécharger en CSV" aria-label="Télécharger les données en CSV">
                    <i data-lucide="file-text" aria-hidden="true"></i>
                </button>
                <button type="button" class="export-btn export-btn--xlsx" data-action="xlsx" data-qid="${qid}" title="Télécharger en Excel (.xlsx)" aria-label="Télécharger les données en Excel">
                    <i data-lucide="file-spreadsheet" aria-hidden="true"></i>
                </button>
            </div>
        </header>
        <div class="chart-container">
            <canvas id="chart-${qid}" role="img" aria-label="${escapeHTML(label)}"></canvas>
        </div>
    `;
    return wrapper;
}

export function renderInfo(state) {
    const info = document.getElementById('general-info');
    const filterLabel = programLabel(state, state.currentProgram);
    const filterChip = state.currentProgram === PROGRAM_ALL
        ? ''
        : ` &nbsp;·&nbsp; <strong>Programme :</strong> ${escapeHTML(filterLabel)}`;

    if (state.currentView === 'compare') {
        const lines = state.years.map((y) => {
            const m = state.manifests[y];
            const periode = m.periode ? ` — ${escapeHTML(m.periode)}` : '';
            const rep = getRepondants(state, y);
            const repTxt = rep == null
                ? '<em>donnée non disponible</em>'
                : `${rep} répondants`;
            return `<li><strong>${y}</strong>${periode} : ${repTxt}</li>`;
        }).join('');
        info.innerHTML = `<p>Vue comparative${filterChip}</p><ul>${lines}</ul>`;
        return;
    }

    const m = state.manifests[state.currentYear];
    const periode = m.periode ? ` &nbsp;·&nbsp; <strong>Période :</strong> ${escapeHTML(m.periode)}` : '';
    const rep = getRepondants(state, state.currentYear);
    if (rep == null) {
        info.innerHTML = `<p><strong>Filtre :</strong> ${escapeHTML(filterLabel)} — <em>données non disponibles pour ${state.currentYear}</em>${periode}</p>`;
    } else {
        info.innerHTML = `<p><strong>Répondants :</strong> ${rep}${periode}${filterChip}</p>`;
    }
}

export function renderYearView(state, charts) {
    renderInfo(state);
    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';

    const year = state.currentYear;
    const manifest = state.manifests[year];
    const repondants = getRepondants(state, year);
    const schemaColors = state.schema.colors;

    for (const qid of manifest.questions) {
        const q = state.schema.questions[qid];
        if (!q) {
            console.warn(`Question inconnue dans le schéma : ${qid}`);
            continue;
        }
        const data = getData(state, year, qid);

        if (q.chartType === 'average') {
            if (!data || data.mean == null) continue;
            container.appendChild(createWrapper(qid, q.label));
            createAverageDisplay(`chart-${qid}`, data, q);
            continue;
        }

        if (!data || data.length === 0 || repondants == null) continue;

        container.appendChild(createWrapper(qid, q.label));
        const canvasId = `chart-${qid}`;
        const chart = q.chartType === 'pie'
            ? createPieChart(canvasId, data, repondants, schemaColors)
            : createBarChart(canvasId, data, repondants, schemaColors);
        if (chart) charts.set(canvasId, chart);
    }
}

export function renderCompareView(state, charts) {
    renderInfo(state);
    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';

    const schemaColors = state.schema.colors;

    for (const qid of allCompareQuestions(state)) {
        const q = state.schema.questions[qid];
        if (!q) continue;

        const years = compareYearsForQuestion(state, qid);
        if (years.length < 2) continue;

        if (q.chartType === 'average') {
            container.appendChild(createWrapper(qid, q.label));
            renderCompareAverage(state, qid, q, years, charts);
            continue;
        }

        const datasets = buildCompareMultiChoiceDatasets(state, qid, years, schemaColors);
        if (datasets == null) continue;

        container.appendChild(createWrapper(qid, q.label));
        const canvasId = `chart-${qid}`;
        const chart = createLineChart(canvasId, years, datasets);
        if (chart) charts.set(canvasId, chart);
    }
}

function buildCompareMultiChoiceDatasets(state, qid, years, schemaColors) {
    const valueTotals = new Map();
    for (const year of years) {
        const items = getData(state, year, qid);
        const rep = getRepondants(state, year);
        if (!items || !rep) continue;
        for (const item of items) {
            const pct = (item.count / rep) * 100;
            valueTotals.set(item.value, (valueTotals.get(item.value) || 0) + pct);
        }
    }
    const topValues = Array.from(valueTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([v]) => v);

    if (topValues.length === 0) return null;

    const assignedColors = assignColors(topValues, schemaColors);
    return topValues.map((value, idx) => {
        const color = assignedColors[idx];
        const data = years.map((year) => {
            const items = getData(state, year, qid);
            const rep = getRepondants(state, year);
            if (!items || !rep) return null;
            const found = items.find((i) => i.value === value);
            return found ? +((found.count / rep) * 100).toFixed(1) : 0;
        });
        return {
            label: value,
            data,
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: color,
            tension: 0.25,
            fill: false,
            spanGaps: false,
        };
    });
}

function renderCompareAverage(state, qid, q, years, charts) {
    const decimals = q.decimals != null ? q.decimals : 2;
    const unit = q.unit || '';
    const color = programColor(state, state.currentProgram);
    const seriesData = years.map((year) => {
        const d = getData(state, year, qid);
        return d && d.mean != null ? +d.mean.toFixed(decimals) : null;
    });
    const dataset = {
        label: programLabel(state, state.currentProgram),
        data: seriesData,
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        tension: 0.25,
        fill: false,
        spanGaps: false,
    };
    const canvasId = `chart-${qid}`;
    const chart = createLineChart(canvasId, years, [dataset], {
        yLabel: unit ? `Moyenne (${unit})` : 'Moyenne',
        yFormatter: (v) => unit ? `${v} ${unit}` : String(v),
        tooltipFormatter: (c) => `${c.dataset.label} : ${c.parsed.y}${unit ? ' ' + unit : ''}`,
        showLegend: false,
    });
    if (chart) charts.set(canvasId, chart);
}
