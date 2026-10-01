// db.ts - conexion a MySQL.
//
// QUE CAMBIA
//
// Las variables dejan de leerse sueltas de process.env y salen de config/env.ts,
// que ya las valido con zod al arrancar. Antes, si DB_HOST faltaba, el pool se
// creaba igual con host undefined y el error aparecia en la primera consulta,
// mucho despues del arranque y sin decir que faltaba.
//
// Todo el acceso a la base pasa por el pool que se exporta aca. No hay que abrir
// conexiones sueltas en cada ruta: el pool las administra y las reutiliza, que es
// lo que hace que la API no se caiga cuando llegan varias peticiones juntas.

import mysql from 'mysql2/promise'; // mysql2 en su version con promesas
import { env } from './config/env';
import { logger } from './logger';

/*
 * connectionLimit: 10 conexiones simultaneas como maximo. Es un numero
 * moderado para MySQL local; si el servidor llegara a tener mas, MySQL mismo
 * avisa con "Too many connections" y ahi conviene bajarlo.
 *
 * waitForConnections: en vez de rechazar la peticion cuando se acabo el cupo,
 * se espera a que se libere una conexion. Para una app como esta, donde las
 * consultas son cortas, casi siempre conviene esperar.
 *
 * queueLimit: 0 = cola infinita de espera. Por eso el combo con lo de arriba
 * no tira peticiones.
 *
 * enableKeepAlive: MySQL cierra conexiones inactivas por su cuenta (wait_timeout,
 * 8 horas por defecto, pero algunos servidores lo bajan a minutos). Con
 * keep-alive, mysql2 manda un ping periodico y las conexiones del pool no
 * mueren mientras la app esta esperando. Sin eso, la primera peticion despues
 * de un rato largo de inactividad falla con "connection lost" y el usuario ve
 * un 500 sin motivo aparente.
 *
 * Los DECIMAL de MySQL llegan como string para no perder precision (ver README,
 * seccion "Decimales"). Eso no se cambia aca: es mysql2 y no un error. Lo que si
 * se hace es convertir con num() de services/calculos en el punto de uso.
 */
const pool = mysql.createPool({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    port: 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,

    // Con charset explicito se evita el "Unknown initial character set" que
    // aparece cuando el servidor y el cliente no coinciden.
    charset: 'utf8mb4'
});

// namedPlaceholders:false queda como default a proposito. Los "?" se pasan como
// arrays [valor, valor] en el orden en que aparecen, que es lo que espera
// mysql2 por defecto.
//
// queueLimit y connectionLimit no son obligatorios: si no se ponen, mysql2
// aplica connectionLimit=10 y waitForConnections=false. estan escritos
// explicitamente para que quede claro cual es el comportamiento buscado.

/**
 * Comprueba que la base responde.
 *
 * Lo usa GET /health. SELECT 1 es la consulta mas barata posible: no toca
 * ninguna tabla, asi que responde en milisegundos y no se traba si alguna tabla
 * esta bloqueada.
 *
 * Devuelve true/false y no lanza, porque un /health que revienta con un 500
 * cuando la base caigo es un /health inutil para un monitor: el monitor solo
 * sabe interpretar 200 y todo lo demas.
 */
export async function baseViva(): Promise<boolean> {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        logger.error({ err: error }, 'no se pudo consultar la base de datos');
        return false;
    }
}

export default pool;