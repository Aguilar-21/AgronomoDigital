import { Router } from 'express';
import db from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { ErrorHttp } from '../middleware/errores';
import {
    queryPublicaciones,
    queryEstadosDisponibles,
    crearPublicacionSchema,
    cambiarEstadoSchema,
    TRANSICIONES,
    ESTADOS
} from '../schemas/publicaciones';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import {
    parcelaDelUsuario,
    productoActivo,
    canalExiste,
    disponibleParaPublicar
} from '../services/consultas';

const router = Router();

async function primerCanal(): Promise<number | null> {
    const fila = db.prepare(
        'SELECT id_canal FROM canales_venta ORDER BY id_canal LIMIT 1'
    ).get() as { id_canal: number } | undefined;

    if (!fila) return null;

    return Number(fila.id_canal);
}

router.get('/publicaciones', protegerRuta, validar(queryPublicaciones, 'query'), (req, res) => {
    const usuario = usuarioActual(res);
    const q = (res.locals.query ?? {}) as {
        estado?: string;
        id_producto?: number;
        mias?: boolean;
        limit: number;
        offset: number;
    };

    const cond: string[] = ['1 = 1'];
    const params: (string | number)[] = [];

    if (q.estado) {
        cond.push('pub.estado = ?');
        params.push(q.estado);
    }
    if (q.id_producto !== undefined) {
        cond.push('pub.id_producto = ?');
        params.push(q.id_producto);
    }
    if (q.mias) {
        cond.push('pub.id_usuario = ?');
        params.push(usuario.id);
    }

    const where = cond.join(' AND ');

    const conteo = db.prepare(
        'SELECT COUNT(*) AS total FROM publicaciones pub WHERE ' + where
    ).get(...params) as { total: number };

    const total = Number(conteo?.total ?? 0);

    const filas = db.prepare(
        'SELECT pub.id_publicacion, pub.id_parcela, pub.id_producto, pub.cantidad, ' +
            'pub.precio_unitario, pub.fecha, pub.estado, pub.notas, pub.id_canal, ' +
            'pr.nombre AS producto, pr.unidad, ' +
            'p.nombre_parcela, ' +
            'u.nombre AS productor, u.correo AS productor_correo, ' +
            'ca.nombre AS canal, ' +
            '(pub.id_usuario = ?) AS mia ' +
            'FROM publicaciones pub ' +
            'LEFT JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
            'JOIN usuarios u ON u.id_usuario = pub.id_usuario ' +
            'JOIN productos pr ON pr.id_producto = pub.id_producto ' +
            'LEFT JOIN canales_venta ca ON ca.id_canal = pub.id_canal ' +
            'WHERE ' + where +
            ' ORDER BY pub.fecha DESC, pub.id_publicacion DESC' +
            ' LIMIT ? OFFSET ?'
    ).all(usuario.id, ...params, q.limit, q.offset);

    res.json({
        publicaciones: filas,
        total,
        limit: q.limit,
        offset: q.offset
    });
});

router.post(
    '/publicaciones',
    protegerRuta,
    validar(crearPublicacionSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);

        const cuerpo = req.body as {
            id_parcela?: number;
            id_producto: number;
            id_canal?: number;
            cantidad: number;
            precio_unitario: number;
            fecha: string;
            ciclo: string;
            notas?: string | null;
        };

        if (cuerpo.id_parcela !== undefined) {
            const parcela = await parcelaDelUsuario(cuerpo.id_parcela, usuario.id);
            if (!parcela) {
                throw new ErrorHttp(404, 'La parcela no existe o no es tuya');
            }
        }

        const producto = await productoActivo(cuerpo.id_producto);
        if (!producto) {
            throw new ErrorHttp(404, 'El producto no existe o esta desactivado');
        }

        let idCanal = cuerpo.id_canal ?? null;

        if (idCanal === null) {
            const canalPorDefecto = await primerCanal();
            if (canalPorDefecto === null) {
                throw new ErrorHttp(
                    409,
                    'No hay ningun canal de venta configurado. Carga catalogos.sql antes de publicar.'
                );
            }
            idCanal = canalPorDefecto;
        } else if (!(await canalExiste(idCanal))) {
            throw new ErrorHttp(404, 'El canal de venta no existe');
        }

        if (cuerpo.id_parcela === undefined) {
            throw new ErrorHttp(
                400,
                'La parcela es obligatoria para publicar. Se necesita para comprobar ' +
                    'que hay produccion disponible.'
            );
        }

        const { disponible, publicado } = await disponibleParaPublicar(
            cuerpo.id_parcela,
            cuerpo.id_producto,
            cuerpo.ciclo
        );

        if (disponible === null) {
            throw new ErrorHttp(
                409,
                `No hay produccion registrada de ese producto en la parcela ` +
                    `para el ciclo "${cuerpo.ciclo}", asi que no se puede publicar. ` +
                    `Registra la produccion primero.`
            );
        }

        if (cuerpo.cantidad > disponible) {
            throw new ErrorHttp(
                409,
                `No hay suficiente produccion disponible. ` +
                    `Pediste ${cuerpo.cantidad} ${producto.unidad} y hay ` +
                    `${disponible} ${producto.unidad} sin publicar ` +
                    `(ya publicados: ${publicado}).`
            );
        }

        const result = db.prepare(
            'INSERT INTO publicaciones ' +
                '(id_usuario, id_parcela, id_producto, id_canal, cantidad, ' +
                ' precio_unitario, fecha, estado, notas, ciclo) ' +
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'disponible', ?, ?)"
        ).run(
            usuario.id,
            cuerpo.id_parcela,
            cuerpo.id_producto,
            idCanal,
            cuerpo.cantidad,
            cuerpo.precio_unitario,
            cuerpo.fecha,
            cuerpo.notas ?? null,
            cuerpo.ciclo
        );

        res.status(201).json({
            mensaje: 'Publicacion creada',
            id_publicacion: result.lastInsertRowid,
            unidad: producto.unidad
        });
    }
);

