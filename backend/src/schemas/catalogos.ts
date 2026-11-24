// Filtros de los catalogos de insumos.

import { z } from 'zod';

/** GET /insumos?id_categoria_insumo=3 */
export const queryInsumos = z.object({
    id_categoria_insumo: z.coerce.number().int().positive().optional()
});
