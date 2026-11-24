// schemas/parcelas.ts
//
// Alta y edicion de parcelas.

import { z } from 'zod';
import { superficie, texto, unidadSuperficie } from './comunes';

export const crearParcelaSchema = z.object({
    nombre_parcela: texto(2, 100),
    ubicacion: texto(0, 255).nullable().optional(),

    // tamano es la superficie total del terreno. La superficie sembrada de
    // cada cultivo va en siembras.
    tamano: superficie.nullable().optional(),
    unidad_superficie: unidadSuperficie.default('hectarea')
});

/**
 * PUT parcial.
 *
 * Se declara campo por campo en vez de usar .partial() porque
 * unidad_superficie tiene un valor por defecto al crear. Con .partial() ese
 * default se aplicaria tambien en el PUT y cambiaria una manzana por una
 * hectarea sin que el cliente lo haya pedido.
 */
export const actualizarParcelaSchema = z
    .object({
        nombre_parcela: texto(2, 100).optional(),
        ubicacion: texto(0, 255).nullable().optional(),
        tamano: superficie.nullable().optional(),
        unidad_superficie: unidadSuperficie.optional()
    })
    .refine((datos) => Object.keys(datos).length > 0, {
        message: 'No mando ningun campo para actualizar'
    });

export type CrearParcelaBody = z.infer<typeof crearParcelaSchema>;
export type ActualizarParcelaBody = z.infer<typeof actualizarParcelaSchema>;
