// Valido body, params y query con los esquemas de Zod.

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { logger } from '../logger';

export type Fuente = 'body' | 'query' | 'params';

/**
 * Valida body o params en req y query en res.locals (en Express 5 req.query
 * no se puede sobrescribir).
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
