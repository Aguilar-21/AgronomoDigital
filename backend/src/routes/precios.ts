// Historial de precios de venta.

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { ErrorHttp } from '../middleware/errores';
import { queryPrecios, queryUltimoPrecio, crearPrecioSchema } from '../schemas/precios';
import { idParams, paginacion } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { productoActivo, canalExiste } from '../services/consultas';
import { num } from '../services/calculos';

const router = Router();

/**
 * GET /precios, paginado. Devuelve { precios, total, limit, offset }.
 * Cada fila trae precio_venta y, por ahora, el alias precio_venta_quintal.
 */
router.get('/precios', protegerRuta, validar(queryPrecios.extend(paginacion.shape), 'query'), async (req, res) => {
    const usuario = usuarioActual(res);
    void usuario;

    const q = (res.locals.query ?? {}) as {
        id_producto?: number;
        id_canal?: number;
        limit: number;
        offset: number;
    };

    const cond: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (q.id_producto !== undefined) {
        cond.push('id_producto = ?');
        params.push(q.id_producto);
    }
    if (q.id_canal !== undefined) {
        cond.push('id_canal = ?');
        params.push(q.id_canal);
    }

    const where = cond.join(' AND ');

    const [conteo] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM historial_precios WHERE ' + where,
        params
    );

    const total = Number(conteo[0]?.total ?? 0);

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT h.id_precio, h.id_producto, h.precio_venta, ' +
            'h.precio_venta AS precio_venta_quintal, ' +
            'h.id_canal, h.fecha, ' +
            'pr.nombre AS producto, pr.unidad, ca.nombre AS canal ' +
            'FROM historial_precios h ' +
            'LEFT JOIN productos pr ON pr.id_producto = h.id_producto ' +
            'LEFT JOIN canales_venta ca ON ca.id_canal = h.id_canal ' +
            'WHERE ' + where +
            ' ORDER BY h.fecha DESC, h.id_precio DESC' +
            ' LIMIT ? OFFSET ?',
        [...params, q.limit, q.offset]
    );

    res.json({
        precios: filas,
        total,
        limit: q.limit,
        offset: q.offset,
        aviso_deprecado:
            'precio_venta_quintal esta obsoleto: usara precio_venta. ' +
            'El alias se quita en una version futura.'
    });
});

/**
 * POST /precios. Acepta precio_venta y, mientras tanto, precio_venta_quintal
 * con un aviso. No es pública: muestra márgenes del negocio.
 */
router.post('/precios', protegerRuta, validar(crearPrecioSchema), async (req, res) => {
    const cuerpo = req.body as {
        id_producto: number | null;
        id_canal: number | null;
        fecha: string;
        precio_venta: number;
        nombreViejoUsado: boolean;
    };

    if (cuerpo.id_producto !== null) {
        const producto = await productoActivo(cuerpo.id_producto);
        if (!producto) {
            throw new ErrorHttp(404, 'El producto no existe o esta desactivado');
        }
    }

    if (cuerpo.id_canal !== null) {
        const existe = await canalExiste(cuerpo.id_canal);
        if (!existe) {
            throw new ErrorHttp(404, 'El canal de venta no existe');
        }
    }

    const [creado] = await pool.query<ResultSetHeader>(
        'INSERT INTO historial_precios (id_producto, id_canal, precio_venta, fecha) ' +
            'VALUES (?, ?, ?, ?)',
        [cuerpo.id_producto, cuerpo.id_canal, cuerpo.precio_venta, cuerpo.fecha]
    );

    const respuesta: Record<string, unknown> = {
        mensaje: 'Precio registrado',
        id_precio: creado.insertId,
        precio_venta: cuerpo.precio_venta,
        precio_venta_quintal: cuerpo.precio_venta
    };

    if (cuerpo.nombreViejoUsado) {
        respuesta.aviso_deprecado =
            'Se guardo con el campo viejo precio_venta_quintal. ' +
            'Usa precio_venta: el nombre quintal no aplica a todos los productos.';
    }

    res.status(201).json(respuesta);
});

/** GET /precios/ultimo, el último precio de ese producto y canal. */
router.get(
    '/precios/ultimo',
    protegerRuta,
    validar(queryUltimoPrecio, 'query'),
    async (req, res) => {
        const q = (res.locals.query ?? {}) as {
            id_producto: number;
            id_canal?: number;
        };

        const cond: string[] = ['id_producto = ?'];
        const params: unknown[] = [q.id_producto];

        if (q.id_canal !== undefined) {
            cond.push('id_canal = ?');
            params.push(q.id_canal);
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT id_precio, precio_venta, id_canal, fecha ' +
                'FROM historial_precios WHERE ' + cond.join(' AND ') +
                ' ORDER BY fecha DESC, id_precio DESC LIMIT 1',
            params
        );

        if (filas.length === 0) {
            res.json({
                precio_venta: null,
                mensaje: 'Ese producto todavia no tiene precio registrado'
            });
            return;
        }

        const f = filas[0];

        res.json({
            precio_venta: num(f.precio_venta),
            precio_venta_quintal: num(f.precio_venta),
            id_canal: f.id_canal,
            fecha: f.fecha
        });
    }
);

/**
 * DELETE /precios/:id. Cualquier usuario puede borrar un precio porque el
 * historial es global y no lleva id_usuario. Para restringirlo habría que
 * agregar esa columna y filtrar acá.
 */
router.delete(
    '/precios/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };

        const [resultado] = await pool.query<ResultSetHeader>(
            'DELETE FROM historial_precios WHERE id_precio = ?',
            [id]
        );

        if (resultado.affectedRows === 0) {
            throw new ErrorHttp(404, 'Precio no encontrado');
        }

        res.json({ mensaje: 'Precio eliminado' });
    }
);

export default router;
