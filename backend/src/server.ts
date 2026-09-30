/**
 * API de AgronoDigital
 * ====================
 *
 * Este archivo es el backend. Si estas del lado del frontend, todo lo que
 * necesitas saber esta aqui y en ../API_DOCUMENTACION.md.
 *
 * COMO SE USA LA API
 *
 * Tres rutas son abiertas, el resto necesita token:
 *
 *   GET  /              dice "hola", sirve para ver si el server esta vivo
 *   POST /registro     crea un usuario
 *   POST /login        devuelve un token
 *
 * El cliente guarda ese token y lo manda en cada peticion:
 *
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * Si falta el token la API responde 401. El token expira a las 2 horas,
 * asi que el frontend tiene que manejar ese 401 y volver a pedir login
 * (guardar el token solo en memoria es lo ideal, con localStorage el
 * usuario se queda "dentro" aunque el token ya haya caducado).
 *
 * EL DATO MAS IMPORTANTE PARA TI
 *
 * MySQL guarda los DECIMAL como texto, no como numero. Si pides un costo
 * te va a llegar "45.50" con comillas, no 45.5. Si haces cuentas con eso
 * sin convertirlo, te sale NaN o te concatena los numeros en vez de sumarlos.
 *
 *   mal:   Number(cantidad) + Number(cantidad)   // funciona, pero...
 *   peor:  cantidad + cantidad                     // "45.50" + "45.50" = "45.5045.50"
 *
 * Conviertelo apenas llegue:
 *
 *   const monto = Number(c.monto)   // ahora si es numero
 *
 * Lo mismo con precio_unitario, precio_venta_quintal, cantidad, tamano y
 * produccion_quintales. Los INT si llegan como numero, esos no hay que tocarlos.
 *
 * UNA REGLA DE SEGURIDAD QUE VERAS REPETIDA
 *
 * El id del usuario NUNCA se recibe del cuerpo de la peticion. Sale del token,
 * en res.locals.usuario.id (lo coloca protegerRuta mas abajo). Por eso casi
 * todas las consultas filtran por id_usuario: si alguien intenta pedir datos
 * ajenos cambiando el id en el body, no va a funcionar, porque el body no se
 * usa para eso.
 */

import express from 'express'; // Trae la librería al archivo. Es el equivalente moderno al require
import 'dotenv/config'; // Carga las variables del archivo .env antes de usarlas
import pool from './db'; // ← Trae la conexión de la db.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import type { ResultSetHeader } from 'mysql2';
import type { Request,Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();
app.use(cors()); // permite que el frontend de otro origen (puerto) consuma la API
app.use(express.json()); // middleware que convierte el JSON entrante en req.body

// La clave con la que se firman los tokens viene SIEMPRE del .env.
// Antes, si faltaba, se usaba una clave de relleno que estaba escrita en este
// mismo archivo: la app arrancaba igual y cualquiera que leyera el codigo
// podia firmar tokens falsos. Ahora la app se niega a arrancar, porque es
// mejor no funcionar que funcionar con la puerta abierta.
const SECRETO = process.env.JWT_SECRETO;
if (!SECRETO || SECRETO.length < 16) {
  console.error('\n' + '='.repeat(64));
  console.error('  Falta JWT_SECRETO en el archivo .env (o es demasiado corto).');
  console.error('  Sin esa clave la API no puede firmar tokens de forma segura,');
  console.error('  asi que no arranca.');
  console.error('');
  console.error('  Como arreglarlo:');
  console.error('    1. Copia backend/.env.example a backend/.env');
  console.error('    2. Ponle una clave larga y unica, por ejemplo:');
  console.error('         JWT_SECRETO=' + 'x'.repeat(40));
  console.error('    3. Ese .env NUNCA se sube al repositorio, ya esta en .gitignore');
  console.error('');
  console.error('  La clave NO va en el codigo ni en el repositorio. Cada');
  console.error('  instalacion genera la suya.');
  console.error('='.repeat(64) + '\n');
  process.exit(1);
}

const PUERTO = Number(process.env.PUERTO) || 3002;


app.get('/', (req, res) => {
    res.send('Bienvenido a AgronomoDigital');
});

/**
 * POST /registro
 * body: { nombre, correo, contrasena }
 * Devuelve 201. Si el correo ya existe devuelve 409 con { error }, no un 400:
 * el frontend puede tratar el 409 aparte para poner "ese correo ya tiene cuenta"
 * sin tener que adivinar por el texto del mensaje.
 */
app.post('/registro', async (req, res) => {
    try {
        const {nombre, correo, contrasena} = req.body; // Extraer los datos que envía el cliente en el cuerpo de la petición

        // 1) Campos obligatorios. 400 = el cliente mando algo mal
        if (!nombre || !correo || !contrasena) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        // 2) Formato del correo (debe tener algo@algo.algo)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return res.status(400).json({ error: 'El correo no tiene un formato válido' });
        }

        // 3) La contrasena necesita minimo 8 caracteres
        if (contrasena.length < 8) {
            return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres' });
        }

        // 4) El correo no debe existir. 409 = conflicto con un dato que ya esta.
        //    Se revisa antes de insertar para poder dar un mensaje claro.
        const [existentes] = await pool.query<RowDataPacket[]>(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existentes.length > 0) {
            return res.status(409).json({ error: 'Ese correo ya esta registrado' });
        }

        const hash = await bcrypt.hash(contrasena,10); // encripta la contraseña. El 10 son las "rondas de sal" (más alto = mas seguro pero más lento)

        // Se devuelve el id recien creado. El frontend lo usa para armar el
        // token del JWT sin tener que pedir un SELECT extra.
        const [creado] = await pool.query<ResultSetHeader>(
            'INSERT INTO usuarios (nombre, correo, contrasena) VALUES (?, ?, ?)', // Los ? son setencias preparadas esto evita inyección SQL
            [nombre, correo, hash]
        );

        res.status(201).json({mensaje: 'Usuario registrado', id_usuario: creado.insertId});
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Error al registrar usuario'});
    }
})

