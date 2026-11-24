// Calculo y almacenamiento de las estimaciones de costo de insumos.

import pool from '../db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ErrorHttp } from '../middleware/errores';
import { aHectareas, type UnidadSuperficie } from '../config/constantes';
import { num, redondear2, redondear4 } from './calculos';

interface FilaReceta extends RowDataPacket {
    id_insumo: number;
    insumo: string;
    unidad_base: string;
    cantidad_por_hectarea: string;
    es_ejemplo: number;
}

interface FilaPrecio extends RowDataPacket {
    id_insumo: number;
    precio_unitario: string;
}

interface FilaFuente extends RowDataPacket {
    id_fuente: number;
    institucion: string;
    es_ejemplo: number;
}

export interface LineaEstimacion {
    id_insumo: number;
    insumo: string;
    unidad_base: string;
    cantidad_por_hectarea: number;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
}

export interface ResultadoEstimacion {
    id_estimacion: number;
    id_producto: number;
    id_parcela: number | null;
    id_fuente: number;
    fuente: string;
    superficie: number;
    unidad_superficie: UnidadSuperficie;
    superficie_ha: number;
    total_estimado: number;
    moneda: string;
    alcance: 'solo_insumos';
    advertencia: string;
    datos_ejemplo: boolean;
    calculado_en: string;
    detalle: LineaEstimacion[];
}

interface DatosEstimacion {
    idUsuario: number;
    idProducto: number;
    idParcela: number | null;
    idFuente: number;
    superficie: number;
    unidadSuperficie: UnidadSuperficie;
}

/**
 * Precio vigente de cada insumo en una fuente.
 *
 * Si hay varias filas vigentes para el mismo insumo gana la de vigente_desde
 * mas reciente. Se resuelve con el ORDER BY y el primer valor que aparece por
 * insumo, sin subconsultas.
 */
async function preciosVigentes(
    idFuente: number,
    idsInsumos: number[]
): Promise<Map<number, number>> {
    if (idsInsumos.length === 0) return new Map();

    const marcadores = idsInsumos.map(() => '?').join(', ');

    const [filas] = await pool.query<FilaPrecio[]>(
        'SELECT id_insumo, precio_unitario FROM precios_insumos ' +
            'WHERE id_fuente = ? ' +
            'AND vigente_desde <= CURDATE() ' +
            'AND (vigente_hasta IS NULL OR vigente_hasta >= CURDATE()) ' +
            'AND id_insumo IN (' + marcadores + ') ' +
            'ORDER BY id_insumo, vigente_desde DESC',
        [idFuente, ...idsInsumos]
    );

    const precios = new Map<number, number>();
    for (const fila of filas) {
        const id = Number(fila.id_insumo);
        if (!precios.has(id)) {
            precios.set(id, num(fila.precio_unitario));
        }
    }
    return precios;
}

