// middleware/errores.ts
//
// Manejador de errores central.
//
// QUE PROBLEMA RESUELVE
//
// Cada una de las 26 rutas tenia su propio try/catch con la misma forma:
//
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'Error al registrar el costo' });
//     }
//
// Eso son 27 copias del mismo bloque, con tres problemas:
//
//   1. El mensaje al usuario era siempre el mismo para cualquier fallo. Si la
//      base estaba caida y el usuario mandaba un costo malo, los dos casos
//      respondian "Error al registrar el costo". No se podia distinguir.
//   2. Se filtraba el detalle real. Un error de MySQL por columna demasiado
//      larga llegaba al usuario como un 500 generico, y el detalle bueno solo
//      se veia en el log del servidor.
//   3. Era facil olvidar el catch en una ruta nueva. Si se olvidaba, Express 5
//      deja que la excepcion llegue sola a este middleware, y sin el middleware
//      la respuesta que ve el usuario es un HTML de error con el stack dentro.
//
// QUE HACE ESTE ARCHIVO
//
//   - ErrorHttp: un error que ya sabe que codigo y que mensaje lleva.
//   - erroresConocidos: convierte errores de MySQL y de zod en ErrorHttp.
//   - manejadorErrores: el unico sitio que responde con un 4xx o 500.
//
// En Express 5 las funciones async que fallan ya propagan el error al siguiente
// middleware solas, asi que las rutas pueden quitarse el try/catch sin perder el
// manejo de errores. Eso es lo que hace el resto de la app.

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
 * Traduce errores que no son ErrorHttp a un ErrorHttp con sentido.
 *
 *   ER_DUP_ENTRY  -> 409  en vez de 500. El correo duplicado es un conflicto
 *                        esperado, no una falla del servidor. Ademas asi no hace
 *                        falta el SELECT previo para saber si el correo existe,
 *                        que era una condicion de carrera: dos registros
 *                        simultaneos pasaban los dos el SELECT y despues uno
 *                        reventaba con 500.
 *
 *   ER_NO_REFERENCED_ROW_2  -> 404  el id que mandaron no existe.
 *   ER_ROW_IS_REFERENCED_2  -> 409  no se puede borrar algo que otros usan.
 *   ZodError                 -> 400  la validacion fallo.
 *
 * Cualquier otra cosa se deja pasar como 500, que es lo que corresponde.
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
 * 404 para rutas que no existen.
 *
 * Sin esto, una ruta mal escrita devuelve el HTML por defecto de Express, que
 * no es JSON. El frontend siempre espera JSON, y un HTML inesperado hace que
 * falle el .json() del lado del navegador.
 *
 * Se tipa como RequestHandler y no como ErrorRequestHandler a proposito: no es
 * middleware de error, y ErrorRequestHandler empieza con el parametro `err`.
 * Declararlo con menos parametros hace que TypeScript corra los tipos un lugar
 * y termine diciendo que `res` es un Request.
 */
export const rutaNoEncontrada: RequestHandler = (req, res) => {
    logger.warn({ ruta: req.originalUrl, metodo: req.method }, 'ruta inexistente');
    res.status(404).json({
        error: `No existe la ruta ${req.method} ${req.path}`
    });
};