const PROGRAM_ALL = 'all';

class DataVisualizationApp {
    constructor() {
        this.schema = null;
        this.programs = {};
        this.aliasLookup = new Map();
        this.years = [];
        this.manifests = {};
        this.data = {};
        this.rawRows = {};
        this.currentYear = null;
        this.currentView = 'year';
        this.currentProgram = PROGRAM_ALL;
        this.charts = new Map();
        this.init();
    }

    async init() {
        const container = document.getElementById('chartsContainer');
        try {
            await this.loadSchema();
            await this.loadYears();
            await this.loadAllManifests();
            await this.loadAllData();
            this.currentYear = this.years[this.years.length - 1];
            this.ensureValidProgram();
            this.renderSelectors();
            this.setupEventListeners();
            this.render();
        } catch (err) {
            console.error("Erreur d'initialisation :", err);
            container.innerHTML = `<div class="error"><h3>Erreur d'initialisation</h3><p>${err.message}</p></div>`;
        }
    }

    async loadSchema() {
        const [questions, aliases, colors, programs] = await Promise.all([
            this.fetchJSON('static/data/schema/questions.json'),
            this.fetchJSON('static/data/schema/aliases.json'),
            this.fetchJSON('static/data/schema/colors.json'),
            this.fetchJSON('static/data/schema/programs.json').catch(() => ({}))
        ]);
        this.schema = { questions, aliases, colors };
        this.programs = programs;
        for (const [canonical, aliasList] of Object.entries(aliases)) {
            this.aliasLookup.set(canonical.toLowerCase(), canonical);
            for (const alias of aliasList) {
                this.aliasLookup.set(alias.toLowerCase(), canonical);
            }
        }
    }

    async loadYears() {
        this.years = await this.fetchJSON('static/data/years.json');
        this.years.sort();
    }

    async loadAllManifests() {
        await Promise.all(this.years.map(async (year) => {
            const m = await this.fetchJSON(`static/data/${year}/manifest.json`);
            if (typeof m.repondants === 'number') {
                m.repondants = { total: m.repondants };
            }
            if (!Array.isArray(m.programs)) m.programs = undefined;
            this.manifests[year] = m;
        }));
    }

    async loadAllData() {
        for (const year of this.years) {
            this.data[year] = {};
            for (const qid of this.manifests[year].questions) {
                try {
                    this.data[year][qid] = await this.loadQuestionCSV(year, qid);
                } catch (e) {
                    console.warn(`Impossible de charger ${year}/${qid}.csv : ${e.message}`);
                    this.data[year][qid] = { total: [] };
                }
            }
        }
    }

    async fetchJSON(path) {
        const r = await fetch(path);
        if (!r.ok) throw new Error(`Impossible de charger ${path} (${r.status})`);
        return r.json();
    }

