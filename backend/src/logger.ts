// logger.ts
//
// Un solo lugar para los logs de la aplicacion.
//
// Que cambia con esto: antes cada ruta tenia su propio console.error con un
// texto distinto ("Error al registrar el costo", "Error al crear parcela"...).
// Para encontrar un fallo habia que saber de memoria que ruta lo producia, y
// los errores de MySQL se perdian porque algunos catch no imprimian nada.
//
// Ahora el logger tiene nombre, nivel y hora, y las peticiones HTTP se loguean
// solas con pino-http: metodo, ruta, status y duracion. Un errorcaught sin
// texto sigue siendo dificil de encontrar.

import pino from 'pino';
import { env } from './config/env';

export const logger = pino({
    level: env.LOG_LEVEL,

    // El nivel como etiqueta numerica ayuda a filtrar rapido cuando hay mucho
    // ruido de consultas.
    base: { nivel: env.NODE_ENV },

    // En desarrollo se imprime sin JSON para poder leerlo en la consola. En
    // produccion sale JSON, que es lo que espera un agregador de logs.
    formatters: {
        level: (label) => ({ nivelLog: label })
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    redact: {
        // Nunca se imprime la contrasena ni el token, aunque alguien los pase
        // por error dentro de un objeto que seloguea. La ruta se deja porque
        // si es util para debuggear.
        paths: [
            'req.headers.authorization',
            'contrasena',
            'token',
            '*.contrasena',
            '*.token'
        ],
        censor: '[oculto]'
    }
});

export default logger;