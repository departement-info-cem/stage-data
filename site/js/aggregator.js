export function normalize(value, aliasLookup) {
    return aliasLookup.get(value.toLowerCase()) || value;
}

export function aggregateMultiChoice(rows, programs, aliasLookup) {
    const totals = new Map();
    const perProgram = {};
    if (programs) for (const p of programs) perProgram[p] = new Map();

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        let answers = row;
        let program = null;
        if (programs) {
            program = String(row[0] || '').trim().toLowerCase();
            answers = row.slice(1);
            if (!perProgram[program]) {
                console.warn(`Programme inconnu "${program}" ligne ${i + 1}`);
                continue;
            }
        }

        for (const item of answers) {
            if (!item || !item.trim()) continue;
            const canonical = normalize(item.trim(), aliasLookup);
            totals.set(canonical, (totals.get(canonical) || 0) + 1);
            if (program) {
                perProgram[program].set(canonical, (perProgram[program].get(canonical) || 0) + 1);
            }
        }
    }

    const toArr = (m) => Array.from(m.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

    const result = { total: toArr(totals) };
    if (programs) for (const p of programs) result[p] = toArr(perProgram[p]);
    return result;
}

export function aggregateSankey(rows, programs, aliasLookup) {
    const total = new Map();
    const perProgram = {};
    if (programs) for (const p of programs) perProgram[p] = new Map();

    const addFlow = (map, fromKey, toKey) => {
        const key = `${fromKey}→${toKey}`;
        const existing = map.get(key);
        if (existing) existing.flow += 1;
        else map.set(key, { from: fromKey, to: toKey, flow: 1 });
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        let answers = row;
        let program = null;
        if (programs) {
            program = String(row[0] || '').trim().toLowerCase();
            answers = row.slice(1);
            if (!perProgram[program]) {
                console.warn(`Programme inconnu "${program}" ligne ${i + 1}`);
                continue;
            }
        }

        const cleaned = answers.map((v) => {
            if (v == null) return null;
            const trimmed = String(v).trim();
            return trimmed ? normalize(trimmed, aliasLookup) : null;
        });

        for (let j = 0; j < cleaned.length - 1; j++) {
            const from = cleaned[j];
            const to = cleaned[j + 1];
            if (!from || !to) continue;
            const fromKey = `c${j}::${from}`;
            const toKey = `c${j + 1}::${to}`;
            addFlow(total, fromKey, toKey);
            if (program) addFlow(perProgram[program], fromKey, toKey);
        }
    }

    const toArr = (m) => Array.from(m.values());
    const result = { total: toArr(total) };
    if (programs) for (const p of programs) result[p] = toArr(perProgram[p]);
    return result;
}

export function aggregateAverage(rows, programs, year, questionId) {
    const stats = { total: { sum: 0, count: 0 } };
    if (programs) for (const p of programs) stats[p] = { sum: 0, count: 0 };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;

        let program = null;
        let valueStr;
        if (programs) {
            program = String(row[0] || '').trim().toLowerCase();
            if (!stats[program]) {
                console.warn(`Programme inconnu "${program}" dans ${year}/${questionId}.csv ligne ${i + 1}`);
                continue;
            }
            valueStr = row[1];
        } else {
            valueStr = row[0];
        }
        if (valueStr == null || !String(valueStr).trim()) continue;

        const num = parseFloat(String(valueStr).replace(',', '.').trim());
        if (Number.isNaN(num)) {
            console.warn(`Valeur non numérique "${valueStr}" dans ${year}/${questionId}.csv ligne ${i + 1}`);
            continue;
        }

        stats.total.sum += num;
        stats.total.count += 1;
        if (program) {
            stats[program].sum += num;
            stats[program].count += 1;
        }
    }

    const result = {};
    for (const key of Object.keys(stats)) {
        const { sum, count } = stats[key];
        result[key] = count > 0 ? { mean: sum / count, count, sum } : null;
    }
    return result;
}

function parseCount(value) {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const num = parseInt(trimmed, 10);
    return Number.isNaN(num) ? null : num;
}

function sumOrNull(values) {
    let sum = 0;
    for (const v of values) {
        if (v == null) return null;
        sum += v;
    }
    return sum;
}

export function aggregateCohorts(rows) {
    const byYear = new Map();
    const programs = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const year = String((row && row.annee) || '').trim();
        const program = String((row && row.programme) || '').trim().toLowerCase();
        if (!year || !program) {
            console.warn(`Ligne ${i + 2} ignorée dans cohortes.csv : année ou programme manquant`);
            continue;
        }
        if (!programs.includes(program)) programs.push(program);

        let entry = byYear.get(year);
        if (!entry) {
            entry = { forecast: false, byProgram: new Map() };
            byYear.set(year, entry);
        }
        if (String(row.previsionnel || '').trim()) entry.forecast = true;
        entry.byProgram.set(program, {
            finissants: parseCount(row.finissants),
            places: parseCount(row.places),
        });
    }

    const years = Array.from(byYear.keys()).sort();
    const result = {
        years,
        programs,
        forecast: years.map((y) => byYear.get(y).forecast),
        byProgram: {},
        total: { finissants: [], places: [] },
    };

    for (const program of programs) {
        result.byProgram[program] = { finissants: [], places: [] };
    }
    for (let i = 0; i < years.length; i++) {
        const entry = byYear.get(years[i]);
        for (const program of programs) {
            const cell = entry.byProgram.get(program) || { finissants: null, places: null };
            result.byProgram[program].finissants.push(cell.finissants);
            result.byProgram[program].places.push(cell.places);
        }
        result.total.finissants.push(sumOrNull(programs.map((p) => result.byProgram[p].finissants[i])));
        result.total.places.push(sumOrNull(programs.map((p) => result.byProgram[p].places[i])));
    }

    return result;
}
