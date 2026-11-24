// Para que TypeScript sepa que res.locals.usuario existe.

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
