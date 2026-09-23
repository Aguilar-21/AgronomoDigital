import mysql from "mysql2/promise"; // Importación de mysql2 en su versión con promesas
import 'dotenv/config'; // Carga las variables del archivo .env antes de usarlas

// Creación de una pool de conexiones con los datos del .env 
const pool = mysql.createPool({
    host: process.env.DB_HOST,       // localhost
    user: process.env.DB_USER,       // root
    password: process.env.DB_PASSWORD, // contraseña real de MySQL
    database: process.env.DB_DATABASE, // agronomodigital
});

export default pool;