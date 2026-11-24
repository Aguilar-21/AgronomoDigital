// schemas/siembras.ts
//
// GET y POST de /parcelas/:id/siembras.
//
// Una siembra es un cultivo dentro de una parcela. La superficie se guarda en
// la siembra, no en la parcela, porque un mismo terreno puede tener varios
// cultivos a la vez.

import { z } from 'zod';
import { idProductoOpcional, superficie, unidadSuperficie } from './comunes';

/** Filtros de GET /parcelas/:id/siembras. */
export const querySiembras = z.object({
    id_producto: idProductoOpcional,
    ciclo: z.string().trim().min(1).max(30).optional()
});

/**
 * Cuerpo de POST /parcelas/:id/siembras.
 *
 * No se acepta fecha: fecha_siembra y fecha_registro las pone el servidor.
 */
export const crearSiembraSchema = z.object({
    id_producto: z.coerce.number().int().positive({
        message: 'El producto es obligatorio'
    }),

    produccion: z.coerce
        .number({ message: 'La produccion debe ser un numero' })
        .positive('La produccion debe ser mayor que cero')
        .max(100_000_000, 'La produccion es demasiado grande'),

    ciclo: z.string().trim().min(1).max(30).default('actual'),

    superficie: superficie.optional(),
    unidad_superficie: unidadSuperficie.default('hectarea')
});

export type CrearSiembraBody = z.infer<typeof crearSiembraSchema>;
