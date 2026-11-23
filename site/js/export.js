import { PLACEMENT_MONTHS, PROGRAM_ALL } from './constants.js';
import { cohortPaceSeries, cohortPrograms, cohortYearProgress, crossYearDataFor, getData, getRepondants, programLabel } from './state-queries.js';
import { triggerDownload } from './utils.js';

export function handleExport(state, action, qid) {
    if (!state.schema.questions[qid]) return;
    const { filename, sheetName, headers, rows } = buildExportData(state, qid);
    if (action === 'csv') {
        downloadCSV(`${filename}.csv`, headers, rows);
    } else if (action === 'xlsx') {
        downloadXLSX(`${filename}.xlsx`, sheetName, headers, rows);
    }
}

function buildExportData(state, qid) {
    const q = state.schema.questions[qid];
    const sheetName = (q && q.label) || qid;
    const programSuffix = state.currentProgram === PROGRAM_ALL ? '' : `-${state.currentProgram}`;

    if (q && q.scope === 'cross-year') {
        if (q.chartType === 'cohortes-rythme') {
            return buildCohortPaceExport(state, qid, sheetName, programSuffix);
        }
        return state.currentView === 'year'
            ? buildCohortYearExport(state, qid, sheetName, programSuffix)
            : buildCohortExport(state, qid, sheetName, programSuffix);
    }

    if (state.currentView === 'year') {
        return buildRawYearExport(state, qid, sheetName, programSuffix);
    }

    if (q && q.chartType === 'average') {
        return buildAverageExport(state, qid, q, sheetName, programSuffix);
    }

    return buildMultiChoiceCompareExport(state, qid, sheetName, programSuffix);
}

// Le rythme comparé s'exporte en tableau : une ligne par mois, deux colonnes par
// cohorte. Les mois interpolés restent vides : l'export ne porte que du mesuré.
function buildCohortPaceExport(state, qid, sheetName, programSuffix) {
    const filename = `${qid}${programSuffix}`;
    const empty = { filename, sheetName, headers: [], rows: [] };
    const cohorts = crossYearDataFor(state, qid);
    if (!cohorts) return empty;
    const series = cohortPaceSeries(state, cohorts);
    if (series.length === 0) return empty;

    const mesure = (s, i) => (s.interpolated && i !== s.lastKnownIndex ? null : i);
    const headers = ['Mois'];
    for (const s of series) headers.push(`H${s.year} — placés`, `H${s.year} (%)`);
    const rows = PLACEMENT_MONTHS.map((m, i) => {
        const row = [m.label];
        for (const s of series) {
            const k = mesure(s, i);
            row.push(k == null ? null : s.cumul[k], k == null ? null : s.pct[k]);
        }
        return row;
    });
    return { filename, sheetName, headers, rows };
}

// En vue année, l'export suit le graphique : une ligne par mois de la saison, avec
// les stages obtenus du mois, le cumul et le taux atteint. Une cohorte sans détail
// mensuel n'a qu'une ligne, « Mois inconnu », plutôt que des zéros inventés.
function buildCohortYearExport(state, qid, sheetName, programSuffix) {
    const year = state.currentYear;
    const filename = `${qid}-${year}${programSuffix}`;
    const empty = { filename, sheetName, headers: [], rows: [] };
    const cohorts = state.crossYearData[qid];
    if (!cohorts) return empty;
    const progress = cohortYearProgress(state, cohorts, year);
    if (!progress) return empty;

    const detailed = progress.series.length > 1;
    const headers = ['Mois'];
    if (detailed) {
        for (const s of progress.series) headers.push(`Stages obtenus — ${programLabel(state, s.program)}`);
    }
    headers.push('Stages obtenus', 'Cumulatif', 'Finissants', 'Taux de placement (%)');

    const rateOf = (cumul) => (progress.finissants
        ? +((cumul / progress.finissants) * 100).toFixed(1)
        : null);

    const rows = [];
    if (progress.undetermined) {
        const i = progress.lastKnownIndex;
        const row = ['Mois inconnu'];
        if (detailed) for (const s of progress.series) row.push(s.cumul[i]);
        const cumul = progress.totals[i];
        row.push(cumul, cumul, progress.finissants, rateOf(cumul));
        rows.push(row);
    } else {
        PLACEMENT_MONTHS.forEach((m, i) => {
            if (progress.totals[i] == null) return;
            const row = [m.label];
            if (detailed) for (const s of progress.series) row.push(s.mensuel[i]);
            const duMois = progress.series.reduce((acc, s) => acc + (s.mensuel[i] || 0), 0);
            row.push(duMois, progress.totals[i], progress.finissants, rateOf(progress.totals[i]));
            rows.push(row);
        });
    }
    if (rows.length === 0) return empty;

    return { filename, sheetName, headers, rows };
}

