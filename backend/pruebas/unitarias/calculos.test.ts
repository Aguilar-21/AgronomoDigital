// pruebas/unitarias/calculos.test.ts
//
// Pruebas de las funciones puras de servicios/calculos.ts.
//
// ESTAS PRUEBAS NO TOCAN LA BASE DE DATOS
//
// Y es lo mas importante que tienen: son funciones puras, sin MySQL, sin red y
// sin temporizadores. Corren en milisegundos y se pueden ejecutar en cualquier
// maquina, con o sin base de datos instalada.
//
// Por eso son la unica capa que se puede probar de verdad en cada cambio. Las
// pruebas contra la base son necesarias para el SQL, pero fallan cuando MySQL no
// esta disponible y entonces no se ejecutan, y lo que no se ejecuta no
// proteja nada.
//
// QUE SE PRUEBA Y POR QUE
//
// Cada caso tiene el nombre de la regla, no el del comportamiento tecnico. Un
// test que se llama "devuelve null sin produccion" se puede renombrar el dia que
// cambie la funcion y nadie sabria que estaba protegiendo la regla de que 0 y
// null no son lo mismo. Uno que se llama "cero con costos fijos es un resultado
// valido, no un error" sigue diciendo la verdad dentro de un ano.

import { describe, expect, it } from 'vitest';
import {
    redondear2,
    num,
    repartirCostosGenerales,
    calcularCostoUnitario,
    calcularPuntoEquilibrio
} from '../../src/services/calculos';

describe('num: conversion de DECIMAL de MySQL', () => {
    it('convierte el texto que devuelve mysql2 para un DECIMAL', () => {
        // mysql2 devuelve los DECIMAL como string, no como number, para no
        // perder precision. Sin esta conversion, sumar dos montos da "50.00" en
        // vez de 50.
        expect(num('1500.50')).toBe(1500.5);
    });

    it('devuelve 0 para null, undefined, texto vacio y basura', () => {
        // La regla es "algo que no es numero es 0", no NaN. Un NaN se propaga
        // por toda la aritmetica y al final aparece como null en la respuesta,
        // que es peor que decir 0: el usuario no puede saber que paso.
        expect(num(null)).toBe(0);
        expect(num(undefined)).toBe(0);
        expect(num('')).toBe(0);
        expect(num('no soy un numero')).toBe(0);
    });

    it('conserva decimales que el redondeo a 2 no tocaria', () => {
        expect(num('0.25')).toBe(0.25);
    });
});

describe('redondear2', () => {
    it('redondea a dos decimales', () => {
        expect(redondear2(1.006)).toBe(1.01);
        expect(redondear2(2.344)).toBe(2.34);
    });

    it('redondea 1.005 a 1.01 y no a 1', () => {
        // Esta prueba existe porque el fallo fue real y no teorico.
        //
        // 1.005 no se puede representar en base 2: lo mas cercano es
        // 1.0049999999999998934. Con Math.round(n * 100) / 100 eso da
        // Math.round(100.49999999999999) = 100, o sea 1 en vez de 1.01.
        //
        // Afectaba a todos los montos de la API: cualquier subtotal de tres
        // decimales terminaba en 5 caia al piso.
        expect(redondear2(1.005)).toBe(1.01);
        expect(redondear2(2.675)).toBe(2.68);
        expect(redondear2(0.145)).toBe(0.15);
    });

    it('redondea bien en magnitudes grandes', () => {
        // La epsilon es relativa justamente por esto: con una fija, un monto de
        // un millon seguia cayendo al piso.
        expect(redondear2(1000000.005)).toBe(1000000.01);
        expect(redondear2(12345.675)).toBe(12345.68);
    });

    it('no sube un numero que solo esta un pelo debajo del limite', () => {
        // El otro riesgo de la epsilon: empujar hacia arriba un numero que de
        // verdad es menor. Con DECIMAL(10,2) una diferencia de 1e-9 no es
        // representable en la base, asi que subirla o bajarla da el mismo dato.
        expect(redondear2(1.004)).toBe(1.0);
        expect(redondear2(0.999)).toBe(1.0);
    });

    it('no toca un numero que ya tiene dos decimales', () => {
        expect(redondear2(2.5)).toBe(2.5);
        expect(redondear2(100)).toBe(100);
        expect(redondear2(0)).toBe(0);
    });

    it('devuelve 0 en vez de NaN o Infinity', () => {
        // Un NaN se propaga por toda la aritmetica y termina apareciendo como
        // null en la respuesta JSON, que es peor que 0.
        expect(redondear2(NaN)).toBe(0);
        expect(redondear2(Infinity)).toBe(0);
        expect(redondear2(-Infinity)).toBe(0);
    });
});

