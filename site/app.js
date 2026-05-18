import { PROGRAM_ALL } from './js/constants.js';
import { loadAllData, loadManifests, loadSchema, loadYears } from './js/data-loader.js';
import { handleExport } from './js/export.js';
import { renderProgramSelector, renderSelectors } from './js/selectors.js';
import { ensureValidProgram } from './js/state-queries.js';
import { renderCompareView, renderYearView } from './js/views.js';

class DataVisualizationApp {
    constructor() {
        this.state = {
            schema: null,
            programs: {},
            aliasLookup: new Map(),
            years: [],
            manifests: {},
            data: {},
            rawRows: {},
            currentYear: null,
            currentView: 'year',
            currentProgram: PROGRAM_ALL,
        };
        this.charts = new Map();
        this.init();
    }

    async init() {
        const container = document.getElementById('chartsContainer');
        try {
            const { schema, programs, aliasLookup } = await loadSchema();
            this.state.schema = schema;
            this.state.programs = programs;
            this.state.aliasLookup = aliasLookup;

            this.state.years = await loadYears();
            this.state.manifests = await loadManifests(this.state.years);

            const { data, rawRows } = await loadAllData({
                years: this.state.years,
                manifests: this.state.manifests,
                schema: this.state.schema,
                aliasLookup: this.state.aliasLookup,
            });
            this.state.data = data;
            this.state.rawRows = rawRows;

            this.state.currentYear = this.state.years[this.state.years.length - 1];
            ensureValidProgram(this.state);
            renderSelectors(this.state);
            this.setupEventListeners();
            this.render();
        } catch (err) {
            console.error("Erreur d'initialisation :", err);
            container.innerHTML = `<div class="error"><h3>Erreur d'initialisation</h3><p>${err.message}</p></div>`;
        }
    }

    setupEventListeners() {
        document.querySelector('.year-selector').addEventListener('click', (e) => {
            const btn = e.target.closest('.year-btn');
            if (!btn) return;
            if (btn.dataset.view === 'compare') {
                this.state.currentView = 'compare';
            } else if (btn.dataset.year) {
                this.state.currentView = 'year';
                this.state.currentYear = btn.dataset.year;
            }
            ensureValidProgram(this.state);
            renderSelectors(this.state);
            this.render();
        });

        const progSel = document.querySelector('.program-selector');
        if (progSel) {
            progSel.addEventListener('click', (e) => {
                const btn = e.target.closest('.program-btn');
                if (!btn) return;
                this.state.currentProgram = btn.dataset.program;
                renderProgramSelector(this.state);
                this.render();
            });
        }

        document.getElementById('chartsContainer').addEventListener('click', (e) => {
            const btn = e.target.closest('.export-btn');
            if (!btn) return;
            handleExport(this.state, btn.dataset.action, btn.dataset.qid);
        });
    }

    render() {
        this.destroyCharts();
        if (this.state.currentView === 'compare') {
            renderCompareView(this.state, this.charts);
        } else {
            renderYearView(this.state, this.charts);
        }
        if (window.lucide) window.lucide.createIcons();
    }

    destroyCharts() {
        this.charts.forEach((c) => c.destroy());
        this.charts.clear();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new DataVisualizationApp();
});
