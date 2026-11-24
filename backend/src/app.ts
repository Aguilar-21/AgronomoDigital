// app.ts
//
// Armo la app Express aca. server.ts es el que la monta en un puerto.
// Las rutas protegidas llevan su propio middleware de autenticacion.

import express from 'express';
import type { Application, RequestHandler } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { logger } from './logger';
import { env, origenesCORS } from './config/env';
import { baseViva } from './db';
import { ErrorHttp, manejadorErrores, noEncontrado } from './middleware/errores';

import rutasAuth from './routes/auth';
import rutasCatalogos from './routes/catalogos';
import rutasParcelas from './routes/parcelas';
import rutasSiembras from './routes/siembras';
import rutasPrecios from './routes/precios';
import rutasMercado from './routes/mercado';
import rutasConsultas from './routes/consultas';
import rutasEstimaciones from './routes/estimaciones';

export function crearApp(): Application {
    const app = express();

    // Para leer la IP real cuando hay un proxy delante. En local no cambia nada.
    app.set('trust proxy', 1);

    app.use(
        pinoHttp({
            logger,
            // Las peticiones correctas van a debug para no llenar el log.
            autoLogging: {
                ignore: (req) => (req.res?.statusCode ?? 0) < 400
            },
            customLogLevel: (_req, res, err) => {
                if (err || res.statusCode >= 500) return 'error';
                if (res.statusCode >= 400) return 'warn';
                return 'debug';
            }
        })
    );

    // 50kb alcanzan para cualquier POST de esta app.
    app.use(express.json({ limit: '50kb' }));

    // CORS. Con CORS_ORIGENES vacío se acepta cualquier origen (para trabajar
    // en local); hay que llenarlo antes de publicar.
    app.use(
        cors({
            origin: origenesCORS() ?? true,
            credentials: true
        })
    );

    // Rutas abiertas

    app.use(rutasAuth); // POST /registro, POST /login
    app.use(rutasCatalogos); // /productos, /canales, /canales/:id/productos

    /**
     * GET /health, público: un monitor no tiene token. Devuelve 503 si la base
     * no responde, que es lo que un monitor entiende como "caído".
     */
    app.get('/health', async (_req, res) => {
        const baseOk = await baseViva();

        res.status(baseOk ? 200 : 503).json({
            estado: baseOk ? 'ok' : 'degradado',
            base_datos: baseOk,
            entorno: env.NODE_ENV
        });
    });

    // Rutas protegidas

    // Cada router protegido pone su propio middleware. Si se pusiera una sola
    // vez acá, una ruta nueva montada por encima quedaría abierta sin aviso.
    app.use(rutasParcelas);
    app.use(rutasSiembras);
    app.use(rutasEstimaciones);
    app.use(rutasPrecios);
    app.use(rutasMercado);
    app.use(rutasConsultas);

    // 404 y errores

    /**
     * Rutas que no existen. Pasa por el manejador de errores para responder
     * con el mismo JSON que todo lo demás.
     */
    app.use(((req, _res, next) => {
        next(noEncontrado('No existe la ruta ' + req.method + ' ' + req.path));
    }) as RequestHandler);

    // El manejador de errores va siempre al final.
    app.use(manejadorErrores);

    return app;
}

export default crearApp;

// Reexportado para que las pruebas y otras rutas puedan lanzar errores con
// codigo sin importar el modulo de errores dos veces.
export { ErrorHttp };
