// Registro y login. La contrasena se guarda con bcrypt.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { validar } from '../middleware/validar';
import { firmarToken } from '../middleware/auth';
import { registroSchema, loginSchema } from '../schemas/auth';
import { logger } from '../logger';
import { ErrorHttp } from '../middleware/errores';

const router = Router();

/** Rondas de sal de bcrypt. 10 es el valor por defecto recomendado. */
const RONDAS_BCRYPT = 10;

/**
 * El nombre del índice de MySQL dice si se repitió el correo o el usuario.
 * Hay que buscar "correo" primero porque el otro nombre también lo contiene.
 */
function mensajeDuplicado(error: unknown): string {
    const texto = String((error as { message?: string }).message ?? '');
    const clave = /for key '([^']+)'/.exec(texto)?.[1] ?? '';

    if (/correo/i.test(clave)) return 'Ese correo ya esta registrado';
    if (/usuario/i.test(clave)) return 'Ese nombre de usuario ya esta en uso';

    return 'Ese usuario o correo ya esta registrado';
}

/** POST /registro -> 201 { mensaje, id_usuario }; 409 si se repite usuario o correo. */
router.post('/registro', validar(registroSchema), async (req, res) => {
    // req.body ya viene parseado por el middleware: usuario y correo llegan
    const {
        usuario: nombreUsuario,
        nombre,
        correo,
        contrasena
    } = req.body as {
        usuario: string;
        nombre: string;
        correo: string;
        contrasena: string;
    };

    const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);

    try {
        const [creado] = await pool.query<ResultSetHeader>(
            'INSERT INTO usuarios (usuario, nombre, correo, contrasena) VALUES (?, ?, ?, ?)',
            [nombreUsuario, nombre, correo, hash]
        );

        logger.info(
            { idUsuario: creado.insertId, usuario: nombreUsuario },
            'usuario registrado'
        );

        res.status(201).json({
            mensaje: 'Usuario registrado',
            id_usuario: creado.insertId,
            usuario: nombreUsuario
        });
    } catch (error) {
        // El 409 se decide por el indice que fallo, no por un SELECT previo.
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
            throw new ErrorHttp(409, mensajeDuplicado(error));
        }
        throw error;
    }
});

/**
 * POST /login. Acepta identificador (usuario o correo), usuario o correo.
 * Si vienen varios, gana identificador, después usuario y por último correo.
 */
router.post('/login', validar(loginSchema), async (req, res) => {
    const {
        identificador,
        usuario: usuarioLogin,
        correo: correoLogin,
        contrasena
    } = req.body as {
        identificador?: string;
        usuario?: string;
        correo?: string;
        contrasena: string;
    };

    // El WHERE cambia segun lo que haya mandado el cliente. Los valores ya
    let where: string;
    let parametros: string[];

    if (identificador !== undefined) {
        where = '(usuario = ? OR correo = ?)';
        parametros = [identificador, identificador];
    } else if (usuarioLogin !== undefined) {
        where = 'usuario = ?';
        parametros = [usuarioLogin];
    } else {
        where = 'correo = ?';
        parametros = [correoLogin as string];
    }

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_usuario, nombre, usuario, contrasena FROM usuarios WHERE ' + where,
        parametros
    );

    const credencialesIncorrectas = new ErrorHttp(
        401,
        'Usuario o contrasena incorrectos'
    );

    if (filas.length === 0) {
        logger.warn({ identificador: identificador ?? usuarioLogin ?? correoLogin }, 'login con cuenta inexistente');
        throw credencialesIncorrectas;
    }

    const cuenta = filas[0];

    const coincide = await bcrypt.compare(contrasena, cuenta.contrasena);

    if (!coincide) {
        logger.warn({ idUsuario: cuenta.id_usuario }, 'login con contrasena incorrecta');
        throw credencialesIncorrectas;
    }

    const token = firmarToken(Number(cuenta.id_usuario), String(cuenta.nombre));

    logger.info({ idUsuario: cuenta.id_usuario }, 'login correcto');

    res.json({
        token,
        mensaje: 'Sesion iniciada',
        usuario: cuenta.usuario
    });
});

export default router;
