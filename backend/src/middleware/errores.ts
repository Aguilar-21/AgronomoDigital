// middleware/errores.ts
//
// Aca se responden todos los errores. Las rutas solo lanzan ErrorHttp.

import type {
    ErrorRequestHandler,
    RequestHandler,
    Request,
    Response,
    NextFunction
} from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

/**
 * Error que ya conoce su codigo HTTP y su mensaje para el usuario.
 *
 * Se lanza desde las rutas y desde los servicios cuando hay una condicion
 *esperada (no existe, no es tuya, el monto es negativo). No se registra como
 * error de servidor: es un 404 o un 400, no una falla.
 */
export class ErrorHttp extends Error {
    readonly codigo: number;
    readonly detalles?: unknown;

    constructor(codigo: number, mensaje: string, detalles?: unknown) {
        super(mensaje);
        this.name = 'ErrorHttp';
        this.codigo = codigo;
        this.detalles = detalles;
    }
}

// Atajos para no repetir el numero en cada ruta.
export const noEncontrado = (mensaje = 'Recurso no encontrado') =>
    new ErrorHttp(404, mensaje);
export const malaPeticion = (mensaje: string, detalles?: unknown) =>
    new ErrorHttp(400, mensaje, detalles);
export const conflicto = (mensaje: string) => new ErrorHttp(409, mensaje);

/** Indice de MySQL para una clave UNIQUE violada. */
const CODIGO_DUPLICADO = 'ER_DUP_ENTRY';

/**
 * Traduce los errores de MySQL y de Zod a ErrorHttp. Un duplicado es 409,
 * un id que no existe es 404 y lo demás se deja como 500.
 */
export function erroresConocidos(error: unknown): ErrorHttp {
    if (error instanceof ErrorHttp) return error;

    if (error instanceof ZodError) {
        return new ErrorHttp(
            400,
            'Los datos enviados no son validos',
            error.issues.map((i) => ({
                campo: i.path.join('.') || '(raiz)',
                problema: i.message
            }))
        );
    }

    const codigo = (error as { code?: string } | null)?.code;

    switch (codigo) {
        case CODIGO_DUPLICADO:
            return new ErrorHttp(409, 'Ese registro ya existe');

        case 'ER_NO_REFERENCED_ROW_2':
        case 'ER_NO_REFERENCED_ROW':
            return new ErrorHttp(404, 'El registro relacionado no existe');

        case 'ER_ROW_IS_REFERENCED_2':
        case 'ER_ROW_IS_REFERENCED':
            return new ErrorHttp(409, 'Ese registro esta en uso y no se puede modificar');

        case 'ECONNREFUSED':
        case 'PROTOCOL_CONNECTION_LOST':
        case 'ER_ACCESS_DENIED_ERROR':
        case 'ER_BAD_DB_ERROR':
            return new ErrorHttp(503, 'La base de datos no esta disponible');

        default:
            return new ErrorHttp(500, 'Error interno del servidor');
    }
}

/**
 * El unico middleware de error de la aplicacion.
 *
 * Se registra al final de todas las rutas, y ademas un manejador de 404 para
 * rutas que no existen.
 */
export const manejadorErrores: ErrorRequestHandler = (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Si los headers ya se enviaron, no hay nada que hacer: delegar al cierre
    // de Express es lo unico correcto. Intentar un res.status(1) desata
    // "Cannot set headers after they are sent".
    if (res.headersSent) {
        return next(error);
    }

    const http = erroresConocidos(error);

    // Un 5xx es una falla nuestra y se loguea entero. Un 4xx es culpa del
    // cliente que mando algo malo, asi que se loguea corto: ruta y motivo.
    if (http.codigo >= 500) {
        logger.error(
            { err: error, ruta: req.originalUrl, metodo: req.method },
            'error no controlado'
        );
    } else {
        logger.warn(
            { ruta: req.originalUrl, metodo: req.method, codigo: http.codigo, motivo: http.message },
            'peticion rechazada'
        );
    }

    const cuerpo: { error: string; detalles?: unknown } = { error: http.message };
    if (http.detalles !== undefined) cuerpo.detalles = http.detalles;

    res.status(http.codigo).json(cuerpo);
};

/**
 * 404 para rutas que no existen, con el mismo formato JSON que los otros errores.
 */
export const rutaNoEncontrada: RequestHandler = (req, res) => {
    logger.warn({ ruta: req.originalUrl, metodo: req.method }, 'ruta inexistente');
    res.status(404).json({
        error: `No existe la ruta ${req.method} ${req.path}`
    });
};
