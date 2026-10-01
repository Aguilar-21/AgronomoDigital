// vitest.config.ts
//
// Configuracion de las pruebas unitarias.
//
// ESTAS PRUEBAS NO ABREN PUERTOS NI TOCAN LA BASE
//
// include solo cubre pruebas/unitarias. Las de integracion viven en otro
// archivo (vitest.integracion.config.ts) y se corren aparte con
// npm run test:integration.
//
// La razon de separarlas es el tiempo. Las unitarias corren en milisegundos y
// se pueden ejecutar en cada guardado de archivo; las de integracion tardan
// segundos porque levantan MySQL y migran la base. Si van juntas, el que espera
// un minuto para ver un error de una division por un numero, deja de correrlas.

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['pruebas/unitarias/**/*.test.ts'],

        // node: el codigo usa process.env y fs, que no existen en el navegador.
        environment: 'node',

        // Las pruebas de calculo son puras y no dependen del orden. Se dice
        // igual para que el resultado no cambie si manana se agrega una que si.
        sequence: {
            shuffle: false
        },

        reporters: ['default']
    }
});
