// services/consultas.ts
//
// Acceso a datos para los calculos.
//
// QUE HACE ESTE ARCHIVO
//
// Saca de las rutas las consultas que arman los insumos de los calculos. Las
// rutas quedan cortas (validar, llamar, responder) y toda la logica de "como se
// junta esto" vive aqui, en un archivo que se puede leer de corrido.
//
// REGLA DE ORO DE ESTE ARCHIVO
//
// Los signos ? se reemplazan de izquierda a derecha contra el texto del SQL. Si
// el orden del array de parametros no calca el orden en que aparecen los ?, no
// hay error: MySQL simplemente busca con el valor equivocado y devuelve ceros.
// Es el fallo mas dificil de detectar de este sistema, asi que:
//
//   - los filtros se construyen con cond[] y su orden se respeta al armar
//     params[] con el MISMO bucle
//   - el filtro de id_usuario va SIEMPRE de primero en params, porque en el
//     SQL el WHERE de la parcela aparece antes que los filtros dinamicos
//   - nunca se escribe un ? suelto sin su valor correspondiente en el array

import pool from '../db';
import type { RowDataPacket } from 'mysql2';
import { num, redondear2 } from './calculos';

// ===========================================================================
// TIPOS DE FILA
// ===========================================================================

export interface FilaParcela extends RowDataPacket {
    id_parcela: number;
    id_usuario: number;
    nombre_parcela: string;
    ubicacion: string | null;
    tamano: string | null;
    /** Antes produccion_quintales. Ver migracion 003. */
    produccion_estimada: string | null;
}

export interface FilaProducto extends RowDataPacket {
    id_producto: number;
    nombre: string;
    unidad: string;
    tipo_producto: string;
    activo?: number;
}

// ===========================================================================
// PARCELAS
// ===========================================================================

/**
 * Devuelve la parcela solo si pertenece al usuario del token.
 *
 * El id_usuario va en la misma consulta, no en un SELECT aparte, para que no
 * haya ventana entre "comprobar que es tuya" y "usarla". Si no existe o no es
 * suya, devuelve null y la ruta responde 404.
 *
 * Por que 404 y no 403: un 403 ("no tienes permiso") confirma que el recurso
 * existe. Con 404 el cliente no puede usar la API para averiguar que ids hay
 * en el sistema.
 */
export async function parcelaDelUsuario(
    idParcela: number,
    idUsuario: number
): Promise<FilaParcela | null> {
    const [filas] = await pool.query<FilaParcela[]>(
        'SELECT id_parcela, id_usuario, nombre_parcela, ubicacion, tamano, produccion_estimada ' +
            'FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
        [idParcela, idUsuario]
    );
    return filas[0] ?? null;
}

// ===========================================================================
// PRODUCTOS
// ===========================================================================

/**
 * Busca un producto activo.
 *
 * activo = TRUE importa: un producto desactivado desaparece de los selectores
 * del frontend pero no se borra, para no perder la produccion historica que lo
 * referencia.
 */
export async function productoActivo(
    idProducto: number
): Promise<FilaProducto | null> {
    const [filas] = await pool.query<FilaProducto[]>(
        'SELECT id_producto, nombre, unidad, tipo_producto FROM productos ' +
            'WHERE id_producto = ? AND activo = TRUE',
        [idProducto]
    );
    return filas[0] ?? null;
}

/** Verifica que un canal exista. */
export async function canalExiste(idCanal: number): Promise<boolean> {
    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_canal FROM canales_venta WHERE id_canal = ?',
        [idCanal]
    );
    return filas.length > 0;
}

// ===========================================================================
// COSTOS
// ===========================================================================

export interface ResumenCostos {
    /** Suma de todos los costos que aplican. */
    total: number;
    fijos: number;
    variables: number;
    /**
     * Costos con id_producto NULL: los compartidos por toda la parcela.
     * Antes se ignoraban en silencio al calcular por producto, que hacia que
     * el costo por unidad saliera mas bajo de lo real.
     */
    generales: number;
    generalesFijos: number;
    generalesVariables: number;
    /** Costos atribuidos al producto consultado. */
    delProducto: number;
    delProductoFijos: number;
    delProductoVariables: number;
}

