// types/express.d.ts
//
// Tipa res.locals.usuario, que antes era any.
//
// Que problema resuelve: protegerRuta colocaba el contenido del JWT en
// res.locals.usuario, y como no habia tipo, cualquier propiedad pasaba el
// typecheck. Si un dia el token traia {id, nombre} y las rutas usaban
// usuario.id, TypeScript no avisaba de nada. Renombrar el campo en el token
// rompia las 20 rutas en silencio, y el error aparecia en produccion como
// "Cannot read properties of undefined".
//
// Ahora el token tiene una forma declarada, y si no cumple, el middleware de
// autenticacion lo rechaza con 401 antes de llegar a ninguna ruta.

import type { UsuarioAutenticado } from '../auth/tipos';

declare global {
    namespace Express {
        interface Locals {
            /**
             * Datos del usuario que viene del token verificado.
             * Solo existe en rutas que pasan por protegerRuta.
             */
            usuario?: UsuarioAutenticado;
        }
    }
}

export {};