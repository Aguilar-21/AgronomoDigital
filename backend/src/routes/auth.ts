// Registro y login. La contrasena se guarda con bcrypt.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db';
import { validar } from '../middleware/validar';
import { firmarToken } from '../middleware/auth';
import { registroSchema, loginSchema } from '../schemas/auth';
import { logger } from '../logger';
import { ErrorHttp } from '../middleware/errores';

const router = Router();

const RONDAS_BCRYPT = 10;

function mensajeDuplicado(error: unknown): string {
    const texto = String((error as { message?: string }).message ?? '');

    if (/correo/i.test(texto)) return 'Ese correo ya esta registrado';
    if (/usuario/i.test(texto)) return 'Ese nombre de usuario ya esta en uso';

    return 'Ese usuario o correo ya esta registrado';
}

router.post('/registro', validar(registroSchema), async (req, res) => {
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
        const result = db.prepare(
            'INSERT INTO usuarios (usuario, nombre, correo, contrasena) VALUES (?, ?, ?, ?)'
        ).run(nombreUsuario, nombre, correo, hash);

        logger.info(
            { idUsuario: result.lastInsertRowid, usuario: nombreUsuario },
            'usuario registrado'
        );

        res.status(201).json({
            mensaje: 'Usuario registrado',
            id_usuario: result.lastInsertRowid,
            usuario: nombreUsuario
        });
    } catch (error) {
        const msg = String((error as { message?: string }).message ?? '');
        if (/UNIQUE constraint failed/i.test(msg)) {
            throw new ErrorHttp(409, mensajeDuplicado(error));
        }
        throw error;
    }
});

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

    let where: string;
    let parametros: (string | number)[];

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

    const filas = db.prepare(
        'SELECT id_usuario, nombre, usuario, contrasena FROM usuarios WHERE ' + where
    ).all(...parametros) as { id_usuario: number; nombre: string; usuario: string; contrasena: string }[];

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
