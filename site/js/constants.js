export const PROGRAM_ALL = 'all';
export const DEFAULT_COLOR = '#3498db';
export const PLACEMENT_COLOR = '#d35400';

// La saison de recherche de stage, dans l'ordre : ce sont les colonnes mensuelles
// de cohortes.csv. Un mois sans stage obtenu s'écrit 0 ; une cellule vide signifie
// « pas encore connu » et arrête la courbe de progression à cet endroit.
export const PLACEMENT_MONTHS = [
    { key: 'ete', label: 'Été' },
    { key: 'septembre', label: 'Septembre' },
    { key: 'octobre', label: 'Octobre' },
    { key: 'novembre', label: 'Novembre' },
    { key: 'decembre', label: 'Décembre' },
    { key: 'janvier', label: 'Janvier' },
    { key: 'fevrier', label: 'Février' },
    { key: 'mars', label: 'Mars' },
];
