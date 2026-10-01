// routes/consultas.ts
//
// Los endpoints de calculo: costo-total, costo-unitario y punto-equilibrio.
//
// QUE CAMBIA
//
// 1. Todo pasa por queryCalculo, que valida los parametros. "?id_producto=abc"
//    daba 500 antes; ahora da 400 diciendo que se espera un numero.
//
// 2. Se quito el fallback de produccion. Antes, si el producto no tenia
//    produccion registrada, se usaba parcelas.produccion_quintales como si
//    fueran cajas del producto pedido. Una parcela con 50 quintales de maiz
//    consultada por tomate devolvia "50 cajas de tomate", y el costo salia de un
//    numero que no era de cajas. Ahora sale null y un aviso que lo explica.
//
// 3. Los costos generales se devuelven APARTE y solo se reparten si el cliente
//    lo pide con repartir_generales=true.
//
// 4. La ruta sigue siendo /costo-unitario y no /costo-quintal: el nombre viejo
//    implica que todo se mide en quintales y hay 6 unidades en juego. Cambiar la
//    ruta seria romper a todos los clientes sin ganar nada.

import { Router } from 'express';
import type { Request, Response } from 'express';
import pool from '../db';
import { validar } from '../middleware/validar';
import { protegerRuta } from '../middleware/auth';
import { queryCalculo } from '../schemas/consultas';
import { idParams } from '../schemas/comunes';
import { usuarioActual } from '../auth/tipos';
import { ErrorHttp } from '../middleware/errores';
import {
    parcelaDelUsuario,
    productoActivo,
    canalExiste,
    resumenCostos,
    resolverProduccion,
    produccionDeParcela,
    valorProduccion,
    ultimoPrecio,
    disponibleParaPublicar
} from '../services/consultas';
import {
    repartirCostosGenerales,
    calcularCostoUnitario,
    calcularPuntoEquilibrioConReparto,
    redondear2
} from '../services/calculos';

const router = Router();

/**
 * Resuelve todo lo que los tres endpoints de calculo necesitan, sin repetir el
 * bloque de validacion en cada uno.
 *
 * El orden importa: primero se confirma que la parcela sea del usuario. Si no
 * fuera, las consultas siguientes devolverian ceros con aspecto de dato real en
 * vez de un 404, que es peor porque el usuario creeria que su parcela esta
 * vacia.
 */
async function preparar(
    res: Parameters<typeof usuarioActual>[0],
    params: { id: number },
    query: {
        id_producto?: number;
        id_canal?: number;
        repartir_generales: boolean;
        ciclo?: string;
    }
) {
    const usuario = usuarioActual(res);

    const parcela = await parcelaDelUsuario(params.id, usuario.id);
    if (!parcela) {
        throw new ErrorHttp(404, 'Parcela no encontrada o no es tuya');
    }

    const idProducto = query.id_producto ?? null;
    const idCanal = query.id_canal ?? null;
    const ciclo = query.ciclo ?? null;

    if (idProducto !== null) {
        const producto = await productoActivo(idProducto);
        if (!producto) {
            throw new ErrorHttp(404, 'El producto no existe o esta desactivado');
        }
    }

    if (idCanal !== null) {
        const existe = await canalExiste(idCanal);
        if (!existe) {
            throw new ErrorHttp(404, 'El canal de venta no existe');
        }
    }

    const costos = await resumenCostos(params.id, ciclo, idProducto);
    const produccion = await resolverProduccion(params.id, idProducto, ciclo);
    const valor = await valorProduccion(params.id, idProducto, ciclo, idCanal);

    const reparto = repartirCostosGenerales(
        costos.generales,
        costos.generalesFijos,
        valor.valorTotal,
        valor.valorProducto,
        query.repartir_generales
    );

    return { usuario, parcela, idProducto, idCanal, ciclo, costos, produccion, valor, reparto };
}

/**
 * GET /parcelas/:id/costo-total
 *
 * Solo la suma de costos. No necesita ni producto ni produccion, asi que no
 * calcula nada mas.
 */
router.get(
    '/parcelas/:id/costo-total',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCalculo, 'query'),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const q = (res.locals.query ?? {}) as {
            id_producto?: number;
            id_canal?: number;
            repartir_generales: boolean;
            ciclo?: string;
        };

        const { usuario, parcela, idProducto, idCanal, ciclo, costos } = await preparar(res, { id }, q);

        res.json({
            id_parcela: parcela.id_parcela,
            nombre_parcela: parcela.nombre_parcela,
            id_usuario: usuario.id,
            id_producto: idProducto,
            id_canal: idCanal,
            ciclo,
            ...costos,
            campos_heredados: {
                costo_total: costos.total,
                costo_fijo: costos.fijos,
                costo_variable: costos.variables,
                costo_quintal: null
            }
        });
    }
);

