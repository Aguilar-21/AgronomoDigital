// services/calculos.ts
//
// Los calculos del sistema, como funciones puras.
//
// QUE SIGNIFICA "FUNCION PURA" AQUI
//
// Una funcion pura no lee la base de datos, no lee el reloj, no lee variables de
// entorno y no escribe nada. Recibe numeros y devuelve numeros. Eso permite:
//   - probarla sin levantar el servidor ni tener MySQL (ver pruebas/unit/)
//   - razonar sobre ella leyendo el codigo, sin seguir un SELECT
//   - reutilizarla desde un script, un trabajo programado o un reporte
//
// ANTES: toda la aritmetica vivia dentro del handler de Express, en medio de
// consultas SQL. El handler era de 80 lineas y para probar "si el margen es
// negativo, que pasa" habia que levantar la API, crear usuarios y parcelas de
// verdad.
//
// CONVENCIONES
//
// - Si un dato falta, el resultado de ese campo es null. Nunca 0, porque 0 es
//   un resultado valido y null significa "no se pudo calcular". Confundirlos
//   hace que el frontend muestre "costo 0" cuando en realidad no hay dato.
// - Toda division esta protegida. Una funcion que puede devolver Infinity o
//   NaN tiene que recibirla por el llamador y ademas explicarla.
// - Redondeo a 2 decimales en los resultados que ve el usuario, pero el
//   redondeo ocurre AL FINAL de la cadena de calculos, nunca entre pasos: si se
//   redondea el costo variable por unidad antes de restarlo del precio, el
//   error se acumula y el punto de equilibrio sale distinto.

/**
 * Redondeo a 2 decimales, que es la precision de los DECIMAL de MySQL.
 *
 * POR QUE NO ES Math.round(n * 100) / 100
 *
 * Porque los numeros decimales no se guardan en base 2. 1.005 no existe: lo mas
 * cercano que hay es 1.0049999999999998934... asi que
 *
 *     Math.round(1.005 * 100) / 100
 *     = Math.round(100.49999999999999) / 100
 *     = 100 / 100
 *     = 1
 *
 * Un monto que vale 1.005 se devuelve como 1, cuando deberia ser 1.01. Y no es un
 * caso raro de laboratorio: cualquier monto cuya tercer decimal sea 5 y que venga
 * de una operacion (un subtotal de varios conceptos, un promedio) cae exactamente
 * ahi.
 *
 * EL ARREGLO
 *
 * Se suma una epsilon antes de redondear. Es el truco estandar para compensar el
 * error de representacion binaria.
 *
 * La epsilon es RELATIVA al numero, no fija: el error de representacion crece
 * con la magnitud, asi que un margen fijo de 1e-9 no alcanzaria para un monto de
 * un millon (donde el error puede ser de 1e-8) y sobraria para uno de centimos.
 *
 * El piso de 1e-9 cubre los numeros chicos, donde el error relativo es enorme
 * pero el absoluto es despreciable.
 */
export function redondear2(n: number): number {
    if (!Number.isFinite(n)) return 0;

    const epsilon = Math.max(1e-9, Math.abs(n) * 1e-12);

    return Math.round((n + epsilon) * 100) / 100;
}

/** Convierte un DECIMAL de MySQL (que llega como texto) a numero. */
export function num(v: unknown): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ===========================================================================
// COSTO GENERAL: COMO SE REPARTE
// ===========================================================================

export interface RepartoGeneral {
    /** Costos totales de la parcela sin producto asignado (id_producto NULL). */
    costosGenerales: number;

    /**
     * Valor total de la produccion de la parcela: suma de (cantidad x precio)
     * de cada producto. Es la base del reparto.
     */
    valorTotal: number;

    /** Valor de la produccion del producto que se esta consultando. */
    valorProducto: number | null;

    /** true si se pudo repartir; false si falta informacion para hacerlo. */
    repartido: boolean;

    /** Porcentaje que le toco a este producto, de 0 a 1. null si no se repartio. */
    proporcion: number | null;

    /** Montos de costos generales atribuidos a este producto. */
    fijosAtribuidos: number;
    variablesAtribuidos: number;

    /**
     * Por que NO se repartio, cuando repartido es false. Se devuelve para que la
     * API lo pase al frontend y no se tenga que adivinar.
     */
    motivo: string | null;
}