/** Calcula la estimacion, la guarda con su detalle y la devuelve completa. */
export async function crearEstimacion(
    datos: DatosEstimacion
): Promise<ResultadoEstimacion> {
    const [fuentes] = await pool.query<FilaFuente[]>(
        'SELECT id_fuente, institucion, es_ejemplo FROM fuentes_precio WHERE id_fuente = ?',
        [datos.idFuente]
    );

    if (fuentes.length === 0) {
        throw new ErrorHttp(404, 'La fuente de precios no existe');
    }

    const [receta] = await pool.query<FilaReceta[]>(
        'SELECT r.id_insumo, i.nombre AS insumo, i.unidad_base, ' +
            'r.cantidad_por_hectarea, r.es_ejemplo ' +
            'FROM requerimientos_cultivo r ' +
            'JOIN insumos i ON i.id_insumo = r.id_insumo ' +
            'WHERE r.id_producto = ? AND i.activo = 1 ' +
            'ORDER BY i.nombre',
        [datos.idProducto]
    );

    if (receta.length === 0) {
        throw new ErrorHttp(
            409,
            'No hay dosis registradas para ese cultivo. No se puede estimar el costo de insumos.'
        );
    }

    const idsInsumos = receta.map((r) => Number(r.id_insumo));
    const precios = await preciosVigentes(datos.idFuente, idsInsumos);

    const sinPrecio = receta
        .filter((r) => !precios.has(Number(r.id_insumo)))
        .map((r) => String(r.insumo));

    if (sinPrecio.length > 0) {
        throw new ErrorHttp(
            409,
            'La fuente de precios no tiene un precio vigente para: ' + sinPrecio.join(', ')
        );
    }

    const superficieHa = redondear4(aHectareas(datos.superficie, datos.unidadSuperficie));

    const detalle: LineaEstimacion[] = receta.map((fila) => {
        const idInsumo = Number(fila.id_insumo);
        const dosis = num(fila.cantidad_por_hectarea);
        const cantidad = redondear4(dosis * superficieHa);
        const precio = precios.get(idInsumo) ?? 0;

        return {
            id_insumo: idInsumo,
            insumo: String(fila.insumo),
            unidad_base: String(fila.unidad_base),
            cantidad_por_hectarea: dosis,
            cantidad,
            precio_unitario: precio,
            subtotal: redondear2(cantidad * precio)
        };
    });

    const total = redondear2(detalle.reduce((suma, linea) => suma + linea.subtotal, 0));
    const datosEjemplo =
        Number(fuentes[0].es_ejemplo) === 1 ||
        receta.some((fila) => Number(fila.es_ejemplo) === 1);

    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        const [cabecera] = await conexion.query<ResultSetHeader>(
            'INSERT INTO estimaciones ' +
                '(id_usuario, id_producto, id_parcela, id_fuente, superficie, ' +
                ' unidad_superficie, superficie_ha, total_estimado, alcance) ' +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'solo_insumos')",
            [
                datos.idUsuario,
                datos.idProducto,
                datos.idParcela,
                datos.idFuente,
                datos.superficie,
                datos.unidadSuperficie,
                superficieHa,
                total
            ]
        );

        const idEstimacion = cabecera.insertId;
        const fila = '(?, ?, ?, ?, ?, ?)';
        const valores = detalle.flatMap((linea) => [
            idEstimacion,
            linea.id_insumo,
            linea.unidad_base,
            linea.cantidad,
            linea.precio_unitario,
            linea.subtotal
        ]);

        await conexion.query(
            'INSERT INTO estimaciones_detalle ' +
                '(id_estimacion, id_insumo, unidad_base, cantidad, precio_unitario, subtotal) ' +
                'VALUES ' + detalle.map(() => fila).join(', '),
            valores
        );

        const [fecha] = await conexion.query<RowDataPacket[]>(
            'SELECT calculado_en FROM estimaciones WHERE id_estimacion = ?',
            [idEstimacion]
        );

        await conexion.commit();

        const advertencia =
            'El total cubre solo insumos. No incluye mano de obra, maquinaria ni otros gastos.';

        return {
            id_estimacion: idEstimacion,
            id_producto: datos.idProducto,
            id_parcela: datos.idParcela,
            id_fuente: datos.idFuente,
            fuente: String(fuentes[0].institucion),
            superficie: datos.superficie,
            unidad_superficie: datos.unidadSuperficie,
            superficie_ha: superficieHa,
            total_estimado: total,
            moneda: 'USD',
            alcance: 'solo_insumos',
            advertencia: datosEjemplo
                ? advertencia + ' Los precios y las dosis usados son de ejemplo, no oficiales.'
                : advertencia,
            datos_ejemplo: datosEjemplo,
            calculado_en: new Date(fecha[0].calculado_en as string | Date).toISOString(),
            detalle
        };
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

/** Historial de estimaciones del usuario, de la mas reciente a la mas vieja. */
export async function listarEstimaciones(
    idUsuario: number,
    limit: number,
    offset: number
): Promise<{ estimaciones: RowDataPacket[]; total: number }> {
    const [conteo] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM estimaciones WHERE id_usuario = ?',
        [idUsuario]
    );

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT e.id_estimacion, e.id_producto, pr.nombre AS producto, ' +
            'e.id_parcela, e.superficie, e.unidad_superficie, e.superficie_ha, ' +
            'e.total_estimado, e.id_fuente, f.institucion AS fuente, ' +
            'f.es_ejemplo AS datos_ejemplo, e.alcance, e.calculado_en ' +
            'FROM estimaciones e ' +
            'JOIN productos pr ON pr.id_producto = e.id_producto ' +
            'JOIN fuentes_precio f ON f.id_fuente = e.id_fuente ' +
            'WHERE e.id_usuario = ? ' +
            'ORDER BY e.calculado_en DESC, e.id_estimacion DESC ' +
            'LIMIT ? OFFSET ?',
        [idUsuario, limit, offset]
    );

    return { estimaciones: filas, total: Number(conteo[0]?.total ?? 0) };
}

/** Una estimacion con su desglose, solo si es del usuario. */
export async function obtenerEstimacion(
    idEstimacion: number,
    idUsuario: number
): Promise<{ estimacion: RowDataPacket; detalle: RowDataPacket[] } | null> {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT e.id_estimacion, e.id_producto, pr.nombre AS producto, ' +
            'e.id_parcela, e.superficie, e.unidad_superficie, e.superficie_ha, ' +
            'e.total_estimado, e.id_fuente, f.institucion AS fuente, ' +
            'f.es_ejemplo AS datos_ejemplo, e.alcance, e.calculado_en ' +
            'FROM estimaciones e ' +
            'JOIN productos pr ON pr.id_producto = e.id_producto ' +
            'JOIN fuentes_precio f ON f.id_fuente = e.id_fuente ' +
            'WHERE e.id_estimacion = ? AND e.id_usuario = ?',
        [idEstimacion, idUsuario]
    );

    if (filas.length === 0) return null;

    const [detalle] = await pool.query<RowDataPacket[]>(
        'SELECT d.id_insumo, i.nombre AS insumo, d.unidad_base, d.cantidad, ' +
            'd.precio_unitario, d.subtotal ' +
            'FROM estimaciones_detalle d ' +
            'JOIN insumos i ON i.id_insumo = d.id_insumo ' +
            'WHERE d.id_estimacion = ? ORDER BY i.nombre',
        [idEstimacion]
    );

    return { estimacion: filas[0], detalle };
}