/**
 * GET /parcelas/:id/costo-unitario
 *
 * Devuelve el costo por unidad en la UNIDAD DEL PRODUCTO, y separa lo que es
 * costo directo del producto de lo que es costo general atribuido.
 */
/**
 * El handler del costo por unidad.
 *
 * Se declara una sola vez y se monta en DOS rutas: /costo-quintal, que es la que
 * ya usan el frontend y las pruebas viejas, y /costo-unitario, que es el nombre
 * correcto.
 *
 * POR QUE DOS RUTAS Y NO UNA RENOMBRADA
 *
 * El nombre viejo dice "quintal" y el valor es por la unidad del producto, que
 * puede ser caja, jaba, ciento o libra. Renombrar la ruta sin más rompe a todos
 * los clientes que ya la están llamando: el frontend devolvería 404 y nadie
 * sabría que el backend "se renombró".
 *
 * Montar las dos cuesta cuatro líneas y deja migrar con calma. Cuando el
 * frontend haya pasado a /costo-unitario, /costo-quintal se borra junto con el
 * alias `campos_heredados.costo_quintal` de la respuesta.
 *
 * No es un alias de ruta con un 301: acá las dos ejecutan el MISMO handler, así
 * que no hay dos implementaciones que puedan divergir. Si mañana se cambia el
 * cálculo, cambia en las dos.
 */
async function costoUnitario(req: Request, res: Response): Promise<void> {
    const { id } = req.params as unknown as { id: number };
    const q = (res.locals.query ?? {}) as {
        id_producto?: number;
        id_canal?: number;
        repartir_generales: boolean;
        ciclo?: string;
    };

    const { parcela, idProducto, ciclo, costos, produccion, reparto } = await preparar(
        res,
        { id },
        q
    );

    // Sin producto no hay unidad de referencia. Se responde 400 en vez de
    // devolver un numero: "costo unitario" de que, si hay 14 productos en 6
    // unidades distintas?
    if (idProducto === null) {
        throw new ErrorHttp(
            400,
            'Falta id_producto. El costo por unidad necesita saber de que producto es, ' +
                'porque cada producto se mide en una unidad distinta.'
        );
    }

    // Cuando hay producto, la produccion por producto es la unica valida. El
    // fallback a la produccion de la parcela se elimino: mezclaba unidades.
    const producto = await productoActivo(idProducto);
    const unidad = producto?.unidad ?? 'unidad';

    const calculo = calcularCostoUnitario({
        costosProductoTotal: costos.delProducto,
        costosProductoFijos: costos.delProductoFijos,
        costosProductoVariables: costos.delProductoVariables,
        costosGenerales: costos.generales,
        costosGeneralesFijos: costos.generalesFijos,
        produccion: produccion.produccion,
        reparto
    });

    const avisos = [...calculo.avisos];
    if (produccion.aviso) avisos.push(produccion.aviso);

    res.json({
        id_parcela: parcela.id_parcela,
        id_producto: idProducto,
        producto: producto?.nombre ?? null,
        unidad,
        ciclo,
        origen_produccion: produccion.origen,
        produccion: produccion.produccion,
        ...calculo,

        // Alias para el frontend viejo. costo_quintal era el nombre del campo,
        // pero el valor ya no es "por quintal": es por la unidad del producto.
        campos_heredados: {
            costo_quintal: calculo.costoUnitario,
            costo_total: calculo.costoTotal,
            costo_variable: calculo.costosVariables,
            aviso_quintales:
                'costo_quintal esta obsoleto: el valor es por ' + unidad + ', no por quintal'
        },
        avisos
    });
}

// El nombre correcto, para el frontend nuevo.
router.get(
    '/parcelas/:id/costo-unitario',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCalculo, 'query'),
    costoUnitario
);

// El nombre viejo, que sigue funcionando hasta que el frontend migre.
router.get(
    '/parcelas/:id/costo-quintal',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCalculo, 'query'),
    costoUnitario
);