/**
 * Decide cuanto costo general le corresponde a un producto.
 *
 * POR QUE NO SE REPARTE PROPORCIONAL A LA PRODUCCION
 *
 * Seria lo obvio, y es la primera idea, pero es incorrecta en este sistema.
 * Una parcela puede tener 200 cajas de tomate y 50 quintales de maiz. Para
 * repartir proporcionalmente a la produccion hay que dividir por una suma de
 * cantidades, y "200 cajas + 50 quintales" no es 250 de nada: son dos
 * magnitudes distintas. El que mas cajas se lleva el reparto, y el maiz queda
 * con menos, solo porque las cajas se cuentan en numeros mas grandes.
 *
 * LA REGLA QUE SI SIRVE
 *
 * Repartir proporcional al VALOR de la produccion: precio x cantidad. El
 * resultado de esa multiplicacion es dinero, y el dinero si se puede sumar
 * entre cultivos distintos. Un producto que genera mas ingreso recibe mas de
 * los costos generales, que es como se comporta un reparto real.
 *
 * CUANDO NO SE REPARTE
 *
 * Si algun producto de la parcela no tiene precio registrado, no hay forma de
 * saber cuanto vale su produccion. En ese caso NO se reparte: se devuelve la
 * razon y los generales por separado. Repartir con una unidad de medida
 * inventada seria peor que no repartir, porque daria un numero con dos decimales
 * que parece tan preciso como los demas.
 *
 * POR QUE EL REPARTO ES OPCIONAL
 *
 * El quinto parametro, repartir, viene del ?repartir_generales=true de la URL y
 * por defecto es false. Los generales se devuelven APARTE y no se atribuyen a
 * nadie salvo que el cliente lo pida.
 *
 * La razon de que sea opcional y no automatico: el reparto por valor es una
 * estimacion, no un dato. Depende de que los precios esten actualizados y de que
 * la produccion registrada sea completa. Meterlo por defecto en un numero que el
 * usuario usa para fijar su precio de venta meteria una estimacion dentro de un
 * dato, sin que nada en la pantalla dijera que hay una estimacion adentro.
 *
 * Con el parametro, el frontend puede mostrar las dos cosas: el costo directo
 * (que es un dato) y el costo con generales repartidos (que es una estimacion).
 */
export function repartirCostosGenerales(
    costosGenerales: number,
    costosGeneralesFijos: number,
    valorTotal: number,
    valorProducto: number | null,
    repartir: boolean = false
): RepartoGeneral {
    const vacio: RepartoGeneral = {
        costosGenerales,
        valorTotal,
        valorProducto,
        repartido: false,
        proporcion: null,
        fijosAtribuidos: 0,
        variablesAtribuidos: 0,
        motivo: null
    };

    // No se pidio repartir. No es un fallo ni un error: es la opcion por defecto,
    // y motivo queda en null para que el frontend no muestre un aviso de
    // "no se pudo repartir" cuando en realidad nadie lo pidio.
    if (!repartir) {
        return vacio;
    }

    if (costosGenerales === 0) {
        // No hay nada que repartir. Es un resultado correcto, no un fallo.
        return { ...vacio, repartido: true, motivo: null };
    }

    if (valorProducto === null) {
        return {
            ...vacio,
            motivo:
                'No se repartieron los costos generales porque falta el precio de venta de este producto.'
        };
    }

    if (valorTotal <= 0) {
        return {
            ...vacio,
            motivo:
                'No se repartieron los costos generales porque la produccion de la parcela no tiene valor de mercado conocido.'
        };
    }

    const proporcion = valorProducto / valorTotal;

    // Si la proporcion se pasa de 1, es que el producto representa mas valor
    // que el total, lo cual solo pasa con datos inconsistentes. Se recorta y se
    // avisa en vez de devolver 103% de los costos.
    const recortada = Math.min(Math.max(proporcion, 0), 1);

    const limite = proporcion > 1 || proporcion < 0;

    return {
        costosGenerales,
        valorTotal,
        valorProducto,
        repartido: true,
        proporcion: recortada,
        fijosAtribuidos: redondear2(costosGeneralesFijos * recortada),
        variablesAtribuidos: redondear2((costosGenerales - costosGeneralesFijos) * recortada),
        motivo: limite
            ? 'La proporcion de este producto superaba el 100% del valor de la parcela, asi que se recorto.'
            : null
    };
}

