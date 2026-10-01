// auth/tipos.ts
//
// La forma exacta del token, en un solo lugar.
//
// Esto es lo que convierte "cualquier cosa del JWT" en un tipo que TypeScript
// puede verificar. Si el token no trae id numerico, el middleware lo rechaza
// con 401 en vez de dejarlo pasar hasta que una ruta intente usar usuario.id y
// reviente con un error de JavaScript.

export interface UsuarioAutenticado {
    id: number;
    nombre: string;
}

/**
 * Convierte lo que salio de jwt.verify en un UsuarioAutenticado, o null si no
 * tiene la forma minima.
 *
 * Por que normaliza en vez de solo comprobar: id puede llegar como numero (asi
 * lo firma jwt.sign) o como texto si el token se armo en otro lado. Se acepta
 * el texto numerico porque un id de MySQL nunca es "38abc".
 *
 * Nombre vacio es aceptable a proposito: el nombre solo se usa para mostrar, y
 * un token sin nombre no es una razon para rechazar a alguien.
 */
export function normalizarUsuario(datos: unknown): UsuarioAutenticado | null {
    if (typeof datos !== 'object' || datos === null) return null;

    const d = datos as Record<string, unknown>;

    const id = typeof d.id === 'number' ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) return null;

    const nombre = typeof d.nombre === 'string' ? d.nombre : '';

    return { id, nombre };
}

/**
 * Lee el usuario autenticado que dejo protegerRuta.
 *
 * Por que hace falta: res.locals.usuario es opcional en el tipo, porque hay
 * rutas abiertas (registro, login) donde no existe. TypeScript entonces obliga
 * a comprobarlo en cada uso, y eso se tradujo en 26 llamadas a
 * res.locals.usuario.id con un ! al final.
 *
 * El ! dice "esto ya se que no es undefined", pero es una promesa que el
 * compilador no verifica. Esta funcion la verifica de verdad: si por un error
 * de orden de middlewares una ruta protegida llegara sin usuario, lanza un
 * error en vez de seguir con un undefined que reventaria tres lineas mas abajo.
 */
export function usuarioActual(res: { locals: Express.Locals }): UsuarioAutenticado {
    if (!res.locals.usuario) {
        throw new Error(
            'usuarioActual() se llamo en una ruta sin protegerRuta. Revisa el orden de los middlewares.'
        );
    }
    return res.locals.usuario;
}