const resumenVacio: ResumenCostos = {
    total: 0,
    fijos: 0,
    variables: 0,
    generales: 0,
    generalesFijos: 0,
    generalesVariables: 0,
    delProducto: 0,
    delProductoFijos: 0,
    delProductoVariables: 0
};

/**
 * Junta los costos de una parcela en las seis cifras que necesitan los calculos.
 *
 * La separacion entre "costos del producto" y "costos generales" es el cambio de
 * fondo. Antes el filtro por producto era "t.id_producto = ?" en el WHERE, y los
 * costos con NULL se perdian sin aviso: el costo del arroz no incluia el
 * alquiler de la parcela, y nadie se enteraba de que faltaba una parte.
 *
 * POR QUE NO HAY WHERE id_producto
 *
 * La consulta trae SIEMPRE todos los costos de la parcela y los separa en
 * columnas con CASE WHEN. Filtrar por producto en el WHERE daria el mismo
 * resultado y ademas seria una trampa: pondria los generales en cero, que es
 * justo el numero que sale mal sin que nada avise.
 *
 * Poner el filtro en el ON de un JOIN tampoco sirve: un JOIN es INNER, y
 * "ON ... AND t.id_producto = ?" descarta las filas con id_producto NULL igual
 * que lo haria el WHERE. Para que un filtro en el ON conserve las filas de la
 * izquierda tiene que ser LEFT JOIN, y aqui no hace falta porque el CASE ya
 * resuelve la separacion.
 *
 * QUE HACE EL PARAMETRO idProducto
 *
 * Separa "costos de la parcela" de "costos de ESTE producto". Sin el, el
 * calculo por producto se llevaba los costos de todos los cultivos de la
 * parcela: el maiz absorbia lo que se gasto en tomates y lo que se gasto en
 * leche, y cada producto pagaba una parte que no era suya.
 *
 * Con idProducto en null (costo-total, que no consulta producto) las tres
 * columnas delProducto quedan en 0, que es lo unico honesto: sin producto
 * elegido no hay a que atribuirle un costo.
 */
export async function resumenCostos(
    idParcela: number,
    ciclo: string | null,
    idProducto: number | null = null
): Promise<ResumenCostos> {
    const cond: string[] = ['t.id_parcela = ?'];
    const params: unknown[] = [];

    // Estos tres "?" van en el SELECT, antes que los del WHERE, asi que se
    // apilan primero. El orden importa: mysql2 los resuelve por posicion.
    //
    // Con idProducto en null, "t.id_producto = NULL" nunca es verdadero (en SQL
    // comparar con NULL da NULL, no verdadero), asi que el CASE nunca suma y
    // delProducto queda en 0. Eso es lo correcto para costo-total, que no
    // consulta ningun producto: no hay producto al que atribuirle nada.
    params.push(idProducto, idProducto, idProducto);

    params.push(idParcela);

    if (ciclo) {
        cond.push('t.ciclo = ?');
        params.push(ciclo);
    }

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT ' +
            'COALESCE(SUM(t.monto), 0) AS total, ' +
            'COALESCE(SUM(CASE WHEN t.es_fijo = TRUE  THEN t.monto ELSE 0 END), 0) AS fijos, ' +
            'COALESCE(SUM(CASE WHEN t.es_fijo = FALSE THEN t.monto ELSE 0 END), 0) AS variables, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto IS NULL THEN t.monto ELSE 0 END), 0) AS generales, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto IS NULL AND t.es_fijo = TRUE  THEN t.monto ELSE 0 END), 0) AS generales_fijos, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto IS NULL AND t.es_fijo = FALSE THEN t.monto ELSE 0 END), 0) AS generales_variables, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto = ? THEN t.monto ELSE 0 END), 0) AS del_producto, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto = ? AND t.es_fijo = TRUE  THEN t.monto ELSE 0 END), 0) AS del_producto_fijos, ' +
            'COALESCE(SUM(CASE WHEN t.id_producto = ? AND t.es_fijo = FALSE THEN t.monto ELSE 0 END), 0) AS del_producto_variables ' +
            'FROM transacciones_costos t ' +
            'WHERE ' + cond.join(' AND '),
        params
    );

    const f = filas[0];

    if (!f) return { ...resumenVacio };

    return {
        total: redondear2(num(f.total)),
        fijos: redondear2(num(f.fijos)),
        variables: redondear2(num(f.variables)),
        generales: redondear2(num(f.generales)),
        generalesFijos: redondear2(num(f.generales_fijos)),
        generalesVariables: redondear2(num(f.generales_variables)),
        delProducto: redondear2(num(f.del_producto)),
        delProductoFijos: redondear2(num(f.del_producto_fijos)),
        delProductoVariables: redondear2(num(f.del_producto_variables))
    };
}

