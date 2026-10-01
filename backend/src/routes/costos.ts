// routes/costos.ts
//
// GET /parcelas/:id/costos, POST /costos, PUT /costos/:id y DELETE /costos/:id.
//
// QUE CAMBIA
//
// 1. id_parcela se valida contra el usuario ANTES de insertar. Antes se mandaba
//    el id directo a la base y el costo quedaba colgado de una parcela ajena.
//
// 2. id_producto es opcional: sin el, el costo es general de la parcela.
//
// 3. PUT parcial con COALESCE, para que corregir el monto no borre la fecha.

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { queryCostos, crearCostoSchema, actualizarCostoSchema } from '../schemas/costos';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario, productoActivo } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

/** GET /parcelas/:id/costos[?id_producto=][?ciclo=][?es_fijo=] */
router.get(
    '/parcelas/:id/costos',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCostos, 'query'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const parcela = await parcelaDelUsuario(id, usuario.id);
        if (!parcela) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        const q = (res.locals.query ?? {}) as {
            id_producto?: number;
            ciclo?: string;
            es_fijo?: boolean;
        };

        const cond: string[] = ['t.id_parcela = ?'];
        const params: unknown[] = [id];

        if (q.id_producto !== undefined) {
            cond.push('t.id_producto = ?');
            params.push(q.id_producto);
        }
        if (q.ciclo !== undefined) {
            cond.push('t.ciclo = ?');
            params.push(q.ciclo);
        }
        if (q.es_fijo !== undefined) {
            cond.push('t.es_fijo = ?');
            params.push(q.es_fijo);
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT t.id_transaccion, t.id_parcela, t.id_producto, t.tipo_costo, ' +
                't.descripcion, t.monto, t.fecha, t.es_fijo, t.ciclo, ' +
                'pr.nombre AS producto ' +
                'FROM transacciones_costos t ' +
                'LEFT JOIN productos pr ON pr.id_producto = t.id_producto ' +
                'WHERE ' + cond.join(' AND ') +
                ' ORDER BY t.fecha DESC, t.id_transaccion DESC',
            params
        );

        res.json(filas);
    }
);

/**
 * POST /costos
 *
 * body: { id_parcela, tipo_costo, monto, fecha, id_producto?, descripcion?,
 *         es_fijo?, ciclo? }
 *
 * 201 { mensaje, id_costo }
 */
router.post('/costos', protegerRuta, validar(crearCostoSchema), async (req, res) => {
    const usuario = usuarioActual(res);

    const cuerpo = req.body as {
        id_parcela: number;
        id_producto?: number;
        tipo_costo: string;
        descripcion?: string | null;
        monto: number;
        fecha: string;
        es_fijo: boolean;
        ciclo: string;
    };

    const parcela = await parcelaDelUsuario(cuerpo.id_parcela, usuario.id);
    if (!parcela) {
        throw noEncontrado('La parcela no existe o no es tuya');
    }

    if (cuerpo.id_producto !== undefined) {
        const producto = await productoActivo(cuerpo.id_producto);
        if (!producto) {
            throw noEncontrado('El producto no existe o esta desactivado');
        }
    }

    const [creado] = await pool.query<ResultSetHeader>(
        'INSERT INTO transacciones_costos ' +
            '(id_parcela, id_producto, tipo_costo, descripcion, monto, fecha, es_fijo, ciclo) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            cuerpo.id_parcela,
            cuerpo.id_producto ?? null,
            cuerpo.tipo_costo,
            cuerpo.descripcion ?? null,
            cuerpo.monto,
            cuerpo.fecha,
            cuerpo.es_fijo,
            cuerpo.ciclo
        ]
    );

    res.status(201).json({
        mensaje: cuerpo.id_producto === undefined
            ? 'Costo general registrado'
            : 'Costo registrado',
        id_costo: creado.insertId
    });
});

/** PUT /costos/:id - parcial, con COALESCE para no pisar lo no mandado. */
router.put(
    '/costos/:id',
    protegerRuta,
    validar(idParams, 'params'),
    validar(actualizarCostoSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const cuerpo = req.body as Record<string, unknown>;

        // El UPDATE lleva id_usuario via JOIN con parcelas, asi que una fila de
        // otro usuario da affectedRows 0 y se responde 404 sin necesidad de una
        // consulta previa.
        const [resultado] = await pool.query<ResultSetHeader>(
            'UPDATE transacciones_costos t ' +
                'JOIN parcelas p ON p.id_parcela = t.id_parcela ' +
                'SET t.tipo_costo = COALESCE(?, t.tipo_costo), ' +
                't.descripcion = COALESCE(?, t.descripcion), ' +
                't.monto = COALESCE(?, t.monto), ' +
                't.fecha = COALESCE(?, t.fecha), ' +
                't.es_fijo = COALESCE(?, t.es_fijo), ' +
                't.ciclo = COALESCE(?, t.ciclo) ' +
                'WHERE t.id_transaccion = ? AND p.id_usuario = ?',
            [
                cuerpo.tipo_costo ?? null,
                cuerpo.descripcion ?? null,
                cuerpo.monto ?? null,
                cuerpo.fecha ?? null,
                cuerpo.es_fijo ?? null,
                cuerpo.ciclo ?? null,
                id,
                usuario.id
            ]
        );

        if (resultado.affectedRows === 0) {
            throw noEncontrado('Costo no encontrado o no es tuyo');
        }

        res.json({ mensaje: 'Costo actualizado' });
    }
);

/** DELETE /costos/:id */
router.delete(
    '/costos/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const [resultado] = await pool.query<ResultSetHeader>(
            'DELETE t FROM transacciones_costos t ' +
                'JOIN parcelas p ON p.id_parcela = t.id_parcela ' +
                'WHERE t.id_transaccion = ? AND p.id_usuario = ?',
            [id, usuario.id]
        );

        if (resultado.affectedRows === 0) {
            throw noEncontrado('Costo no encontrado o no es tuyo');
        }

        res.json({ mensaje: 'Costo eliminado' });
    }
);

export default router;