/**
 * POST /login
 * body: { correo, contrasena }
 * 200 -> { token, mensaje }. Ese token es lo unico que el frontend necesita
 * guardar para las siguientes peticiones.
 * 401 -> correo o contraseña incorrectos. Ojo: el mensaje es el mismo para los
 * dos casos a proposito, asi no se puede usar la API para saber que correos
 * estan registrados.
 */

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

/**
 * Todo lo que entra a una ruta protegida pasa por aqui antes.
 *
 * Lee el header Authorization, separa la palabra "Bearer" del token, verifica
 * la firma con jwt.verify y guarda lo que viene dentro en res.locals.usuario.
 * Ese objeto es el que despues usan todas las rutas para saber quien es el
 * que esta llamando. Si el token esta mal, caduco o no viene, corta aqui con
 * 401 y la ruta nunca se ejecuta.
 */
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

/**
 * GET /parcelas
 * Devuelve un arreglo con las parcelas del usuario, vacio si no tiene ninguna.
 * Cada fila trae: id_parcela, id_usuario, nombre_parcela, ubicacion, tamano,
 * produccion_quintales, fecha_registro.
 *
 * Ojo con tamano y produccion_quintales: son DECIMAL, llegan como texto.
 */
app.get('/parcelas', protegerRuta, async (req, res) => {
    try{
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM parcelas WHERE id_usuario = ?',
            [res.locals.usuario.id]
        );
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al consultar parcelas' });
    }
});

/**
 * POST /parcelas
 * body: { nombre_parcela, ubicacion, tamano, produccion_quintales }
 * Los dos ultimos son opcionales. Si produccion viene en 0 o vacia se guarda
 * como NULL a proposito: cero quintales producidos y "no lo se" son cosas
 * distintas, y el calculo del costo por unidad no puede sacar division por cero.
 * 201 al exito.
 */
app.post('/parcelas', protegerRuta, async (req, res) => {
    try {
        const {nombre_parcela, ubicacion, tamano, produccion_quintales} = req.body;

        // Si no mandan produccion, se guarda NULL (la columna lo permite)
        const produccion = produccion_quintales ? Number(produccion_quintales) : null;

        if (!nombre_parcela) {
            return res.status(400).json({ error: 'El nombre de la parcela es obligatorio' });
        }

        // INSERT con el id del usuario que viene con el token
        const [creada] = await pool.query<ResultSetHeader>(
            'INSERT INTO parcelas (id_usuario, nombre_parcela, ubicacion, tamano, produccion_quintales) VALUES (?, ?, ?, ?, ?)',
            [res.locals.usuario.id, nombre_parcela, ubicacion, tamano, produccion ]
        );

        // Se devuelve id_parcela para que el cliente pueda usar la parcela nueva
        // de inmediato, sin tener que volver a pedir el listado completo.
        res.status(201).json({ mensaje: 'Parcela creada', id_parcela: creada.insertId });
    }catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear parcela' });
    }
});

