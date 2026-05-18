import { PROGRAM_ALL } from './constants.js';

export function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    return {
        view: params.get('view'),
        program: params.get('program'),
    };
}

export function writeUrlState(state) {
    const params = new URLSearchParams(window.location.search);
    if (state.currentView === 'compare') {
        params.set('view', 'compare');
    } else if (state.currentYear) {
        params.set('view', state.currentYear);
    } else {
        params.delete('view');
    }
    if (state.currentProgram && state.currentProgram !== PROGRAM_ALL) {
        params.set('program', state.currentProgram);
    } else {
        params.delete('program');
    }
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
}

export function applyUrlStateToApp(state) {
    const { view, program } = readUrlState();
    if (view === 'compare' && state.years.length > 1) {
        state.currentView = 'compare';
    } else if (view) {
        const matched = state.years.find((y) => String(y) === view);
        if (matched != null) {
            state.currentView = 'year';
            state.currentYear = matched;
        }
    }
    if (program) {
        const programs = new Set();
        for (const y of state.years) {
            const ps = state.manifests[y] && state.manifests[y].programs;
            if (ps) ps.forEach((p) => programs.add(p));
        }
        if (programs.has(program)) {
            state.currentProgram = program;
        }
    }
}
