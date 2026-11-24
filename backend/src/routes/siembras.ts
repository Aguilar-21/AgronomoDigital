// GET, POST y DELETE de las siembras de una parcela.

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearSiembraSchema, querySiembras } from '../schemas/siembras';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario, productoActivo } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

/**
 * GET /parcelas/:id/siembras[?id_producto=][?ciclo=]
 *
 * Devuelve producto y unidad ya resueltos para que el frontend no tenga que
 * cruzarlos con GET /productos.
 */
router.get(
    '/parcelas/:id/siembras',
    protegerRuta,
    validar(idParams, 'params'),
    validar(querySiembras, 'query'),
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
        };

        const condiciones: string[] = ['s.id_parcela = ?'];
        const parametros: unknown[] = [id];

        if (q.id_producto !== undefined) {
            condiciones.push('s.id_producto = ?');
            parametros.push(q.id_producto);
        }
        if (q.ciclo !== undefined) {
            condiciones.push('s.ciclo = ?');
            parametros.push(q.ciclo);
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT s.id_siembra, s.id_parcela, s.id_producto, s.ciclo, ' +
                's.superficie, s.unidad_superficie, s.fecha_siembra, ' +
                's.produccion, s.fecha_registro, ' +
                'pr.nombre AS producto, pr.unidad, pr.tipo_producto ' +
                'FROM siembras s ' +
                'JOIN productos pr ON pr.id_producto = s.id_producto ' +
                'WHERE ' + condiciones.join(' AND ') +
                ' ORDER BY pr.nombre, s.ciclo',
            parametros
        );

        res.json(filas);
    }
);

/**
 * POST /parcelas/:id/siembras
 *
 * body: { id_producto, produccion, ciclo?, superficie?, unidad_superficie? }
 *
 * Si ya existe una siembra con la misma parcela, producto y ciclo, se
 * actualiza. Es lo que espera un formulario cuando el usuario corrige un dato.
 */
router.post(
    '/parcelas/:id/siembras',
    protegerRuta,
    validar(idParams, 'params'),
    validar(crearSiembraSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const parcela = await parcelaDelUsuario(id, usuario.id);
        if (!parcela) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        const { id_producto, produccion, ciclo, superficie, unidad_superficie } = req.body as {
            id_producto: number;
            produccion: number;
            ciclo: string;
            superficie?: number;
            unidad_superficie: 'hectarea' | 'manzana';
        };

        const producto = await productoActivo(id_producto);
        if (!producto) {
            throw noEncontrado('El producto no existe o esta desactivado');
        }

        const [resultado] = await pool.query<ResultSetHeader>(
            'INSERT INTO siembras ' +
                '(id_parcela, id_producto, ciclo, superficie, unidad_superficie, ' +
                ' produccion, fecha_siembra) ' +
                'VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE) ' +
                'ON DUPLICATE KEY UPDATE ' +
                'produccion = VALUES(produccion), ' +
                'superficie = COALESCE(VALUES(superficie), superficie), ' +
                'unidad_superficie = IF(VALUES(superficie) IS NULL, unidad_superficie, VALUES(unidad_superficie))',
            [id, id_producto, ciclo, superficie ?? null, unidad_superficie, produccion]
        );

        const creada = resultado.affectedRows === 1;

        res.status(creada ? 201 : 200).json({
            mensaje: creada ? 'Siembra registrada' : 'Siembra actualizada',
            id_siembra: resultado.insertId || null,
            id_producto,
            unidad: producto.unidad,
            ciclo,
            superficie: superficie ?? null,
            unidad_superficie
        });
    }
);

/**
 * DELETE /siembras/:id
 *
 * Primero se comprueba que la parcela de esa siembra sea del usuario. El
 * DELETE no lleva el id_usuario porque la tabla no lo tiene.
 */
router.delete('/siembras/:id', protegerRuta, validar(idParams, 'params'), async (req, res) => {
    const usuario = usuarioActual(res);
    const { id } = req.params as unknown as { id: number };

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT s.id_siembra FROM siembras s ' +
            'JOIN parcelas p ON p.id_parcela = s.id_parcela ' +
            'WHERE s.id_siembra = ? AND p.id_usuario = ?',
        [id, usuario.id]
    );

    if (filas.length === 0) {
        throw noEncontrado('Siembra no encontrada o no es tuya');
    }

    await pool.query('DELETE FROM siembras WHERE id_siembra = ?', [id]);

    res.json({ mensaje: 'Siembra eliminada' });
});

export default router;