app.put('/parcelas/:id', protegerRuta, async (req, res) => {
    try {
        const {nombre_parcela, ubicacion, tamano, produccion_quintales} = req.body;

        const produccion = produccion_quintales ? Number(produccion_quintales) : null;

        const [resultado] = await pool.query<ResultSetHeader>(
            'UPDATE parcelas SET nombre_parcela = ?, ubicacion = ?, tamano = ?, produccion_quintales = ? WHERE id_parcela = ? AND id_usuario = ?',
            [nombre_parcela, ubicacion, tamano, produccion, req.params.id, res.locals.usuario.id]
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

/* ============================================================
   PRODUCCION POR PARCELA
   ============================================================

   Esta tabla es la que hace que los calculos por producto signifiquen algo.

   parcelas.produccion_quintales es UN solo numero para toda la parcela. Si en
   esa parcela sembras arroz y tomate, no hay forma de saber cuantos quintales
   son de cada uno, y dividir el costo total entre la suma de los dos mezcla
   cultivos que no se comparan. Acabo en un numero que no representa nada.

   produccion_parcelas separa eso: una fila por (parcela, producto, ciclo).
   O sea que el mismo producto puede aparecer dos veces si hizo dos-siembra,
   y por eso el ciclo es parte de la llave unica.

   OJO CON LAS UNIDADES, que es donde esta la trampa. El numero de aqui va en
   la unidad del producto, NO en quintales. Si el producto se vende en caja,
   esto guarda cajas. El nombre de la columna es produccion y no
   produccion_quintales justamente para que nadie la lea como quintales por
   costumbre. La unidad de referencia sale de productos.unidad.
   ============================================================ */

/**
 * GET /parcelas/:id/produccion
 * Lista la produccion de la parcela, con el nombre del producto y su unidad ya
 * resueltos para que el frontend no tenga que cruzar los id con GET /productos.
 * Acepta ?id_producto=N para filtrar.
 */
app.get('/parcelas/:id/produccion', protegerRuta, async (req, res) => {
    try {
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const idProducto = queryNum(req, 'id_producto');
        const filtro = idProducto ? 'AND pp.id_producto = ?' : '';
        const params: unknown[] = [String(req.params.id)];
        if (idProducto) params.push(idProducto);

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pp.id_produccion, pp.id_parcela, pp.id_producto, pp.ciclo, ' +
            'pp.produccion, pr.nombre AS producto, pr.unidad, pr.tipo_producto ' +
            'FROM produccion_parcelas pp ' +
            'JOIN productos pr ON pr.id_producto = pp.id_producto ' +
            'WHERE pp.id_parcela = ? ' + filtro + ' ORDER BY pr.nombre, pp.ciclo',
            params
        );

        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al consultar la produccion' });
    }
});

/**
 * POST /parcelas/:id/produccion
 * body: { id_producto, produccion, ciclo? }
 *
 * ciclo es opcional, si no viene se guarda como "actual". Sirve para distinguir
 * siembras: si el usuario hizo dos Backend, tendra dos filas del mismo
 * producto y las podra sumar o no segun el ciclo que le interese.
 *
 * Si el mismo (parcela, producto, ciclo) ya existe, esta fila se ACTUALIZA en
 * vez de fallar con 409. Es lo que espera un formulario: el usuario corrige un
 * numero que se equivoco y lo guarda otra vez, no quiere un error de clave
 * duplicada que no sabe interpretar.
 *
 * La produccion va en la unidad del producto (cajas, quintales, libras...).
 */
app.post('/parcelas/:id/produccion', protegerRuta, async (req, res) => {
    try {
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const { id_producto, produccion, ciclo } = req.body;

        if (id_producto === undefined || Number.isNaN(Number(id_producto))) {
            return res.status(400).json({ error: 'El producto es obligatorio' });
        }

        const producto = await datosProducto(Number(id_producto));
        if (!producto) {
            return res.status(404).json({ error: 'El producto no existe' });
        }

        // Se guarda como numero antes de validar para que "abc" no llegue a
        // MySQL y reviente con un error de formato en vez de un 400 claro.
        const cant = Number(produccion);
        if (produccion === undefined || produccion === null || produccion === '' || Number.isNaN(cant)) {
            return res.status(400).json({ error: 'La produccion debe ser un numero' });
        }
        if (cant <= 0) {
            return res.status(400).json({ error: 'La produccion debe ser mayor que cero' });
        }

        const cicloTexto = ciclo && String(ciclo).trim() !== '' ? String(ciclo).trim() : 'actual';

        // ON DUPLICATE KEY UPDATE en vez de insertar a secas: la llave unica
        // (parcela, producto, ciclo) convierte un segundo guardado del mismo
        // ciclo en una actualizacion silenciosa.
        const [resultado] = await pool.query<ResultSetHeader>(
            'INSERT INTO produccion_parcelas (id_parcela, id_producto, ciclo, produccion) ' +
            'VALUES (?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE produccion = VALUES(produccion), fecha_registro = CURRENT_TIMESTAMP',
            [String(req.params.id), Number(id_producto), cicloTexto, cant]
        );

        // affectedRows es 1 si inserto y 2 si actualizo. Con eso el frontend
        // puede avisar "actualizado" en vez de "creado" sin tener que consultar.
        const creado = resultado.affectedRows === 1;

        res.status(creado ? 201 : 200).json({
            mensaje: creado ? 'Produccion registrada' : 'Produccion actualizada',
            unidad: producto.unidad
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar la produccion' });
    }
});

/**
 * DELETE /produccion/:id
 * Borra un registro de produccion.
 *
 * El borrado va contra la tabla produccion_parcelas y no contra parcelas, y por
 * eso no se toca id_usuario en el WHERE: primero se confirma que la parcela de
 * esa fila sea del usuario con un SELECT, y solo despues se borra. Con el JOIN
 * directo habia que repetir la condicion de dos columnas.
 */
app.delete('/produccion/:id', protegerRuta, async (req, res) => {
    try {
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pp.id_produccion FROM produccion_parcelas pp ' +
            'JOIN parcelas p ON p.id_parcela = pp.id_parcela ' +
            'WHERE pp.id_produccion = ? AND p.id_usuario = ?',
            [req.params.id, res.locals.usuario.id]
        );

        if (filas.length === 0) {
            return res.status(404).json({ error: 'Registro de produccion no encontrado o no es tuyo' });
        }

        await pool.query('DELETE FROM produccion_parcelas WHERE id_produccion = ?', [req.params.id]);

        res.json({ mensaje: 'Produccion eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la produccion' });
    }
});

app.post('/costos', protegerRuta, async (req, res) => {
    try {
        const {id_parcela, id_producto, tipo_costo, descripcion, monto, fecha, es_fijo} = req.body;

        // Antes de inesertar: verificar que la parcela es del usuario del token
        const [parcela] = await pool.query<RowDataPacket[]>(
            'SELECT id_parcela FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
            [id_parcela, res.locals.usuario.id]
        );

        if (parcela.length === 0) {
            return res.status(404).json({ error: 'La parcela no existe o no es tuya'});
        }

        if (monto === undefined || Number.isNaN(Number(monto))) {
            return res.status(400).json({ error: 'El monto es obligatorio y debe ser un numero' });
        }
        if (Number(monto) <= 0) {
            return res.status(400).json({ error: 'El monto debe ser mayor que cero' });
        }
        if (!tipo_costo) {
            return res.status(400).json({ error: 'El tipo de costo es obligatorio' });
        }

        // Si mandan id_producto, el producto tiene que existir.
        if (id_producto) {
            const producto = await datosProducto(Number(id_producto));
            if (!producto) {
                return res.status(404).json({ error: 'El producto indicado no existe' });
            }
        }

        // Insertar el costo
        // es_fijo se convierte a 1 o 0 porque la columna es TINYINT(1) en MySQL.
        // Si el cliente no lo manda, queda 0 (costo variable) por defecto.
        // id_producto es opcional: si no se manda, el costo es de la parcela en general.
        const [registrado] = await pool.query<ResultSetHeader>(
            'INSERT INTO transacciones_costos (id_parcela, id_producto, tipo_costo, descripcion, monto, fecha, es_fijo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id_parcela, id_producto ?? null, tipo_costo, descripcion, monto, fecha, es_fijo ? 1 : 0]
        );

        res.status(201).json({ mensaje: 'Costo registrado', id_transaccion: registrado.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error al registrar los costo' });
    }
});

app.get('/parcelas/:id/costos', protegerRuta, async (req, res) => {
    try {
        // Se verifica que la parcela sea del usuario antes de listar. Sin esto
        // el JOIN de abajo ya evita la fuga de datos (daria []), pero la
        // respuesta seria 200 con lista vacia, indistinguible de "no tenes
        // costos". El 404 deja claro que la parcela no existe o no es tuya.
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT t.*, pr.nombre AS producto, pr.unidad FROM transacciones_costos t ' +
            'LEFT JOIN productos pr ON pr.id_producto = t.id_producto ' +
            'WHERE t.id_parcela = ? ' +
            'ORDER BY t.fecha DESC, t.id_transaccion DESC',
            [String(req.params.id)]
        );
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Error al consultar costos'});
    }
});

// Editar un costo ya registrado
app.put('/costos/:id', protegerRuta, async (req, res) => {
    try {
        const { tipo_costo, descripcion, monto, fecha, es_fijo } = req.body;

        if (monto !== undefined) {
            if (Number.isNaN(Number(monto)) || Number(monto) <= 0) {
                return res.status(400).json({ error: 'El monto debe ser mayor que cero' });
            }
        }
        if (tipo_costo !== undefined && !tipo_costo) {
            return res.status(400).json({ error: 'El tipo de costo no puede ir vacio' });
        }

        const [r] = await pool.query<ResultSetHeader>(
            'UPDATE transacciones_costos t ' +
            'JOIN parcelas p ON t.id_parcela = p.id_parcela ' +
            'SET t.tipo_costo = COALESCE(?, t.tipo_costo), ' +
            '    t.descripcion = COALESCE(?, t.descripcion), ' +
            '    t.monto = COALESCE(?, t.monto), ' +
            '    t.fecha = COALESCE(?, t.fecha), ' +
            '    t.es_fijo = COALESCE(?, t.es_fijo) ' +
            'WHERE t.id_transaccion = ? AND p.id_usuario = ?',
            [
                tipo_costo ?? null,
                descripcion ?? null,
                monto !== undefined ? Number(monto) : null,
                fecha ?? null,
                es_fijo === undefined ? null : (es_fijo ? 1 : 0),
                req.params.id,
                res.locals.usuario.id
            ]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Costo no encontrado o no es tuyo' });
        }

        res.json({ mensaje: 'Costo actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el costo' });
    }
});

// Borrar un costo
app.delete('/costos/:id', protegerRuta, async (req, res) => {
    try {
        const [r] = await pool.query<ResultSetHeader>(
            'DELETE t FROM transacciones_costos t ' +
            'JOIN parcelas p ON t.id_parcela = p.id_parcela ' +
            'WHERE t.id_transaccion = ? AND p.id_usuario = ?',
            [req.params.id, res.locals.usuario.id]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Costo no encontrado o no es tuyo' });
        }

        res.json({ mensaje: 'Costo eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el costo' });
    }
});

/**
 * GET /parcelas/:id/costo-total
 * Devuelve { costo_total: "240.00" } con la suma de todos los costos de la parcela,
 * sin filtro de producto y sin separar fijos de variables.
 *
 * Es la version simple, para cuando solo queres mostrar "cuanto me gasté en total".
 * Si lo que queres es el costo por unidad o el punto de equilibrio, usa mejor
 * GET /parcelas/:id/costo-quintal, que además trae el desglose.
 *
 * El JOIN con parcelas no es decorativo: pone la condicion de id_usuario en la
 * misma consulta, y asi una parcela ajena te devuelve costo_total 0 en vez de
 * filtrar. Ojo con ese 0, no es un error de calculo, es que no encontraste nada.
 *
 * Cuando se busca borrar la parcela, ese 0 es incomodo: despues de borrarla el
 * endpoint sigue respondiendo 200 con 0 en vez de 404. Por eso se verifica la
 * pertenencia primero y se responde 404 si la parcela no es del usuario, igual
 * que en el resto de las rutas de parcela.
 */
app.get('/parcelas/:id/costo-total', protegerRuta, async (req, res) => {
    try {
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT SUM(monto) AS costo_total FROM transacciones_costos WHERE id_parcela = ?',
            [String(req.params.id)]
        );
        // Si no hay costos, devuelve 0 en ves de null
        res.json({ costo_total: filas[0]?.costo_total ?? 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular el costo total' });
    }
});


// Consultar precios
app.get('/precios', protegerRuta, async (req, res) => {
    try {
        const cond: string[] = [];
        const params: unknown[] = [];

        const idProducto = queryNum(req, 'id_producto');
        if (idProducto) { cond.push('h.id_producto = ?'); params.push(idProducto); }

        const idCanal = queryNum(req, 'id_canal');
        if (idCanal) { cond.push('h.id_canal = ?'); params.push(idCanal); }

        const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT h.id_precio, h.id_producto, h.id_canal, h.fecha, h.precio_venta_quintal, ' +
            'pr.nombre AS producto, pr.unidad, cv.nombre AS canal ' +
            'FROM historial_precios h ' +
            'LEFT JOIN productos pr ON pr.id_producto = h.id_producto ' +
            'LEFT JOIN canales_venta cv ON cv.id_canal = h.id_canal ' +
            where +
            ' ORDER BY h.fecha DESC, h.id_precio DESC',
            params
        );
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al consultar precios' });
    }
});

/**
 * POST /precios
 * body: { id_producto?, id_canal?, fecha, precio_venta_quintal }
 *
 * Guarda un precio de mercado. id_producto e id_canal son opcionales: si no
 * se mandan, el precio queda como una referencia general, que es como se
 * guardan los precios "de referencia" que no son de un canal en especifico.
 *
 * El nombre de la columna es precio_venta_quintal pero el valor es el precio
 * de la UNIDAD del producto. O sea, si el producto se vende en caja, el 55 que
 * mandes es 55 por caja, no 55 por quintal. Es un nombre que quedo de antes
 * cuando todos los productos se median en quintales; el frontend debe mostrar
 * el precio junto con la unidad que le da GET /productos.
 *
 * Este endpoint es global: el historial de precios lo ve todo el mundo, no
 * tiene id_usuario. Es a proposito, el precio del mercado es el mismo para
 * todos. Lo que si es personal son las parcelas, los costos y las
 * publicaciones.
 */
app.post('/precios', protegerRuta, async (req, res) => {
    try {
        const { id_producto, id_canal, fecha, precio_venta_quintal } = req.body;

        if (fecha === undefined || fecha === null || fecha === '') {
            return res.status(400).json({ error: 'La fecha es obligatoria' });
        }
        if (precio_venta_quintal === undefined || Number.isNaN(Number(precio_venta_quintal))) {
            return res.status(400).json({ error: 'El precio es obligatorio y debe ser un numero' });
        }
        if (Number(precio_venta_quintal) <= 0) {
            return res.status(400).json({ error: 'El precio debe ser mayor que cero' });
        }

        // id_producto e id_canal son opcionales: si no se mandan, el precio
        // queda como referencia general (sin producto ni canal especifico).
        if (id_producto) {
            const producto = await datosProducto(Number(id_producto));
            if (!producto) {
                return res.status(404).json({ error: 'El producto indicado no existe' });
            }
        }

        if (id_canal) {
            const [canales] = await pool.query<RowDataPacket[]>(
                'SELECT id_canal FROM canales_venta WHERE id_canal = ?', [id_canal]
            );
            if (!canales.length) {
                return res.status(404).json({ error: 'El canal indicado no existe' });
            }
        }

        const [registrado] = await pool.query<ResultSetHeader>(
            'INSERT INTO historial_precios (id_producto, id_canal, fecha, precio_venta_quintal) VALUES (?, ?, ?, ?)',
            [id_producto ?? null, id_canal ?? null, fecha, Number(precio_venta_quintal)]
        );

        res.status(201).json({mensaje: 'Precio Registrado', id_precio: registrado.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar el precio' });
    }
});

// Borrar un precio del historial
app.delete('/precios/:id', protegerRuta, async (req, res) => {
    try {
        const [r] = await pool.query<ResultSetHeader>(
            'DELETE FROM historial_precios WHERE id_precio = ?', [req.params.id]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Precio no encontrado' });
        }

        res.json({ mensaje: 'Precio eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar el precio' });
    }
});

// Catalogo de productos (solo lectura, lo usa el frontend para los <select>)
app.get('/productos', protegerRuta, async (_req, res) => {
    try {
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT id_producto, nombre, unidad, tipo_producto FROM productos WHERE activo = TRUE ORDER BY nombre'
        );
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar el catalogo de productos' });
    }
});

// Categorias de costo filtradas por tipo de producto.
// GET /categorias-costos?tipo=granos  ->  Agua, Abono, Semillas, ...
app.get('/categorias-costos', protegerRuta, async (req, res) => {
    try {
        const tipo = req.query.tipo;

        // Sin ?tipo= la consulta comparaba contra undefined y MySQL lo tratar
        // como NULL, devolviendo 404 con un mensaje que habla de "ese tipo de
        // producto" cuando en realidad no se mando ninguno. Es un error del
        // cliente (400), no un catalogo vacio (404).
        if (typeof tipo !== 'string' || !tipo.trim()) {
            return res.status(400).json({ error: 'Falta el parametro ?tipo= con el tipo de producto' });
        }

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT id_categoria, nombre, tipo_producto, es_fijo_default FROM categorias_costos WHERE tipo_producto = ? ORDER BY nombre',
            [tipo]
        );
        if (filas.length === 0) {
            return res.status(404).json({ error: 'No hay categorias para ese tipo de producto' });
        }
        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al consultar las categorias de costo' });
    }
});

// Canales de venta
app.get('/canales', protegerRuta, async (_req, res) => {
    try {
        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT id_canal, nombre FROM canales_venta ORDER BY id_canal'
        );
        res.json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar los canales de venta' });
    }
});

/**
 * Lee un parametro numerico de la query string. Ej: ?id_producto=3
 *
 * Devuelve null si no viene o si viene con letras. Eso es a proposito: si el
 * cliente manda ?id_producto=abc, nosotros lo tratamos como "no filtro" en vez
 * de reventar con un 500. Si en algun momento prefieres que sea un 400, se
 * cambia aqui y se arregla en todas partes de golpe.
 */
function queryNum(req: Request, nombre: string): number | null {
    const v = req.query[nombre];
    if (typeof v !== 'string' || v.trim() === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}

// Busca el producto para saber su nombre y unidad de venta.
async function datosProducto(idProducto: number) {
    const [r] = await pool.query<RowDataPacket[]>(
        'SELECT id_producto, nombre, unidad, tipo_producto FROM productos WHERE id_producto = ? AND activo = TRUE',
        [idProducto]
    );
    return (r[0] as { id_producto: number, nombre: string, unidad: string, tipo_producto: string } | undefined) ?? null;
}

// Verifica que la parcela exista y sea del usuario del token.
// En Express 5 req.params.id puede venir como string[], por eso se normaliza.
async function parcelaDelUsuario(idParcela: string | string[], idUsuario: number) {
    const [r] = await pool.query<RowDataPacket[]>(
        'SELECT id_parcela, nombre_parcela, produccion_quintales FROM parcelas WHERE id_parcela = ? AND id_usuario = ?',
        [String(idParcela), idUsuario]
    );
    return (r[0] as { id_parcela: number, nombre_parcela: string, produccion_quintales: string } | undefined) ?? null;
}

/**
 * Resuelve QUE produccion usar para un calculo, y de donde la saco.
 *
 * Con id_producto: suma la produccion de ese producto en esa parcela, sumando
 * todos los ciclos. Si el producto no tiene ninguna fila en produccion_parcelas,
 * se cae a parcelas.produccion_quintales como plan B.
 *
 * Sin id_producto: usa directamente parcelas.produccion_quintales, que es el
 * total declarado de la parcela en quintales. No tiene sentido sumar ahi las
 * filas de produccion_parcelas porque mezclarian cajas con quintales y el
 * resultado seria un numero sin unidad.
 *
 * Devuelve ademas el origen, para que el frontend pueda avisarle al usuario
 * cuando esta viendo un numero de fallback y no el dato real de su producto.
 */
async function resolverProduccion(
    idParcela: string,
    idProducto: number | null,
    produccionDeLaParcela: string | null
): Promise<{ produccion: number, origen: 'por_producto' | 'parcela' }> {
    if (idProducto) {
        const [r] = await pool.query<RowDataPacket[]>(
            'SELECT COALESCE(SUM(produccion), 0) AS total FROM produccion_parcelas ' +
            'WHERE id_parcela = ? AND id_producto = ?',
            [idParcela, idProducto]
        );
        const total = Number(r[0]?.total ?? 0);
        if (total > 0) {
            return { produccion: total, origen: 'por_producto' };
        }
    }
    return { produccion: Number(produccionDeLaParcela ?? 0), origen: 'parcela' };
}

/**
 * GET /parcelas/:id/costo-quintal[?id_producto=N]
 *
 * Que te sirve: cuanto te cuesta producir una unidad de lo que vendes.
 *
 * Sin id_producto suma los costos de TODA la parcela. Con id_producto suma solo
 * los costos que se registraron para ese producto, que es lo que casi siempre
 * quieres: si en un lote tienes arroz y tomate, el costo del arroz no incluye
 * lo que gastaste en el tomate.
 *
 * En la respuesta viene "unidad" para que el frontend sepa como interpretar
 * costo_quintal. Sin filtro sale "quintal" porque no hay producto del cual
 * sacarla; con filtro sale la unidad real del producto (caja, quintal, libra...).
 */
app.get('/parcelas/:id/costo-quintal', protegerRuta, async (req, res) => {
    try {
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const idProducto = queryNum(req, 'id_producto');
        let producto = null;
        if (idProducto) {
            producto = await datosProducto(idProducto);
            if (!producto) {
                return res.status(404).json({ error: 'El producto indicado no existe' });
            }
        }

        // Si mandan id_producto se filtran los costos de ese producto.
        // El filtro va en el ON del LEFT JOIN y NO en el WHERE: si fuera en el
        // WHERE, las filas de costo sin producto (NULL) se descartarian y la
        // parcela entera desapareceria del resultado.
        const filtro = idProducto ? 'AND t.id_producto = ?' : '';
        // Aqui el filtro va PRIMERO en el array porque en el SQL esta en el ON
        // del JOIN, que aparece antes que el WHERE. En punto-equilibrio, en cambio,
        // el filtro esta en el WHERE y su valor va de ultimo.
        //
        // Esa es la trampa de los signos ?: se reemplazan de izquierda a
        // derecha contra el texto del SQL, asi que el orden del array tiene que
        // calcar el orden en que aparecen los ? en la consulta. Si se cruzan,
        // MySQL no avisa que se especifico mal, simplemente busca con el id
        // equivocado y devuelve ceros sin quejarse.
        const params: unknown[] = [];
        if (idProducto) params.push(idProducto);
        params.push(String(req.params.id), res.locals.usuario.id);

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT p.produccion_quintales, ' +
            'COALESCE(SUM(t.monto), 0) AS costo_total, ' +
            'COALESCE(SUM(CASE WHEN t.es_fijo = TRUE THEN t.monto ELSE 0 END), 0) AS costos_fijos, ' +
            'COALESCE(SUM(CASE WHEN t.es_fijo = FALSE THEN t.monto ELSE 0 END), 0) AS costos_variables ' +
            'FROM parcelas p ' +
            'LEFT JOIN transacciones_costos t ON t.id_parcela = p.id_parcela ' + filtro + ' ' +
            'WHERE p.id_parcela = ? AND p.id_usuario = ? ' +
            'GROUP BY p.id_parcela',
            params
        );

        const fila = filas[0] ?? {};
        const { produccion, origen } = await resolverProduccion(
            String(req.params.id),
            idProducto,
            parcela.produccion_quintales
        );
        const costo_total = Number(fila.costo_total ?? 0);
        const costos_fijos = Number(fila.costos_fijos ?? 0);
        const costos_variables = Number(fila.costos_variables ?? 0);
        const costo_quintal = produccion > 0 ? costo_total / produccion : null;

        res.json({
            id_producto: producto?.id_producto ?? null,
            producto: producto?.nombre ?? null,
            unidad: producto?.unidad ?? 'quintal',
            costo_total,
            costos_fijos,
            costos_variables,
            produccion,
            // Nombre viejo que se conserva por compatibilidad. OJO: ya no
            // siempre son quintales, con id_producto es la unidad del producto.
            // El campo bueno para el frontend es "produccion".
            produccion_quintales: produccion,
            origen_produccion: origen,
            costo_quintal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular el costo por quintal' });
    }
});

app.get('/parcelas/:id/punto-equilibrio', protegerRuta, async (req, res) => {
    try {
        const parcela = await parcelaDelUsuario(req.params.id, res.locals.usuario.id);
        if (!parcela) {
            return res.status(404).json({ error: 'Parcela no encontrada o no es tuya' });
        }

        const idProducto = queryNum(req, 'id_producto');
        const idCanal = queryNum(req, 'id_canal');

        let producto = null;
        if (idProducto) {
            producto = await datosProducto(idProducto);
            if (!producto) {
                return res.status(404).json({ error: 'El producto indicado no existe' });
            }
        }

        // Costos fijos y variables, filtrados por producto si mandaron id_producto.
        // OJO con el orden: los '?' se reemplazan de izquierda a derecha en el SQL.
        // El filtro va al final de la consulta, asi que su valor va al final del array.
        const filtro = idProducto ? 'AND t.id_producto = ?' : '';
        const params: unknown[] = [String(req.params.id), res.locals.usuario.id];
        if (idProducto) params.push(idProducto);

        const [costosR] = await pool.query<RowDataPacket[]>(
            'SELECT COALESCE(SUM(CASE WHEN t.es_fijo = TRUE THEN t.monto ELSE 0 END), 0) AS fijos, ' +
            'COALESCE(SUM(CASE WHEN t.es_fijo = FALSE THEN t.monto ELSE 0 END), 0) AS variables ' +
            'FROM transacciones_costos t ' +
            'JOIN parcelas p ON t.id_parcela = p.id_parcela ' +
            'WHERE p.id_parcela = ? AND p.id_usuario = ? ' + filtro,
            params
        );

        const fila = costosR[0] ?? {};
        const fijos = Number(fila.fijos ?? 0);
        const variables = Number(fila.variables ?? 0);
        const { produccion, origen } = await resolverProduccion(
            String(req.params.id),
            idProducto,
            parcela.produccion_quintales
        );

        // Ultimo precio de venta. Si mandan id_producto / id_canal se filtra.
        // El id_precio en el ORDER BY es el desempate: sin el, si hay dos
        // precios el mismo dia, MySQL devuelve cualquiera de los dos.
        const cond: string[] = [];
        const pParams: unknown[] = [];
        if (idProducto) { cond.push('id_producto = ?'); pParams.push(idProducto); }
        if (idCanal) { cond.push('id_canal = ?'); pParams.push(idCanal); }
        const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

        const [precioR] = await pool.query<RowDataPacket[]>(
            'SELECT precio_venta_quintal FROM historial_precios ' + where +
            ' ORDER BY fecha DESC, id_precio DESC LIMIT 1',
            pParams
        );
        const precio = precioR[0]?.precio_venta_quintal !== undefined
            ? Number(precioR[0].precio_venta_quintal) : null;

        const varPorUnidad = produccion > 0 ? variables / produccion : null;
        const margen = (precio !== null && varPorUnidad !== null) ? precio - varPorUnidad : null;
        const pe = (margen !== null && margen > 0) ? fijos / margen : null;

        res.json({
            id_producto: idProducto,
            producto: producto?.nombre ?? null,
            unidad: producto?.unidad ?? 'quintal',
            costos_fijos: fijos,
            costos_variables: variables,
            produccion,
            produccion_quintales: produccion,
            origen_produccion: origen,
            precio_venta: precio,
            costo_variable_unidad: varPorUnidad,
            margen_contribucion: margen,
            punto_equilibrio_unidades: pe
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular el punto de equilibrio' });
    }
});

/**
 * POST /publicaciones
 * body: { id_parcela?, id_producto, id_canal, cantidad, precio_unitario, fecha }
 *
 * Esto es el mercado: un agricultor ofrece lo que cosecho y otro lo compra.
 *
 * id_parcela es opcional. A veces la cosecha viene de varias parcelas juntas y
 * no hay una sola que decir "esta es la oferta". Si viene, tiene que ser del
 * usuario del token.
 *
 * "estado" NO se recibe del body, a proposito. La columna es un ENUM con default
 * 'disponible' y se cambia despues con PUT /publicaciones/:id/estado. Si el
 * cliente pudiera mandarlo, podria publicar ya vendido o retirado y saltarse
 * la regla de negocio.
 *
 * 201 al exito, 400 si cantidad o precio no son positivos, 404 si el producto,
 * el canal o la parcela no existen.
 */
app.post('/publicaciones', protegerRuta, async (req, res) => {
    try {
        const { id_parcela, id_producto, id_canal, cantidad, precio_unitario, fecha } = req.body;

        if (!id_producto || !id_canal) {
            return res.status(400).json({ error: 'El producto y el canal son obligatorios' });
        }
        if (cantidad === undefined || precio_unitario === undefined) {
            return res.status(400).json({ error: 'La cantidad y el precio son obligatorios' });
        }
        if (cantidad <= 0 || precio_unitario <= 0) {
            return res.status(400).json({ error: 'La cantidad y el precio deben ser mayores que cero' });
        }

        const producto = await datosProducto(Number(id_producto));
        if (!producto) {
            return res.status(404).json({ error: 'El producto indicado no existe' });
        }

        // id_parcela es opcional, pero si viene tiene que ser del usuario.
        if (id_parcela) {
            const parcela = await parcelaDelUsuario(String(id_parcela), res.locals.usuario.id);
            if (!parcela) {
                return res.status(404).json({ error: 'La parcela no existe o no es tuya' });
            }
        }

        const [canales] = await pool.query<RowDataPacket[]>(
            'SELECT id_canal FROM canales_venta WHERE id_canal = ?', [id_canal]
        );
        if (!canales.length) {
            return res.status(404).json({ error: 'El canal indicado no existe' });
        }

        const [creada] = await pool.query<ResultSetHeader>(
            'INSERT INTO publicaciones (id_usuario, id_parcela, id_producto, id_canal, cantidad, precio_unitario, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [res.locals.usuario.id, id_parcela ?? null, id_producto, id_canal, cantidad, precio_unitario, fecha]
        );

        res.status(201).json({ mensaje: 'Publicación creada', id_publicacion: creada.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear la publicación' });
    }
});

/**
 * GET /publicaciones[?estado=][?id_producto=][?mias=true]
 *
 * A diferencia de casi todo lo demas, esta ruta NO filtra por usuario: el
 * mercado es publico y lo que quieres es ver las publicaciones de toda la
 * gente para saber a quien le puedes comprar. Por eso el token sigue siendo
 * obligatorio (para no dejar la API abierta) pero no se usa para filtrar.
 *
 * Los filtros se pueden combinar: ?estado=disponible&id_producto=3
 *
 * Los tres valores validos de estado son: disponible, vendido, retirado.
 * Si mandas cualquier otro devuelve 400 diciendo cuales son los validos,
 * para que el frontend pueda mostrar esa lista en un selector.
 *
 * Cada fila ya viene con producto, unidad, canal, agricultor y nombre_parcela
 * resueltos, para que no haya que hacer un GET por cada id.
 */
app.get('/publicaciones', protegerRuta, async (req, res) => {
    try {
        const cond: string[] = [];
        const params: unknown[] = [];

        const estado = typeof req.query.estado === 'string' ? req.query.estado : null;
        if (estado) {
            const validos = ['disponible', 'vendido', 'retirado'];
            if (!validos.includes(estado)) {
                return res.status(400).json({ error: `Estado no valido. Usa: ${validos.join(', ')}` });
            }
            cond.push('pub.estado = ?');
            params.push(estado);
        }

        const idProducto = queryNum(req, 'id_producto');
        if (idProducto) {
            cond.push('pub.id_producto = ?');
            params.push(idProducto);
        }

        // Por defecto el mercado es publico: se ven las de todos.
        // Con ?mias=true solo las del usuario del token.
        const soloMias = req.query.mias === 'true';
        if (soloMias) {
            cond.push('pub.id_usuario = ?');
            params.push(res.locals.usuario.id);
        }

        const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

        const [filas] = await pool.query<RowDataPacket[]>(
            'SELECT pub.id_publicacion, pub.id_usuario, pub.id_parcela, pub.id_producto, ' +
            'pub.id_canal, pub.cantidad, pub.precio_unitario, pub.estado, pub.fecha, pub.creado_en, ' +
            'pr.nombre AS producto, pr.unidad, cv.nombre AS canal, u.nombre AS agricultor, ' +
            'pa.nombre_parcela, ' +
            // "mia" le dice al frontend si puede cambiarle el estado a esta fila.
            // Sin esto tendria que comparar id_usuario contra el id del usuario
            // guardado en el navegador, y ese id no viene en el token.
            //
            // OJO con el orden del array: este ? es el PRIMERO del SQL porque
            // esta en el SELECT, que va antes que el WHERE. Por eso su valor va
            // adelante del spread, no al final como los del where.
            //
            // OJO tambien con la coma de arriba: sin ella MySQL lee
            // "pa.nombre_parcela (pub.id_usuario = 38)" como una llamada a
            // funcion y revienta con ER_SP_DOES_NOT_EXIST.
            '(pub.id_usuario = ?) AS mia ' +
            'FROM publicaciones pub ' +
            'JOIN productos pr ON pr.id_producto = pub.id_producto ' +
            'JOIN canales_venta cv ON cv.id_canal = pub.id_canal ' +
            'JOIN usuarios u ON u.id_usuario = pub.id_usuario ' +
            'LEFT JOIN parcelas pa ON pa.id_parcela = pub.id_parcela ' +
            where +
            ' ORDER BY pub.creado_en DESC, pub.id_publicacion DESC',
            [res.locals.usuario.id, ...params]
        );

        res.json(filas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al consultar las publicaciones' });
    }
});

/**
 * PUT /publicaciones/:id/estado
 * body: { estado: 'disponible' | 'vendido' | 'retirado' }
 *
 * Sirve para cambiar el estado de una oferta, por ejemplo cuando alguien la
 * compro. Solo funciona sobre publicaciones del usuario del token: si el id
 * es de otra persona devuelve 404, no 403, para no confirmar que ese id existe.
 *
 * 200 al exito, 400 si el estado no es valido, 404 si no existe o no es tuya.
 */
app.put('/publicaciones/:id/estado', protegerRuta, async (req, res) => {
    try {
        const { estado } = req.body;
        const validos = ['disponible', 'vendido', 'retirado'];

        if (!estado) {
            return res.status(400).json({ error: 'El estado es obligatorio' });
        }
        if (!validos.includes(estado)) {
            return res.status(400).json({ error: `Estado no valido. Usa: ${validos.join(', ')}` });
        }

        const [r] = await pool.query<ResultSetHeader>(
            'UPDATE publicaciones SET estado = ? WHERE id_publicacion = ? AND id_usuario = ?',
            [estado, req.params.id, res.locals.usuario.id]
        );

        if (r.affectedRows === 0) {
            return res.status(404).json({ error: 'Publicacion no encontrada o no es tuya' });
        }

        res.json({ mensaje: 'Estado actualizado', estado });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el estado' });
    }
});

app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`Corriendo en el puerto ${PUERTO}`);
});