router.put(
    '/publicaciones/:id/estado',
    protegerRuta,
    validar(idParams, 'params'),
    validar(cambiarEstadoSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const { estado } = req.body as { estado: (typeof ESTADOS)[number] };

        const filas = db.prepare(
            'SELECT pub.estado FROM publicaciones pub ' +
                'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
                'WHERE pub.id_publicacion = ? AND p.id_usuario = ?'
        ).all(id, usuario.id) as { estado: string }[];

        if (filas.length === 0) {
            throw new ErrorHttp(404, 'Publicacion no encontrada o no es tuya');
        }

        const actual = String(filas[0].estado) as (typeof ESTADOS)[number];

        if (actual === estado) {
            res.json({ mensaje: `La publicacion ya estaba en estado "${estado}"`, estado });
            return;
        }

        if (!TRANSICIONES[actual].includes(estado)) {
            const destino = TRANSICIONES[actual].join(' o ');
            throw new ErrorHttp(
                409,
                `No se puede pasar de "${actual}" a "${estado}". ` +
                    (destino
                        ? `Desde "${actual}" solo se permite ir a: ${destino}.`
                        : `"${actual}" es un estado final: para volver a ofrecer la mercaderia, retira esta publicacion y crea una nueva.`)
            );
        }

        const result = db.prepare(
            'UPDATE publicaciones SET estado = ? ' +
                'WHERE id_publicacion = ? AND estado = ? AND ' +
                'id_parcela IN (SELECT id_parcela FROM parcelas WHERE id_usuario = ?)'
        ).run(estado, id, actual, usuario.id);

        if (result.changes === 0) {
            throw new ErrorHttp(
                409,
                'La publicacion cambio de estado mientras se guardaba. Vuelve a cargarla e intenta de nuevo.'
            );
        }

        res.json({ mensaje: 'Estado actualizado', estado });
    }
);

router.get(
    '/publicaciones/:id/estado',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryEstadosDisponibles, 'query'),
    (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const { estado } = (res.locals.query ?? {}) as { estado: (typeof ESTADOS)[number] };

        const filas = db.prepare(
            'SELECT pub.estado FROM publicaciones pub ' +
                'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
                'WHERE pub.id_publicacion = ? AND p.id_usuario = ?'
        ).all(id, usuario.id) as { estado: string }[];

        if (filas.length === 0) {
            throw new ErrorHttp(404, 'Publicacion no encontrada o no es tuya');
        }

        const actual = String(filas[0].estado) as (typeof ESTADOS)[number];

        if (actual === estado) {
            res.json({ puede: true, estado_actual: actual, estado_destino: estado, ya_esta_ahi: true });
            return;
        }

        const permitido = TRANSICIONES[actual].includes(estado);

        res.json({
            puede: permitido,
            estado_actual: actual,
            estado_destino: estado,
            motivo: permitido
                ? null
                : `"${actual}" no puede pasar a "${estado}". ` +
                  (TRANSICIONES[actual].length
                      ? `Solo se permite: ${TRANSICIONES[actual].join(' o ')}.`
                      : `"${actual}" es un estado final.`)
        });
    }
);

export default router;