// ===========================================================================
// COSTO POR UNIDAD
// ===========================================================================

export interface EntradaCostoUnitario {
    /** Costos con id_producto igual al producto consultado. */
    costosProductoTotal: number;
    costosProductoFijos: number;
    costosProductoVariables: number;

    /** Costos con id_producto NULL, compartidos por toda la parcela. */
    costosGenerales: number;
    costosGeneralesFijos: number;

    /** Produccion del producto, en la unidad del producto. null si no hay. */
    produccion: number | null;

    reparto: RepartoGeneral;
}

export interface ResultadoCostoUnitario {
    costosProductoTotal: number;
    costosProductoFijos: number;
    costosProductoVariables: number;

    costosGenerales: number;
    costosGeneralesAtribuidos: number;

    /** Total de fijos, ya con la parte de generales atribuida. */
    costosFijos: number;
    /** Total de variables, ya con la parte de generales atribuida. */
    costosVariables: number;
    costoTotal: number;

    /** Costo de producir una unidad contando solo los costos del producto. */
    costoUnitarioDirecto: number | null;
    /** Parte de costo general que le toco a este producto, por unidad. */
    costoUnitarioGeneral: number | null;
    /** Directo + general. El numero que va al precio. */
    costoUnitario: number | null;

    avisos: string[];
}

export function calcularCostoUnitario(e: EntradaCostoUnitario): ResultadoCostoUnitario {
    const avisos: string[] = [];

    const generalesAtribuidos = e.reparto.repartido
        ? redondear2(e.reparto.fijosAtribuidos + e.reparto.variablesAtribuidos)
        : 0;

    if (e.reparto.motivo) avisos.push(e.reparto.motivo);

    const costosFijos = redondear2(e.costosProductoFijos + e.reparto.fijosAtribuidos);
    const costosVariables = redondear2(
        e.costosProductoVariables + e.reparto.variablesAtribuidos
    );
    const costoTotal = redondear2(e.costosProductoTotal + generalesAtribuidos);

    const hayProduccion = e.produccion !== null && e.produccion > 0;

    if (!hayProduccion) {
        avisos.push(
            'No hay produccion registrada para este producto, asi que no se puede calcular el costo por unidad.'
        );
    }

    const costoUnitarioDirecto = hayProduccion
        ? redondear2(e.costosProductoTotal / (e.produccion as number))
        : null;

    const costoUnitarioGeneral = hayProduccion && generalesAtribuidos > 0
        ? redondear2(generalesAtribuidos / (e.produccion as number))
        : hayProduccion
          ? 0
          : null;

    const costoUnitario = hayProduccion ? redondear2(costoTotal / (e.produccion as number)) : null;

    return {
        costosProductoTotal: redondear2(e.costosProductoTotal),
        costosProductoFijos: redondear2(e.costosProductoFijos),
        costosProductoVariables: redondear2(e.costosProductoVariables),
        costosGenerales: redondear2(e.costosGenerales),
        costosGeneralesAtribuidos: generalesAtribuidos,
        costosFijos,
        costosVariables,
        costoTotal,
        costoUnitarioDirecto,
        costoUnitarioGeneral,
        costoUnitario,
        avisos
    };
}

// ===========================================================================
// PUNTO DE EQUILIBRIO
// ===========================================================================

export interface EntradaPuntoEquilibrio {
    costosFijos: number;
    costosVariables: number;
    produccion: number | null;
    precioVenta: number | null;
}

export interface ResultadoPuntoEquilibrio {
    /** Costos variables por unidad de venta. null si no hay produccion. */
    costoVariableUnidad: number | null;

    /** precio - costoVariableUnidad. null si falta precio o produccion. */
    margenContribucion: number | null;

    /**
     * Costos fijos que hay que recuperar, y cuantas unidades hacen falta.
     *
     * El 0 es un resultado VALIDO y distinto de null: significa que no hay
     * costos fijos, que ya no hay nada que recuperar. null significa que el
     * calculo no se puede hacer. El frontend tiene que poder distinguir los dos
     * casos, asi que no se simplifica ninguno de los dos.
     */
    puntoEquilibrioUnidades: number | null;

