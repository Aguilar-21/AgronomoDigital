import db from '../db';
import { num, redondear2 } from './calculos';

export interface FilaParcela {
    id_parcela: number;
    id_usuario: number;
    nombre_parcela: string;
    ubicacion: string | null;
    tamano: string | null;
    unidad_superficie: 'hectarea' | 'manzana';
}

export interface FilaProducto {
    id_producto: number;
    nombre: string;
    unidad: string;
    tipo_producto: string;
    activo?: number;
}

export async function parcelaDelUsuario(
    idParcela: number,
    idUsuario: number
): Promise<FilaParcela | null> {
    const fila = db.prepare(
        'SELECT id_parcela, id_usuario, nombre_parcela, ubicacion, tamano, ' +
            'unidad_superficie ' +
            'FROM parcelas WHERE id_parcela = ? AND id_usuario = ?'
    ).get(idParcela, idUsuario) as FilaParcela | undefined;
    return fila ?? null;
}

export async function productoActivo(
    idProducto: number
): Promise<FilaProducto | null> {
    const fila = db.prepare(
        'SELECT id_producto, nombre, unidad, tipo_producto FROM productos ' +
            'WHERE id_producto = ? AND activo = 1'
    ).get(idProducto) as FilaProducto | undefined;
    return fila ?? null;
}

export async function canalExiste(idCanal: number): Promise<boolean> {
    const fila = db.prepare(
        'SELECT id_canal FROM canales_venta WHERE id_canal = ?'
    ).get(idCanal);
    return !!fila;
}

export async function disponibleParaPublicar(
    idParcela: number,
    idProducto: number,
    ciclo: string | null
): Promise<{ disponible: number | null; publicado: number }> {
    const condicionesSiembra: string[] = ['s.id_parcela = ?', 's.id_producto = ?'];
    const parametrosSiembra: (string | number)[] = [idParcela, idProducto];

    if (ciclo) {
        condicionesSiembra.push('s.ciclo = ?');
        parametrosSiembra.push(ciclo);
    }

    const producido = db.prepare(
        'SELECT COALESCE(SUM(s.produccion), 0) AS total ' +
            'FROM siembras s WHERE ' + condicionesSiembra.join(' AND ')
    ).get(...parametrosSiembra) as { total: number };

    const produccion = num(producido?.total);

    const condicionesPublicacion: string[] = [
        'pub.id_parcela = ?',
        'pub.id_producto = ?',
        "pub.estado IN ('disponible','vendido')"
    ];
    const parametrosPublicacion: (string | number)[] = [idParcela, idProducto];

    if (ciclo) {
        condicionesPublicacion.push('pub.ciclo = ?');
        parametrosPublicacion.push(ciclo);
    }

    const publicado = db.prepare(
        'SELECT COALESCE(SUM(pub.cantidad), 0) AS total ' +
            'FROM publicaciones pub WHERE ' + condicionesPublicacion.join(' AND ')
    ).get(...parametrosPublicacion) as { total: number };

    const yaPublicado = num(publicado?.total);

    if (produccion <= 0) {
        return { disponible: null, publicado: yaPublicado };
    }

    return { disponible: redondear2(produccion - yaPublicado), publicado: yaPublicado };
}
