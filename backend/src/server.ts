// Arranco el servidor y cierro el pool cuando me piden que salga.

import { crearApp } from './app';
import { env } from './config/env';
import { logger } from './logger';
import db from './db';

const app = crearApp();

const servidor = app.listen(env.PUERTO, () => {
    logger.info(
        { puerto: env.PUERTO, entorno: env.NODE_ENV },
        'servidor escuchando'
    );
});

// Apagado limpio

/** Cierra el servidor y despuÃ©s el pool de MySQL. */
function apagar(motivo: string, codigoSalida = 0): void {
    logger.info({ motivo }, 'cerrando el servidor');

    servidor.close(() => {
        try {
            db.close();
            logger.info('base de datos cerrada');
        } catch (error) {
            logger.error({ err: error }, 'error al cerrar la base de datos');
        } finally {
            process.exit(codigoSalida);
        }
    });

    // Si en 5 segundos no se cerro todo, se sale igual.
    setTimeout(() => {
        logger.error('el cierre tardo demasiado, saliendo de todos modos');
        process.exit(codigoSalida);
    }, 5000).unref();
}

process.on('SIGINT', () => apagar('SIGINT (Ctrl+C)'));
process.on('SIGTERM', () => apagar('SIGTERM'));

// El manejador de 'error' del server dispara cuando listen falla. Sin esto, el
servidor.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        logger.error(
            { puerto: env.PUERTO },
            `el puerto ${env.PUERTO} ya esta ocupado. Cerrar el otro proceso o cambiar PORT en .env`
        );
    } else {
        logger.error({ err: error }, 'error del servidor');
    }
    apagar('error del servidor', 1);
});

// Errores que no son de peticiones (desbordes de pila, errores en timers).
process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'excepcion no capturada');
    apagar('excepcion no capturada', 1);
});

process.on('unhandledRejection', (razon) => {
    logger.fatal({ err: razon }, 'promesa rechazada sin manejar');
    apagar('promesa rechazada', 1);
});
