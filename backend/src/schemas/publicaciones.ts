// schemas/publicaciones.ts
//
// Alta, filtros y cambio de estado de publicaciones.

import { z } from 'zod';
import { fechaISO, idCanalOpcional, idProductoOpcional, montoPositivo, texto } from './comunes';

/** Los tres estados posibles. El orden no importa, la lista si. */
export const ESTADOS = ['disponible', 'vendido', 'retirado'] as const;
export type Estado = (typeof ESTADOS)[number];

/**
 * Transiciones permitidas. Vendido y retirado son finales: una venta cerrada
 * no se reabre, se retira la publicación vieja y se crea otra.
 */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
    disponible: ['vendido', 'retirado'],
    vendido: [],
    retirado: []
};

/** Filtros de GET /publicaciones. */
export const queryPublicaciones = z.object({
    estado: z.enum(ESTADOS).optional(),
    id_producto: idProductoOpcional,
    mias: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),

    // Paginacion: el mercado es la unica lista que puede crecer sin limite,
    // porque cada usuario publica las suyas y todas se ven entre si.
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});

/** Filtro de GET /publicaciones/:id/estado disponible. */
export const queryEstadosDisponibles = z.object({
    estado: z.enum(ESTADOS)
});

/** Cuerpo de POST /publicaciones. */
export const crearPublicacionSchema = z.object({
    // Nota: la ruta POST lo exige igual y devuelve 400 si falta, porque la
    // regla de "no publicar mas de lo producido" necesita contra que parcela
    // comparar. Se deja opcional en el esquema para que un cliente viejo que no
    // lo mandaba reciba un mensaje que explica el motivo, en vez de un 400 de
    // "campo obligatorio" que no dice por que.
    id_parcela: z.coerce.number().int().positive().optional(),

    id_producto: z.coerce.number().int().positive({
        message: 'El producto es obligatorio'
    }),
    id_canal: idCanalOpcional,

    cantidad: z.coerce
        .number({ message: 'La cantidad debe ser un numero' })
        .positive('La cantidad debe ser mayor que cero')
        .max(100_000_000, 'La cantidad es demasiado grande'),

    precio_unitario: montoPositivo,
    fecha: fechaISO,

    // ciclo es la temporada o siembra, y TIENE que coincidir con el ciclo en el
    // que se registro la produccion de esa parcela.
    //
    // Antes la ruta pasaba "fecha" en su lugar. Fecha es una ISO ("2026-09-29") y
    // ciclo es un nombre de temporada ("actual", "2026-A"), asi que la busqueda
    // de produccion no encontraba nunca nada y toda publicacion caia en el 409
    // de "no hay produccion registrada", aunque la parcela tuviera el producto
    // con tons. Era el bug mas caro del modulo: no dejaba publicar nada.
    //
    // Por eso es default 'actual' y no la fecha: 'actual' es el mismo valor que
    // usa POST /parcelas/:id/siembras cuando el cliente no manda ciclo, que es
    // el caso comun.
    ciclo: z.string().trim().min(1).max(30).default('actual'),

    // Aceptado y descartado a proposito: la ruta lo ignora y avisa. Asi un
    // cliente viejo que lo mandaba no rompe, pero tampoco puede crear una
    // oferta ya vendida por la puerta de atras.
    estado: z.enum(ESTADOS).optional(),

    notas: texto(0, 255).nullable().optional()
});

/** Cuerpo de PUT /publicaciones/:id/estado. */
export const cambiarEstadoSchema = z.object({
    estado: z.enum(ESTADOS, {
        message: `El estado debe ser uno de: ${ESTADOS.join(', ')}`
    })
});

export type CrearPublicacionBody = z.infer<typeof crearPublicacionSchema>;
export type CambiarEstadoBody = z.infer<typeof cambiarEstadoSchema>;