// ===========================================================================
// PRODUCCION
// ===========================================================================

export interface ResolucionProduccion {
    /**
     * Produccion en la UNIDAD DEL PRODUCTO (cajas, quintales, libras).
     * null cuando no hay dato, y eso es distinto de 0.
     */
    produccion: number | null;
    /** De donde salio el numero, para que el frontend pueda avisar. */
    origen: 'por_producto' | 'parcela' | 'sin_datos';
    /** Cuantos registros de produccion se leyeron. */
    registros: number;
    /** Aviso para el usuario cuando el numero no es del producto pedido. */
    aviso: string | null;
}

/**
 * Resuelve la produccion de un producto en una parcela.
 *
 * QUICK CAMBIO IMPORTANTE: SE QUITO EL FALLBACK
 *
 * Antes, si el producto no tenia filas en produccion_parcelas, esta funcion
 * caia a parcelas.produccion_estimada como plan B. Eso mezclaba unidades: la
 * columna del fallback era produccion_quintales, y se usaba como
 * si fuera cajas, quintales o libras. Una parcela con 50 quintales de maiz
 * consultada por tomate devolvia "50 cajas de tomate", y el costo por caja salia
 * de un numero que no era de cajas.
 *
 * El resultado era peor que no devolver nada, porque parecia un dato real.
 *
 * Ahora: si no hay produccion registrada para ese producto, produccion es null
 * y aviso explica por que. El calculo devuelve null en vez de un numero falso.
 * Si el usuario quiere calcular sobre toda la parcela sin filtro de producto,
 * para eso esta la produccion_estimada de la parcela, que se usa solo en ese
 * caso y se declara como tal.
 */
export async function resolverProduccion(
    idParcela: number,
    idProducto: number | null,
    ciclo: string | null
): Promise<ResolucionProduccion> {
    // Sin producto no hay unidad de referencia, asi que no se puede usar la
    // produccion por producto. La ruta decide si usa la de la parcela.
    if (idProducto === null) {
        return {
            produccion: null,
            origen: 'sin_datos',
            registros: 0,
            aviso: null
        };
    }

    const cond: string[] = ['id_parcela = ?', 'id_producto = ?'];
    const params: unknown[] = [idParcela, idProducto];

    if (ciclo) {
        cond.push('ciclo = ?');
        params.push(ciclo);
    }

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT COALESCE(SUM(produccion), 0) AS total, COUNT(*) AS registros ' +
            'FROM produccion_parcelas WHERE ' + cond.join(' AND '),
        params
    );

    const total = num(filas[0]?.total);
    const registros = Number(filas[0]?.registros ?? 0);

    if (total > 0) {
        return { produccion: total, origen: 'por_producto', registros, aviso: null };
    }

    const queFalta = ciclo
        ? `no hay produccion registrada del producto en el ciclo "${ciclo}"`
        : 'no hay produccion registrada de este producto en la parcela';

    return {
        produccion: null,
        origen: 'sin_datos',
        registros,
        aviso:
            `No se puede calcular por unidad: ${queFalta}. ` +
            'Registrala en POST /parcelas/' + idParcela + '/produccion.'
    };
}

/**
 * Produccion estimada declarada de la parcela (columna heredada).
 *
 * Solo se usa cuando la consulta NO filtra por producto. En ese caso la unidad
 * no viene de productos.unidad sino que es la del total de la parcela, y
 * por eso origen es 'parcela' y no 'por_producto': la respuesta no puede hacer
 * pasar un total de parcela por la produccion de un cultivo concreto.
 *
 * origen aparece en la respuesta justamente para que esa diferencia sea visible
 * en lugar de esconderse detras de un numero.
 */
