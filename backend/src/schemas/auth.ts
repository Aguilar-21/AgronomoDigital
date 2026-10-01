// schemas/auth.ts
//
// POST /registro y POST /login.
//
// QUE CAMBIA
//
// El correo se normaliza (trim + minusculas) dentro del esquema, asi que
// "  Jose@Mail.COM " y "jose@mail.com" son el mismo usuario. Antes cada ruta
// comparaba el correo tal cual llegaba, y un usuario que escribia su correo con
// mayuscula no podia volver a entrar.
//
// Tambien se define el cuerpo minimo. Antes POST /login sin body hacia
// req.body.correo sobre undefined y reventaba con 500; ahora responde 400
// diciendo que falta el correo.

import { z } from 'zod';
import { correo, contrasena, texto } from './comunes';

/**
 * Cuerpo de POST /registro.
 *
 * No se acepta id_usuario: el id lo genera MySQL. Aceptarlo seria permitir
 * que alguien eligiera su propio id.
 */
export const registroSchema = z.object({
    nombre: texto(2, 100),
    correo,
    contrasena
});

/** Cuerpo de POST /login. */
export const loginSchema = z.object({
    correo,
    contrasena: z.string().min(1, 'La contrasena es obligatoria').max(72)
});

export type RegistroBody = z.infer<typeof registroSchema>;
export type LoginBody = z.infer<typeof loginSchema>;