describe('repartirCostosGenerales: no se reparte por defecto', () => {
    const base = {
        costosGenerales: 1000,
        costosGeneralesFijos: 400,
        valorTotal: 10000,
        valorProducto: 5000
    };

    it('sin pedirlo, no atribuye nada y no se queja', () => {
        // Esta es la regla de seguridad: los generales son una estimacion, y
        // meterlos por defecto en el numero que el usuario usa para fijar su
        // precio de venta esconde una suposicion dentro de un dato.
        const r = repartirCostosGenerales(
            base.costosGenerales,
            base.costosGeneralesFijos,
            base.valorTotal,
            base.valorProducto
        );

        expect(r.repartido).toBe(false);
        expect(r.fijosAtribuidos).toBe(0);
        expect(r.variablesAtribuidos).toBe(0);
        expect(r.motivo).toBeNull();
    });

    it('con repartir=true y proporcion exacta, reparte la mitad', () => {
        const r = repartirCostosGenerales(
            base.costosGenerales,
            base.costosGeneralesFijos,
            base.valorTotal,
            base.valorProducto,
            true
        );

        expect(r.repartido).toBe(true);
        expect(r.proporcion).toBe(0.5);
        expect(r.fijosAtribuidos).toBe(200); // 400 fijos * 0.5
        expect(r.variablesAtribuidos).toBe(300); // (1000 - 400) * 0.5
        expect(r.fijosAtribuidos + r.variablesAtribuidos).toBe(500);
    });

    it('no reparte si falta el precio del producto, y lo explica', () => {
        const r = repartirCostosGenerales(1000, 400, 10000, null, true);

        expect(r.repartido).toBe(false);
        expect(r.motivo).toContain('falta el precio');
    });

    it('no reparte si el valor total es cero', () => {
        const r = repartirCostosGenerales(1000, 400, 0, 500, true);

        expect(r.repartido).toBe(false);
        expect(r.motivo).toContain('valor de mercado');
    });

    it('trata cero costo general como repartido sin problema', () => {
        // No hay nada que repartir. Es un resultado correcto, no un fallo, y por
        // eso motivo queda en null: no hay nada que avisar.
        const r = repartirCostosGenerales(0, 0, 10000, 5000, true);

        expect(r.repartido).toBe(true);
        expect(r.motivo).toBeNull();
        expect(r.fijosAtribuidos).toBe(0);
    });

    it('recorta una proporcion sobre 1 y avisa', () => {
        // Datos inconsistentes: el producto "vale" mas que toda la parcela. Sin
        // recortar, devolveria mas del 100% de los generales.
        const r = repartirCostosGenerales(1000, 400, 1000, 5000, true);

        expect(r.proporcion).toBe(1);
        expect(r.motivo).toContain('recorto');
    });
});

describe('calcularCostoUnitario', () => {
    const repartoSinReparto = {
        costosGenerales: 0,
        valorTotal: 0,
        valorProducto: null,
        repartido: false,
        proporcion: null,
        fijosAtribuidos: 0,
        variablesAtribuidos: 0,
        motivo: null
    };

    it('divide los costos del producto por la produccion', () => {
        const r = calcularCostoUnitario({
            costosProductoTotal: 5000,
            costosProductoFijos: 1000,
            costosProductoVariables: 4000,
            costosGenerales: 0,
            costosGeneralesFijos: 0,
            produccion: 100,
            reparto: repartoSinReparto
        });

        // 5000 / 100 cajas
        expect(r.costoUnitarioDirecto).toBe(50);
        expect(r.costoUnitario).toBe(50);
    });

    it('devuelve null, no cero, cuando no hay produccion', () => {
        // El punto del cambio: 0 y null significan cosas distintas. Un 0 aqui
        // significaria "cada unidad cuesta cero", que es un negocio roto, y el
        // usuario no tendria forma de saber que el dato falta.
        const r = calcularCostoUnitario({
            costosProductoTotal: 5000,
            costosProductoFijos: 0,
            costosProductoVariables: 5000,
            costosGenerales: 0,
            costosGeneralesFijos: 0,
            produccion: null,
            reparto: repartoSinReparto
        });

        expect(r.costoUnitario).toBeNull();
        expect(r.costoUnitarioDirecto).toBeNull();
        expect(r.avisos.some((a) => a.includes('No hay produccion'))).toBe(true);
    });

    it('separa el costo directo del costo general atribuido', () => {
        const r = calcularCostoUnitario({
            costosProductoTotal: 5000,
            costosProductoFijos: 0,
            costosProductoVariables: 5000,
            costosGenerales: 2000,
            costosGeneralesFijos: 0,
            produccion: 100,
            reparto: {
                ...repartoSinReparto,
                repartido: true,
                fijosAtribuidos: 0,
                variablesAtribuidos: 1000
            }
        });

        // Directo: 5000 / 100 = 50. Con la parte de generales: 6000 / 100 = 60.
        expect(r.costoUnitarioDirecto).toBe(50);
        expect(r.costoUnitarioGeneral).toBe(10);
        expect(r.costoUnitario).toBe(60);
    });
});

