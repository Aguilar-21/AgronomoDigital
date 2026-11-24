import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import db from '../db';
import { logger } from '../logger';

const directorioMigraciones = join(__dirname, '..', '..', 'migraciones');

function ordenNatural(a: string, b: string): number {
    const na = Number(a.match(/\d+/)?.[0] ?? 0);
    const nb = Number(b.match(/\d+/)?.[0] ?? 0);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
}

export async function correrMigraciones(
    directorio = directorioMigraciones
): Promise<string[]> {
    db.exec(
        'CREATE TABLE IF NOT EXISTS migraciones_aplicadas (' +
            'nombre TEXT NOT NULL PRIMARY KEY, ' +
            'aplicada_en TEXT NOT NULL DEFAULT (datetime(\'now\'))' +
            ')'
    );

    // Si el esquema ya esta en su version final (tabla estimaciones existe),
    // las migraciones ya estan aplicadas: solo las registramos.
    const existeFinal = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='estimaciones'"
    ).get();

    const archivos = readdirSync(directorio)
        .filter((f) => f.endsWith('.sql'))
        .sort(ordenNatural);

    if (existeFinal) {
        const stmt = db.prepare('INSERT OR IGNORE INTO migraciones_aplicadas (nombre) VALUES (?)');
        for (const a of archivos) {
            stmt.run(a);
        }
        logger.info({ total: archivos.length }, 'esquema ya en version final, migraciones registradas');
        return [];
    }

    // Esquema viejo: aplicar migraciones pendientes.
    const hechas = db.prepare('SELECT nombre FROM migraciones_aplicadas').all() as { nombre: string }[];
    const yaAplicadas = new Set(hechas.map((f) => String(f.nombre)));

    const aplicadas: string[] = [];

    for (const archivo of archivos) {
        if (yaAplicadas.has(archivo)) {
            logger.debug({ archivo }, 'migracion ya aplicada, se omite');
            continue;
        }

        const sql = readFileSync(join(directorio, archivo), 'utf8');

        const sqlSinComentarios = sql
            .split('\n')
            .filter((linea) => !linea.trim().startsWith('--'))
            .join('\n');

        const sentencias = sqlSinComentarios
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        try {
            db.exec('BEGIN');
            for (const sentencia of sentencias) {
                db.exec(sentencia);
            }
            db.prepare('INSERT INTO migraciones_aplicadas (nombre) VALUES (?)').run(archivo);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            logger.error({ err: error, archivo }, 'la migracion fallo');
            throw new Error(
                `Fallo la migracion ${archivo}. Revisa el estado antes de volver a correr.`
            );
        }

        aplicadas.push(archivo);
        logger.info({ archivo }, 'migracion aplicada');
    }

    return aplicadas;
}

if (process.argv[1] && process.argv[1].endsWith('correr.ts')) {
    correrMigraciones()
        .then((aplicadas) => {
            logger.info({ total: aplicadas.length }, 'migraciones terminadas');
            process.exit(0);
        })
        .catch(async (error) => {
            logger.error({ err: error }, 'no se pudieron correr las migraciones');
            process.exit(1);
        });
}
