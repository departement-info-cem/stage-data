import { PROGRAM_ALL } from './constants.js';
import {
    availablePrograms,
    hasAnyChartForProgram,
    programColor,
    programLabel,
} from './state-queries.js';

export function renderYearSelector(state) {
    const sel = document.querySelector('.year-selector');
    sel.innerHTML = '';
    for (const year of state.years) {
        const btn = document.createElement('button');
        btn.className = 'year-btn';
        btn.dataset.year = year;
        btn.textContent = year;
        if (state.currentView === 'year' && year === state.currentYear) {
            btn.classList.add('active');
        }
        sel.appendChild(btn);
    }
    if (state.years.length > 1) {
        const btn = document.createElement('button');
        btn.className = 'year-btn compare-btn';
        btn.dataset.view = 'compare';
        btn.textContent = 'Comparer les années';
        if (state.currentView === 'compare') btn.classList.add('active');
        sel.appendChild(btn);
    }
}

export function renderProgramSelector(state) {
    const sel = document.querySelector('.program-selector');
    if (!sel) return;
    const programs = availablePrograms(state);
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
        if (!hasAnyChartForProgram(state, code)) btn.disabled = true;
        if (state.currentProgram === code) {
            btn.classList.add('active');
            const color = programColor(state, code);
            btn.style.background = color;
            btn.style.boxShadow = `0 4px 15px ${color}55`;
        }
        return btn;
    };

    sel.appendChild(makeBtn(PROGRAM_ALL, programLabel(state, PROGRAM_ALL)));
    for (const p of programs) sel.appendChild(makeBtn(p, programLabel(state, p)));
}

export function renderSelectors(state) {
    renderYearSelector(state);
    renderProgramSelector(state);
}
