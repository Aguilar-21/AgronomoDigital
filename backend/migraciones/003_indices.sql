-- 003_publicaciones.sql
--
-- POR QUE ESTA MIGRACION EXISTE
--
-- 1. La columna notas no existia, y el formulario de publicar tiene un campo de
--    notas. O se agregar la columna o el frontend pierde ese dato.
--
-- 2. Indices para las consultas que ahora hacen las rutas. Sin esto, el tablero
--    del mercado hace un recorrido completo de la tabla en cada pagina, y eso se
--    nota a partir de unos miles de publicaciones, no de cien.
--
-- 3. id_usuario se deja como esta. La ruta nueva lo llena SIEMPRE desde el
--    token, y antes no se llenaba: se deduca a traves de la parcela. La columna
--    es NOT NULL, asi que una publicacion sin parcela no podia insertarse, lo cual
--    es una limitacion que el esquema debio avisar antes.
--
-- SOBRE EL INDICE (estado, fecha, id_publicacion)
--
-- El orden de las columnas no es arbitrario. La consulta del tablero es:
--
--     WHERE estado = 'disponible' ORDER BY fecha DESC, id_publicacion DESC
--                       LIMIT 50 OFFSET n
--
-- Con estado de primera, el indice solo contiene las filas disponibles, que son
-- las que se muestran. Con fecha de primera, MySQL tendria que recorrer el
-- indice entero y descartar las vendidas, y como las ventas se acumulan para
-- siempre, la lista se degrada con el uso sin que nada cambie en el codigo.
--
-- El id_publicacion al final resuelve los empates en la misma fecha. Sin el, dos
-- publicaciones del mismo dia pueden salir en orden distinto entre peticiones,
-- y eso hace que una pagina parezca "perdida" y "aparecida" al recargar.

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
--
-- VARCHAR(255) porque es una nota para el comprador ("cosecha de esta semana",
-- "se entrega en la finca"), no un texto largo. Con TEXT no habria limite y
-- el dato terminaria en un modal de cinco parrafos que nadie leeria.
ALTER TABLE `publicaciones`
    ADD COLUMN `notas` varchar(255) DEFAULT NULL AFTER `estado`;

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------

-- El tablero del mercado: filtro por estado, ordenado por fecha.
--
-- El indice actual idx_pub_producto es (id_producto, estado), que ayuda cuando
-- se filtra por producto. Este cubre el caso mas frecuente, que es ver todo lo
-- disponible.
CREATE INDEX `idx_pub_estado_fecha` ON `publicaciones` (`estado`, `fecha`, `id_publicacion`);

-- Conteo de "cuanto queda disponible" para la regla de no sobre-publicar.
--
-- La consulta es:
--
--     SELECT SUM(cantidad) FROM publicaciones
--     WHERE id_parcela = ? AND id_producto = ? AND estado IN (...)
--
-- El indice actual no cubre porque empieza por id_producto, no por id_parcela.
-- Con este, la busqueda ocurre solo sobre las publicaciones de esa parcela.
CREATE INDEX `idx_pub_parcela_producto` ON `publicaciones` (`id_parcela`, `id_producto`, `estado`);

-- ---------------------------------------------------------------------------
-- Costos: (id_parcela, ciclo) y (id_parcela, id_producto, ciclo)
-- ---------------------------------------------------------------------------
--
-- El resumen de costos agrupa por parcela y ciclo. El indice actual es solo
-- (id_parcela), que MySQL puede usar, pero tiene que descartar fila por fila las
-- de otros ciclos para quedarse con las del pedido.
--
-- Con (id_parcela, ciclo) la busqueda es directa. El orden de las columnas
-- importa: id_parcela va primero porque siempre viene en el WHERE, y la
-- cardinalidad de parcela es menor que la de ciclo, asi que es el primer filtro
-- que reduce.
CREATE INDEX `idx_costo_parcela_ciclo` ON `transacciones_costos` (`id_parcela`, `ciclo`);

-- Para el filtro por producto. Sin esto, el separador de "costos del producto" y
-- "costos generales" tiene que leer todos los costos de la parcela y descartar en
-- memoria los que no son de ese producto.
CREATE INDEX `idx_costo_parcela_producto` ON `transacciones_costos` (`id_parcela`, `id_producto`, `ciclo`);

-- ---------------------------------------------------------------------------
-- Precios: el ultimo de cada producto
-- ---------------------------------------------------------------------------
--
-- Todas las consultas de precio ordenan por fecha DESC, id_precio DESC para
-- quedarse con el mas reciente. Con este indice, MySQL lee de atras hacia
-- adelante y para en el primero: no tiene que traer todo el historial para
-- devolver un numero.
CREATE INDEX `idx_precio_producto_fecha` ON `historial_precios` (`id_producto`, `fecha`, `id_precio`);

-- Igual, para el filtro por canal. La consulta de "productos de este canal" lo
-- necesita.
CREATE INDEX `idx_precio_canal_fecha` ON `historial_precios` (`id_canal`, `fecha`, `id_precio`);
