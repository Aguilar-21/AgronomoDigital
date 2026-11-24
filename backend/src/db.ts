// db.ts
//
// Conexion a SQLite. Un solo archivo, sin servidor.
//
// better-sqlite3 es sincrono: las consultas bloquean el hilo mientras
// corren, pero para una app como esta (consultas cortas, pocos usuarios)
// es mas simple y mas rapido que un driver asincrono.

import Database from 'better-sqlite3';
import { env } from './config/env';
import { logger } from './logger';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = env.DB_PATH;
const dir = path.dirname(dbPath);
if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const db: any = new Database(dbPath, { verbose: undefined });

// WAL mejora la concurrencia de lectura mientras se escribe.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Comprueba que la base responde.
 */
export async function baseViva(): Promise<boolean> {
    try {
        db.prepare('SELECT 1').get();
        return true;
    } catch (error) {
        logger.error({ err: error }, 'no se pudo consultar la base de datos');
        return false;
    }
}

export default db;
