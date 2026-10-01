// app.ts
//
// La aplicacion Express, separada del arranque.
//
// QUE CAMBIA
//
// Este archivo es la razon de que "npm run build" pueda existir. Antes toda la
// app (1300 lineas, 26 rutas, middleware y manejo de errores) estaba en
// server.ts, que ademas era el punto de entrada. Para testear algo habia que
// importarlo, y al importarlo arrancaba el servidor y se quedaba escuchando en
// un puerto: las pruebas unitarias no podian correr sin pelearse con el puerto
// 3000.
//
// Ahora:
//
//   app.ts    -> construye la app y la EXPORTA. No escucha en ningun puerto.
//   server.ts -> importa app.ts, la monta en un puerto y maneja el cierre.
//
// Una prueba hace: import app from '../app'; request(app).get(...) y ya. Sin
// puertos, sin procesos colgados, sin afterAll para matar el servidor.
//
// SOBRE EL ORDEN DE LOS MIDDLEWARES
//
// El orden importa y no es arbitrario:
//
//   1. logger      - primero, para que registre hasta las peticiones que fallan
//   2. json        - el body tiene que estar parseado antes de validar
//   3. cors        - antes de las rutas, para que el error tambien lo lleve
//   4. abiertas    - registro, login, catalogos y /health
//   5. protegidas  - cada router se protege a si mismo con protegerRuta
//   6. 404         - cuando ninguna ruta coincidio
//   7. errores     - SIEMPRE ultimo. Express identifica el manejador de errores
//                    por sus cuatro parametros, y si esta antes de las rutas,
//                    las de error nunca se ejecutan.
//
// POR QUE CADA ROUTER SE PROTEGE SOLO
//
// Lo natural seria un app.use(protegerRuta) antes del grupo protegido: una vez
// y no se repite. Se hizo al reves a proposito.
//
// Con un solo app.use, la seguridad depende de que la ruta este montada DESPUES
// de esa linea. Si alguien agrega app.use(rutasNuevas) arriba por error, esa ruta
// queda abierta y no hay ningun aviso: el servidor arranca normal, la ruta
// funciona, y nadie se da cuenta hasta que alguien consulte datos ajenos.
//
// Declarando protegerRuta en cada ruta de cada router, el costo es escribir la
// palabra una vez mas, y el beneficio es que una ruta sin proteccion se ve al
// leer el archivo, no al auditarlo un ano despues.

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
import rutasProduccion from './routes/produccion';
import rutasCostos from './routes/costos';
import rutasPrecios from './routes/precios';
import rutasMercado from './routes/mercado';
import rutasConsultas from './routes/consultas';

export function crearApp(): Application {
    const app = express();

    // Trust proxy: sin esto, req.ip da "::1" para todas las peticiones de
    // internet y el limitador por IP no sirve de nada. Con esto toma la
    // cabecera X-Forwarded-For, que es correcta SOLO si hay un proxy delante
    // (nginx, un balanceador). Es un valor por defecto para una app que se
    // despliega; en local no cambia nada porque no hay proxy y la cabecera no
    // existe.
    app.set('trust proxy', 1);

    app.use(
        pinoHttp({
            logger,
            // Las peticiones correctas se dejan en debug y no en info. Un log por
            // peticion en info llena el archivo en minutos y esconde lo que si
            // importa, que son los errores.
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

    // express.json() con limite explicito: el body de un POST normal de esta app
    // son unos pocos cientos de bytes. El limite por defecto de 100kb ya sobra,
    // y bajarlo a 50kb corta los cuerpos abusivos antes de que lleguen a MySQL.
    app.use(express.json({ limit: '50kb' }));

    // CORS. Los origenes salen de origenesCORS(), en config/env.ts.
    //
    // Si CORS_ORIGENES esta vacio, origenesCORS devuelve null y la peticion pasa
    // a cors({ origin: true }) con el origen del que venga. Es lo que permite
    // trabajar en local con el frontend abierto en file://, y lo que hay que
    // cambiar antes de publicar: con la variable vacia, cualquiera puede llamar
    // a la API desde su pagina.
    //
    // Se decide en un solo lugar a proposito: si app.ts interpretara el string
    // por su cuenta, un cambio en la forma de escribir la lista tendria que
    // replicarse aqui.
    app.use(
        cors({
            origin: origenesCORS() ?? true,
            credentials: true
        })
    );

    // ----------------------------------------------------------------------
    // Rutas abiertas
    // ----------------------------------------------------------------------

    app.use(rutasAuth); // POST /registro, POST /login
    app.use(rutasCatalogos); // /productos, /canales, /categorias-costos

    /**
     * GET /health
     *
     * Ruta nueva, y publica a proposito: un monitor externo no tiene token.
     *
     * Va ANTES de protegerRuta. Si fuera despues, un monitor sin token recibiria
     * 401 y leeria eso como "la aplicacion esta caida", cuando en realidad la
     * unica cosa caida seria la idea de tener un monitor.
     *
     * Devuelve 200 con la base viva y 503 si no. El 503 es lo que un balanceador
     * o un monitor entiende como "esta caida", mientras que un 200 con un false
     * adentro tendria que serparse para saberlo.
     */
    app.get('/health', async (_req, res) => {
        const baseOk = await baseViva();

        res.status(baseOk ? 200 : 503).json({
            estado: baseOk ? 'ok' : 'degradado',
            base_datos: baseOk,
            entorno: env.NODE_ENV
        });
    });

    // ----------------------------------------------------------------------
    // Rutas protegidas
    // ----------------------------------------------------------------------

    // A partir de aqui TODA ruta exige token. Por eso cada router protegido
    // vuelve a declarar protegerRuta en sus propias rutas y no se aplica aqui:
    // ponerlo aqui seria mas corto, pero entonces /registro y /login, que ya se
    // montaron arriba, seguirian funcionando solo por el orden de montaje, y
    // cualquier ruta nueva olvidada quedaria abierta en silencio.
    app.use(rutasParcelas);
    app.use(rutasProduccion);
    app.use(rutasCostos);
    app.use(rutasPrecios);
    app.use(rutasMercado);
    app.use(rutasConsultas);

    // ----------------------------------------------------------------------
    // 404 y errores
    // ----------------------------------------------------------------------

    /**
     * Cualquier ruta que no llego a ninguna de las anteriores.
     *
     * Pasa por el manejador central de errores en vez de responder aqui, para
     * que el 404 tenga el mismo formato que todos los demas errores. Antes el
     * 404 devolvia { error: "Ruta no encontrada" } y los otros devolvian
     * { error: "..." } con el mismo formato, pero el mensaje no distinguisha
     * entre "no existe" y "no tienes permiso".
     */
    app.use(((req, _res, next) => {
        next(noEncontrado('No existe la ruta ' + req.method + ' ' + req.path));
    }) as RequestHandler);

    // SIEMPRE el ultimo. Express lo reconoce por tener 4 parametros.
    app.use(manejadorErrores);

    return app;
}

export default crearApp;

// Reexportado para que las pruebas y otras rutas puedan lanzar errores con
// codigo sin importar el modulo de errores dos veces.
export { ErrorHttp };
