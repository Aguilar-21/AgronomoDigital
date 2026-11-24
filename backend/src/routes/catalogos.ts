// routes/catalogos.ts
//
// Catalogos publicos: productos, canales, insumos, recetas y fuentes de precio.
// No piden token porque son listas que no cambian y el formulario de registro
// las necesita antes de iniciar sesion.

import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import pool from '../db';
import { ErrorHttp } from '../middleware/errores';
import { validar } from '../middleware/validar';
import { idParams } from '../schemas/comunes';
import { queryInsumos } from '../schemas/catalogos';

const router = Router();

/** GET /: comprobacion de vida, sin tocar la base. */
router.get('/', (_req, res) => {
    res.type('text/plain').send('Bienvenido a AgronoDigital');
});

/** GET /productos: solo los activos. */
router.get('/productos', async (_req, res) => {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_producto, nombre, unidad, tipo_producto, activo ' +
            'FROM productos WHERE activo = 1 ORDER BY nombre'
    );

    res.json(filas);
});

/** GET /categorias-insumos */
router.get('/categorias-insumos', async (_req, res) => {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_categoria_insumo, nombre FROM categorias_insumos ORDER BY nombre'
    );

    res.json(filas);
});

/** GET /insumos[?id_categoria_insumo=] */
router.get('/insumos', validar(queryInsumos, 'query'), async (_req, res) => {
    const q = (res.locals.query ?? {}) as { id_categoria_insumo?: number };

    const condiciones: string[] = ['i.activo = 1'];
    const parametros: unknown[] = [];

    if (q.id_categoria_insumo !== undefined) {
        condiciones.push('i.id_categoria_insumo = ?');
        parametros.push(q.id_categoria_insumo);
    }

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT i.id_insumo, i.id_categoria_insumo, c.nombre AS categoria, ' +
            'i.nombre, i.unidad_base, i.activo ' +
            'FROM insumos i ' +
            'JOIN categorias_insumos c ON c.id_categoria_insumo = i.id_categoria_insumo ' +
            'WHERE ' + condiciones.join(' AND ') +
            ' ORDER BY c.nombre, i.nombre',
        parametros
    );

    res.json(filas);
});

/**
 * GET /productos/:id/requerimientos
 *
 * La receta del cultivo: que insumos lleva y cuanto de cada uno por hectarea.
 * Un cultivo sin receta devuelve una lista vacia; la estimacion es la que
 * responde 409.
 */
router.get(
    '/productos/:id/requerimientos',
    validar(idParams, 'params'),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT r.id_requerimiento, r.id_producto, r.id_insumo, ' +
                'i.nombre AS insumo, i.unidad_base, r.cantidad_por_hectarea, ' +
                'r.etapa, r.es_ejemplo ' +
                'FROM requerimientos_cultivo r ' +
                'JOIN insumos i ON i.id_insumo = r.id_insumo ' +
                'WHERE r.id_producto = ? ORDER BY i.nombre',
            [id]
        );

        res.json(filas);
    }
);

/** GET /fuentes-precio: documentos cargados, con cuantos precios trae cada uno. */
router.get('/fuentes-precio', async (_req, res) => {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT f.id_fuente, f.institucion, f.titulo, f.fecha_publicacion, ' +
            'f.url, f.descargado_en, f.es_ejemplo, f.notas, ' +
            '(SELECT COUNT(*) FROM precios_insumos p WHERE p.id_fuente = f.id_fuente) AS precios ' +
            'FROM fuentes_precio f ' +
            'ORDER BY f.fecha_publicacion DESC, f.id_fuente DESC'
    );

    res.json(filas);
});

/** GET /canales */
router.get('/canales', async (_req, res) => {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_canal, nombre FROM canales_venta ORDER BY nombre'
    );

    res.json(filas);
});

/** GET /canales/:id/productos: productos con precio registrado en ese canal. */
router.get('/canales/:id/productos', validar(idParams, 'params'), async (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const [canal] = await pool.query<RowDataPacket[]>(
        'SELECT id_canal, nombre FROM canales_venta WHERE id_canal = ?',
        [id]
    );

    if (canal.length === 0) {
        throw new ErrorHttp(404, 'El canal de venta no existe');
    }

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT pr.id_producto, pr.nombre, pr.unidad, pr.tipo_producto ' +
            'FROM productos pr ' +
            'JOIN historial_precios h ON h.id_producto = pr.id_producto ' +
            'WHERE h.id_canal = ? AND pr.activo = 1 ' +
            'GROUP BY pr.id_producto, pr.nombre, pr.unidad, pr.tipo_producto ' +
            'ORDER BY pr.nombre',
        [id]
    );

    res.json(filas);
});

export default router;
