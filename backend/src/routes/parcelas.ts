import { Router } from 'express';
import db from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearParcelaSchema, actualizarParcelaSchema } from '../schemas/parcelas';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

router.get('/parcelas', protegerRuta, (req, res) => {
    const usuario = usuarioActual(res);

    const filas = db.prepare(
        'SELECT id_parcela, nombre_parcela, ubicacion, tamano, unidad_superficie ' +
            'FROM parcelas WHERE id_usuario = ? ORDER BY id_parcela'
    ).all(usuario.id);

    res.json(filas);
});

router.post('/parcelas', protegerRuta, validar(crearParcelaSchema), (req, res) => {
    const usuario = usuarioActual(res);

    const { nombre_parcela, ubicacion, tamano, unidad_superficie } = req.body as {
        nombre_parcela: string;
        ubicacion?: string | null;
        tamano?: number | null;
        unidad_superficie: 'hectarea' | 'manzana';
    };

    const result = db.prepare(
        'INSERT INTO parcelas (id_usuario, nombre_parcela, ubicacion, tamano, unidad_superficie) ' +
            'VALUES (?, ?, ?, ?, ?)'
    ).run(usuario.id, nombre_parcela, ubicacion ?? null, tamano ?? null, unidad_superficie);

    res.status(201).json({
        mensaje: 'Parcela creada',
        id_parcela: result.lastInsertRowid
    });
});

router.put(
    '/parcelas/:id',
    protegerRuta,
    validar(idParams, 'params'),
    validar(actualizarParcelaSchema),
    (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const cuerpo = req.body as Record<string, unknown>;

        const result = db.prepare(
            'UPDATE parcelas SET ' +
                'nombre_parcela = COALESCE(?, nombre_parcela), ' +
                'ubicacion = COALESCE(?, ubicacion), ' +
                'tamano = COALESCE(?, tamano), ' +
                'unidad_superficie = COALESCE(?, unidad_superficie) ' +
                'WHERE id_parcela = ? AND id_usuario = ?'
        ).run(
            cuerpo.nombre_parcela ?? null,
            cuerpo.ubicacion ?? null,
            cuerpo.tamano ?? null,
            cuerpo.unidad_superficie ?? null,
            id,
            usuario.id
        );

        if (result.changes === 0) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        res.json({ mensaje: 'Parcela actualizada' });
    }
);

router.delete(
    '/parcelas/:id',
    protegerRuta,
    validar(idParams, 'params'),
    (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const result = db.prepare(
            'DELETE FROM parcelas WHERE id_parcela = ? AND id_usuario = ?'
        ).run(id, usuario.id);

        if (result.changes === 0) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        res.json({ mensaje: 'Parcela eliminada' });
    }
);

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