describe('calcularPuntoEquilibrio: cero y null no son lo mismo', () => {
    it('cero con costos fijos en cero es un resultado valido', () => {
        // La regla: si no hay costos fijos, no hay nada que recuperar, y el
        // punto de equilibrio es 0. Antes esto se confundia con "no se pudo
        // calcular" y las dos cosas salian igual.
        const r = calcularPuntoEquilibrio({
            costosFijos: 0,
            costosVariables: 1000,
            produccion: 100, // 10 por unidad
            precioVenta: 15 // margen 5
        });

        expect(r.puntoEquilibrioUnidades).toBe(0);
        expect(r.puntoEquilibrioUnidadesRedondeado).toBe(0);
        expect(r.motivo).toBeNull();
    });

    it('sin produccion devuelve null con motivo', () => {
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 500,
            produccion: null,
            precioVenta: 20
        });

        expect(r.puntoEquilibrioUnidades).toBeNull();
        expect(r.motivo).toContain('No hay produccion');
    });

    it('sin precio devuelve null con motivo', () => {
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 500,
            produccion: 100,
            precioVenta: null
        });

        expect(r.puntoEquilibrioUnidades).toBeNull();
        expect(r.motivo).toContain('precio de venta');
    });

    it('con margen exactamente cero devuelve null, no Infinity', () => {
        // 1000 fijos / 0 seria Infinity, y JSON.stringify(Infinity) es null.
        // O sea, el endpoint devolveria null sin decir por que. Ahora el motivo
        // esta a la vista.
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 1000,
            produccion: 100, // 10 por unidad
            precioVenta: 10 // margen 0
        });

        expect(r.margenContribucion).toBe(0);
        expect(r.puntoEquilibrioUnidades).toBeNull();
        expect(r.motivo).toContain('igual al costo variable');
    });

    it('con margen negativo devuelve null y explica que se pierde plata', () => {
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 1000,
            produccion: 100, // 10 por unidad
            precioVenta: 8 // margen -2
        });

        expect(r.puntoEquilibrioUnidades).toBeNull();
        expect(r.motivo).toContain('perdida');
    });

    it('calcula el punto de equilibrio y lo redondea hacia arriba', () => {
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 1000,
            produccion: 100, // 10 por unidad
            precioVenta: 15 // margen 5
        });

        // 1000 / 5 = 200 exactas
        expect(r.puntoEquilibrioUnidades).toBe(200);
        expect(r.puntoEquilibrioUnidadesRedondeado).toBe(200);
    });

    it('redondea hacia arriba, no al mas cercano', () => {
        // Vender 100.4 unidades no alcanza: hay que vender 101.
        const r = calcularPuntoEquilibrio({
            costosFijos: 1002,
            costosVariables: 0,
            produccion: 1,
            precioVenta: 10 // margen 10
        });

        expect(r.puntoEquilibrioUnidades).toBe(100.2);
        expect(r.puntoEquilibrioUnidadesRedondeado).toBe(101);
    });

    it('avisa si los costos variables son cero', () => {
        // Produccion positiva con costo variable cero es un dato raro o un error
        // de captura. Con el, el margen seria el precio entero y el punto de
        // equilibrio una fraccion.
        const r = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 0,
            produccion: 100,
            precioVenta: 20
        });

        expect(r.motivo).toContain('costos variables son cero');
    });

    it('propaga el precio minimo util solo cuando hay costo variable', () => {
        const conCosto = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 1000,
            produccion: 100,
            precioVenta: 20
        });

        // 10 de costo variable * 1.1
        expect(conCosto.precioMinimoUtil).toBe(11);

        const sinProduccion = calcularPuntoEquilibrio({
            costosFijos: 1000,
            costosVariables: 1000,
            produccion: null,
            precioVenta: 20
        });

        expect(sinProduccion.precioMinimoUtil).toBeNull();
    });
});
