import { fetchJSON } from './utils.js';
import { aggregateAverage, aggregateMultiChoice, aggregateSankey } from './aggregator.js';

export async function loadSchema() {
    const [questions, aliases, colors, programs] = await Promise.all([
        fetchJSON('static/data/schema/questions.json'),
        fetchJSON('static/data/schema/aliases.json'),
        fetchJSON('static/data/schema/colors.json'),
        fetchJSON('static/data/schema/programs.json').catch(() => ({})),
    ]);
    const aliasLookup = new Map();
    for (const [canonical, aliasList] of Object.entries(aliases)) {
        aliasLookup.set(canonical.toLowerCase(), canonical);
        for (const alias of aliasList) {
            aliasLookup.set(alias.toLowerCase(), canonical);
        }
    }
    return {
        schema: { questions, aliases, colors },
        programs,
        aliasLookup,
    };
}

export async function loadYears() {
    const years = await fetchJSON('static/data/years.json');
    years.sort();
    return years;
}

export async function loadManifests(years) {
    const manifests = {};
    await Promise.all(years.map(async (year) => {
        const m = await fetchJSON(`static/data/${year}/manifest.json`);
        if (typeof m.repondants === 'number') {
            m.repondants = { total: m.repondants };
        }
        if (!Array.isArray(m.programs)) m.programs = undefined;
        manifests[year] = m;
    }));
    return manifests;
}

export async function loadAllData({ years, manifests, schema, aliasLookup }) {
    const data = {};
    const rawRows = {};
    for (const year of years) {
        data[year] = {};
        rawRows[year] = {};
        for (const qid of manifests[year].questions) {
            try {
                data[year][qid] = await loadQuestionCSV({
                    year,
                    questionId: qid,
                    manifest: manifests[year],
                    schema,
                    aliasLookup,
                    rawRows,
                });
            } catch (e) {
                console.warn(`Impossible de charger ${year}/${qid}.csv : ${e.message}`);
                data[year][qid] = { total: [] };
            }
        }
    }
    return { data, rawRows };
}

async function loadQuestionCSV({ year, questionId, manifest, schema, aliasLookup, rawRows }) {
    const programs = manifest.programs;
    const q = (schema && schema.questions[questionId]) || {};
    const chartType = q.chartType;
    const response = await fetch(`static/data/${year}/${questionId}.csv`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
                rawRows[year][questionId] = results.data;
                if (chartType === 'average') {
                    resolve(aggregateAverage(results.data, programs, year, questionId));
                } else if (chartType === 'sankey') {
                    resolve(aggregateSankey(results.data, programs, aliasLookup));
                } else {
                    resolve(aggregateMultiChoice(results.data, programs, aliasLookup));
                }
            },
            error: reject,
        });
    });
}