// En vue comparative : une ligne par année, finissants et placement final.
function buildCohortExport(state, qid, sheetName, programSuffix) {
    const cohorts = state.crossYearData[qid];
    const empty = { filename: `${qid}${programSuffix}`, sheetName, headers: [], rows: [] };
    if (!cohorts) return empty;

    const selected = cohortPrograms(state, cohorts);
    if (selected.length === 0) return empty;

    const years = cohorts.years;
    if (years.length === 0) return empty;

    const detailed = selected.length > 1;
    const headers = ['Année'];
    if (detailed) {
        for (const p of selected) {
            const label = programLabel(state, p);
            headers.push(`Finissants — ${label}`, `Placés — ${label}`);
        }
    }
    headers.push('Finissants', 'Étudiants placés en stage', 'Taux de placement (%)', 'Prévisionnel');

    const rows = years.map((year) => {
        const i = cohorts.years.indexOf(year);
        const row = [year];
        let finissants = 0;
        let places = 0;
        let placesKnown = true;
        for (const p of selected) {
            const f = cohorts.byProgram[p].finissants[i];
            const pl = cohorts.byProgram[p].places[i];
            if (detailed) row.push(f, pl);
            finissants += f || 0;
            if (pl == null) placesKnown = false;
            else places += pl;
        }
        const rate = placesKnown && finissants ? +((places / finissants) * 100).toFixed(1) : null;
        row.push(finissants, placesKnown ? places : null, rate, cohorts.forecast[i] ? 'oui' : '');
        return row;
    });

    return { filename: `${qid}${programSuffix}`, sheetName, headers, rows };
}

function buildMultiChoiceCompareExport(state, qid, sheetName, programSuffix) {
    const valueTotals = new Map();
    for (const year of state.years) {
        const items = getData(state, year, qid);
        const rep = getRepondants(state, year);
        if (!items || !rep) continue;
        for (const item of items) {
            const pct = (item.count / rep) * 100;
            valueTotals.set(item.value, (valueTotals.get(item.value) || 0) + pct);
        }
    }
    const allValues = Array.from(valueTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([v]) => v);
    const headers = ['Valeur', ...state.years.map((y) => `${y} (%)`)];
    const rows = allValues.map((value) => {
        const row = [value];
        for (const year of state.years) {
            const items = getData(state, year, qid);
            const rep = getRepondants(state, year);
            if (!items || !rep) { row.push(null); continue; }
            const found = items.find((i) => i.value === value);
            row.push(found ? +((found.count / rep) * 100).toFixed(1) : null);
        }
        return row;
    });
    return { filename: `${qid}-comparaison${programSuffix}`, sheetName, headers, rows };
}

function buildAverageExport(state, qid, q, sheetName, programSuffix) {
    const decimals = q.decimals != null ? q.decimals : 2;
    const unit = q.unit || '';
    const meanHeader = unit ? `Moyenne (${unit})` : 'Moyenne';

    const headers = ['Année', meanHeader, 'Nombre de réponses'];
    const rows = state.years.map((year) => {
        const d = getData(state, year, qid);
        return d && d.mean != null
            ? [year, +d.mean.toFixed(decimals), d.count]
            : [year, null, 0];
    });
    return { filename: `${qid}-comparaison${programSuffix}`, sheetName, headers, rows };
}

function buildRawYearExport(state, qid, sheetName, programSuffix) {
    const year = state.currentYear;
    const raw = (state.rawRows[year] && state.rawRows[year][qid]) || [];
    const hasPrograms = !!state.manifests[year].programs;
    const rows = hasPrograms && state.currentProgram !== PROGRAM_ALL
        ? raw.filter((r) => String(r[0] || '').trim().toLowerCase() === state.currentProgram)
        : raw;
    return { filename: `${qid}-${year}${programSuffix}`, sheetName, headers: [], rows };
}

function downloadCSV(filename, headers, rows) {
    const escapeCell = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    if (headers && headers.length) lines.push(headers.map(escapeCell).join(','));
    for (const row of rows) lines.push(row.map(escapeCell).join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
}

function downloadXLSX(filename, sheetName, headers, rows) {
    if (typeof XLSX === 'undefined') {
        console.error('Bibliothèque XLSX non disponible.');
        alert("Impossible de générer le fichier Excel : la bibliothèque n'est pas chargée.");
        return;
    }
    const safeName = String(sheetName || 'Données').replace(/[\\/?*:\[\]]/g, '').slice(0, 31) || 'Données';
    const sheetData = headers && headers.length ? [headers, ...rows] : rows;
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, safeName);
    XLSX.writeFile(wb, filename);
}
