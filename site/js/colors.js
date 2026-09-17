import { DEFAULT_COLOR } from './constants.js';

function paletteOf(schemaColors) {
    return (schemaColors && schemaColors.palette) || [DEFAULT_COLOR];
}

function valuesMapOf(schemaColors) {
    return (schemaColors && schemaColors.values) || {};
}

export function colorFor(value, fallbackIndex, schemaColors) {
    const map = valuesMapOf(schemaColors);
    const palette = paletteOf(schemaColors);
    return map[value] || palette[fallbackIndex % palette.length];
}

export function assignColors(values, schemaColors) {
    const map = valuesMapOf(schemaColors);
    const palette = paletteOf(schemaColors);
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

export function withAlpha(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const int = parseInt(m[1], 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
