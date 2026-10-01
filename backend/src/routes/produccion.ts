// routes/produccion.ts
//
// GET, POST y DELETE de produccion por parcela.
//
// QUE CAMBIA
//
// 1. Los filtros son opcionales y validados: ?id_producto= y ?ciclo=.
//
// 2. El cuerpo ya no acepta id_parcela. Va en la ruta (/parcelas/:id/produccion)
//    y aceptarlo en el body abriria la puerta a mandar un id en la ruta y otro en
//    el body, y el resultado dependeria de cual ganara.

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { crearProduccionSchema, queryProduccion } from '../schemas/produccion';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { parcelaDelUsuario, productoActivo } from '../services/consultas';
import { noEncontrado } from '../middleware/errores';

const router = Router();

/**
 * GET /parcelas/:id/produccion[?id_producto=][?ciclo=]
 *
 * Trae producto y unidad ya resueltos, para que el frontend no tenga que cruzar
 * los id con GET /productos.
 */
router.get(
    '/parcelas/:id/produccion',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryProduccion, 'query'),
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

        // Filtros opcionales. cond[] y params[] se arman en el MISMO bucle, y en
        // el mismo orden que aparece el AND en el SQL. Ese orden no es un
        // detalle: los ? se llenan de izquierda a derecha contra el texto de la
        // consulta, y cruzarlos no da error, da resultados equivocados.
        const cond: string[] = ['pp.id_parcela = ?'];
        const params: unknown[] = [id];

        if (q.id_producto !== undefined) {
            cond.push('pp.id_producto = ?');
            params.push(q.id_producto);
        }
        if (q.ciclo !== undefined) {
            cond.push('pp.ciclo = ?');
            params.push(q.ciclo);
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pp.id_produccion, pp.id_parcela, pp.id_producto, pp.ciclo, ' +
                'pp.produccion, pp.fecha_registro, ' +
                'pr.nombre AS producto, pr.unidad, pr.tipo_producto ' +
                'FROM produccion_parcelas pp ' +
                'JOIN productos pr ON pr.id_producto = pp.id_producto ' +
                'WHERE ' + cond.join(' AND ') +
                ' ORDER BY pr.nombre, pp.ciclo',
            params
        );

        res.json(filas);
    }
);

/**
 * POST /parcelas/:id/produccion
 *
 * body: { id_producto, produccion, ciclo? }
 *
 * La produccion va en la UNIDAD DEL PRODUCTO: cajas si el producto se vende en
 * cajas, quintales si se vende en quintales. El backend no la convierte.
 *
 * Si el mismo (parcela, producto, ciclo) ya existe, la fila se ACTUALIZA en vez
 * de fallar. Es lo que espera un formulario: el usuario corrige un numero y lo
 * guarda otra vez, no quiere un error de clave duplicada que no sabe
 * interpretar. Por eso affectedRows distingue: 1 = creado, 2 = actualizado.
 */
router.post(
    '/parcelas/:id/produccion',
    protegerRuta,
    validar(idParams, 'params'),
    validar(crearProduccionSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const parcela = await parcelaDelUsuario(id, usuario.id);
        if (!parcela) {
            throw noEncontrado('Parcela no encontrada o no es tuya');
        }

        const { id_producto, produccion, ciclo } = req.body as {
            id_producto: number;
            produccion: number;
            ciclo: string;
        };

        const producto = await productoActivo(id_producto);
        if (!producto) {
            throw noEncontrado('El producto no existe o esta desactivado');
        }

        const [resultado] = await pool.query<ResultSetHeader>(
            'INSERT INTO produccion_parcelas (id_parcela, id_producto, ciclo, produccion) ' +
                'VALUES (?, ?, ?, ?) ' +
                'ON DUPLICATE KEY UPDATE produccion = VALUES(produccion), ' +
                'fecha_registro = CURRENT_TIMESTAMP',
            [id, id_producto, ciclo, produccion]
        );

        // affectedRows es 1 si inserto y 2 si actualizo. El frontend puede asi
        // avisar "actualizado" en vez de "creado" sin tener que consultar.
        const creado = resultado.affectedRows === 1;

        res.status(creado ? 201 : 200).json({
            mensaje: creado ? 'Produccion registrada' : 'Produccion actualizada',
            id_producto,
            unidad: producto.unidad,
            ciclo
        });
    }
);

/**
 * DELETE /produccion/:id
 *
 * El borrado va contra produccion_parcelas, no contra parcelas, y por eso no
 * lleva id_usuario en el WHERE: primero se confirma, con un SELECT, que la
 * parcela de esa fila sea del usuario. Con un JOIN directo habria que repetir
 * la condicion de dos columnas en el DELETE, y es mas dificil de leer.
 */
router.delete(
    '/produccion/:id',
    protegerRuta,
    validar(idParams, 'params'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pp.id_produccion FROM produccion_parcelas pp ' +
                'JOIN parcelas p ON p.id_parcela = pp.id_parcela ' +
                'WHERE pp.id_produccion = ? AND p.id_usuario = ?',
            [id, usuario.id]
        );

        if (filas.length === 0) {
            throw noEncontrado('Registro de produccion no encontrado o no es tuyo');
        }

        await pool.query('DELETE FROM produccion_parcelas WHERE id_produccion = ?', [id]);

        res.json({ mensaje: 'Produccion eliminada' });
    }
);

export default router;