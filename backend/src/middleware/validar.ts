// middleware/validar.ts
//
// Un solo lugar donde se decide que es una peticion valida.
//
// QUE PROBLEMA RESUELVE
//
// Cada ruta validaba a mano, y cada una validaba distinto:
//
//   - POST /costos revisaba monto, pero no que tipo_costo fuera texto
//   - POST /publicaciones comparaba cantidad <= 0 sin convertir: si el cliente
//     mandaba "abc", "abc" <= 0 es false, y "abc" llegaba a MySQL
//   - PUT /parcelas con campos undefined escribia NULL sobre lo que habia
//   - POST /login sin body hacia undefined.length y reventaba con 500
//   - POST /precios con fecha "no-es-fecha" la mandaba a MySQL tal cual
//
// Esos casos no son hipoteticos: producian 500, y un 500 culpa al servidor
// cuando el error vino del cliente.
//
// QUE HACE ESTE ARCHIVO
//
//   validar(schema) devuelve un middleware de Express. Si la peticion no
//   cumple, responde 400 con la lista exacta de campos que fallaron y la ruta
//   no se ejecuta.
//
// El valor que llega a la ruta ya viene parseado: los string numericos ("150")
// son numeros, y lo que no se declara en el esquema se descarta. Eso elimina de
// raiz los NaN que venian de Number() sobre campos que a veces eran string y a
// veces numero.

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { logger } from '../logger';

export type Fuente = 'body' | 'query' | 'params';

/**
 * Middleware que valida una parte de la peticion.
 *
 * Donde deja el resultado:
 *
 *   body   -> req.body, ya parseado
 *   params -> req.params, ya parseado
 *   query  -> res.locals.query
 *
 * El query va a res.locals y no a req.query a proposito: en Express 5
 * req.query es un getter sin setter, y asignarle un valor falla en silencio o
 * lanza segun el modo. Sobrescribirlo rompia la ruta sin avisar.
 */
export function validar(
    esquema: ZodTypeAny,
    fuente: Fuente = 'body'
): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const parseado = esquema.parse(req[fuente]);

            if (fuente === 'query') {
                res.locals.query = parseado;
            } else {
                req[fuente] = parseado as never;
            }

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const detalles = error.issues.map((i) => ({
                    campo: i.path.join('.') || '(raiz)',
                    problema: i.message
                }));

                logger.warn(
                    { ruta: req.originalUrl, metodo: req.method, campos: detalles.length },
                    'validacion fallo'
                );

                return res.status(400).json({
                    error: 'Los datos enviados no son validos',
                    detalles
                });
            }
            next(error);
        }
    };
}

/**
 * Lee la query ya validada.
 *
 * Si se llama sin validar antes, devuelve un objeto vacio en vez de reventar:
 * los filtros son opcionales, y que falte uno no es un error.
 */
export function queryDe<T extends Record<string, unknown>>(
    res: Response,
    porDefecto?: T
): T {
    return (res.locals.query as T | undefined) ?? (porDefecto ?? ({} as T));
}