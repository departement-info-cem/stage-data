import { DEFAULT_COLOR, PROGRAM_ALL } from './constants.js';

export function getData(state, year, qid) {
    const yearData = state.data[year] && state.data[year][qid];
    if (!yearData) return null;
    if (state.currentProgram === PROGRAM_ALL) return yearData.total;
    return yearData[state.currentProgram] || null;
}

export function getRepondants(state, year) {
    const r = state.manifests[year].repondants || {};
    if (state.currentProgram === PROGRAM_ALL) return r.total;
    return r[state.currentProgram];
}

export function availablePrograms(state) {
    const set = new Set();
    for (const year of state.years) {
        const programs = state.manifests[year].programs;
        if (programs) programs.forEach((p) => set.add(p));
    }
    return Array.from(set);
}

export function programLabel(state, code) {
    if (code === PROGRAM_ALL) return 'Tous les programmes';
    return (state.programs[code] && state.programs[code].label) || code;
}

export function programColor(state, code) {
    if (code === PROGRAM_ALL) return DEFAULT_COLOR;
    return (state.programs[code] && state.programs[code].color) || DEFAULT_COLOR;
}

export function allProgramsUniverse(state) {
    const universe = new Set();
    for (const y of state.years) {
        const m = state.manifests[y];
        if (m && Array.isArray(m.programs)) {
            for (const p of m.programs) universe.add(p);
        }
    }
    return universe;
}

export function yearHasFullProgramData(state, year, qid) {
    if (state.currentProgram !== PROGRAM_ALL) return true;
    const manifest = state.manifests[year];
    if (!manifest || !manifest.questions.includes(qid)) return false;
    const universe = allProgramsUniverse(state);
    if (universe.size === 0) return true;
    const yearData = state.data[year] && state.data[year][qid];
    if (!yearData) return false;
    const q = state.schema.questions[qid];
    if (q && q.chartType === 'average') {
        for (const p of universe) {
            if (!yearData[p] || yearData[p].count === 0) return false;
        }
        return true;
    }
    for (const p of universe) {
        if (!Array.isArray(yearData[p]) || yearData[p].length === 0) return false;
    }
    return true;
}

export function hasAnyYearChart(state, year) {
    const manifest = state.manifests[year];
    if (!manifest) return false;
    const repondants = getRepondants(state, year);
    for (const qid of manifest.questions) {
        const q = state.schema.questions[qid];
        if (!q) continue;
        const data = getData(state, year, qid);
        if (q.chartType === 'average') {
            if (data && data.mean != null) return true;
        } else if (data && data.length > 0 && repondants != null) {
            return true;
        }
    }
    return false;
}

export function allCompareQuestions(state) {
    const seen = new Set();
    const list = [];
    for (const year of state.years) {
        for (const qid of state.manifests[year].questions) {
            if (!seen.has(qid)) { seen.add(qid); list.push(qid); }
        }
    }
    return list;
}

export function compareYearsForQuestion(state, qid) {
    const q = state.schema.questions[qid];
    if (!q) return [];
    if (q.chartType === 'sankey') return [];
    return state.years.filter((y) => {
        if (!yearHasFullProgramData(state, y, qid)) return false;
        const d = getData(state, y, qid);
        if (!d) return false;
        if (q.chartType === 'average') return d.mean != null;
        return Array.isArray(d) && d.length > 0;
    });
}

export function hasAnyCompareChart(state) {
    for (const qid of allCompareQuestions(state)) {
        if (compareYearsForQuestion(state, qid).length >= 2) return true;
    }
    return false;
}

export function hasAnyChartForProgram(state, program) {
    const prev = state.currentProgram;
    state.currentProgram = program;
    try {
        if (state.currentView === 'compare') return hasAnyCompareChart(state);
        return hasAnyYearChart(state, state.currentYear);
    } finally {
        state.currentProgram = prev;
    }
}

export function ensureValidProgram(state) {
    if (hasAnyChartForProgram(state, state.currentProgram)) return;
    const candidates = [PROGRAM_ALL, ...availablePrograms(state)];
    for (const p of candidates) {
        if (hasAnyChartForProgram(state, p)) {
            state.currentProgram = p;
            return;
        }
    }
}
