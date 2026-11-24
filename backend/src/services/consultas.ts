// services/consultas.ts
//
// Consultas de parcelas y de produccion disponible.

import pool from '../db';
import type { RowDataPacket } from 'mysql2';
import { num, redondear2 } from './calculos';

export interface FilaParcela extends RowDataPacket {
    id_parcela: number;
    id_usuario: number;
    nombre_parcela: string;
    ubicacion: string | null;
    tamano: string | null;
    unidad_superficie: 'hectarea' | 'manzana';
}

export interface FilaProducto extends RowDataPacket {
    id_producto: number;
    nombre: string;
    unidad: string;
    tipo_producto: string;
    activo?: number;
}

/**
 * Devuelve la parcela solo si pertenece al usuario del token.
 *
 * Se responde 404 y no 403 cuando no es suya para no confirmar que el id
 * existe.
 */
export async function parcelaDelUsuario(
    idParcela: number,
    idUsuario: number
): Promise<FilaParcela | null> {
    const [filas] = await pool.query<FilaParcela[]>(
        'SELECT id_parcela, id_usuario, nombre_parcela, ubicacion, tamano, ' +
            'unidad_superficie ' +
            'FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
        [idParcela, idUsuario]
    );
    return filas[0] ?? null;
}

/**
 * Busca un producto activo.
 *
 * Los productos desactivados se conservan para no perder el historico, pero no
 * se ofrecen en los selectores ni se aceptan en registros nuevos.
 */
export async function productoActivo(
    idProducto: number
): Promise<FilaProducto | null> {
    const [filas] = await pool.query<FilaProducto[]>(
        'SELECT id_producto, nombre, unidad, tipo_producto FROM productos ' +
            'WHERE id_producto = ? AND activo = TRUE',
        [idProducto]
    );
    return filas[0] ?? null;
}

/** Verifica que un canal exista. */
export async function canalExiste(idCanal: number): Promise<boolean> {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_canal FROM canales_venta WHERE id_canal = ?',
        [idCanal]
    );
    return filas.length > 0;
}

/**
 * Cuanto de un producto queda disponible para publicar en una parcela.
 *
 * Se resta lo publicado que todavia cuenta (disponible y vendido). Devuelve
 * null cuando no hay siembra registrada para ese producto y ciclo: null es
 * "no hay dato", distinto de 0, que es "hay dato y no queda nada".
 */
export async function disponibleParaPublicar(
    idParcela: number,
    idProducto: number,
    ciclo: string | null
): Promise<{ disponible: number | null; publicado: number }> {
    const condicionesSiembra: string[] = ['s.id_parcela = ?', 's.id_producto = ?'];
    const parametrosSiembra: unknown[] = [idParcela, idProducto];

    if (ciclo) {
        condicionesSiembra.push('s.ciclo = ?');
        parametrosSiembra.push(ciclo);
    }

    const [producido] = await pool.query<RowDataPacket[]>(
        'SELECT COALESCE(SUM(s.produccion), 0) AS total ' +
            'FROM siembras s WHERE ' + condicionesSiembra.join(' AND '),
        parametrosSiembra
    );

    const produccion = num(producido[0]?.total);

    const condicionesPublicacion: string[] = [
        'pub.id_parcela = ?',
        'pub.id_producto = ?',
        "pub.estado IN ('disponible','vendido')"
    ];
    const parametrosPublicacion: unknown[] = [idParcela, idProducto];

    if (ciclo) {
        condicionesPublicacion.push('pub.ciclo = ?');
        parametrosPublicacion.push(ciclo);
    }

    const [publicado] = await pool.query<RowDataPacket[]>(
        'SELECT COALESCE(SUM(pub.cantidad), 0) AS total ' +
            'FROM publicaciones pub WHERE ' + condicionesPublicacion.join(' AND '),
        parametrosPublicacion
    );

    const yaPublicado = num(publicado[0]?.total);

    if (produccion <= 0) {
        return { disponible: null, publicado: yaPublicado };
    }

    return { disponible: redondear2(produccion - yaPublicado), publicado: yaPublicado };
}
