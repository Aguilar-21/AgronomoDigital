// schemas/parcelas.ts
//
// POST /parcelas, PUT /parcelas/:id y GET /parcelas.
//
// QUE CAMBIA
//
// 1. El cuerpo es estricto: mandar un campo que no existe se ignora, en vez de
//    colarse en la consulta.
//
// 2. PUT ya no puede mandar undefined. Antes un PUT con solo el nombre
//    escribia NULL en ubicacion, tamano y produccion, borrando datos que el
//    usuario no habia tocado. Con .partial() solo se actualiza lo que venga,
//    y lo que no venga se deja como estaba.
//
// 3. produccion_estimada es un numero o null explicito. El 0 ya no significa
//    "no produjo": significa 0, y el calculo lo trata como 0.

import { z } from 'zod';
import { texto } from './comunes';

/** Tamano de la parcela en unidades de medida, opcional. */
const tamano = z.coerce
    .number({ message: 'El tamano debe ser un numero' })
    .positive('El tamano debe ser mayor que cero')
    .max(1_000_000, 'El tamano es demasiado grande')
    .nullable()
    .optional();

/**
 * Produccion declarada de la parcela.
 *
 * Antes la columna se llamaba produccion_quintales, lo cual era mentira en un
 * sistema con cajas, libras, jabas y cientos. Ahora es produccion_estimada y
 * su unidad, cuando existe, sale de productos.unidad.
 *
 * null y 0 son distintos a proposito:
 *   null -> "no lo se", todavia no hay dato
 *   0    -> "produje cero", y el calculo debe respetar ese 0
 */
const produccion = z.coerce
    .number({ message: 'La produccion debe ser un numero' })
    .min(0, 'La produccion no puede ser negativa')
    .max(100_000_000, 'La produccion es demasiado grande')
    .nullable()
    .optional();

export const crearParcelaSchema = z.object({
    nombre_parcela: texto(2, 100),
    ubicacion: texto(0, 255).nullable().optional(),
    tamano,
    produccion_estimada: produccion
});

/**
 * PUT parcial.
 *
 * .partial() hace que todo sea opcional, que es lo correcto para una
 * actualizacion: el cliente manda solo lo que cambio. Si no fuera parcial, un
 * PUT del frontend tendria que reenviar la parcela entera, y cualquier campo
 * olvidado por el formulario se borraria.
 */
export const actualizarParcelaSchema = crearParcelaSchema
    .partial()
    .refine((d) => Object.keys(d).length > 0, {
        message: 'No mando ningun campo para actualizar'
    });

export type CrearParcelaBody = z.infer<typeof crearParcelaSchema>;
export type ActualizarParcelaBody = z.infer<typeof actualizarParcelaSchema>;