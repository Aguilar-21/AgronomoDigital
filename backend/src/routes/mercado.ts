// routes/mercado.ts
//
// GET /publicaciones, POST /publicaciones y PUT /publicaciones/:id/estado.
//
// QUE CAMBIA
//
// 1. No se puede publicar mas de lo que se produjo. Antes el backend aceptaba
//    cualquier cantidad y el error se descubria en la vida real: 500 cajas
//    publicadas de una parcela que dio 100. Ahora disponibleParaPublicar() lo
//    rechaza con 409 antes de insertar.
//
// 2. Las transiciones de estado se validan contra TRANSICIONES. vendido y
//    retirado son terminales.
//
// 3. GET /publicaciones trae paginacion y total, para que el tablero no cargue
//    la tabla entera en memoria.
//
// 4. GET /publicaciones/:id/estado es ruta nueva: el frontend necesita saber
//    si todavia puede pasar a vendido o si ya no puede.

import { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
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

/**
 * El id del primer canal de venta, que se usa cuando el cliente no indica uno.
 *
 * Se consulta en vez de suponer un id fijo (tipo 1) porque el catalogo de canales
 * esta en la base y puede cambiar: si el canal 1 se elimina, un id supuesto deja
 * de funcionar sin que nadie haya tocado esa parte del codigo.
 *
 * LIMIT 1 con el ORDER BY hace explicito que se elige el primero por id, no "uno
 * cualquiera": MySQL no garantiza el orden sin ORDER BY.
 */
async function primerCanal(): Promise<number | null> {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_canal FROM canales_venta ORDER BY id_canal LIMIT 1'
    );

    if (filas.length === 0) return null;

    return Number(filas[0].id_canal);
}

/**
 * GET /publicaciones[?estado=][?id_producto=][?mias=][?limit=][?offset=]
 *
 * Devuelve { publicaciones, total, limit, offset } en vez de un arreglo pelado.
 *
 * El "total" va aparte porque es lo que permite el boton "siguiente pagina": sin
 * el, el frontend no sabe si hay mas y tendria que traer una pagina extra para
 * enterarse.
 *
 * mias=true filtra por el usuario del token. Sin ese filtro, la lista es el
 * tablero completo, que es lo que quiere el mercado.
 */
router.get('/publicaciones', protegerRuta, validar(queryPublicaciones, 'query'), async (req, res) => {
    const usuario = usuarioActual(res);
    const q = (res.locals.query ?? {}) as {
        estado?: string;
        id_producto?: number;
        mias?: boolean;
        limit: number;
        offset: number;
    };

    const cond: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (q.estado) {
        cond.push('pub.estado = ?');
        params.push(q.estado);
    }
    if (q.id_producto !== undefined) {
        cond.push('pub.id_producto = ?');
        params.push(q.id_producto);
    }
    if (q.mias) {
        cond.push('p.id_usuario = ?');
        params.push(usuario.id);
    }

    const where = cond.join(' AND ');

    const [conteo] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM publicaciones pub ' +
            'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
            'WHERE ' + where,
        params
    );

    const total = Number(conteo[0]?.total ?? 0);

    // params se vuelve a usar con los dos valores de paginacion al final. Se
    // pasa [...params] porque si se empujara sobre el mismo arreglo, el ORDER BY
    // de la segunda consulta leeria numeros de mas.
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT pub.id_publicacion, pub.id_parcela, pub.id_producto, pub.cantidad, ' +
            'pub.precio_unitario, pub.fecha, pub.estado, pub.notas, pub.id_canal, ' +
            'pr.nombre AS producto, pr.unidad, ' +
            'p.nombre_parcela, ' +
            'u.nombre AS productor, u.correo AS productor_correo, ' +
            'ca.nombre AS canal ' +
            'FROM publicaciones pub ' +
            'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
            'JOIN usuarios u ON u.id_usuario = p.id_usuario ' +
            'JOIN productos pr ON pr.id_producto = pub.id_producto ' +
            'LEFT JOIN canales_venta ca ON ca.id_canal = pub.id_canal ' +
            'WHERE ' + where +
            ' ORDER BY pub.fecha DESC, pub.id_publicacion DESC' +
            ' LIMIT ? OFFSET ?',
        [...params, q.limit, q.offset]
    );

    res.json({
        publicaciones: filas,
        total,
        limit: q.limit,
        offset: q.offset
    });
});

