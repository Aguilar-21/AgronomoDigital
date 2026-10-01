// server.ts
//
// Arranque y apagado. Nada mas.
//
// QUE CAMBIA
//
// Este archivo paso de 1300 lineas a unas 90. La app esta en app.ts y cada grupo
// de rutas en routes/.
//
// La separacion no es estetica: app.ts se puede importar sin que nada escuche
// en un puerto, asi que las pruebas pueden hacer request(app) contra la
// aplicacion entera sin abrir un puerto real ni tener que cerrar un servidor al
// final. Ver app.ts, que explica el detalle.
//
// EL APAGADO LIMPIO
//
// La parte que mas se olvida y mas duele cuando falta.
//
// Ctrl+C en la terminal manda SIGINT. Node aborta en seco. Lo que queda
// pendiente en el pool de MySQL no se ejecuta: consultas a medio escribir, un
// costo que quedo a medio insertar, una fila con el estado cambiado y el resto
// sin cambiar.
//
// pool.end() le dice a mysql2 "espera a que terminen las consultas que ya estan
// corriendo y despues cierra". Eso es lo que evita el corte a la mitad.
//
// Se hace en los tres casos:
//
//   SIGINT  -> Ctrl+C en la terminal
//   SIGTERM -> lo manda el sistema al apagar un contenedor o un servicio
//   'error' -> el server no pudo escuchar (puerto ocupado, permisos)
//
// El ultimo importa mas de lo que parece: si el puerto 3000 esta ocupado,
// mysql2 deja las conexiones abiertas y el proceso se queda colgado sin
// terminar. Con este manejador se cierran y el proceso sale.

import { crearApp } from './app';
import { env } from './config/env';
import { logger } from './logger';
import pool from './db';

const app = crearApp();

const servidor = app.listen(env.PUERTO, () => {
    logger.info(
        { puerto: env.PUERTO, entorno: env.NODE_ENV },
        'servidor escuchando'
    );
});

// ---------------------------------------------------------------------------
// Apagado limpio
// ---------------------------------------------------------------------------

/**
 * Cierra el servidor y el pool, en ese orden.
 *
 * Primero el servidor: deja de aceptar peticiones nuevas. Si se cerrara el pool
 * primero, las peticiones que ya estaban entrando se encontrarian con una base
 * cerrada y fallarian.
 *
 * forceAfter de 5 segundos es un seguro contra el proceso colgado: si alguna
 * conexion se resiste, se corta igual y se registra. Un proceso que no termina
 * es peor que uno que se corta con un error en el log.
 */
function apagar(motivo: string, codigoSalida = 0): void {
    logger.info({ motivo }, 'cerrando el servidor');

    servidor.close(async () => {
        try {
            await pool.end();
            logger.info('pool de base de datos cerrado');
        } catch (error) {
            logger.error({ err: error }, 'error al cerrar el pool de base de datos');
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
// error es un 'error' no capturado que tumba el proceso sin cerrar el pool.
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
// Se registran en vez de dejar que Node imprima el stack y salga: registrar
// permite saber de donde vino.
process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'excepcion no capturada');
    apagar('excepcion no capturada', 1);
});

process.on('unhandledRejection', (razon) => {
    logger.fatal({ err: razon }, 'promesa rechazada sin manejar');
    apagar('promesa rechazada', 1);
});