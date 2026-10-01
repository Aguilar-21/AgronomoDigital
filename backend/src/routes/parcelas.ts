// routes/parcelas.ts
//
// GET, POST, PUT y DELETE de parcelas.
//
// QUE CAMBIA
//
// 1. Sin try/catch. En Express 5 un error en un handler asincrono llega solo al
//    middleware de error, asi que los 4 bloques identicos de catch desaparecen.
//
// 2. PUT es parcial de verdad. Antes un PUT con solo el nombre escribia NULL en
//    ubicacion, tamano y produccion: el usuario corregia un nombre y perdia la
//    ubicacion. Ahora solo se actualiza lo que viene en el body.
//
// 3. El nombre de la columna produccion_quintales paso a produccion_estimada.
//
// POR QUE SE RENOMBRO ESA COLUMNA
//
// El sistema tiene 14 productos en 6 unidades: quintal, caja, jaba, ciento,
// libra y botella. Decir "quintales" en una columna que se usa para todas era
// una mentira que ya habia producido un error real: el calculo por producto
// caia a esta columna como plan B y devolvia, por ejemplo, 50 quintales
// interpretados como cajas de tomate.
//
// produccion_estimada sigue siendo una unica cifra para toda la parcela, y por
// eso mismo solo se usa cuando la consulta NO filtra por producto. La
// produccion real por cultivo vive en produccion_parcelas.

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

/** GET /parcelas: arreglo de las parcelas del usuario, vacio si no tiene. */
router.get('/parcelas', protegerRuta, async (_req, res) => {
    const usuario = usuarioActual(res);

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_parcela, nombre_parcela, ubicacion, tamano, produccion_estimada ' +
            'FROM parcelas WHERE id_usuario = ? ORDER BY id_parcela',
        [usuario.id]
    );

    res.json(filas);
});

/** POST /parcelas: 201 con el id de la parcela creada. */
router.post('/parcelas', protegerRuta, validar(crearParcelaSchema), async (req, res) => {
    const usuario = usuarioActual(res);

    const { nombre_parcela, ubicacion, tamano, produccion_estimada } = req.body as {
        nombre_parcela: string;
        ubicacion?: string | null;
        tamano?: number | null;
        produccion_estimada?: number | null;
    };

    const [creada] = await pool.query<ResultSetHeader>(
        'INSERT INTO parcelas (id_usuario, nombre_parcela, ubicacion, tamano, produccion_estimada) ' +
            'VALUES (?, ?, ?, ?, ?)',
        [usuario.id, nombre_parcela, ubicacion ?? null, tamano ?? null, produccion_estimada ?? null]
    );

    res.status(201).json({
        mensaje: 'Parcela creada',
        id_parcela: creada.insertId
    });
});

/**
 * PUT /parcelas/:id
 *
 * Actualiza SOLO los campos que vinieron. El COALESCE es lo que hace ese
 * trabajo: si el campo no vino, su valor es NULL, y COALESCE(NULL, valor_guardado)
 * devuelve el valor guardado. Si vino con un valor, devuelve ese.
 *
 * Con eso un PUT parcial no borra nada. El id_usuario va en el WHERE para que
 * una parcela ajena no se pueda tocar: si no coincide, affectedRows es 0 y se
 * responde 404.
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
                'produccion_estimada = COALESCE(?, produccion_estimada) ' +
                'WHERE id_parcela = ? AND id_usuario = ?',
            [
                cuerpo.nombre_parcela ?? null,
                cuerpo.ubicacion ?? null,
                cuerpo.tamano ?? null,
                cuerpo.produccion_estimada ?? null,
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
 * Por los ON DELETE CASCADE del esquema, borrar la parcela borra tambien sus
 * costos, su produccion y pone en NULL las publicaciones que la usaban. Es lo
 * correcto: un costo sin parcela no tiene a quien pertenecer.
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

/**
 * GET /parcelas/:id
 *
 * Ruta nueva: devuelve una sola parcela. Antes para ver una parcela habia que
 * bajar el listado completo de GET /parcelas y buscar a mano, lo cual es un
 * costo innecesario en un formulario de edicion.
 */
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