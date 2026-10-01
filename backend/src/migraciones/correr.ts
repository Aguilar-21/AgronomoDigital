// migraciones/correr.ts
//
// Corre las migraciones pendientes y no repite las que ya se aplicaron.
//
// QUE CAMBIA
//
// Antes el "migrar" era: abrir MySQL, copiar schema.sql a mano, y si algo
// fallaba a mitad, la base quedaba con una parte del esquema viejo y una parte
// del nuevo. Luego la aplicacion fallaba con errores que no tenian nada que ver
// con el cambio que se estaba haciendo.
//
// LA TABLA migraciones_aplicadas
//
// El problema de correr un archivo de SQL cada vez es no saber cual ya se
// aplico. MySQL no lleva esa cuenta. Entonces este script guarda el nombre de
// cada archivo aplicado en una tabla, y al correr de nuevo solo ejecuta los que
// no estan.
//
// Esa tabla se crea sola si no existe, con el nombre del archivo y la fecha.
//
// POR QUE SOLO SE APLICA UNA VEZ Y NO SE DESHACE
//
// No hay rollback. Es una decision consciente: un rollback Automatico es peor
// que no tener rollback cuando hay renombres de columnas, porque "deshacer" el
// rename significa volver a renombrar, y si alguien escribio datos en la columna
// nueva entre la aplicacion y el rollback, esos datos quedan en la columna
// equivocada sin aviso.
//
// Para volver atras hay que escribir el SQL a mano, sabiendo lo que se hizo. Es
// mas lento, y por eso el comentario de cada migracion dice que se puede y que
// no.
//
// LA TRANSACCION
//
// MySQL no hace rollback de DDL. Un ALTER TABLE a medias NO se puede revertir
// con ROLLBACK. Por eso se ejecuta una sentencia por una y se reporta cual
// fallo, en vez de un lote silencioso.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2';
import pool from '../db';
import { logger } from '../logger';

// Los .sql viven en migraciones/, que esta FUERA de src/ y por lo tanto fuera de
// rootDir y fuera de dist/ al compilar.
//
// Se resuelve con dos saltos hacia arriba en vez de copiar los .sql dentro de
// src: los archivos de migracion son datos, no codigo, y tenerlos duplicados
// dentro de src significaria que una copia puede quedar desactualizada sin que
// nadie se entere.
//
// En desarrollo __dirname es <backend>/src/migraciones, y dos saltos dan
// <backend>, que es donde esta migraciones/.
// En produccion es <backend>/dist/migraciones, y tambien dan <backend>.
const directorioMigraciones = join(__dirname, '..', '..', 'migraciones');

/** Ordena los nombres de los archivos de forma natural: 2 antes que 10. */
function ordenNatural(a: string, b: string): number {
    const na = Number(a.match(/\d+/)?.[0] ?? 0);
    const nb = Number(b.match(/\d+/)?.[0] ?? 0);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
}

export async function correrMigraciones(
    directorio = directorioMigraciones
): Promise<string[]> {
    // Tabla de control. Se crea antes de nada para que el propio registro de lo
    // aplicado tenga garantia de que se guardo.
    await pool.query(
        'CREATE TABLE IF NOT EXISTS migraciones_aplicadas (' +
            'nombre varchar(255) NOT NULL, ' +
            'aplicada_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (nombre)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    const archivos = readdirSync(directorio)
        .filter((f) => f.endsWith('.sql'))
        .sort(ordenNatural);

    const [hechas] = await pool.query<RowDataPacket[]>(
        'SELECT nombre FROM migraciones_aplicadas'
    );

    const yaAplicadas = new Set(hechas.map((f) => String(f.nombre)));

    const aplicadas: string[] = [];

    for (const archivo of archivos) {
        if (yaAplicadas.has(archivo)) {
            logger.debug({ archivo }, 'migracion ya aplicada, se omite');
            continue;
        }

        const sql = readFileSync(join(directorio, archivo), 'utf8');

        // Cada sentencia por separado. El archivo entero como una sola llamada
        // solo funciona si el driver acepta varios sentencias, y cuando una
        // falla MySQL ya aplico las anteriores: no hay vuelta atras.
        const sentencias = sql
            .split(';')
            .map((s) =>
                // Se quitan los comentarios de linea, que si no se cuelan en la
                // sentencia y MySQL los rechaza.
                s.split('\n')
                    .filter((linea) => !linea.trim().startsWith('--'))
                    .join('\n')
                    .trim()
            )
            .filter((s) => s.length > 0);

        try {
            for (const sentencia of sentencias) {
                await pool.query(sentencia);
            }
        } catch (error) {
            logger.error({ err: error, archivo }, 'la migracion fallo');
            throw new Error(
                `Fallo la migracion ${archivo}. Las anteriores de este archivo pueden ` +
                    `haber quedado aplicadas: MySQL no tiene rollback de DDL. ` +
                    `Revisa el estado antes de volver a correr.`
            );
        }

        await pool.query('INSERT INTO migraciones_aplicadas (nombre) VALUES (?)', [archivo]);

        aplicadas.push(archivo);
        logger.info({ archivo }, 'migracion aplicada');
    }

    return aplicadas;
}

// Solo se ejecuta cuando este archivo es el punto de entrada, no cuando otra
// cosa lo importa. Sin esta comprobacion, importar el modulo desde una prueba
// migraria la base de produccion.
if (process.argv[1] && process.argv[1].endsWith('correr.ts')) {
    correrMigraciones()
        .then((aplicadas) => {
            logger.info({ total: aplicadas.length }, 'migraciones terminadas');
            return pool.end();
        })
        .then(() => process.exit(0))
        .catch(async (error) => {
            logger.error({ err: error }, 'no se pudieron correr las migraciones');
            await pool.end();
            process.exit(1);
        });
}