export async function produccionDeParcela(
    parcela: FilaParcela
): Promise<ResolucionProduccion> {
    const valor = num(parcela.produccion_estimada);

    if (valor <= 0) {
        return {
            produccion: null,
            origen: 'sin_datos',
            registros: 0,
            aviso:
                'No hay produccion registrada para esta parcela, asi que no se puede calcular el costo por unidad. ' +
                'Registrala con POST /parcelas/' + parcela.id_parcela + '/produccion.'
        };
    }

    return {
        produccion: valor,
        origen: 'parcela',
        registros: 1,
        aviso:
            'Estos numeros son el total declarado de la parcela, no la produccion de un cultivo. ' +
            'Registra produccion por producto para ver el costo de cada uno por separado.'
    };
}

// ===========================================================================
// VALOR DE LA PRODUCCION (para repartir los costos generales)
// ===========================================================================

export interface ValorProduccionParcela {
    /** Suma de (cantidad x ultimo precio) de todos los productos con precio. */
    valorTotal: number;
    /** Valor del producto consultado. null si ese producto no tiene precio. */
    valorProducto: number | null;
    /** Productos de la parcela a los que NO se les pudo poner precio. */
    productosSinPrecio: string[];
    /** true si TODOS los productos con produccion tienen precio. */
    completa: boolean;
}

/**
 * Calcula el valor de mercado de la produccion, que es la base del reparto de
 * costos generales.
 *
 * Por que se usa precio x cantidad y no solo cantidad: porque el reparto tiene
 * que caer sobre dinero. Las cantidades de productos distintos no son
 * comparables (cajas contra quintales), pero los valores si.
 *
 * Si un producto no tiene precio, se cuenta como sin precio y el reparto se
 * salta. Se podria repartir "a partes iguales" entre los que si tienen precio,
 * pero eso asignaria al maiz una parte de la cosecha de tomate sin ninguna base,
 * que es peor que decir que no se puede repartir.
 *
 * Son DOS consultas y no una con subconsulta, por una razon concreta: en una
 * sola consulta los parametros del subquery (que aparece en el SELECT) y los del
 * WHERE (que aparece despues) se llenan en ese orden, y confundirlos no da
 * ningun error, solo numeros equivocados. Con dos consultas cada una tiene sus
 * parametros y no hay forma de cruzarlos.
 */
export async function valorProduccion(
    idParcela: number,
    idProducto: number | null,
    ciclo: string | null,
    idCanal: number | null
): Promise<ValorProduccionParcela> {
    // Consulta 1: que hay producido en la parcela.
    const cond: string[] = ['pp.id_parcela = ?'];
    const params: unknown[] = [idParcela];

    if (ciclo) {
        cond.push('pp.ciclo = ?');
        params.push(ciclo);
    }

    const [cultivos] = await pool.query<RowDataPacket[]>(
        'SELECT pp.id_producto, pr.nombre, SUM(pp.produccion) AS produccion ' +
            'FROM produccion_parcelas pp ' +
            'JOIN productos pr ON pr.id_producto = pp.id_producto ' +
            'WHERE ' + cond.join(' AND ') +
            ' GROUP BY pp.id_producto, pr.nombre',
        params
    );

    if (cultivos.length === 0) {
        return {
            valorTotal: 0,
            valorProducto: null,
            productosSinPrecio: [],
            completa: false
        };
    }

    // Consulta 2: los precios, ordenados del mas reciente al mas antiguo. Al
    // recorrerlos, el primer precio que aparece para un producto es el ultimo
    // registrado; los siguientes de ese mismo producto se ignoran.
    //
    // Se hace asi en vez de con un GROUP BY por fecha porque el historial de
    // precios es una tabla chica y los indices no se necesitan todavia. Si
    // llegara a tener cientos de miles de filas, aqui si toca optimizar, y el
    // comentario lo deja claro.
    const [precios] = await pool.query<RowDataPacket[]>(
        'SELECT id_producto, precio_venta FROM historial_precios ' +
            (idCanal !== null ? 'WHERE id_canal = ? ' : '') +
            'ORDER BY fecha DESC, id_precio DESC',
        idCanal !== null ? [idCanal] : []
    );

    const precioPorProducto = new Map<number, number>();

    for (const f of precios) {
        const id = Number(f.id_producto);
        if (precioPorProducto.has(id)) continue;

        const precio = num(f.precio_venta);
        if (precio > 0) precioPorProducto.set(id, precio);
    }

    let valorTotal = 0;
    let valorProducto: number | null = null;
    const productosSinPrecio: string[] = [];

    for (const c of cultivos) {
        const id = Number(c.id_producto);
        const precio = precioPorProducto.get(id);

        if (precio === undefined) {
            productosSinPrecio.push(String(c.nombre));
            continue;
        }

        const valor = redondear2(num(c.produccion) * precio);
        valorTotal = redondear2(valorTotal + valor);

        if (id === idProducto) {
            valorProducto = valor;
        }
    }

    return {
        valorTotal,
        valorProducto,
        productosSinPrecio,
        completa: productosSinPrecio.length === 0
    };
}

