// Catalogos publicos: productos, canales, insumos, recetas y fuentes de precio.

import { Router } from 'express';
import db from '../db';
import { ErrorHttp } from '../middleware/errores';
import { validar } from '../middleware/validar';
import { idParams } from '../schemas/comunes';
import { queryInsumos } from '../schemas/catalogos';

const router = Router();

router.get('/', (_req, res) => {
    res.type('text/plain').send('Bienvenido a AgronoDigital');
});

router.get('/productos', (_req, res) => {
    const filas = db.prepare(
        'SELECT id_producto, nombre, unidad, tipo_producto, activo ' +
            'FROM productos WHERE activo = 1 ORDER BY nombre'
    ).all();

    res.json(filas);
});

router.get('/categorias-insumos', (_req, res) => {
    const filas = db.prepare(
        'SELECT id_categoria_insumo, nombre FROM categorias_insumos ORDER BY nombre'
    ).all();

    res.json(filas);
});

router.get('/insumos', validar(queryInsumos, 'query'), (_req, res) => {
    const q = (res.locals.query ?? {}) as { id_categoria_insumo?: number };

    const condiciones: string[] = ['i.activo = 1'];
    const parametros: (string | number)[] = [];

    if (q.id_categoria_insumo !== undefined) {
        condiciones.push('i.id_categoria_insumo = ?');
        parametros.push(q.id_categoria_insumo);
    }

    const filas = db.prepare(
        'SELECT i.id_insumo, i.id_categoria_insumo, c.nombre AS categoria, ' +
            'i.nombre, i.unidad_base, i.activo ' +
            'FROM insumos i ' +
            'JOIN categorias_insumos c ON c.id_categoria_insumo = i.id_categoria_insumo ' +
            'WHERE ' + condiciones.join(' AND ') +
            ' ORDER BY c.nombre, i.nombre'
    ).all(...parametros);

    res.json(filas);
});

router.get(
    '/productos/:id/requerimientos',
    validar(idParams, 'params'),
    (req, res) => {
        const { id } = req.params as unknown as { id: number };

        const filas = db.prepare(
            'SELECT r.id_requerimiento, r.id_producto, r.id_insumo, ' +
                'i.nombre AS insumo, i.unidad_base, r.cantidad_por_hectarea, ' +
                'r.etapa, r.es_ejemplo ' +
                'FROM requerimientos_cultivo r ' +
                'JOIN insumos i ON i.id_insumo = r.id_insumo ' +
                'WHERE r.id_producto = ? ORDER BY i.nombre'
        ).all(id);

        res.json(filas);
    }
);

router.get('/fuentes-precio', (_req, res) => {
    const filas = db.prepare(
        'SELECT f.id_fuente, f.institucion, f.titulo, f.fecha_publicacion, ' +
            'f.url, f.descargado_en, f.es_ejemplo, f.notas, ' +
            '(SELECT COUNT(*) FROM precios_insumos p WHERE p.id_fuente = f.id_fuente) AS precios ' +
            'FROM fuentes_precio f ' +
            'ORDER BY f.fecha_publicacion DESC, f.id_fuente DESC'
    ).all();

    res.json(filas);
});

router.get('/canales', (_req, res) => {
    const filas = db.prepare(
        'SELECT id_canal, nombre FROM canales_venta ORDER BY nombre'
    ).all();

    res.json(filas);
});

router.get('/canales/:id/productos', validar(idParams, 'params'), (req, res) => {
    const { id } = req.params as unknown as { id: number };

    const canal = db.prepare(
        'SELECT id_canal, nombre FROM canales_venta WHERE id_canal = ?'
    ).get(id) as { id_canal: number; nombre: string } | undefined;

    if (!canal) {
        throw new ErrorHttp(404, 'El canal de venta no existe');
    }

    const filas = db.prepare(
        'SELECT pr.id_producto, pr.nombre, pr.unidad, pr.tipo_producto ' +
            'FROM productos pr ' +
            'JOIN historial_precios h ON h.id_producto = pr.id_producto ' +
            'WHERE h.id_canal = ? AND pr.activo = 1 ' +
            'GROUP BY pr.id_producto, pr.nombre, pr.unidad, pr.tipo_producto ' +
            'ORDER BY pr.nombre'
    ).all(id);

    res.json(filas);
});

export default router;
