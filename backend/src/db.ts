// db.ts - conexión a MySQL.
//
// Todo el acceso a la base pasa por el pool que se exporta acá. No hay que abrir
// conexiones sueltas en cada ruta: el pool las administra y las reutiliza, que es
// lo que hace que el API no se caiga cuando llegan varias peticiones juntas.

import mysql from "mysql2/promise"; // mysql2 en su versión con promesas
import 'dotenv/config'; // Carga las variables del .env antes de usarlas

/*
 * connectionLimit: 10 conexiones simultáneas como máximo. Es un número
 * moderado para MySQL local; si el servidor llegara a tener más, MySQL mismo
 * avisa con "Too many connections" y ahí conviene bajarlo.
 *
 * waitForConnections: en vez de rechazar la petición cuando se acabó el cupo,
 * se espera a que se libere una conexión. Para una app como esta, donde las
 * consultas son cortas, casi siempre conviene esperar.
 *
 * queueLimit: 0 = cola infinita de espera. Por eso el combo con lo de arriba
 * no tira peticiones.
 *
 * Los DECIMAL de MySQL llegan como string para no perder precisión (ver README,
 * sección "Decimales"). Eso no se cambia acá: es mysql2 y no un error.
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST,        // localhost
    user: process.env.DB_USER,        // root
    password: process.env.DB_PASSWORD, // contraseña real de MySQL
    database: process.env.DB_DATABASE, // agronomodigital
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// namedPlaceholders:false queda como default a proposito. En el server.ts los
// "?" se pasan como arrays [valor, valor] en el orden en que aparecen, que es
// lo que espera mysql2 por defecto y lo que hace el ORDER BY de los filtros
// dynamicos de /publicaciones mas fragile de leer.
//
// queueLimit y connectionLimit no son obligatorios: si no se ponen, mysql2
// aplica connectionLimit=10 y waitForConnections=false. Están escritos
// explicitamente para que quede claro cual es el comportamiento buscado.

export default pool;
