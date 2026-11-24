// Filtros de la consulta de disponible.

import { z } from 'zod';
import { idProductoOpcional } from './comunes';

/** GET /parcelas/:id/disponible?id_producto=3&ciclo=primera */
export const queryDisponible = z.object({
    id_producto: idProductoOpcional,
    ciclo: z.string().trim().min(1).max(30).optional()
});
