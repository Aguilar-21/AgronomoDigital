// Constantes de conversion entre unidades de superficie.
//
// El valor de la manzana cambia segun el pais. El que se usa aqui (0,6989 ha)
// corresponde a la manzana salvadorena y se puede sobreescribir con la variable
// de entorno HECTAREAS_POR_MANZANA sin tocar el codigo.
const desdeEntorno = Number(process.env.HECTAREAS_POR_MANZANA);

export const HECTAREAS_POR_MANZANA =
    Number.isFinite(desdeEntorno) && desdeEntorno > 0 ? desdeEntorno : 0.6989;

export const UNIDADES_SUPERFICIE = ['hectarea', 'manzana'] as const;

export type UnidadSuperficie = (typeof UNIDADES_SUPERFICIE)[number];

/** Pasa una superficie a hectareas, que es la unidad de las dosis. */
export function aHectareas(superficie: number, unidad: UnidadSuperficie): number {
    return unidad === 'manzana' ? superficie * HECTAREAS_POR_MANZANA : superficie;
}