/**
 * GET /parcelas/:id/punto-equilibrio
 *
 * Devuelve cuantas unidades hay que vender para no perder dinero.
 *
 * La diferencia con el endpoint viejo, ademas del fallback ya eliminado: ahora
 * dice de donde salio cada numero y avisa cuando el calculo no es confiable. Un
 * punto de equilibrio de 0 con "sin costos fijos" es un resultado legitimo; un
 * 0 con "no hay datos" es un bug. Antes los dos salian como 0.
 */
router.get(
    '/parcelas/:id/punto-equilibrio',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCalculo, 'query'),
    async (req, res) => {
        const { id } = req.params as unknown as { id: number };
        const q = (res.locals.query ?? {}) as {
            id_producto?: number;
            id_canal?: number;
            repartir_generales: boolean;
            ciclo?: string;
        };

        const { parcela, idProducto, idCanal, ciclo, costos, produccion, reparto } = await preparar(
            res,
            { id },
            q
        );

        if (idProducto === null) {
            throw new ErrorHttp(
                400,
                'Falta id_producto. El punto de equilibrio necesita el precio de un producto concreto.'
            );
        }

        const producto = await productoActivo(idProducto);
        const unidad = producto?.unidad ?? 'unidad';

        // Sin producto no hay produccion por producto, y aqui no hay alternativa
        // legitima: el punto de equilibrio es "cuantas cajas vender", y sin saber
        // de que producto no hay unidad.
        const produccionUsada = produccion.produccion;

        const precio = await ultimoPrecio(idProducto, idCanal);

        // calcularPuntoEquilibrioConReparto suma la parte de generales atribuida
        // a los costos del producto y despues aplica la misma aritmetica de
        // siempre. Se usa el atajo en vez de sumar a mano porque sumar en el
        // orden equivocado no da error: da un punto de equilibrio distinto, y
        // un punto de equivocado no se nota hasta que se decide no vender.
        const resultado = calcularPuntoEquilibrioConReparto(
            {
                costosFijos: costos.delProductoFijos,
                costosVariables: costos.delProductoVariables,
                produccion: produccionUsada,
                precioVenta: precio
            },
            reparto.fijosAtribuidos,
            reparto.variablesAtribuidos
        );

        // Se juntan los tres motivos posibles: por que el calculo de punto de
        // equilibrio no se pudo hacer (motivo), por que no hay produccion
        // registrada (produccion.aviso) y por que no se repartieron los
        // generales (reparto.motivo).
        //
        // Van en un arreglo y no en un solo campo porque puede haber mas de una
        // cosa faltando a la vez. Si solo saliera el primero, el usuario
        // arreglaba uno, volvia a mirar, encontraba el siguiente y tendria que
        // adivinar que habia otro.
        const avisos: string[] = [];

        if (resultado.motivo) avisos.push(resultado.motivo);
        if (produccion.aviso) avisos.push(produccion.aviso);
        if (reparto.motivo) avisos.push(reparto.motivo);

        if (!resultado.motivo && resultado.puntoEquilibrioUnidades === 0) {
            avisos.push(
                'El punto de equilibrio es 0 porque no hay costos fijos que recuperar. ' +
                    'Con costos fijos, movete hasta la pestana de costos.'
            );
        }

        res.json({
            id_parcela: parcela.id_parcela,
            id_producto: idProducto,
            unidad,
            ciclo,
            origen_produccion: produccion.origen,
            produccion: produccionUsada,
            precio_venta: precio,

            // Lo que se atribuye a este producto de los costos generales, para
            // que se vea de donde sale cada parte del calculo.
            costos_generales_atribuidos: redondear2(
                reparto.fijosAtribuidos + reparto.variablesAtribuidos
            ),
            costos_fijos_totales: redondear2(costos.delProductoFijos + reparto.fijosAtribuidos),
            costos_variables_totales: redondear2(
                costos.delProductoVariables + reparto.variablesAtribuidos
            ),

            ...resultado,

            campos_heredados: {
                punto_equilibrio_unidades: resultado.puntoEquilibrioUnidades,
                margen_disponible: resultado.margenContribucion
            },
            avisos
        });
    }
);

/**
 * GET /parcelas/:id/disponible
 *
 * Ruta nueva. Le dice al formulario de publicar cuanta mercaderia queda sin
 * publicar, para que no deje mandar una cantidad que el backend va a rechazar.
 */
router.get(
    '/parcelas/:id/disponible',
    protegerRuta,
    validar(idParams, 'params'),
    validar(queryCalculo, 'query'),
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