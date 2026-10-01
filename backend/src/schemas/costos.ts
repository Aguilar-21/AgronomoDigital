// schemas/costos.ts
//
// POST /costos, PUT /costos/:id y GET /parcelas/:id/costos.
//
// QUE CAMBIA
//
// 1. La fecha es obligatoria y validada como fecha. Antes se mandaba
//    fecha: undefined al INSERT y MySQL lo rechazaba con un 500 y el mensaje
//    "Field 'fecha' doesn't have a default value", que no le dice nada al
//    usuario.
//
// 2. id_producto es opcional, y cuando falta el costo es general de la parcela.
//    Eso ahora es una decision explicita documentada en la respuesta de los
//    calculos (ver servicios/costos.ts), no un hueco silencioso.
//
// 3. ciclo se agrego. Sin el, los costos de dos temporadas se suman contra la
//    produccion de una sola.

import { z } from 'zod';
import { fechaISO, idProductoOpcional, montoPositivo, texto } from './comunes';

/** Filtro opcional de GET /parcelas/:id/costos. */
export const queryCostos = z.object({
    id_producto: idProductoOpcional,
    ciclo: z.string().trim().min(1).max(30).optional(),
    es_fijo: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional()
});

/**
 * Cuerpo de POST /costos.
 *
 * id_parcela NO se acepta: es parte de la ruta en GET, y en POST se valida
 * contra el usuario antes de insertar.
 */
export const crearCostoSchema = z.object({
    id_parcela: z.coerce.number().int().positive({
        message: 'La parcela es obligatoria'
    }),

    // Ausente = costo general de la parcela (no atribuible a un producto).
    // Presente = costo de ese producto en especifico.
    id_producto: idProductoOpcional,

    tipo_costo: texto(2, 50),
    descripcion: texto(0, 255).nullable().optional(),

    monto: montoPositivo,
    fecha: fechaISO,
    es_fijo: z.boolean().default(false),
    ciclo: z.string().trim().min(1).max(30).default('actual')
});

/**
 * PUT parcial de /costos/:id.
 *
 * COALESCE en el UPDATE hacia que un NULL de "no mandado" no pise el valor
 * guardado. Por eso los opcionales de texto van como nullable(): si el cliente
 * manda descripcion: null, el COALESCE lo trata igual que "no lo mandaste" y
 * deja la anterior. Es una limitacion conocida de este patron, no un error.
 */
export const actualizarCostoSchema = z
    .object({
        tipo_costo: texto(2, 50).optional(),
        descripcion: texto(0, 255).nullable().optional(),
        monto: montoPositivo.optional(),
        fecha: fechaISO.optional(),
        es_fijo: z.boolean().optional(),
        ciclo: z.string().trim().min(1).max(30).optional()
    })
    .refine((d) => Object.keys(d).length > 0, {
        message: 'No mando ningun campo para actualizar'
    });

/** Filtro de GET /parcelas/:id/costo-total. */
export const queryCostoTotal = z.object({
    id_producto: idProductoOpcional,
    ciclo: z.string().trim().min(1).max(30).optional()
});

export type CrearCostoBody = z.infer<typeof crearCostoSchema>;
export type ActualizarCostoBody = z.infer<typeof actualizarCostoSchema>;