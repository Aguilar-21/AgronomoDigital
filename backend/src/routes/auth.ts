// routes/auth.ts
//
// POST /registro y POST /login.
//
// QUE CAMBIA
//
// 1. El correo ya llega normalizado desde el esquema zod (trim + minusculas).
//    No hay que acordarse de normalizar en la ruta.
//
// 2. Desaparecio el SELECT previo para ver si el correo existe. Ahora se inserta
//    y se atrapa el error de clave duplicada de MySQL.
//
// POR QUE SE QUITO EL SELECT PREVIO
//
// El codigo era:
//
//     SELECT id_usuario FROM usuarios WHERE correo = ?
//     if (existe) return 409
//     INSERT INTO usuarios ...
//
// Parece correcto y tiene una condicion de carrera: entre el SELECT y el INSERT
// otra peticion puede insertar el mismo correo. Las dos pasan el SELECT (no
// existe todavia), las dos hacen INSERT, y la segunda recibe un 500 de MySQL en
// vez de un 409. Con dos personas registrarse en el mismo instante, o con un
// doble clic en el boton, el usuario ve "Error al registrar usuario".
//
// El indice UNIQUE de usuarios.correo ya garantiza la unicidad en la base. Lo
// unico que faltaba era traducir ese error a una respuesta utile, y eso lo hace
// el manejador central de errores (middleware/errores.ts): ER_DUP_ENTRY -> 409.
//
// Ademas el SELECT era una consulta de mas en el camino caliente del registro.

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
 * POST /registro
 *
 * 201 { mensaje, id_usuario }
 * 409 el correo ya existe
 * 400 el cuerpo no cumple el esquema (se explica campo por campo)
 */
router.post('/registro', validar(registroSchema), async (req, res) => {
    // req.body ya viene parseado por el middleware: nombre es string, correo es
    // string normalizado, contrasena es string. Ningun Number() hace falta.
    const { nombre, correo, contrasena } = req.body as {
        nombre: string;
        correo: string;
        contrasena: string;
    };

    const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);

    try {
        const [creado] = await pool.query<ResultSetHeader>(
            'INSERT INTO usuarios (nombre, correo, contrasena) VALUES (?, ?, ?)',
            [nombre, correo, hash]
        );

        logger.info(
            { idUsuario: creado.insertId },
            'usuario registrado'
        );

        res.status(201).json({
            mensaje: 'Usuario registrado',
            id_usuario: creado.insertId
        });
    } catch (error) {
        // ER_DUP_ENTRY se traduce a 409 en el manejador central. Aqui solo se
        // distingue el caso por el mensaje, porque el generico ("Ese registro ya
        // existe") no le dice al usuario QUE es lo que ya existe.
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
            throw new ErrorHttp(409, 'Ese correo ya esta registrado');
        }
        throw error;
    }
});

/**
 * POST /login
 *
 * 200 { token, mensaje }
 * 401 correo o contrasena incorrectos
 *
 * El mensaje es el mismo para los dos fallos a proposito. Si "ese correo no
 * existe" fuera distinto de "esa contrasena no es", la API serviria para
 * enumerar que correos estan registrados, que es informacion que el atacante no
 * deberia tener.
 */
router.post('/login', validar(loginSchema), async (req, res) => {
    const { correo, contrasena } = req.body as {
        correo: string;
        contrasena: string;
    };

    const [filas] = await pool.query<RowDataPacket[]>(
        'SELECT id_usuario, nombre, contrasena FROM usuarios WHERE correo = ?',
        [correo]
    );

    const credencialesIncorrectas = new ErrorHttp(401, 'Correo o contrasena incorrectos');

    if (filas.length === 0) {
        logger.warn({ correo }, 'login con correo inexistente');
        throw credencialesIncorrectas;
    }

    const usuario = filas[0];

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!coincide) {
        logger.warn({ idUsuario: usuario.id_usuario }, 'login con contrasena incorrecta');
        throw credencialesIncorrectas;
    }

    const token = firmarToken(Number(usuario.id_usuario), String(usuario.nombre));

    logger.info({ idUsuario: usuario.id_usuario }, 'login correcto');

    res.json({ token, mensaje: 'Sesion iniciada' });
});

export default router;