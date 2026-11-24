// La forma del usuario que viene en el token.

export interface UsuarioAutenticado {
    id: number;
    nombre: string;
}

/** Convierte lo que devuelve jwt.verify en un usuario, o null si no sirve. */
export function normalizarUsuario(datos: unknown): UsuarioAutenticado | null {
    if (typeof datos !== 'object' || datos === null) return null;

    const d = datos as Record<string, unknown>;

    const id = typeof d.id === 'number' ? d.id : Number(d.id);
    if (!Number.isInteger(id) || id <= 0) return null;

    const nombre = typeof d.nombre === 'string' ? d.nombre : '';

    return { id, nombre };
}

/** Lee el usuario que puso protegerRuta en res.locals. */
export function usuarioActual(res: { locals: Express.Locals }): UsuarioAutenticado {
    if (!res.locals.usuario) {
        throw new Error(
            'usuarioActual() se llamo en una ruta sin protegerRuta. Revisa el orden de los middlewares.'
        );
    }
    return res.locals.usuario;
}
