// pruebas/unitarias/publicaciones.test.ts
//
// Pruebas del ESQUEMA de POST /publicaciones.
//
// ESTAS PRUEBAS NO TOCAN LA BASE DE DATOS
//
// Son Zod puro: validan lo que entra y lo que sale del cuerpo, sin MySQL, sin red
// y sin abrir puertos. Corren en milisegundos.
//
// POR QUE HAY UN ARCHIVO DEDICADO A ESTO
//
// Porque el bug del ciclo era invisible en los calculos y era el mas caro del
// modulo de mercado.
//
// Que paso: POST /publicaciones buscaba la produccion disponible pasando
// cuerpo.fecha donde esperaba un ciclo. Fecha es "2026-09-29" y ciclo es
// "actual" o "2026-A", asi que la busqueda no encontraba NUNCA una produccion y
// toda publicacion terminaba en el 409 de "no hay produccion registrada".
//
// Por que las pruebas de calculo no lo detectaban: calcularCostoUnitario y
// calcularPuntoEquilibrio reciben la produccion ya resuelta. El bug estaba en la
// consulta que produce esa variable, aguas arriba, y ninguna prueba de aritmetica
// lo podia ver.
//
// Que no se repita: el esquema ahora obliga a que ciclo tenga un valor explicito
// y por defecto 'actual', asi que la ruta ya no puede volver a confuses fecha con
// ciclo. Estas pruebas fijan ese default.

import { describe, expect, it } from 'vitest';
import { crearPublicacionSchema } from '../../src/schemas/publicaciones';

/** Cuerpo minimo valido. */
const valido = {
    id_parcela: 1,
    id_producto: 1,
    cantidad: 100,
    precio_unitario: 55,
    fecha: '2026-09-29'
};

describe('POST /publicaciones: ciclo', () => {
    it('sin ciclo, usa "actual" para no depender de la fecha', () => {
        // Esta es la linea que evita el bug del que habla el encabezado del
        // archivo. Si alguien saca el default, esta prueba se cae.
        const r = crearPublicacionSchema.parse(valido);

        expect(r.ciclo).toBe('actual');
    });

    it('"actual" NO puede ser la fecha de la publicacion', () => {
        // La confusion era justo esta: usar la fecha como si fuera el ciclo.
        // Las dos cosas existen en el cuerpo y son distintas a proposito.
        const r = crearPublicacionSchema.parse(valido);

        expect(r.ciclo).not.toBe(r.fecha);
        expect(r.fecha).toBe('2026-09-29');
    });

    it('acepta un ciclo explicito de temporada', () => {
        const r = crearPublicacionSchema.parse({ ...valido, ciclo: '2026-A' });

        expect(r.ciclo).toBe('2026-A');
    });

    it('acepta el ciclo que usa POST /parcelas/:id/produccion', () => {
        // Los dos endpoints tienen que hablar el mismo idioma de ciclos. Si uno
        // usa 'actual' y el otro no, la comparacion de disponibilidad no
        // encuentra nada y el 409 vuelve a aparecer.
        const r = crearPublicacionSchema.parse({ ...valido, ciclo: 'actual' });

        expect(r.ciclo).toBe('actual');
    });

    it('rechaza un ciclo vacio o solo espacios', () => {
        // Sin trim, " " pasaria el min(1) y crearia una fila con un ciclo que no
        // existe en ninguna parte.
        const r = crearPublicacionSchema.safeParse({ ...valido, ciclo: '   ' });

        expect(r.success).toBe(false);
    });

    it('rechaza un ciclo absurdamente largo', () => {
        const r = crearPublicacionSchema.safeParse({
            ...valido,
            ciclo: 'c'.repeat(31)
        });

        expect(r.success).toBe(false);
    });

    it('recorta los espacios del ciclo', () => {
        const r = crearPublicacionSchema.parse({ ...valido, ciclo: '  2026-A  ' });

        expect(r.ciclo).toBe('2026-A');
    });
});

describe('POST /publicaciones: campos que ya se validaban', () => {
    it('exige producto, cantidad, precio y fecha', () => {
        for (const campo of ['id_producto', 'cantidad', 'precio_unitario', 'fecha']) {
            const cuerpo: Record<string, unknown> = { ...valido };
            delete cuerpo[campo];

            const r = crearPublicacionSchema.safeParse(cuerpo);

            expect(r.success, `deberia rechazar falta de ${campo}`).toBe(false);
        }
    });

    it('rechaza cantidad cero o negativa', () => {
        for (const cantidad of [0, -5]) {
            const r = crearPublicacionSchema.safeParse({ ...valido, cantidad });

            expect(r.success, `deberia rechazar cantidad ${cantidad}`).toBe(false);
        }
    });

    it('rechaza texto donde va un numero', () => {
        // El bug viejo: "abc" <= 0 es false en JS, asi que cantidad: "abc" pasaba
        // la comprobacion manual y llegaba a MySQL como texto.
        const r = crearPublicacionSchema.safeParse({ ...valido, cantidad: 'abc' });

        expect(r.success).toBe(false);
    });

    it('convierte a numero los campos que llegan como texto de un formulario', () => {
        // El HTML manda strings. Un formulario que no convierte antes de enviar
        // manda "100" y "55", y eso tiene que funcionar.
        const r = crearPublicacionSchema.parse({
            ...valido,
            cantidad: '100',
            precio_unitario: '55'
        });

        expect(r.cantidad).toBe(100);
        expect(r.precio_unitario).toBe(55);
    });

    it('acepta id_canal ausente y lo resuelve la ruta', () => {
        const r = crearPublicacionSchema.parse(valido);

        expect(r.id_canal).toBeUndefined();
    });

    it('acepta estado en el cuerpo pero la ruta lo ignora', () => {
        // Aceptarlo evita romper clientes viejos; descartarlo en la ruta impide
        // publicar ya "vendido" por la puerta de atras.
        const r = crearPublicacionSchema.parse({ ...valido, estado: 'vendido' });

        expect(r.estado).toBe('vendido');
    });

    it('rechaza un estado inventado', () => {
        const r = crearPublicacionSchema.safeParse({ ...valido, estado: 'enventa' });

        expect(r.success).toBe(false);
    });

    it('deja id_parcela ausente sin romper el esquema', () => {
        // El esquema lo deja opcional a proposito: la ruta responde con un 400
        // que explica que hace falta para comprobar la produccion, que es mejor
        // que un "campo obligatorio" que no dice por que.
        const r = crearPublicacionSchema.parse({
            id_producto: 1,
            cantidad: 100,
            precio_unitario: 55,
            fecha: '2026-09-29'
        });

        expect(r.id_parcela).toBeUndefined();
        expect(r.ciclo).toBe('actual');
    });
});
