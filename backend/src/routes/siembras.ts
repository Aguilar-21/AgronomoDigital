import { Router } from 'express';
import db from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearSiembraSchema, querySiembras } from '../schemas/siembras';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario, productoActivo } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

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
        const parametros: (string | number)[] = [id];

        if (q.id_producto !== undefined) {
            condiciones.push('s.id_producto = ?');
            parametros.push(q.id_producto);
        }
        if (q.ciclo !== undefined) {
            condiciones.push('s.ciclo = ?');
            parametros.push(q.ciclo);
        }

        const filas = db.prepare(
            'SELECT s.id_siembra, s.id_parcela, s.id_producto, s.ciclo, ' +
                's.superficie, s.unidad_superficie, s.fecha_siembra, ' +
                's.produccion, s.fecha_registro, ' +
                'pr.nombre AS producto, pr.unidad, pr.tipo_producto ' +
                'FROM siembras s ' +
                'JOIN productos pr ON pr.id_producto = s.id_producto ' +
                'WHERE ' + condiciones.join(' AND ') +
                ' ORDER BY pr.nombre, s.ciclo'
        ).all(...parametros);

        res.json(filas);
    }
);

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

        const existente = db.prepare(
            'SELECT id_siembra FROM siembras WHERE id_parcela = ? AND id_producto = ? AND ciclo = ?'
        ).get(id, id_producto, ciclo) as { id_siembra: number } | undefined;

        let idSiembra: number;
        let creada: boolean;

        if (existente) {
            db.prepare(
                'UPDATE siembras SET produccion = ?, ' +
                    'superficie = COALESCE(?, superficie), ' +
                    'unidad_superficie = CASE WHEN ? IS NULL THEN unidad_superficie ELSE ? END ' +
                    'WHERE id_siembra = ?'
            ).run(produccion, superficie ?? null, superficie ?? null, unidad_superficie, existente.id_siembra);
            idSiembra = existente.id_siembra;
            creada = false;
        } else {
            const result = db.prepare(
                'INSERT INTO siembras ' +
                    '(id_parcela, id_producto, ciclo, superficie, unidad_superficie, ' +
                    ' produccion, fecha_siembra) ' +
                    'VALUES (?, ?, ?, ?, ?, ?, date(\'now\'))'
            ).run(id, id_producto, ciclo, superficie ?? null, unidad_superficie, produccion);
            idSiembra = Number(result.lastInsertRowid);
            creada = true;
        }

        res.status(creada ? 201 : 200).json({
            mensaje: creada ? 'Siembra registrada' : 'Siembra actualizada',
            id_siembra: idSiembra,
            id_producto,
            unidad: producto.unidad,
            ciclo,
            superficie: superficie ?? null,
            unidad_superficie
        });
    }
);

router.delete('/siembras/:id', protegerRuta, validar(idParams, 'params'), (req, res) => {
    const usuario = usuarioActual(res);
    const { id } = req.params as unknown as { id: number };

    const filas = db.prepare(
        'SELECT s.id_siembra FROM siembras s ' +
            'JOIN parcelas p ON p.id_parcela = s.id_parcela ' +
            'WHERE s.id_siembra = ? AND p.id_usuario = ?'
    ).all(id, usuario.id) as { id_siembra: number }[];

    if (filas.length === 0) {
        throw noEncontrado('Siembra no encontrada o no es tuya');
    }

    db.prepare('DELETE FROM siembras WHERE id_siembra = ?').run(id);

    res.json({ mensaje: 'Siembra eliminada' });
});

export default router;
