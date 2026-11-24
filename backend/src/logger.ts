// Un solo logger para toda la app.

import pino from 'pino';
import { env } from './config/env';

export const logger = pino({
    level: env.LOG_LEVEL,

    // El nivel como etiqueta numerica ayuda a filtrar rapido cuando hay mucho
    base: { nivel: env.NODE_ENV },

    // En desarrollo se imprime sin JSON para poder leerlo en la consola. En
    formatters: {
        level: (label) => ({ nivelLog: label })
    },

    timestamp: pino.stdTimeFunctions.isoTime,

    redact: {
        // Nunca se imprime la contrasena ni el token, aunque alguien los pase
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