    /** El mismo resultado redondeado a entero para mostrar "cuantas unidades". */
    puntoEquilibrioUnidadesRedondeado: number | null;

    /** Por que no se pudo calcular, si no se pudo. */
    motivo: string | null;

    /** Que margen le falta, o que precio haria falta, para que si sea negocio. */
    precioMinimoUtil: number | null;
}

export function calcularPuntoEquilibrio(
    e: EntradaPuntoEquilibrio
): ResultadoPuntoEquilibrio {
    const { costosFijos, costosVariables, produccion, precioVenta } = e;

    const hayProduccion = produccion !== null && produccion > 0;

    const costoVariableUnidad = hayProduccion
        ? redondear2(costosVariables / (produccion as number))
        : null;

    const margen =
        precioVenta !== null && costoVariableUnidad !== null
            ? redondear2(precioVenta - costoVariableUnidad)
            : null;

    // El margen tiene que ser estrictamente positivo.
    //
    //   margen = 0     -> cada unidad vendida repone lo que costaba producirla.
    //                      Los fijos nunca se recuperan: no hay punto de
    //                      equilibrio, y fijos/0 seria Infinity.
    //   margen < 0     -> cada venta pierde plata. fijos/margen daria un numero
    //                      negativo, que no significa nada como "unidades a
    //                      vender".
    //
    // Devolver null en los dos casos y explicar el motivo es mejor que devolver
    // un numero raro: el cliente no sabe que hacer con -15 unidades.
    const puntoEquilibrioUnidades =
        margen !== null && margen > 0 ? redondear2(costosFijos / margen) : null;

    let motivo: string | null = null;

    if (!hayProduccion) {
        motivo =
            'No hay produccion registrada para este producto, asi que no se puede calcular el punto de equilibrio.';
    } else if (precioVenta === null) {
        motivo =
            'No hay precio de venta registrado en el historial para este producto o canal.';
    } else if (costoVariableUnidad !== null && costoVariableUnidad <= 0) {
        // Produccion positiva y costo variable cero es un dato raro (o un error
        // de captura). Se avisa en vez de devolver un margen gigante.
        motivo =
            'Los costos variables son cero, asi que cualquier precio deja ganancia. Revisa los costos de la parcela.';
    } else if (margen !== null && margen === 0) {
        motivo =
            'El precio de venta es igual al costo variable: cada unidad vendida repone lo que costo, y los costos fijos nunca se recuperan.';
    } else if (margen !== null && margen < 0) {
        motivo = 'El precio de venta es menor que el costo variable: cada unidad vendida genera perdida.';
    }

    // El precio minimo para que una unidad deje algo: el costo variable mas un
    // margen minimo del 10%. Es una referencia, no una recomendacion, y se
    // devuelve solo cuando hay los datos para calcularlo.
    const precioMinimoUtil =
        costoVariableUnidad !== null && costoVariableUnidad > 0
            ? redondear2(costoVariableUnidad * 1.1)
            : null;

    return {
        costoVariableUnidad,
        margenContribucion: margen,
        puntoEquilibrioUnidades,
        puntoEquilibrioUnidadesRedondeado:
            puntoEquilibrioUnidades === null
                ? null
                : Math.ceil(puntoEquilibrioUnidades),
        motivo,
        precioMinimoUtil
    };
}

// ===========================================================================
// PUNTO DE EQUILIBRIO CON REPARTO DE GENERALES
// ===========================================================================

/**
 * Atajo: punto de equilibrio usando los costos con la parte de generales ya
 * atribuida.
 *
 * Sirve para que las rutas no tengan que sumar a mano dos cosas y equivocarse
 * en el orden. La aritmetica sigue siendo la de arriba.
 */
export function calcularPuntoEquilibrioConReparto(
    entrada: EntradaPuntoEquilibrio,
    fijosAtribuidos: number,
    variablesAtribuidas: number
): ResultadoPuntoEquilibrio {
    return calcularPuntoEquilibrio({
        costosFijos: redondear2(entrada.costosFijos + fijosAtribuidos),
        costosVariables: redondear2(entrada.costosVariables + variablesAtribuidas),
        produccion: entrada.produccion,
        precioVenta: entrada.precioVenta
    });
}
