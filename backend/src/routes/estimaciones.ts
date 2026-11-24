// routes/estimaciones.ts
//
// POST /estimaciones y el historial de consultas del usuario.

import { Router } from 'express';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearEstimacionSchema, queryEstimaciones } from '../schemas/estimaciones';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { ErrorHttp } from '../middleware/errores';
import { parcelaDelUsuario, productoActivo } from '../services/consultas';
import {
    crearEstimacion,
    listarEstimaciones,
    obtenerEstimacion
} from '../services/estimaciones';

const router = Router();

/**
 * POST /estimaciones
 *
 * body: { id_producto, superficie, unidad_superficie, id_fuente, id_parcela? }
 *
 * No recibe fecha: la pone el servidor al guardar la consulta.
 */
router.post('/estimaciones', protegerRuta, validar(crearEstimacionSchema), async (req, res) => {
    const usuario = usuarioActual(res);
    const cuerpo = req.body as {
        id_producto: number;
        superficie: number;
        unidad_superficie: 'hectarea' | 'manzana';
        id_fuente: number;
        id_parcela?: number;
    };

    const producto = await productoActivo(cuerpo.id_producto);
    if (!producto) {
        throw new ErrorHttp(404, 'El cultivo no existe o esta desactivado');
    }

    if (cuerpo.id_parcela !== undefined) {
        const parcela = await parcelaDelUsuario(cuerpo.id_parcela, usuario.id);
        if (!parcela) {
            throw new ErrorHttp(404, 'La parcela no existe o no es tuya');
        }
    }

    const resultado = await crearEstimacion({
        idUsuario: usuario.id,
        idProducto: cuerpo.id_producto,
        idParcela: cuerpo.id_parcela ?? null,
        idFuente: cuerpo.id_fuente,
        superficie: cuerpo.superficie,
        unidadSuperficie: cuerpo.unidad_superficie
    });

    res.status(201).json(resultado);
});

/** GET /estimaciones: historial del usuario autenticado. */
router.get('/estimaciones', protegerRuta, validar(queryEstimaciones, 'query'), async (_req, res) => {
    const usuario = usuarioActual(res);
    const q = (res.locals.query ?? {}) as { limit: number; offset: number };

    const { estimaciones, total } = await listarEstimaciones(usuario.id, q.limit, q.offset);

    res.json({
        estimaciones,
        total,
        limit: q.limit,
        offset: q.offset
    });
});

/** GET /estimaciones/:id: una consulta con su desglose por insumo. */
router.get(
    '/estimaciones/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const resultado = await obtenerEstimacion(id, usuario.id);

        if (!resultado) {
            throw new ErrorHttp(404, 'Estimacion no encontrada o no es tuya');
        }

        const datosEjemplo =
            Number((resultado.estimacion as { datos_ejemplo?: number }).datos_ejemplo) === 1;
        const advertencia =
            'El total cubre solo insumos. No incluye mano de obra, maquinaria ni otros gastos.' +
            (datosEjemplo ? ' Los precios y las dosis usados son de ejemplo, no oficiales.' : '');

        res.json({
            ...resultado.estimacion,
            datos_ejemplo: datosEjemplo,
            detalle: resultado.detalle,
            alcance: 'solo_insumos',
            advertencia
        });
    }
);

export default router;
