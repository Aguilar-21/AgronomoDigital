-- 004_usuario_login.sql
--
-- POR QUE ESTA MIGRACION EXISTE
--
-- Hasta ahora la cuenta se identificaba solo por correo. Se agrega un nombre de
-- usuario para que el login acepte cualquiera de los dos.
--
-- La unicidad no se controla con un SELECT antes de insertar: se controla con
-- un indice UNIQUE. Un SELECT previo deja una ventana entre la comprobacion y
-- el INSERT en la que dos peticiones pueden pasar las dos. El indice, en cambio,
-- es atomico: la segunda recibe un error de clave duplicada y la ruta lo
-- traduce a 409.
--
-- SOBRE LOS USUARIOS QUE YA EXISTEN
--
-- La columna se agrega nullable, se rellena a partir de la parte del correo
-- anterior a la arroba, y recien despues se vuelve NOT NULL. Si se agregara
-- NOT NULL de una vez, MySQL no sabria que ponerle a las filas existentes.
--
-- Si dos correos comparten esa parte (por ejemplo nuevo@dominio1.com y
-- nuevo@dominio2.com), el segundo recibe el sufijo _<id> para no violar el
-- UNIQUE. Es preferible a que la migracion falle y deje la tabla a medias.

-- 1. La columna, nullable por ahora.
ALTER TABLE `usuarios`
    ADD COLUMN `usuario` varchar(30) DEFAULT NULL AFTER `nombre`;

-- 2. Relleno desde el correo.
--
-- Se limpian los caracteres que no son validos en un usuario (por ejemplo el
-- + de las direcciones con etiqueta) y se recorta a 30. LOWER porque el login
-- normaliza a minusculas y los datos viejos tienen que quedar igual.
UPDATE `usuarios`
SET `usuario` = LEFT(
        LOWER(REGEXP_REPLACE(SUBSTRING_INDEX(`correo`, '@', 1), '[^a-zA-Z0-9._-]', '_')),
        30
    )
WHERE `usuario` IS NULL;

-- 3. Si el resultado no empieza con letra, se le antepone una 'u'.
UPDATE `usuarios`
SET `usuario` = CONCAT('u', `usuario`)
WHERE `usuario` NOT REGEXP '^[a-z]';

-- 4. Duplicados: el segundo y siguientes reciben _<id>.
--
-- La subconsulta va envuelta en una tabla derivada a proposito. MySQL no deja
-- leer y escribir la misma tabla en la misma sentencia si se referencia directa,
-- pero si la deja materializar como derived table.
UPDATE `usuarios` u
JOIN (
    SELECT `usuario`, MIN(`id_usuario`) AS primero
    FROM `usuarios`
    GROUP BY `usuario`
    HAVING COUNT(*) > 1
) d ON d.`usuario` = u.`usuario` AND u.`id_usuario` <> d.primero
SET u.`usuario` = CONCAT(LEFT(u.`usuario`, 20), '_', u.`id_usuario`);

-- 5. Ahora si, obligatoria y unica.
ALTER TABLE `usuarios`
    MODIFY COLUMN `usuario` varchar(30) NOT NULL;

ALTER TABLE `usuarios`
    ADD UNIQUE KEY `uq_usuarios_usuario` (`usuario`);

-- Verificacion manual:
--
--   SELECT id_usuario, usuario, correo FROM usuarios ORDER BY id_usuario;
--   SHOW INDEX FROM usuarios WHERE Key_name = 'uq_usuarios_usuario';
