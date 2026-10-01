// schemas/comunes.ts
//
// Piezas de validacion que se repiten en casi todos los endpoints.
//
// Centralizarlas tiene una razon concreta: si el id de parcela se valida en 9
// sitios y en uno de ellos faltaba el .int().positive(), ese endpoint aceptaba
// 1.5 y "abc" y fallaba con un 500 de MySQL. Con el esquema unico, el forget
// se puede hacer una vez, no nueve.

import { z } from 'zod';

/**
 * Id de path (/parcelas/:id).
 *
 * Express 5 entrega req.params como string (o string[] si el parametro se
 * repite). Por eso se usa z.coerce: convierte "12" a 12, y si llega ["12","13"]
 * z.coerce.number no lo puede convertir y devuelve 400, que es lo correcto.
 */
export const idParams = z.object({
    id: z.coerce.number().int().positive({
        message: 'El id debe ser un numero entero positivo'
    })
});

/** Id de producto, canal o usuario: mismo criterio que idParams. */
export const idParamsEnIds = z.object({
    id: z.coerce.number().int().positive()
});

/** Parametro de query numerico opcional (?id_producto=3). */
export const idQuery = z.coerce.number().int().positive().optional();

/**
 * Paginacion.
 *
 * limit y offset van acotados porque un limit sin techo es una forma facil de
 * tumbar el servidor: el cliente pide limit=1000000 y la consulta trae la
 * tabla entera. Con max(100) el peor caso es 100 filas.
 */
export const paginacion = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});

/**
 * Fecha en formato AAAA-MM-DD.
 *
 * z.iso.date() exige el formato exacto y ademas valida que la fecha exista de
 * verdad: "2026-02-31" se rechaza porque febrero no tiene 31 dias, mientras que
 * un new Date("2026-02-31") daria marzo 3 y no avisaria.
 */
export const fechaISO = z.iso.date({
    message: 'La fecha debe estar en formato AAAA-MM-DD'
});

/**
 * Monto o cantidad.
 *
 * .positive() y no .min(0) a proposito: un costo de cero no es un costo. El
 * unico caso legitimo en cero es la produccion, y ese campo usa otro esquema
 * porque "registre que no produce" se maneja con null, no con 0.
 */
export const montoPositivo = z.coerce
    .number({ message: 'Debe ser un numero' })
    .positive({ message: 'Debe ser mayor que cero' })
    .max(99_999_999, 'El valor es demasiado alto');

/**
 * Texto obligatorio, sin espacios solo.
 *
 * El trim automatico importa porque el frontend manda lo que el usuario
 * escribio. " Maiz " y "Maiz" son el mismo cultivo para el agricultor, pero
 * para MySQL son dos cadenas distintas, y el UNIQUE de productos no los
 * detectaria como duplicados.
 */
export const texto = (min: number, max: number) =>
    z
        .string({ message: 'Debe ser texto' })
        .trim()
        .min(min, `Debe tener al menos ${min} caracteres`)
        .max(max, `No puede pasar de ${max} caracteres`);

/**
 * Correo Electronico, ya normalizado.
 *
 * La normalizacion va DENTRO del esquema, y no en un .toLowerCase() suelto por
 * la ruta, para que ningun endpoint se olvide. trim quita espacios que se
 * cuelan al copiar y pegar, toLowerCase evita que "Jose@Mail.com" y
 * "jose@mail.com" creen dos cuentas.
 *
 * La razon de fondo: el UNIQUE de usuarios.correo es lo unico que impide dos
 * cuentas con el mismo correo. Si se guardan sin normalizar, el indice deja de
 * detectar el duplicado y el usuario termina con dos cuentas.
 */
export const correo = z
    .string({ message: 'El correo es obligatorio' })
    .trim()
    .toLowerCase()
    .min(5, 'El correo es muy corto')
    .max(150, 'El correo es muy largo')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no tiene un formato valido');

/** Contrasena: minimo 8. El maximo acota el costo de bcrypt con entradas raras. */
export const contrasena = z
    .string({ message: 'La contrasena es obligatoria' })
    .min(8, 'La contrasena debe tener al menos 8 caracteres')
    .max(72, 'La contrasena no puede pasar de 72 caracteres');

/** Un id de producto dentro del cuerpo, opcional. */
export const idProductoOpcional = z.coerce.number().int().positive().optional();

/** id_canal dentro del cuerpo, opcional. */
export const idCanalOpcional = z.coerce.number().int().positive().optional();