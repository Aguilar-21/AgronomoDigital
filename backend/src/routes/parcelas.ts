// CRUD de parcelas. Una parcela es el terreno; los cultivos que tiene encima

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearParcelaSchema, actualizarParcelaSchema } from '../schemas/parcelas';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

/** GET /parcelas: parcelas del usuario. */
router.get('/parcelas', protegerRuta, async (_req, res) => {
    const usuario = usuarioActual(res);

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_parcela, nombre_parcela, ubicacion, tamano, unidad_superficie ' +
            'FROM parcelas WHERE id_usuario = ? ORDER BY id_parcela',
        [usuario.id]
    );

    res.json(filas);
});

/** POST /parcelas */
router.post('/parcelas', protegerRuta, validar(crearParcelaSchema), async (req, res) => {
    const usuario = usuarioActual(res);

    const { nombre_parcela, ubicacion, tamano, unidad_superficie } = req.body as {
        nombre_parcela: string;
        ubicacion?: string | null;
        tamano?: number | null;
        unidad_superficie: 'hectarea' | 'manzana';
    };

    const [creada] = await pool.query<ResultSetHeader>(
        'INSERT INTO parcelas (id_usuario, nombre_parcela, ubicacion, tamano, unidad_superficie) ' +
            'VALUES (?, ?, ?, ?, ?)',
        [usuario.id, nombre_parcela, ubicacion ?? null, tamano ?? null, unidad_superficie]
    );

    res.status(201).json({
        mensaje: 'Parcela creada',
        id_parcela: creada.insertId
    });
});

/**
 * PUT /parcelas/:id
 *
 * Solo actualiza los campos que vienen. COALESCE(NULL, valor_guardado) deja
 * intacto lo que el cliente no mando.
 */
router.put(
    '/parcelas/:id',
    protegerRuta,
    validar(idParams, 'params'),
    validar(actualizarParcelaSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const cuerpo = req.body as Record<string, unknown>;

        const [resultado] = await pool.query<ResultSetHeader>(
            'UPDATE parcelas SET ' +
                'nombre_parcela = COALESCE(?, nombre_parcela), ' +
                'ubicacion = COALESCE(?, ubicacion), ' +
                'tamano = COALESCE(?, tamano), ' +
                'unidad_superficie = COALESCE(?, unidad_superficie) ' +
                'WHERE id_parcela = ? AND id_usuario = ?',
            [
                cuerpo.nombre_parcela ?? null,
                cuerpo.ubicacion ?? null,
                cuerpo.tamano ?? null,
                cuerpo.unidad_superficie ?? null,
                id,
                usuario.id
            ]
        );

        if (resultado.affectedRows === 0) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        res.json({ mensaje: 'Parcela actualizada' });
    }
);

/**
 * DELETE /parcelas/:id
 *
 * Las siembras se van en cascada. Las publicaciones quedan con id_parcela en
 * NULL porque su FK usa ON DELETE SET NULL.
 */
router.delete(
    '/parcelas/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const [resultado] = await pool.query<ResultSetHeader>(
            'DELETE FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
            [id, usuario.id]
        );

        if (resultado.affectedRows === 0) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        res.json({ mensaje: 'Parcela eliminada' });
    }
);

/** GET /parcelas/:id */
router.get(
    '/parcelas/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const parcela = await parcelaDelUsuario(id, usuario.id);

        if (!parcela) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        res.json(parcela);
    }
);

export default router;
