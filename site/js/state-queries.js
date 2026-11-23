import { DEFAULT_COLOR, PROGRAM_ALL } from './constants.js';

export function manifestSections(manifest) {
    if (!manifest) return [];
    if (Array.isArray(manifest.sections)) return manifest.sections;
    if (Array.isArray(manifest.questions)) {
        return [{ title: null, questions: manifest.questions }];
    }
    return [];
}

export function manifestQuestionIds(manifest) {
    const ids = [];
    for (const section of manifestSections(manifest)) {
        for (const qid of section.questions) ids.push(qid);
    }
    return ids;
}

export function mergedSections(state) {
    const sections = [];
    const indexByTitle = new Map();
    const sortedYears = state.years.slice().sort();
    for (let i = sortedYears.length - 1; i >= 0; i--) {
        const manifest = state.manifests[sortedYears[i]];
        for (const section of manifestSections(manifest)) {
            const key = section.title || '';
            let entry = indexByTitle.get(key);
            if (!entry) {
                entry = { title: section.title, questions: [], seen: new Set() };
                indexByTitle.set(key, entry);
                sections.push(entry);
            }
            for (const qid of section.questions) {
                if (!entry.seen.has(qid)) {
                    entry.seen.add(qid);
                    entry.questions.push(qid);
                }
            }
        }
    }
    return sections.map((s) => ({ title: s.title, questions: s.questions }));
}

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
    if (!manifest || !manifestQuestionIds(manifest).includes(qid)) return false;
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
    for (const qid of manifestQuestionIds(manifest)) {
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
        for (const qid of manifestQuestionIds(state.manifests[year])) {
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

export function crossYearQuestions(state) {
    return Object.entries(state.schema.questions)
        .filter(([, q]) => q.scope === 'cross-year')
        .map(([qid, q]) => ({ qid, q }));
}

// Les programmes retenus par le filtre courant, dans l'ordre d'empilement du fichier.
export function cohortPrograms(state, cohorts) {
    if (state.currentProgram === PROGRAM_ALL) return cohorts.programs;
    return cohorts.byProgram[state.currentProgram] ? [state.currentProgram] : [];
}

// Additionne les programmes retenus pour une année. `places` (et donc `rate`) vaut
// null dès qu'un programme n'a pas encore sa donnée de placement.
export function cohortTotalsAt(cohorts, programs, index) {
    if (programs.length === 0 || index < 0 || index >= cohorts.years.length) return null;
    let finissants = 0;
    let places = 0;
    let placesKnown = true;
    for (const p of programs) {
        const f = cohorts.byProgram[p].finissants[index];
        const pl = cohorts.byProgram[p].places[index];
        if (f == null) return null;
        finissants += f;
        if (pl == null) placesKnown = false;
        else places += pl;
    }
    return {
        finissants,
        places: placesKnown ? places : null,
        rate: placesKnown && finissants ? (places / finissants) * 100 : null,
        forecast: cohorts.forecast[index],
    };
}

export function cohortYearTotals(state, cohorts, year) {
    return cohortTotalsAt(cohorts, cohortPrograms(state, cohorts), cohorts.years.indexOf(String(year)));
}

// Progression cumulative du placement d'une cohorte, mois par mois, pour les
// programmes retenus. Un mois ne compte que si tous les programmes retenus l'ont
// renseigné : le cumul s'arrête au premier mois manquant, car on ne peut pas
// cumuler par-dessus un trou.
export function cohortProgressAt(cohorts, programs, index) {
    if (programs.length === 0 || index < 0 || index >= cohorts.years.length) return null;

    const cells = [];
    let finissants = 0;
    for (const p of programs) {
        const source = cohorts.byProgram[p];
        const f = source.finissants[index];
        if (f == null) return null;
        finissants += f;
        cells.push({
            program: p,
            mensuel: source.mensuel[index] || [],
            moisInconnu: source.moisInconnu[index],
            complet: source.complet[index],
        });
    }

    const monthCount = cells[0].mensuel.length;
    const series = cells.map((c) => ({
        program: c.program,
        mensuel: new Array(monthCount).fill(null),
        cumul: new Array(monthCount).fill(null),
    }));
    // Les cohortes d'avant le suivi mensuel n'ont qu'un total : on relie zéro à ce
    // total par une droite, de l'été à mars, plutôt que de laisser un mur en fin de
    // saison. Seul le point d'arrivée est une mesure ; le graphique trace ces
    // cohortes en pointillés, n'étiquette que mars et le dit dans sa note.
    const undetermined = cells.some((c) => c.moisInconnu != null);
    let lastKnownIndex = -1;

    if (undetermined) {
        lastKnownIndex = monthCount - 1;
        cells.forEach((c, k) => {
            const total = c.mensuel.reduce((acc, v) => acc + (v || 0), 0) + (c.moisInconnu || 0);
            for (let m = 0; m < monthCount; m++) {
                series[k].cumul[m] = Math.round((total * m) / lastKnownIndex);
            }
        });
    } else {
        const running = cells.map(() => 0);
        for (let m = 0; m < monthCount; m++) {
            if (cells.some((c) => c.mensuel[m] == null)) break;
            cells.forEach((c, k) => {
                running[k] += c.mensuel[m];
                series[k].mensuel[m] = c.mensuel[m];
                series[k].cumul[m] = running[k];
            });
            lastKnownIndex = m;
        }
    }

    const totals = new Array(monthCount).fill(null);
    for (let m = 0; m <= lastKnownIndex; m++) {
        totals[m] = series.reduce((acc, s) => acc + s.cumul[m], 0);
    }

    const places = lastKnownIndex >= 0 ? totals[lastKnownIndex] : null;
    return {
        finissants,
        series,
        totals,
        places,
        rate: places != null && finissants ? (places / finissants) * 100 : null,
        lastKnownIndex,
        complete: cells.every((c) => c.complet),
        undetermined,
        forecast: cohorts.forecast[index],
    };
}

export function cohortYearProgress(state, cohorts, year) {
    return cohortProgressAt(cohorts, cohortPrograms(state, cohorts), cohorts.years.indexOf(String(year)));
}

// Les données d'une question transversale, qu'elle ait son fichier ou qu'elle
// relise celui d'une autre (« derivedFrom »).
export function crossYearDataFor(state, qid) {
    const q = state.schema.questions[qid];
    const source = (q && q.derivedFrom) || qid;
    return state.crossYearData[source] || null;
}

// Une courbe par cohorte, en part de la cohorte placée à la fin de chaque mois :
// c'est ce qui rend les années comparables malgré leurs effectifs différents.
export function cohortPaceSeries(state, cohorts) {
    const programs = cohortPrograms(state, cohorts);
    if (programs.length === 0) return [];
    const series = [];
    cohorts.years.forEach((year, i) => {
        const p = cohortProgressAt(cohorts, programs, i);
        if (!p || p.lastKnownIndex < 0 || !p.finissants) return;
        series.push({
            year,
            finissants: p.finissants,
            cumul: p.totals,
            pct: p.totals.map((v) => (v == null ? null : +((v / p.finissants) * 100).toFixed(1))),
            lastKnownIndex: p.lastKnownIndex,
            interpolated: p.undetermined,
            complete: p.complete,
            forecast: p.forecast,
        });
    });
    return series;
}

// Une année n'a de contenu de sondage que si son manifeste déclare des questions ;
// les autres n'existent que par les données transversales.
export function yearHasSurvey(state, year) {
    return manifestQuestionIds(state.manifests[year]).length > 0;
}

// Les années à présenter : celles du sondage plus celles des données transversales.
export function allDisplayYears(state) {
    const years = new Set(state.years.map(String));
    for (const { qid } of crossYearQuestions(state)) {
        const cohorts = state.crossYearData && state.crossYearData[qid];
        if (cohorts) for (const y of cohorts.years) years.add(String(y));
    }
    return Array.from(years).sort();
}

// `year` restreint la recherche à cette année ; sans elle, toute la série compte.
export function hasAnyCrossYearChart(state, year = null) {
    for (const { qid } of crossYearQuestions(state)) {
        const cohorts = state.crossYearData && state.crossYearData[qid];
        if (!cohorts || cohorts.years.length === 0) continue;
        if (year != null) {
            if (cohortYearTotals(state, cohorts, year)) return true;
            continue;
        }
        if (cohortPrograms(state, cohorts).length > 0) return true;
    }
    return false;
}

export function hasAnyCompareChart(state) {
    for (const qid of allCompareQuestions(state)) {
        if (compareYearsForQuestion(state, qid).length >= 2) return true;
    }
    return false;
}

function forProgram(state, program, fn) {
    const prev = state.currentProgram;
    state.currentProgram = program;
    try {
        return fn();
    } finally {
        state.currentProgram = prev;
    }
}

// Les réponses au sondage seules : c'est ce qui rend un filtre intéressant par défaut.
export function hasAnySurveyChartForProgram(state, program) {
    return forProgram(state, program, () => (state.currentView === 'compare'
        ? hasAnyCompareChart(state)
        : hasAnyYearChart(state, state.currentYear)));
}

// Tout ce qui s'affiche, portrait des cohortes compris : c'est ce qui rend un
// filtre cliquable, même quand le sondage n'a pas de données comparables.
export function hasAnyChartForProgram(state, program) {
    return forProgram(state, program, () => (state.currentView === 'compare'
        ? hasAnyCrossYearChart(state) || hasAnyCompareChart(state)
        : hasAnyCrossYearChart(state, state.currentYear) || hasAnyYearChart(state, state.currentYear)));
}

export function ensureValidProgram(state) {
    // Un programme choisi par l'utilisateur (clic ou lien partagé) tient tant qu'il
    // reste quelque chose à montrer ; sinon on retombe sur le meilleur filtre possible.
    if (state.programExplicit && hasAnyChartForProgram(state, state.currentProgram)) return;
    const candidates = [state.currentProgram, PROGRAM_ALL, ...availablePrograms(state)];
    for (const p of candidates) {
        if (hasAnySurveyChartForProgram(state, p)) {
            state.currentProgram = p;
            return;
        }
    }
    for (const p of candidates) {
        if (hasAnyChartForProgram(state, p)) {
            state.currentProgram = p;
            return;
        }
    }
}
