// Validacion de POST /estimaciones y de los filtros del historial.

import { z } from 'zod';
import { paginacion, superficie, unidadSuperficie } from './comunes';

/**
 * Cuerpo de POST /estimaciones.
 *
 * El usuario elige el cultivo y escribe la superficie. No manda fecha: la pone
 * el servidor al guardar la estimacion.
 *
 * id_fuente es obligatorio para que el total se pueda explicar despues. El
 * frontend lo obtiene de GET /fuentes-precio.
 *
 * id_parcela es opcional: se puede consultar el costo antes de tener la
 * parcela registrada.
 */
export const crearEstimacionSchema = z.object({
    id_producto: z.coerce.number().int().positive({
        message: 'El cultivo es obligatorio'
    }),
    superficie,
    unidad_superficie: unidadSuperficie.default('hectarea'),
    id_fuente: z.coerce.number().int().positive({
        message: 'La fuente de precios es obligatoria'
    }),
    id_parcela: z.coerce.number().int().positive().optional()
});

export const queryEstimaciones = paginacion;

export type CrearEstimacionBody = z.infer<typeof crearEstimacionSchema>;
