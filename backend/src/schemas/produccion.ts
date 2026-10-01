// schemas/produccion.ts
//
// GET y POST de /parcelas/:id/produccion.
//
// QUE CAMBIA
//
// La produccion va en la unidad del producto (cajas, quintales, libras). Por eso
// el campo se llama produccion y no produccion_quintales, y por eso el
// esquema no puede inventar una unidad.
//
// ciclo es la temporada o siembra. Sin el, sumar costos de dos anos contra la
// produccion de uno da un costo por unidad que no corresponde a nada real.

import { z } from 'zod';
import { idProductoOpcional } from './comunes';

/** Filtro opcional de GET /parcelas/:id/produccion. */
export const queryProduccion = z.object({
    id_producto: idProductoOpcional,
    ciclo: z.string().trim().min(1).max(30).optional()
});

/**
 * Cuerpo de POST /parcelas/:id/produccion.
 *
 * El id_parcela NO se acepta aqui: ya va en la ruta (/parcelas/:id/produccion).
 * Aceptarlo en el body abriria la puerta a mandar un id de parcela y una ruta
 * que no coinciden, y cual de los dos gana dependeria del orden del codigo.
 */
export const crearProduccionSchema = z.object({
    id_producto: z.coerce.number().int().positive({
        message: 'El producto es obligatorio'
    }),

    produccion: z.coerce
        .number({ message: 'La produccion debe ser un numero' })
        .positive('La produccion debe ser mayor que cero')
        .max(100_000_000, 'La produccion es demasiado grande'),

    // default 'actual' mantiene el comportamiento anterior para los clientes que
    // no mandan ciclo. Es un nombre temporal explicito, no un DEFAULT de MySQL:
    // asi se nota en el codigo que es una decision de la app y no del esquema.
    ciclo: z.string().trim().min(1).max(30).default('actual')
});

export type CrearProduccionBody = z.infer<typeof crearProduccionSchema>;