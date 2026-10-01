// routes/catalogos.ts
//
// GET /productos, /categorias-costos, /canales y /canales/:id/productos.
//
// QUE CAMBIA
//
// Casi nada en el comportamiento: estas rutas ya funcionaban. Lo que cambio es
// que ahora viven en su propio archivo y no se mezclan con las de negocio.
//
// Se mantienen publicas (sin token) a proposito: el formulario de registro y la
// pantalla de login necesitan la lista de productos para mostrar nombres, y no
// tiene sentido pedirle a alguien que se registre para ver un catalogo que no
// cambia.

import { Router } from 'express';
import type { RowDataPacket } from 'mysql2';
import pool from '../db';
import { ErrorHttp } from '../middleware/errores';
import { validar } from '../middleware/validar';
import { queryCategorias } from '../schemas/consultas';
import { idParams } from '../schemas/comunes';

const router = Router();

/**
 * GET /
 *
 * Comprobacion de vida sin depender de la base. Es la primera peticion que hace
 * cualquiera al abrir la API, y por eso NO consulta MySQL: tiene que responder
 * aunque la base este caida, que es justo cuando mas hace falta saber que el
 * servidor esta vivo.
 *
 * Para el estado real de la base esta GET /health, en app.ts.
 *
 * El texto es texto plano, no JSON, a proposito: es una respuesta para humanos y
 * para curl, no para el frontend.
 */
router.get('/', (_req, res) => {
    res.type('text/plain').send('Bienvenido a AgronoDigital');
});

/**
 * GET /productos
 *
 * Solo productos activos (activo = 1). Los dados de baja no se ofrecen para
 * vender, pero sus costos y su produccion historica se conservan.
 */
router.get('/productos', async (_req, res) => {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_producto, nombre, unidad, tipo_producto, activo ' +
            'FROM productos WHERE activo = 1 ORDER BY nombre'
    );

    res.json(filas);
});

/**
 * GET /categorias-costos?tipo=granos
 *
 * ?tipo es obligatorio y validado. Antes un tipo vacio devolvia la lista vacia
 * sin decir por que; ahora el error dice "falta el parametro ?tipo=".
 */
router.get('/categorias-costos', validar(queryCategorias, 'query'), async (req, res) => {
    const { tipo } = (res.locals.query ?? {}) as { tipo: string };

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_categoria, nombre, tipo_producto FROM categorias_costos ' +
            'WHERE tipo_producto = ? ORDER BY nombre',
        [tipo]
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

/**
 * GET /canales/:id/productos
 *
 * Que productos se venden por que canal. Antes cada precio traia el nombre del
 * canal y habia que filtrar en el frontend; esto lo resuelve la base.
 */
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