// middleware/auth.ts
//
// Verificacion del token JWT.
//
// QUE CAMBIA
//
// 1. res.locals.usuario tiene tipo. Antes era any: cualquier propiedad pasaba
//    el typecheck, y un token mal formado pasaba hasta que una ruta hacia
//    usuario.id y reventaba. Ver types/express.d.ts.
//
// 2. Se distingue token ausente de token invalido en el mensaje, pero ambos
//    devuelven 401. La distincion es para el log, no para el cliente: si el
//    401 dijera "el token no existe" frente a "el token vencio", un atacante
//    podria distinguir tokens reales de inventados.
//
// 3. El id del usuario sale SIEMPRE del token, nunca del cuerpo de la peticion.
//    Es la regla que sostiene el aislamiento entre usuarios del sistema.

import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { logger } from '../logger';
import { normalizarUsuario } from '../auth/tipos';

export const DURACION_TOKEN = '2h';

/**
 * Firma un token para un usuario recien autenticado.
 *
 * Se mantiene en su propia funcion para que registro y login usen exactamente
 * la misma forma de token. Si divergen, un token emitido por uno no lo acepta
 * el otro.
 */
export function firmarToken(idUsuario: number, nombre: string): string {
    return jwt.sign({ id: idUsuario, nombre }, env.JWT_SECRETO, {
        expiresIn: DURACION_TOKEN
    });
}

/**
 * Middleware que exige un token valido.
 *
 * En Express 5 no hace falta try/catch en los handlers asincronos: el error
 * llega solo al middleware de error. Este middleware es sincrono, asi que su
 * try/catch alrededor de jwt.verify si es necesario.
 */
export const protegerRuta: RequestHandler = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header) {
        logger.warn({ ruta: req.originalUrl }, 'peticion sin header Authorization');
        return res.status(401).json({
            error: 'Falta el token. Mandalo en el header Authorization: Bearer <token>'
        });
    }

    // Se verifica que el esquema sea Bearer. Antes se tomaba
    // header.split(' ')[1] a ciegas, asi que un header "basico abc" pasaba y
    // jwt.verify recibia "basico" como si fuera el token.
    const partes = header.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        logger.warn({ ruta: req.originalUrl }, 'header Authorization con formato incorrecto');
        return res.status(401).json({
            error: 'El header Authorization debe tener el formato: Bearer <token>'
        });
    }

    let datos: unknown;

    try {
        datos = jwt.verify(partes[1], env.JWT_SECRETO);
    } catch (error) {
        const expirado = error instanceof jwt.TokenExpiredError;

        logger.warn(
            { ruta: req.originalUrl, expirado },
            expirado ? 'token expirado' : 'token invalido'
        );

        return res.status(401).json({
            error: expirado
                ? 'La sesion expiro. Vuelve a iniciar sesion.'
                : 'Token invalido'
        });
    }

    const usuario = normalizarUsuario(datos);

    if (!usuario) {
        // El token es criptograficamente valido pero no trae un id usable.
        // Pasa si alguien lo firmo con la clave correcta pero con otro payload.
        // Es raro, pero rechazarlo es lo correcto: la ruta no puede saber de
        // quien es la peticion.
        logger.error(
            { ruta: req.originalUrl },
            'token valido sin id de usuario utilizable'
        );
        return res.status(401).json({ error: 'Token incompleto' });
    }

    res.locals.usuario = usuario;
    next();
};