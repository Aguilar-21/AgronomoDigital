// schemas/precios.ts
//
// POST y GET de /precios.
//
// QUE CAMBIA
//
// La columna se renombro de precio_venta_quintal a precio_venta. El nombre viejo
// era una mentira: el sistema tiene 14 productos en 6 unidades (quintal, caja,
// jaba, ciento, libra, botella) y el valor siempre fue el precio de LA UNIDAD
// del producto. Un tomate en caja costaba lo que costaba la caja, y el nombre
// decia quintal.
//
// Esto es un cambio incompatible para el cliente: hay que actualizar el
// frontend. Por eso el campo viejo sigue saliendo en la respuesta como alias y
// el esquema acepta el nombre viejo en el POST durante la transicion.

import { z } from 'zod';
import { fechaISO, idCanalOpcional, idProductoOpcional, montoPositivo } from './comunes';

/** Filtros de GET /precios. */
export const queryPrecios = z.object({
    id_producto: idProductoOpcional,
    id_canal: idCanalOpcional
});

/**
 * Filtros de GET /precios/ultimo.
 *
 * id_producto es OBLIGATORIO a diferencia de en GET /precios. "El ultimo
 * precio" sin decir de que producto no significa nada, y devolver el mas
 * reciente de cualquier producto seria un dato que no sirve para el calculo y
 * que ademas el frontend creeria que es el del producto pedido.
 */
export const queryUltimoPrecio = z.object({
    id_producto: z.coerce.number().int().positive({
        message: 'Falta id_producto para pedir el ultimo precio'
    }),
    id_canal: idCanalOpcional
});

/**
 * Cuerpo de POST /precios.
 *
 * Se aceptan los dos nombres del precio: precio_venta es el bueno,
 * precio_venta_quintal es el viejo. Al menos UNO tiene que venir, y si vienen
 * los dos gana precio_venta.
 *
 * Por que los dos son opcionales y no "el bueno obligatorio": durante la
 * transicion hay clientes viejos que siguen mandando el nombre viejo. Si el
 * esquema exigiera el nuevo, esos clientes empezarian a recibir 400 hasta que
 * se actualizaran, y un despliegue se convierte en una caida.
 */
export const crearPrecioSchema = z
    .object({
        id_producto: idProductoOpcional,
        id_canal: idCanalOpcional,
        fecha: fechaISO,

        precio_venta: montoPositivo.optional(),

        // Solo para la transicion. Se borra en cuanto el frontend este
        // actualizado; ver POST /precios, que responde con aviso_deprecado.
        precio_venta_quintal: montoPositivo.optional()
    })
    .refine((d) => d.precio_venta !== undefined || d.precio_venta_quintal !== undefined, {
        message: 'Falta el precio: manda precio_venta',
        path: ['precio_venta']
    })
    .transform((d) => ({
        id_producto: d.id_producto ?? null,
        id_canal: d.id_canal ?? null,
        fecha: d.fecha,
        precio_venta: d.precio_venta ?? d.precio_venta_quintal!,
        nombreViejoUsado: d.precio_venta === undefined
    }));

export type CrearPrecioBody = z.infer<typeof crearPrecioSchema>;