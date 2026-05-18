import { PROGRAM_ALL } from './constants.js';
import { getData, getRepondants } from './state-queries.js';
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

    if (state.currentView === 'year') {
        return buildRawYearExport(state, qid, sheetName, programSuffix);
    }

    if (q && q.chartType === 'average') {
        return buildAverageExport(state, qid, q, sheetName, programSuffix);
    }

    return buildMultiChoiceCompareExport(state, qid, sheetName, programSuffix);
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
