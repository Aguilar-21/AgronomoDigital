-- 001_renombres.sql
--
-- POR QUE ESTA MIGRACION EXISTE
--
-- Dos columnas tienen nombres que describen mal lo que guardan, y ese nombre ya
-- produjo un error real.
--
-- precio_venta_quintal guardaba el precio de UNA UNIDAD del producto. El sistema
-- tiene 14 productos en 6 unidades (quintal, caja, jaba, ciento, libra, botella):
-- un tomate en caja costaba lo que costaba la caja y la columna se llamaba
-- quintal. El nombre hacia creer que el dato estaba en quintales cuando no lo
-- estaba.
--
-- produccion_quintales es el caso mas grave. Esa columna es un unico total para
-- toda la parcela, y el codigo la usaba como plan B cuando un producto no
-- tenia produccion registrada en produccion_parcelas. Una parcela con 50
-- quintales de maiz consultada por tomate devolvia "50 cajas de tomate", y el
-- costo por caja salia de un numero que no era de cajas.
--
-- El renombre no arregla ese ultimo caso: eso se arreglo dejando de usar la
-- columna como fallback (ver servicios/consultas.ts, resolverProduccion). Pero
-- mientras la columna se llame "quintales", el error sigue siendo facil de
-- cometer.
--
-- MySQL 8 soporta RENAME COLUMN. En MySQL 5.7 no existe, y ahi habria que usar
-- CHANGE COLUMN, que ademas es lo unico que funciona en MariaDB.

-- 1. El precio de venta de una unidad.
--
-- Se mantiene el tipo DECIMAL(10,2) y los datos: es un cambio de nombre, no de
-- contenido. Los DECIMAL no se tocan para nada; siguen saliendo como texto de
-- mysql2 y el backend los convierte con num().
ALTER TABLE `historial_precios`
    RENAME COLUMN `precio_venta_quintal` TO `precio_venta`;

-- 2. La produccion estimada del total de la parcela.
--
-- "estimada" porque sigue siendo un dato aproximado que declara el usuario, no
-- una medicion. El nombre nuevo no promete una precision que no tiene.
ALTER TABLE `parcelas`
    RENAME COLUMN `produccion_quintales` TO `produccion_estimada`;

-- Verificacion: si el RENAME no se aplico, esto no encuentra las columnas nuevas
-- y el script falla con un error claro en vez de dejar la base a medias.
--
-- SELECT precio_venta FROM historial_precios LIMIT 1;
-- SELECT produccion_estimada FROM parcelas LIMIT 1;