// ===========================================================================
// PRECIOS
// ===========================================================================

/**
 * Ultimo precio de venta registrado para un producto o canal.
 *
 * El desempate por id_precio en el ORDER BY no es decorativo: sin el, si hay
 * dos precios el mismo dia, MySQL no garantiza el orden y devolveria cualquiera
 * de los dos, haciendo que el mismo request diera dos resultados.
 *
 * Devuelve null si no hay ningun precio, no 0. Un precio de 0 no existe, y
 * tratarlo como 0 haria que el margen se viera como -costoVariable.
 */
export async function ultimoPrecio(
    idProducto: number | null,
    idCanal: number | null
): Promise<number | null> {
    const cond: string[] = [];
    const params: unknown[] = [];

    if (idProducto !== null) {
        cond.push('id_producto = ?');
        params.push(idProducto);
    }
    if (idCanal !== null) {
        cond.push('id_canal = ?');
        params.push(idCanal);
    }

    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT precio_venta FROM historial_precios ' + where +
            ' ORDER BY fecha DESC, id_precio DESC LIMIT 1',
        params
    );

    if (filas.length === 0) return null;

    const valor = filas[0].precio_venta;
    return valor === null || valor === undefined ? null : num(valor);
}

// ===========================================================================
// PRODUCCION DISPONIBLE PARA PUBLICAR
// ===========================================================================

/**
 * Cuanto de un producto hay disponible para publicar en una parcela.
 *
 * Se resta lo que ya esta publicado y no esta retirado ni vendido. Sin esto se
 * podian publicar 500 cajas de tomate en una parcela que solo produjo 100.
 *
 * Devuelve null cuando la parcela no tiene produccion registrada para ese
 * producto, que es distinto de "no queda nada": null significa "no hay dato
 * para saber", 0 significa "hay dato y no queda nada".
 */
export async function disponibleParaPublicar(
    idParcela: number,
    idProducto: number,
    ciclo: string | null
): Promise<{ disponible: number | null; publicado: number }> {
    const condProd: string[] = ['pp.id_parcela = ?', 'pp.id_producto = ?'];
    const paramsProd: unknown[] = [idParcela, idProducto];

    if (ciclo) {
        condProd.push('pp.ciclo = ?');
        paramsProd.push(ciclo);
    }

    const [producido] = await pool.query<RowDataPacket[]>(
        'SELECT COALESCE(SUM(pp.produccion), 0) AS total ' +
            'FROM produccion_parcelas pp WHERE ' + condProd.join(' AND '),
        paramsProd
    );

    const produccion = num(producido[0]?.total);

    // Solo 'retirado' y 'vendido' descuentan. Una publicacion 'disponible' ya
    // esta reservando esa mercaderia en el tablero, asi que volver a contarla
    // permitiria sobre-publicar.
    const condPub: string[] = [
        'pub.id_parcela = ?',
        'pub.id_producto = ?',
        "pub.estado IN ('disponible','vendido')"
    ];
    const paramsPub: unknown[] = [idParcela, idProducto];

    if (ciclo) {
        condPub.push('pub.ciclo = ?');
        paramsPub.push(ciclo);
    }

    const [publicado] = await pool.query<RowDataPacket[]>(
        'SELECT COALESCE(SUM(pub.cantidad), 0) AS total ' +
            'FROM publicaciones pub WHERE ' + condPub.join(' AND '),
        paramsPub
    );

    const yaPublicado = num(publicado[0]?.total);

    if (produccion <= 0) {
        return { disponible: null, publicado: yaPublicado };
    }

    return { disponible: redondear2(produccion - yaPublicado), publicado: yaPublicado };
}