/**
 * POST /publicaciones
 *
 * body: { id_parcela, id_producto, cantidad, precio_unitario, fecha,
 *         id_canal?, ciclo?, notas? }
 *
 * 201 { mensaje, id_publicacion }
 * 409 no hay produccion disponible para esa cantidad
 * 404 parcela ajena, producto desactivado o canal inexistente
 *
 * fecha Y ciclo NO SON LO MISMO
 *
 * fecha es cuando se publica (ISO, "2026-09-29") y ciclo es de que temporada es
 * la mercaderia ("actual", "2026-A"). La regla de "no publicar mas de lo que se
 * produjo" compara contra produccion_parcelas del MISMO ciclo, asi que lo que
 * se usa para buscar la produccion es ciclo. Pasarle la fecha ahi era un bug:
 * "2026-09-29" no matchea nunca con un ciclo, toda publicacion moria en el 409
 * de "no hay produccion registrada".
 *
 * LOS TRES CAMPOS QUE EL ESQUEMA EXIGE
 *
 * publicaciones.id_usuario y publicaciones.id_canal son NOT NULL en el esquema.
 * El id_usuario sale SIEMPRE del token, nunca del cuerpo ni de la parcela.
 *
 * Antes el INSERT no llenaba id_usuario y MySQL rechazaba la fila con
 * "Field 'id_usuario' doesn't have a default value", un 500 que no le decia nada
 * a nadie. Llenarlo desde el token ademas elimina una fuente de error: si el
 * cliente mandara un id_usuario distinto, el INSERT lo ignora en vez de crear
 * una oferta a nombre de otro.
 *
 * id_canal es obligatorio en el esquema pero opcional en el API. Se resuelve
 * tomando el canal con el menor id, que es el canal por defecto. Es mejor eso que
 * volver obligatorio el campo: el formulario ya tiene una lista de canales y el
 * caso "no me importa el canal" es legitimo.
 */
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

        // id_parcela es opcional en el esquema a proposito (una oferta puede
        // junta varias parcelas), pero si viene tiene que ser del usuario.
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

        // Canal explicito, o el que exista. Se consulta en vez de suponer un id
        // fijo porque si el catalogo de canales cambiara, un id supuesto
        // empezaria a fallar sin que nadie tocara esa parte del codigo.
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

        // La regla de fondo: no se publica mercaderia que no se produjo.
        //
        // La comparacion es sobre la produccion del MISMO ciclo de la
        // publicacion, no sobre el total historico de la parcela, porque si no
        // lo que se publico en el ciclo anterior volveria a estar disponible.
        // id_parcela es NOT NULL en el esquema, asi que una oferta sin parcela no
        // se puede insertar. Se dice con un mensaje claro en vez de dejar que
        // MySQL rechace la fila con un 500.
        if (cuerpo.id_parcela === undefined) {
            throw new ErrorHttp(
                400,
                'La parcela es obligatoria para publicar. Se necesita para comprobar ' +
                    'que hay produccion disponible.'
            );
        }

        // La regla de fondo: no se publica mercaderia que no se produjo.
        //
        // El ciclo va del cuerpo, NO de la fecha. La fecha dice cuando se publica
        // y el ciclo dice de que temporada es la mercaderia, que son cosas
        // distintas: se puede publicar hoy la cosecha de "2026-A". Antes se
        // pasaba cuerpo.fecha aqui y la comparacion no encontraba la produccion
        // nunca.
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

        const [creada] = await pool.query<ResultSetHeader>(
            'INSERT INTO publicaciones ' +
                '(id_usuario, id_parcela, id_producto, id_canal, cantidad, ' +
                ' precio_unitario, fecha, estado, notas, ciclo) ' +
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'disponible', ?, ?)",
            [
                usuario.id,
                cuerpo.id_parcela,
                cuerpo.id_producto,
                idCanal,
                cuerpo.cantidad,
                cuerpo.precio_unitario,
                cuerpo.fecha,
                cuerpo.notas ?? null,
                cuerpo.ciclo
            ]
        );

        res.status(201).json({
            mensaje: 'Publicacion creada',
            id_publicacion: creada.insertId,
            unidad: producto.unidad
        });
    }
);

/**
 * PUT /publicaciones/:id/estado
 *
 * body: { estado }
 *
 * 200 { mensaje, estado }
 * 409 la transicion no es valida
 *
 * El UPDATE lleva el estado actual como condicion: "cambiar a vendido SOLO si
 * todavia esta disponible". Si dos usuarios tocan la misma publicacion a la vez,
 * el segundo recibe 409 en vez de sobrescribir al primero. Esa es la razon de
 * usar affectedRows como verificador y no un SELECT previo.
 */
router.put(
    '/publicaciones/:id/estado',
    protegerRuta,
    validar(idParams, 'params'),
    validar(cambiarEstadoSchema),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const { estado } = req.body as { estado: (typeof ESTADOS)[number] };

        // Se lee el estado actual para poder explicar por que la transicion no
        // vale. El SELECT no es redundante con el UPDATE de abajo: aca es para
        // el mensaje de error, que necesita saber de donde se pretendia ir.
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pub.estado FROM publicaciones pub ' +
                'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
                'WHERE pub.id_publicacion = ? AND p.id_usuario = ?',
            [id, usuario.id]
        );

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

        const [resultado] = await pool.query<ResultSetHeader>(
            'UPDATE publicaciones pub ' +
                'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
                'SET pub.estado = ? ' +
                'WHERE pub.id_publicacion = ? AND p.id_usuario = ? AND pub.estado = ?',
            [estado, id, usuario.id, actual]
        );

        if (resultado.affectedRows === 0) {
            throw new ErrorHttp(
                409,
                'La publicacion cambio de estado mientras se guardaba. Vuelve a cargarla e intenta de nuevo.'
            );
        }

        res.json({ mensaje: 'Estado actualizado', estado });
    }
);

/**
 * GET /publicaciones/:id/estado[?estado=]
 *
 * Ruta nueva. Devuelve si la publicacion puede pasar al estado pedido:
 *
 *     { puede: true, estado_actual: "disponible", estado_destino: "vendido" }
 *     { puede: false, motivo: "..." }
 *
 * Sirve para que el frontend deshabilite el boton de "marcar vendido" en vez de
 * dejar que el usuario lo pulse y reciba un 409.
 */
router.get(
    '/publicaciones/:id/estado',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryEstadosDisponibles, 'query'),
    async (req, res) => {
        const usuario = usuarioActual(res);
        const { id } = req.params as unknown as { id: number };
        const { estado } = (res.locals.query ?? {}) as { estado: (typeof ESTADOS)[number] };

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pub.estado FROM publicaciones pub ' +
                'JOIN parcelas p ON p.id_parcela = pub.id_parcela ' +
                'WHERE pub.id_publicacion = ? AND p.id_usuario = ?',
            [id, usuario.id]
        );

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