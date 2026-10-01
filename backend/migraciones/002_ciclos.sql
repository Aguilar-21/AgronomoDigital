-- 002_ciclos.sql
--
-- POR QUE ESTA MIGRACION EXISTE
--
-- transacciones_costos NO TENIA COLUMNA ciclo. produccion_parcelas si lo tenia,
-- y ahi estaba el problema.
--
-- El caso: un agricultor registra sus costos de enero a junio de 2026 y su
-- produccion del ciclo "2026-A". El punto de equilibrio suma los costos de dos
-- anos y los divide por la produccion de uno. El numero que sale no describe
-- ninguna temporada: es una mezcla.
--
-- El sintoma es dificil de detectar porque el endpoint no da error. Devuelve un
-- numero con dos decimales que parece tan legitimo como cualquier otro, solo
-- que es incorrecto.
--
-- En resumen: sin ciclo, los costos de la parcela son de todos los ciclos a la
-- vez.
--
-- SOBRE EL VALOR POR DEFECTO 'actual'
--
-- Las filas que ya existen reciben 'actual'. No es '2026' ni '2026-A' porque la
-- migracion no puede saber a que temporada pertenecna cada costo: eso solo lo
-- sabe el usuario.
--
-- Asignarlas todas a 'actual' es la unica opcion que no inventa informacion. Y
-- tiene una consecuencia util: los datos viejos quedan agrupados juntos y
-- separados de los costos nuevos que si traen su ciclo, que es exactamente lo
-- que hace falta para poder comparar. Si en cambio se hubiera puesto '2026' a
-- todo, los costos de enero del 2025 y los de junio del 2026 quedaron mezclados
-- bajo una etiqueta que miente.

-- ---------------------------------------------------------------------------
-- Costos
-- ---------------------------------------------------------------------------
ALTER TABLE `transacciones_costos`
    ADD COLUMN `ciclo` varchar(30) NOT NULL DEFAULT 'actual' AFTER `fecha`;

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------
--
-- Por que TAMBIEN publicaciones: la regla de "no publicar mas de lo que se produjo"
-- compara la cantidad contra la produccion. Sin ciclo, comparar una publicacion
-- de junio contra la produccion acumulada de todo el ano dejaria publicar tres
-- veces la mercaderia.
ALTER TABLE `publicaciones`
    ADD COLUMN `ciclo` varchar(30) NOT NULL DEFAULT 'actual' AFTER `fecha`;

-- ---------------------------------------------------------------------------
-- Por que NO un indice todavia
-- ---------------------------------------------------------------------------
--
-- Todas las consultas filtran por (id_parcela, ciclo) o (id_parcela,
-- id_producto, ciclo), y el indice compuesto de produccion_parcelas ya cubre la
-- segunda forma.
--
-- Este indice tiene sentido cuando haya suficientes filas. Con las que hay hoy,
-- MySQL lo ignora: hace el mismo trabajo escaneando la tabla entera que leyendo
-- el indice. Agregarlo ahora seria una escritura extra en cada INSERT a cambio de
-- nada. Se agrega en la migracion 003, junto con los demas, y con un criterio
-- explicito sobre cuando tiene sentido.
