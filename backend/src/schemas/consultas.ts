// schemas/consultas.ts
//
// Query strings de los endpoints de calculo y de catalogos.
//
// Estas son las validaciones que evitan los 500 mas molestos, porque los
// parametros de query llegan siempre como texto: "?id_producto=abc" es la forma
// mas facil de tumbar un endpoint que hace Number() sin comprobar.
//
// Decision: un parametro de filtro que no es un numero se rechaza con 400, en
// vez de ignorarse. La version anterior lo trataba como "sin filtro", lo que
// hacia que un error de tipeo en el frontend devolviera la lista COMPLETA de
// precios o de costos sin avisar, que es peor que un error: el usuario creeria
// que vio todo cuando en realidad vio otra cosa.

import { z } from 'zod';
import { idCanalOpcional, idProductoOpcional } from './comunes';

/**
 * Filtros de GET /parcelas/:id/costo-unitario y /punto-equilibrio.
 *
 * Los dos endpoints comparten la forma de la query, asi que comparten esquema.
 */
export const queryCalculo = z.object({
    id_producto: idProductoOpcional,
    id_canal: idCanalOpcional,

    // 'true' reparte los costos generales entre los productos de la parcela en
    // proporcion a su valor. Por defecto NO se reparten: se devuelven aparte.
    // Ver servicios/costos.ts, repartirCostosGenerales.
    repartir_generales: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .default(false),

    ciclo: z.string().trim().min(1).max(30).optional()
});

/** GET /categorias-costos?tipo=granos */
export const queryCategorias = z.object({
    tipo: z
        .string({ message: 'Falta el parametro ?tipo=' })
        .trim()
        .min(1, 'Falta el parametro ?tipo= con el tipo de producto')
        .max(30)
});

export type QueryCalculo = z.infer<typeof queryCalculo>;