    async loadQuestionCSV(year, questionId) {
        const manifest = this.manifests[year];
        const programs = manifest.programs;
        const q = (this.schema && this.schema.questions[questionId]) || {};
        const isAverage = q.chartType === 'average';
        const response = await fetch(`static/data/${year}/${questionId}.csv`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return new Promise((resolve, reject) => {
            Papa.parse(text, {
                header: false,
                skipEmptyLines: true,
                complete: (results) => {
                    this.rawRows[year] = this.rawRows[year] || {};
                    this.rawRows[year][questionId] = results.data;
                    if (isAverage) {
                        resolve(this.aggregateAverage(results.data, programs, year, questionId));
                    } else {
                        resolve(this.aggregateMultiChoice(results.data, programs));
                    }
                },
                error: reject
            });
        });
    }

    aggregateMultiChoice(rows, programs) {
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
                const canonical = this.normalize(item.trim());
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

    aggregateAverage(rows, programs, year, questionId) {
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

    normalize(value) {
        return this.aliasLookup.get(value.toLowerCase()) || value;
    }

    colorFor(value, fallbackIndex) {
        const map = (this.schema.colors && this.schema.colors.values) || {};
        const palette = (this.schema.colors && this.schema.colors.palette) || ['#3498db'];
        return map[value] || palette[fallbackIndex % palette.length];
    }

    assignColors(values) {
        const map = (this.schema.colors && this.schema.colors.values) || {};
        const palette = (this.schema.colors && this.schema.colors.palette) || ['#3498db'];
        const used = new Set();
        for (const v of values) {
            const explicit = map[v];
            if (explicit) used.add(explicit.toLowerCase());
        }
        const result = [];
        let paletteIdx = 0;
        for (const v of values) {
            const explicit = map[v];
            if (explicit) { result.push(explicit); continue; }
            let color;
            let attempts = 0;
            do {
                color = palette[paletteIdx % palette.length];
                paletteIdx++;
                attempts++;
            } while (used.has(color.toLowerCase()) && attempts <= palette.length);
            used.add(color.toLowerCase());
            result.push(color);
        }
        return result;
    }

    getData(year, qid) {
        const yearData = this.data[year] && this.data[year][qid];
        if (!yearData) return null;
        if (this.currentProgram === PROGRAM_ALL) return yearData.total;
        return yearData[this.currentProgram] || null;
    }

    allProgramsUniverse() {
        const universe = new Set();
        for (const y of this.years) {
            const m = this.manifests[y];
            if (m && Array.isArray(m.programs)) {
                for (const p of m.programs) universe.add(p);
            }
        }
        return universe;
    }

    yearHasFullProgramData(year, qid) {
        if (this.currentProgram !== PROGRAM_ALL) return true;
        const manifest = this.manifests[year];
        if (!manifest || !manifest.questions.includes(qid)) return false;
        const universe = this.allProgramsUniverse();
        if (universe.size === 0) return true;
        const yearData = this.data[year] && this.data[year][qid];
        if (!yearData) return false;
        const q = this.schema.questions[qid];
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

    getRepondants(year) {
        const r = this.manifests[year].repondants || {};
        if (this.currentProgram === PROGRAM_ALL) return r.total;
        return r[this.currentProgram];
    }

    availablePrograms() {
        const set = new Set();
        for (const year of this.years) {
            const programs = this.manifests[year].programs;
            if (programs) programs.forEach((p) => set.add(p));
        }
        return Array.from(set);
    }

    programLabel(code) {
        if (code === PROGRAM_ALL) return 'Tous les programmes';
        return (this.programs[code] && this.programs[code].label) || code;
    }

    programColor(code) {
        if (code === PROGRAM_ALL) return '#3498db';
        return (this.programs[code] && this.programs[code].color) || '#3498db';
    }

    renderSelectors() {
        this.renderYearSelector();
        this.renderProgramSelector();
    }

    hasAnyChartForProgram(program) {
        const prev = this.currentProgram;
        this.currentProgram = program;
        try {
            if (this.currentView === 'compare') return this.hasAnyCompareChart();
            return this.hasAnyYearChart(this.currentYear);
        } finally {
            this.currentProgram = prev;
        }
    }

    hasAnyYearChart(year) {
        const manifest = this.manifests[year];
        if (!manifest) return false;
        const repondants = this.getRepondants(year);
        for (const qid of manifest.questions) {
            const q = this.schema.questions[qid];
            if (!q) continue;
            const data = this.getData(year, qid);
            if (q.chartType === 'average') {
                if (data && data.mean != null) return true;
            } else if (data && data.length > 0 && repondants != null) {
                return true;
            }
        }
        return false;
    }

    hasAnyCompareChart() {
        const seen = new Set();
        const allQuestions = [];
        for (const year of this.years) {
            for (const qid of this.manifests[year].questions) {
                if (!seen.has(qid)) { seen.add(qid); allQuestions.push(qid); }
            }
        }
        for (const qid of allQuestions) {
            const q = this.schema.questions[qid];
            if (!q) continue;
            const years = this.years.filter((y) => {
                if (!this.yearHasFullProgramData(y, qid)) return false;
                const d = this.getData(y, qid);
                if (!d) return false;
                if (q.chartType === 'average') return d.mean != null;
                return Array.isArray(d) && d.length > 0;
            });
            if (years.length >= 2) return true;
        }
        return false;
    }

    ensureValidProgram() {
        if (this.hasAnyChartForProgram(this.currentProgram)) return;
        const candidates = [PROGRAM_ALL, ...this.availablePrograms()];
        for (const p of candidates) {
            if (this.hasAnyChartForProgram(p)) {
                this.currentProgram = p;
                return;
            }
        }
    }

    renderYearSelector() {
        const sel = document.querySelector('.year-selector');
        sel.innerHTML = '';
        for (const year of this.years) {
            const btn = document.createElement('button');
            btn.className = 'year-btn';
            btn.dataset.year = year;
            btn.textContent = year;
            if (this.currentView === 'year' && year === this.currentYear) {
                btn.classList.add('active');
            }
            sel.appendChild(btn);
        }
        if (this.years.length > 1) {
            const btn = document.createElement('button');
            btn.className = 'year-btn compare-btn';
            btn.dataset.view = 'compare';
            btn.textContent = 'Comparer les années';
            if (this.currentView === 'compare') btn.classList.add('active');
            sel.appendChild(btn);
        }
    }

    renderProgramSelector() {
        const sel = document.querySelector('.program-selector');
        if (!sel) return;
        const programs = this.availablePrograms();
        if (programs.length === 0) {
            sel.innerHTML = '';
            sel.hidden = true;
            return;
        }
        sel.hidden = false;
        sel.innerHTML = '';

        const makeBtn = (code, label) => {
            const btn = document.createElement('button');
            btn.className = 'program-btn';
            btn.dataset.program = code;
            btn.textContent = label;
            if (!this.hasAnyChartForProgram(code)) btn.disabled = true;
            if (this.currentProgram === code) {
                btn.classList.add('active');
                const color = this.programColor(code);
                btn.style.background = color;
                btn.style.boxShadow = `0 4px 15px ${color}55`;
            }
            return btn;
        };

        sel.appendChild(makeBtn(PROGRAM_ALL, this.programLabel(PROGRAM_ALL)));
        for (const p of programs) sel.appendChild(makeBtn(p, this.programLabel(p)));
    }

    setupEventListeners() {
        document.querySelector('.year-selector').addEventListener('click', (e) => {
            const btn = e.target.closest('.year-btn');
            if (!btn) return;
            if (btn.dataset.view === 'compare') {
                this.currentView = 'compare';
            } else if (btn.dataset.year) {
                this.currentView = 'year';
                this.currentYear = btn.dataset.year;
            }
            this.ensureValidProgram();
            this.renderSelectors();
            this.render();
        });

        const progSel = document.querySelector('.program-selector');
        if (progSel) {
            progSel.addEventListener('click', (e) => {
                const btn = e.target.closest('.program-btn');
                if (!btn) return;
                this.currentProgram = btn.dataset.program;
                this.renderProgramSelector();
                this.render();
            });
        }

        document.getElementById('chartsContainer').addEventListener('click', (e) => {
            const btn = e.target.closest('.export-btn');
            if (!btn) return;
            this.handleExport(btn.dataset.action, btn.dataset.qid);
        });
    }

    render() {
        this.destroyCharts();
        if (this.currentView === 'compare') {
            this.renderCompareView();
        } else {
            this.renderYearView();
        }
        if (window.lucide) window.lucide.createIcons();
    }

    renderInfo() {
        const info = document.getElementById('general-info');
        const filterLabel = this.programLabel(this.currentProgram);
        const filterChip = this.currentProgram === PROGRAM_ALL
            ? ''
            : ` &nbsp;·&nbsp; <strong>Programme :</strong> ${this.escape(filterLabel)}`;

        if (this.currentView === 'compare') {
            const lines = this.years.map((y) => {
                const m = this.manifests[y];
                const periode = m.periode ? ` — ${this.escape(m.periode)}` : '';
                const rep = this.getRepondants(y);
                const repTxt = rep == null
                    ? '<em>donnée non disponible</em>'
                    : `${rep} répondants`;
                return `<li><strong>${y}</strong>${periode} : ${repTxt}</li>`;
            }).join('');
            info.innerHTML = `<p>Vue comparative${filterChip}</p><ul>${lines}</ul>`;
        } else {
            const m = this.manifests[this.currentYear];
            const periode = m.periode ? ` &nbsp;·&nbsp; <strong>Période :</strong> ${this.escape(m.periode)}` : '';
            const rep = this.getRepondants(this.currentYear);
            if (rep == null) {
                info.innerHTML = `<p><strong>Filtre :</strong> ${this.escape(filterLabel)} — <em>données non disponibles pour ${this.currentYear}</em>${periode}</p>`;
            } else {
                info.innerHTML = `<p><strong>Répondants :</strong> ${rep}${periode}${filterChip}</p>`;
            }
        }
    }

    renderYearView() {
        this.renderInfo();
        const container = document.getElementById('chartsContainer');
        container.innerHTML = '';

        const year = this.currentYear;
        const manifest = this.manifests[year];
        const repondants = this.getRepondants(year);

        for (const qid of manifest.questions) {
            const q = this.schema.questions[qid];
            if (!q) {
                console.warn(`Question inconnue dans le schéma : ${qid}`);
                continue;
            }
            const data = this.getData(year, qid);

            if (q.chartType === 'average') {
                if (!data || data.mean == null) continue;
                const wrapper = this.createWrapper(qid, q.label);
                container.appendChild(wrapper);
                this.createAverageDisplay(`chart-${qid}`, data, q);
                continue;
            }

            if (!data || data.length === 0 || repondants == null) continue;

            const wrapper = this.createWrapper(qid, q.label);
            container.appendChild(wrapper);

            if (q.chartType === 'pie') {
                this.createPieChart(`chart-${qid}`, data, repondants);
            } else {
                this.createBarChart(`chart-${qid}`, data, repondants);
            }
        }
    }

    renderCompareView() {
        this.renderInfo();
        const container = document.getElementById('chartsContainer');
        container.innerHTML = '';

        const seen = new Set();
        const allQuestions = [];
        for (const year of this.years) {
            for (const qid of this.manifests[year].questions) {
                if (!seen.has(qid)) { seen.add(qid); allQuestions.push(qid); }
            }
        }

        for (const qid of allQuestions) {
            const q = this.schema.questions[qid];
            if (!q) continue;

            const years = this.years.filter((y) => {
                if (!this.yearHasFullProgramData(y, qid)) return false;
                const d = this.getData(y, qid);
                if (!d) return false;
                if (q.chartType === 'average') return d.mean != null;
                return Array.isArray(d) && d.length > 0;
            });
            if (years.length < 2) continue;

            if (q.chartType === 'average') {
                const wrapper = this.createWrapper(qid, q.label);
                container.appendChild(wrapper);
                this.renderCompareAverage(qid, q, years);
                continue;
            }

            const valueTotals = new Map();
            for (const year of years) {
                const items = this.getData(year, qid);
                const rep = this.getRepondants(year);
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

            if (topValues.length === 0) continue;

            const wrapper = this.createWrapper(qid, q.label);
            container.appendChild(wrapper);

            const assignedColors = this.assignColors(topValues);
            const datasets = topValues.map((value, idx) => {
                const color = assignedColors[idx];
                const data = years.map((year) => {
                    const items = this.getData(year, qid);
                    const rep = this.getRepondants(year);
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
                    spanGaps: false
                };
            });

            this.createLineChart(`chart-${qid}`, years, datasets);
        }
    }

    renderCompareAverage(qid, q, years) {
        const decimals = q.decimals != null ? q.decimals : 2;
        const unit = q.unit || '';
        const color = this.programColor(this.currentProgram);
        const seriesData = years.map((year) => {
            const d = this.getData(year, qid);
            return d && d.mean != null ? +d.mean.toFixed(decimals) : null;
        });
        const dataset = {
            label: this.programLabel(this.currentProgram),
            data: seriesData,
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: color,
            tension: 0.25,
            fill: false,
            spanGaps: false
        };
        this.createLineChart(`chart-${qid}`, years, [dataset], {
            yLabel: unit ? `Moyenne (${unit})` : 'Moyenne',
            yFormatter: (v) => unit ? `${v} ${unit}` : String(v),
            tooltipFormatter: (c) => `${c.dataset.label} : ${c.parsed.y}${unit ? ' ' + unit : ''}`,
            showLegend: false
        });
    }

    createAverageDisplay(canvasId, data, q) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const container = canvas.parentElement;
        const decimals = q.decimals != null ? q.decimals : 2;
        const unit = q.unit || '';
        const formatted = data.mean.toFixed(decimals);
        const responseLabel = data.count > 1 ? 'réponses' : 'réponse';
        container.innerHTML = `
            <div class="chart-average">
                <div class="chart-average__value">${this.escape(formatted)}${unit ? `<span class="chart-average__unit">${this.escape(unit)}</span>` : ''}</div>
                <div class="chart-average__count">basée sur ${data.count} ${responseLabel}</div>
            </div>
        `;
    }

    createWrapper(qid, label) {
        const wrapper = document.createElement('section');
        wrapper.className = 'chart-wrapper';
        wrapper.innerHTML = `
            <header class="chart-header">
                <h2 class="chart-title">${this.escape(label)}</h2>
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
                <canvas id="chart-${qid}" role="img" aria-label="${this.escape(label)}"></canvas>
            </div>
        `;
        return wrapper;
    }

buildExportData(qid) {
        const q = this.schema.questions[qid];
        const sheetName = (q && q.label) || qid;
        const programSuffix = this.currentProgram === PROGRAM_ALL ? '' : `-${this.currentProgram}`;

        if (this.currentView === 'year') {
            return this.buildRawYearExport(qid, sheetName, programSuffix);
        }

        if (q && q.chartType === 'average') {
            return this.buildAverageExport(qid, q, sheetName, programSuffix);
        }

        const valueTotals = new Map();
        for (const year of this.years) {
            const items = this.getData(year, qid);
            const rep = this.getRepondants(year);
            if (!items || !rep) continue;
            for (const item of items) {
                const pct = (item.count / rep) * 100;
                valueTotals.set(item.value, (valueTotals.get(item.value) || 0) + pct);
            }
        }
        const allValues = Array.from(valueTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([v]) => v);
        const headers = ['Valeur', ...this.years.map((y) => `${y} (%)`)];
        const rows = allValues.map((value) => {
            const row = [value];
            for (const year of this.years) {
                const items = this.getData(year, qid);
                const rep = this.getRepondants(year);
                if (!items || !rep) { row.push(null); continue; }
                const found = items.find((i) => i.value === value);
                row.push(found ? +((found.count / rep) * 100).toFixed(1) : null);
            }
            return row;
        });
        return { filename: `${qid}-comparaison${programSuffix}`, sheetName, headers, rows };
    }

    buildAverageExport(qid, q, sheetName, programSuffix) {
        const decimals = q.decimals != null ? q.decimals : 2;
        const unit = q.unit || '';
        const meanHeader = unit ? `Moyenne (${unit})` : 'Moyenne';

        const headers = ['Année', meanHeader, 'Nombre de réponses'];
        const rows = this.years.map((year) => {
            const d = this.getData(year, qid);
            return d && d.mean != null
                ? [year, +d.mean.toFixed(decimals), d.count]
                : [year, null, 0];
        });
        return { filename: `${qid}-comparaison${programSuffix}`, sheetName, headers, rows };
    }

    buildRawYearExport(qid, sheetName, programSuffix) {
        const year = this.currentYear;
        const raw = (this.rawRows[year] && this.rawRows[year][qid]) || [];
        const hasPrograms = !!this.manifests[year].programs;
        const rows = hasPrograms && this.currentProgram !== PROGRAM_ALL
            ? raw.filter((r) => String(r[0] || '').trim().toLowerCase() === this.currentProgram)
            : raw;
        return { filename: `${qid}-${year}${programSuffix}`, sheetName, headers: [], rows };
    }

    handleExport(action, qid) {
        if (!this.schema.questions[qid]) return;
        const { filename, sheetName, headers, rows } = this.buildExportData(qid);
        if (action === 'csv') {
            this.downloadCSV(`${filename}.csv`, headers, rows);
        } else if (action === 'xlsx') {
            this.downloadXLSX(`${filename}.xlsx`, sheetName, headers, rows);
        }
    }

    downloadCSV(filename, headers, rows) {
        const escapeCell = (v) => {
            if (v == null) return '';
            const s = String(v);
            return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [];
        if (headers && headers.length) lines.push(headers.map(escapeCell).join(','));
        for (const row of rows) lines.push(row.map(escapeCell).join(','));
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    }

    downloadXLSX(filename, sheetName, headers, rows) {
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

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    escape(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    destroyCharts() {
        this.charts.forEach((c) => c.destroy());
        this.charts.clear();
    }

    createBarChart(canvasId, data, repondants) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (!data.length) return;
        const labels = data.map((d) => d.value);
        const values = data.map((d) => d.count);
        const colors = this.assignColors(data.map((d) => d.value));

        const chart = new Chart(ctx, {
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
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#3498db',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            label: (c) => {
                                const v = c.parsed.x;
                                const pct = repondants ? ((v / repondants) * 100).toFixed(1) : '—';
                                return `${v} étudiant(s) — ${pct} %`;
                            }
                        }
                    },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        color: '#2c3e50',
                        formatter: (v) => repondants ? `${((v / repondants) * 100).toFixed(1)} %` : ''
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        ticks: { color: '#7f8c8d', autoSkip: false }
                    },
                    x: {
                        grid: { display: true },
                        ticks: { color: '#7f8c8d' },
                        afterDataLimits: (axis) => { axis.max = axis.max * 1.05; }
                    }
                },
                animation: { duration: 800, easing: 'easeOutQuart' }
            }
        });
        this.charts.set(canvasId, chart);
    }

    createPieChart(canvasId, data, repondants) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (!data.length) return;
        const sorted = [...data].sort((a, b) => String(a.value).localeCompare(String(b.value), 'fr', { sensitivity: 'base' }));
        const labels = sorted.map((d) => {
            const pct = repondants ? ((d.count / repondants) * 100).toFixed(1) : '—';
            return `${d.value} (${pct} %)`;
        });
        const values = sorted.map((d) => d.count);
        const colors = this.assignColors(sorted.map((d) => d.value));

        const chart = new Chart(ctx, {
            type: 'pie',
            data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: 'white', borderWidth: 3 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 20, usePointStyle: true, color: '#2c3e50' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#3498db',
                        borderWidth: 1,
                        cornerRadius: 8
                    }
                },
                animation: { duration: 800, easing: 'easeOutQuart' }
            }
        });
        this.charts.set(canvasId, chart);
    }

    createLineChart(canvasId, years, datasets, options = {}) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        const onlyOneYear = years.length < 2;
        const yLabel = options.yLabel || '% des répondants';
        const yFormatter = options.yFormatter || ((v) => v + ' %');
        const tooltipFormatter = options.tooltipFormatter || ((c) => `${c.dataset.label} : ${c.parsed.y} %`);
        const showLegend = options.showLegend !== false;
        const chart = new Chart(ctx, {
            type: onlyOneYear ? 'bar' : 'line',
            data: { labels: years, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: showLegend,
                        position: 'bottom',
                        labels: { padding: 15, usePointStyle: true, color: '#2c3e50' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        callbacks: {
                            label: tooltipFormatter
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: yLabel },
                        ticks: { color: '#7f8c8d', callback: yFormatter }
                    },
                    x: {
                        title: { display: true, text: 'Année' },
                        ticks: { color: '#7f8c8d' }
                    }
                },
                animation: { duration: 800, easing: 'easeOutQuart' }
            }
        });
        this.charts.set(canvasId, chart);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new DataVisualizationApp();
});
