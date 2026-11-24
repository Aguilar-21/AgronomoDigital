// Forma del registro y del login.

import { z } from 'zod';
import {
    correo,
    correoOpcional,
    contrasena,
    texto,
    usuario,
    usuarioOpcional
} from './comunes';

/**
 * Cuerpo de POST /registro.
 *
 * No se acepta id_usuario: el id lo genera MySQL. Aceptarlo seria permitir
 * que alguien eligiera su propio id.
 */
export const registroSchema = z.object({
    usuario,
    nombre: texto(2, 100),
    correo,
    contrasena
});

/**
 * Identificador libre para el login: puede ser un usuario o un correo.
 *
 * No se valida con el formato de correo ni con el de usuario porque tiene que
 * aceptar los dos. Si no coincide con ninguna cuenta, la ruta responde 401 con
 * el mismo mensaje que una contrasena incorrecta, para no filtrar si la cuenta
 * existe.
 */
const identificador = z
    .string({ message: 'Manda tu usuario o tu correo' })
    .trim()
    .toLowerCase()
    .min(1, 'Manda tu usuario o tu correo')
    .max(150, 'El identificador es demasiado largo')
    .optional();

/** Cuerpo de POST /login. */
export const loginSchema = z
    .object({
        identificador,
        usuario: usuarioOpcional,
        correo: correoOpcional,
        contrasena: z
            .string({ message: 'La contrasena es obligatoria' })
            .min(1, 'La contrasena es obligatoria')
            .max(72)
    })
    .refine(
        (d) =>
            d.identificador !== undefined ||
            d.usuario !== undefined ||
            d.correo !== undefined,
        {
            message: 'Manda tu usuario o tu correo',
            path: ['identificador']
        }
    );
