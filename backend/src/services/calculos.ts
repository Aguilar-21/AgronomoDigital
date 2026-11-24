// services/calculos.ts
//
// Conversion y redondeo de los DECIMAL que devuelve MySQL.

export function redondear2(n: number): number {
    if (!Number.isFinite(n)) return 0;

    const epsilon = Math.max(1e-9, Math.abs(n) * 1e-12);

    return Math.round((n + epsilon) * 100) / 100;
}

/** Convierte un DECIMAL de MySQL (que llega como texto) a numero. */
export function num(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Redondeo a 4 decimales, la precision que usan las cantidades de insumos y la
 * superficie en hectareas.
 */
export function redondear4(n: number): number {
    if (!Number.isFinite(n)) return 0;

    const epsilon = Math.max(1e-9, Math.abs(n) * 1e-12);

    return Math.round((n + epsilon) * 10_000) / 10_000;
}
