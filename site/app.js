class DataVisualizationApp {
    constructor() {
        this.repondants = 0;
        this.currentYear = 2025;
        this.charts = new Map();
        this.chartConfigs = [
            {
                file: 'techno.csv',
                type: 'bar',
                id: 'techno-chart'
            },
            {
                file: 'langage.csv',
                type: 'bar',
                id: 'langage-chart'
            },
            {
                file: 'framework.csv',
                type: 'bar',
                id: 'framework-chart'
            },
            {
                file: 'os.csv',
                type: 'pie',
                id: 'os-chart'
            },
            {
                file: 'outil.csv',
                type: 'bar',
                id: 'outil-chart'
            },
            {
                file: 'gestion.csv',
                type: 'bar',
                id: 'gestion-chart'
            },
            {
                file: 'communication.csv',
                type: 'bar',
                id: 'communication-chart'
            },
            {
                file: 'vsc.csv',
                type: 'pie',
                id: 'vsc-chart'
            },
            {
                file: 'ia.csv',
                type: 'pie',
                id: 'ia-chart'
            },
            {
                file: 'ia-utilise.csv',
                type: 'bar',
                id: 'ia-utilise-chart'
            },
            {
                file: 'bd.csv',
                type: 'bar',
                id: 'bd-chart'
            },
            {
                file: 'autre-outil.csv',
                type: 'bar',
                id: 'autre-outil-chart'
            }
            // Ajoutez d'autres configurations de graphiques ici
        ];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadChartsForYear(this.currentYear);
    }

    setupEventListeners() {
        const yearButtons = document.querySelectorAll('.year-btn');
        yearButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const year = parseInt(e.target.dataset.year);
                this.switchYear(year);
            });
        });
    }

    loadGeneralInfo(annee) {
        const infoPath = `static/data/${annee}/info.csv`;

        Papa.parse(infoPath, {
            download: true,
            header: true,
            complete: function (results) {
                const info = results.data[0]; // première ligne
                let html = "";

                if (info && info.repondants) {
                    html += `<p><strong>Répondants :</strong> ${info.repondants}</p>`;
                    this.repondants = info.repondants;
                } else {
                    html = `<p>Aucune donnée générale trouvée pour ${annee}.</p>`;
                }

                document.getElementById("general-info").innerHTML = html;
            },
            error: function (error) {
                console.error("Erreur lors du chargement de info.csv :", error);
                document.getElementById("general-info").innerHTML = `<p>Erreur de chargement des données générales.</p>`;
            }
        });
    }

    switchYear(year) {
        this.currentYear = year;

        // Mise à jour des boutons
        document.querySelectorAll('.year-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-year="${year}"]`).classList.add('active');

        // Rechargement des graphiques
        this.loadChartsForYear(year);
    }

    async loadChartsForYear(year) {
        const container = document.getElementById('chartsContainer');
        container.innerHTML = '<div class="loading">Chargement des données...</div>';

        try {
            await this.createCharts(year);
            this.loadGeneralInfo(year); // Charger les infos générales pour l'année sélectionnée
        } catch (error) {
            container.innerHTML = `<div class="error">Erreur lors du chargement des données: ${error.message}</div>`;
        }
    }

    async createCharts(year) {
        const container = document.getElementById('chartsContainer');
        container.innerHTML = '';

        // Détruire les graphiques existants
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();

        for (const config of this.chartConfigs) {
            try {
                const csvData = await this.loadCSV(`static/data/${year}/${config.file}`);
                if (csvData && csvData.length > 0) {
                    const chartElement = this.createChartElement(config, csvData);
                    container.appendChild(chartElement);

                    if (config.type === 'bar') {
                        this.createBarChart(config.id, csvData);
                    } else if (config.type === 'pie') {
                        this.createPieChart(config.id, csvData);
                    }
                } else {
                    throw new Error('Aucune donnée trouvée dans le fichier CSV');
                }
            } catch (error) {
                console.error(`Erreur lors du chargement de ${config.file}:`, error);
                const errorElement = this.createErrorElement(config.file, error.message);
                container.appendChild(errorElement);
            }
        }
    }

    async loadCSV(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Impossible de charger le fichier: ${response.status} ${response.statusText}`);
            }
            const csvText = await response.text();

            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: false, // Changé à false pour traiter comme des lignes simples
                    skipEmptyLines: true,
                    complete: (results) => {
                        try {
                            // Traitement spécial pour les données à choix multiples
                            const processedData = this.processMultiChoiceData(results.data);
                            resolve(processedData);
                        } catch (error) {
                            reject(new Error(`Erreur lors du traitement des données: ${error.message}`));
                        }
                    },
                    error: (error) => {
                        reject(new Error(`Erreur lors de l'analyse CSV: ${error.message}`));
                    }
                });
            });
        } catch (error) {
            // Fallback vers les données d'exemple si le fichier n'existe pas
            console.warn(`Fichier ${filePath} non trouvé, utilisation des données d'exemple`);
        }
    }

    processMultiChoiceData(rawData) {
        const counts = new Map();

        // La première ligne contient le titre/question
        const questionTitle = rawData[0] && rawData[0][0] ? rawData[0][0] : 'Données';

        // Parcourir chaque ligne de données (en sautant la première qui est le titre)
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (row && Array.isArray(row)) {
                // Papa Parse a déjà séparé les éléments, on prend tous les éléments non vides
                row.forEach(item => {
                    if (item && item.trim().length > 0) {
                        const trimmedItem = item.trim();
                        counts.set(trimmedItem, (counts.get(trimmedItem) || 0) + 1);
                    }
                });
            }
        }

        // Convertir en format attendu par les graphiques
        const processedData = Array.from(counts.entries())
            .map(([item, count]) => ({
                [questionTitle]: item,
                'Étudiants': count
            }))
            .sort((a, b) => b['Étudiants'] - a['Étudiants']);

        return processedData;
    }

    createChartElement(config, data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';

        // Le titre est maintenant la question (première colonne)
        const title = data.length > 0 ? Object.keys(data[0])[0] : 'Graphique';

        wrapper.innerHTML = `
          <h2 class="chart-title">${title}</h2>
          <div class="chart-container">
              <canvas id="${config.id}"></canvas>
          </div>
      `;

        return wrapper;
    }

    createErrorElement(fileName, errorMessage) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';
        wrapper.innerHTML = `
          <div class="error">
              <h3>Erreur de chargement</h3>
              <p><strong>Fichier:</strong> ${fileName}</p>
              <p><strong>Erreur:</strong> ${errorMessage}</p>
              <p><em>Vérifiez que le fichier existe dans le bon dossier et que le serveur web est configuré correctement.</em></p>
          </div>
      `;
        return wrapper;
    }

    createBarChart(canvasId, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');

        if (data.length === 0) return;

        const keys = Object.keys(data[0]);
        const labelKey = keys[0];
        const valueKey = keys[1];

        // Trier les données par ordre décroissant
        const sortedData = [...data].sort((a, b) => b[valueKey] - a[valueKey]);

        const labels = sortedData.map(item => item[labelKey]);
        const values = sortedData.map(item => parseFloat(item[valueKey]) || 0);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: valueKey,
                    data: values,
                    backgroundColor: [
                        '#3498db', '#e74c3c', '#2ecc71', '#f39c12',
                        '#9b59b6', '#1abc9c', '#34495e', '#e67e22',
                        '#95a5a6', '#f1c40f', '#8e44ad', '#16a085',
                        '#2c3e50', '#d35400', '#7f8c8d', '#f39c12'
                    ],
                    borderColor: [
                        '#2980b9', '#c0392b', '#27ae60', '#d68910',
                        '#8e44ad', '#16a085', '#2c3e50', '#d35400',
                        '#7f8c8d', '#f39c12', '#7d3c98', '#138d75',
                        '#1b2631', '#ba4a00', '#566573', '#d68910'
                    ],
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
                    legend: {
                        display: false
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
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        },
                        ticks: {
                            color: '#7f8c8d',
                            autoSkip: false,
                        }
                    },
                    x: {
                        grid: {
                            display: true
                        },
                        ticks: {
                            color: '#7f8c8d',
                        },
                        afterDataLimits: (axis) => {
                            const max = axis.max;
                            axis.max = max * 1.005;
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        this.charts.set(canvasId, chart);
    }

    createPieChart(canvasId, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');

        if (data.length === 0) return;

        const keys = Object.keys(data[0]);
        const labelKey = keys[0];
        const valueKey = keys[1];

        // Trier les données par ordre décroissant
        const sortedData = [...data].sort((a, b) => b[valueKey] - a[valueKey]);

        const labels = sortedData.map(item => item[labelKey]);
        const values = sortedData.map(item => parseFloat(item[valueKey]) || 0);

        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#3498db', '#e74c3c', '#2ecc71', '#f39c12',
                        '#9b59b6', '#1abc9c', '#34495e', '#e67e22',
                        '#95a5a6', '#f1c40f', '#8e44ad', '#16a085',
                        '#2c3e50', '#d35400', '#7f8c8d', '#f39c12'
                    ],
                    borderColor: 'white',
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            color: '#2c3e50'
                        }
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
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        this.charts.set(canvasId, chart);
    }

    // Méthode pour ajouter facilement de nouveaux graphiques
    addChart(config) {
        this.chartConfigs.push(config);
        this.loadChartsForYear(this.currentYear);
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DataVisualizationApp();
});