// routes/precios.ts
//
// GET y POST de /precios.
//
// QUE CAMBIA
//
// 1. precio_venta_quintal paso a precio_venta. El nombre viejo mentia: hay 14
//    productos en 6 unidades y el valor siempre fue el precio de LA UNIDAD.
//
// 2. Durante la transicion se aceptan los dos nombres al escribir, y el viejo
//    sigue saliendo en la respuesta como alias. Asi el frontend viejo no se
//    rompe y ademas la respuesta trae aviso_deprecado para que se sepa que hay
//    que migrar.
//
// 3. GET /precios es paginado. El historial es la tabla que mas crece.

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
 * GET /precios[?id_producto=][?id_canal=][?limit=][?offset=]
 *
 * Devuelve { precios, total, limit, offset }.
 *
 * Cada fila trae precio_venta y tambien precio_venta_quintal con el mismo
 * valor. Es duplicado a proposito: si el frontend viejo lee el campo viejo, sigue
 * funcionando sin cambiar una linea. Cuando el frontend se actualice, el alias se
 * borra de aqui.
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
 * POST /precios
 *
 * body: { id_producto, precio_venta, fecha, id_canal? }
 *   o:  { id_producto, precio_venta_quintal, fecha, id_canal? }   (transicion)
 *
 * 201 { mensaje, id_precio, precio_venta }
 *
 * /precios NO es publica: los precios de venta son informacion del negocio y
 * exponerla a cualquiera seria mostrarle a un competidor el margen.
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

/**
 * GET /precios/ultimo?id_producto=&id_canal=
 *
 * Ruta nueva. Devuelve solo el ultimo precio, que es lo que necesita la pantalla
 * de punto de equilibrio. Antes habia que bajar el historial completo y tomar el
 * primero, gastando un LIMIT de mas y cargando todo en memoria.
 */
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
 * DELETE /precios/:id
 *
 * OJO CON ESTA RUTA: es la unica del sistema donde un usuario puede borrar un
 * registro que creo otro, porque el historial de precios es global y no lleva
 * id_usuario. No es un descuido, es una decision: el precio es un dato de
 * referencia publico y corregir un precio mal cargado vale mas que la
 * trazabilidad de quien lo cargo.
 *
 * Si alguna vez hay que restringirlo, se agrega id_usuario a historial_precios y
 * el DELETE lleva el filtro. Ver la seccion "Lo que falta" del README.
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