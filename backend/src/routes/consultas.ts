// Solo GET /parcelas/:id/disponible, para saber cuanto queda sin publicar.

import { Router } from 'express';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { queryDisponible } from '../schemas/consultas';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { ErrorHttp } from '../middleware/errores';
import {
    parcelaDelUsuario,
    productoActivo,
    disponibleParaPublicar
} from '../services/consultas';

const router = Router();

/**
 * GET /parcelas/:id/disponible
 *
 * Le dice al formulario de publicar cuanta mercaderia queda sin publicar, para
 * que no deje mandar una cantidad que el backend va a rechazar.
 */
router.get(
    '/parcelas/:id/disponible',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryDisponible, 'query'),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const q = (res.locals.query ?? {}) as { id_producto?: number; ciclo?: string };

        const usuario = usuarioActual(res);

        const parcela = await parcelaDelUsuario(id, usuario.id);
        if (!parcela) {
            throw new ErrorHttp(404, 'Parcela no encontrada o no es tuya');
        }

        if (q.id_producto === undefined) {
            throw new ErrorHttp(400, 'Falta id_producto para saber cuanto hay disponible');
        }

        const producto = await productoActivo(q.id_producto);
        const { disponible, publicado } = await disponibleParaPublicar(
            id,
            q.id_producto,
            q.ciclo ?? null
        );

        res.json({
            id_parcela: id,
            id_producto: q.id_producto,
            unidad: producto?.unidad ?? 'unidad',
            ciclo: q.ciclo ?? null,
            disponible,
            publicado,
            mensaje:
                disponible === null
                    ? 'No hay produccion registrada de ese producto en la parcela'
                    : 'Quedan ' + disponible + ' sin publicar'
        });
    }
);

export default router;
