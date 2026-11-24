-- 002_ciclos.sql
--
-- POR QUE ESTA MIGRACION EXISTE
--
-- Agrega la columna `ciclo` a publicaciones, para que el tablero del mercado
-- pueda separar ofertas por temporada.
--
-- El caso: sin ciclo, comparar una publicacion de junio contra la produccion
-- acumulada de todo el ano dejaria publicar tres veces la mercaderia.
--
-- SOBRE EL VALOR POR DEFECTO 'actual'
--
-- Las filas que ya existen reciben 'actual'. No es '2026' ni '2026-A' porque la
-- migracion no puede saber a que temporada pertenecna cada publicacion: eso solo
-- lo sabe el usuario.
--
-- NOTA: esta migracion solia agregar `ciclo` tambien a transacciones_costos.
-- Esa tabla se retiro junto con el sistema de costos declarados, asi que esa
-- parte se elimino. Si mas adelante se vuelve a necesitar, hay que reescribir
-- la migracion.

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------

ALTER TABLE `publicaciones`
    ADD COLUMN `ciclo` varchar(30) NOT NULL DEFAULT 'actual' AFTER `fecha`;

-- ---------------------------------------------------------------------------
-- Por que NO un indice todavia
-- ---------------------------------------------------------------------------
--
-- El indice compuesto de produccion_parcelas ya cubre la forma (id_parcela,
-- id_producto, ciclo). El de publicaciones se agrega en la migracion 003.
