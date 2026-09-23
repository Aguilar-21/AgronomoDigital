import express from 'express'; // Trae la librería al archivo. Es el equivalente moderno al require
import 'dotenv/config'; // Carga las variables del archivo .env antes de usarlas
import pool from './db'; // ← Trae la conexión de la db.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import type { ResultSetHeader } from 'mysql2';
import type { Request,Response, NextFunction } from 'express';

const app = express();
app.use(express.json()); // middleware que convierte el JSON entrante en req.body
const SECRETO = process.env.JWT_SECRETO ?? 'clave_secreta_error_sin_env'; // la clave viene del .env
const PUERTO = Number(process.env.PUERTO) || 3002;


app.get('/', (req, res) => {
    res.send('Bienvenido a AgronomoDigital');
});

app.post('/registro', async (req, res) => {
    try {
        const {nombre, correo, contrasena} = req.body; // Extraer los datos que envía el cliente en el cuerpo de la petición
        const hash = await bcrypt.hash(contrasena,10); // encripta la contraseña. El 10 son las "rondas de sal" (más alto = mas seguro pero más lento)

        await pool.query(
            'INSERT INTO usuarios (nombre, correo, contrasena) VALUES (?, ?, ?)', // Los ? son setencias preparadas esto evita inyección SQL
            [nombre, correo, hash]
        );

        res.status(201).json({mensaje: 'Usuario registrado'});
    } catch (error) {
        res.status(500).json({error: 'Error al registrar usuario'});
    }
})

app.post('/login', async (req, res) => {
    try {
        const { correo, contrasena} = req.body;

        //Busca el usuario por correo
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM usuarios WHERE correo = ?',
            [correo]
        );

        // Si no existe, la respuesta es 401
        if (filas.length === 0) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos'});
        }

        const usuario = filas[0];

        // comparar la contraseña enviada con el hash guardado
        const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!coincide) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos'});
        }

        // si esta bien, firma un token con los datos del usuario
        const token = jwt.sign(
            {id: usuario.id_usuario, nombre: usuario.nombre},
            SECRETO,
            { expiresIn: '2h'}
        );

        res.json({ token, mensaje: 'Sesión inciada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al inciar sesión' });
    }
});

const protegerRuta = (req: Request, res: Response, next: NextFunction) => {
    try {
        // Sacar el header
        const header = req.headers.authorization;
        if (!header) {
            return res.status(401).json({error: 'NO hay token'});
        }
        
        // Extraer el token
        const token = header.split(' ')[1];
        
        // Verificar la firma del token con el SECRETO
        const datos = jwt.verify(token, SECRETO);
        
        //guarda los datos del usuario para que la ruta sepa quien es
        res.locals.usuario = datos;
        
        next();
    } catch (error){
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

app.get('/parcelas', protegerRuta, async (req, res) => {
    try{
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM parcelas WHERE id_usuario = ?',
            [res.locals.usuario.id]
        );
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar parcelas' });
    }
});

app.post('/parcelas', protegerRuta, async (req, res) => {
    try {
        const {nombre_parcela, ubicacion, tamano} = req.body;

        // INSERT con el id del usuario que viene con el token
        await pool.query(
            'INSERT INTO parcelas (id_usuario, nombre_parcela, ubicacion, tamano) VALUES (?, ?, ?, ?)',
            [res.locals.usuario.id, nombre_parcela, ubicacion, tamano ]
        );

        res.status(201).json({ mensaje: 'Parcela creada' });
    }catch (error) {
        res.status(500).json({ error: 'Error al crear parcela' });
    }
});

app.put('/parcelas/:id', protegerRuta, async (req, res) => {
    try {
        const {nombre_parcela, ubicacion, tamano} = req.body;

        const [resultado] = await pool.query<ResultSetHeader>(
            'UPDATE parcelas SET nombre_parcela = ?, ubicacion = ?, tamano = ? WHERE id_parcela = ? AND id_usuario = ?',
            [nombre_parcela, ubicacion, tamano, req.params.id, res.locals.usuario.id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya'});
        }

        res.json({ mensaje: 'Parcela actualizada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar parcela' });
    }
});

app.delete('/parcelas/:id', protegerRuta, async (req, res) => {
    try {
        const [resultado] = await pool.query<ResultSetHeader>(
            'DELETE FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
            [req.params.id, res.locals.usuario.id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya'});
        }

        res.json({ mensaje: 'Parcela eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar parcela' });
    }
});

app.post('/costos', protegerRuta, async (req, res) => {
    try {
        const {id_parcela, tipo_costo, descripcion, monto, fecha} = req.body;

        // Antes de inesertar: verificar que la parcela es del usuario del token
        const [parcela] = await pool.query<RowDataPacket[]>(
            'SELECT id_parcela FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
            [id_parcela, res.locals.usuario.id]
        );

        if (parcela.length === 0) {
            return res.status(404).json({ error: 'La parcela no existe o no es tuya'});
        }

        // Insertar el costo
        await pool.query(
            'INSERT INTO transacciones_costos (id_parcela, tipo_costo, descripcion, monto, fecha) VALUES (?, ?, ?, ?, ?)',
            [id_parcela, tipo_costo, descripcion, monto, fecha]
        );

        res.status(201).json({ mensaje: 'Costo registrado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar los costo' });
    }
});

app.get('/parcelas/:id/costos', protegerRuta, async (req,res) => {
    try {
        // JOIN costos junto con su parcela, pero solo si la parcela es del usuario
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT t.* FROM transacciones_costos t ' + 
            'JOIN parcelas p ON t.id_parcela = p.id_parcela ' + 
            'WHERE p.id_parcela = ? AND p.id_usuario = ?',
            [req.params.id, res.locals.usuario.id]
        );
        res.json(filas);
    } catch (error) {
        res.status(500).json({error: 'Error al consultar costos'});
    }
});

app.listen(PUERTO, () => {
    console.log(`Corriendo en el puerto ${PUERTO}`);
});