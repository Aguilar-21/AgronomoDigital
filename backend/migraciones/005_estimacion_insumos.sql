-- 005_estimacion_insumos.sql
--
-- Cambia el modelo de costos declarados por el de estimacion de insumos.
-- parcelas guarda la unidad de su tamano, produccion_parcelas pasa a ser
-- siembras con su superficie, y se crean las tablas de insumos, recetas,
-- fuentes de precio y estimaciones.
--
-- No se toca categorias_costos: en esta base ya no existe. Si apareciera en
-- una instalacion vieja, se borra a mano.

-- ---------------------------------------------------------------------------
-- 1. parcelas: unidad de superficie y salida de produccion_estimada
-- ---------------------------------------------------------------------------
--
-- tamano es solo un numero. Sin la unidad, 5 puede ser 5 hectareas o 5
-- manzanas, y la diferencia es de casi 43%. La columna nueva evita esa
-- ambiguedad.
ALTER TABLE `parcelas`
    ADD COLUMN `unidad_superficie` enum('hectarea','manzana') NOT NULL DEFAULT 'hectarea'
        AFTER `tamano`;

-- produccion_estimada era una cifra unica para toda la parcela. La produccion
-- real por cultivo vive en siembras, asi que esta columna queda sin uso.
ALTER TABLE `parcelas`
    DROP COLUMN `produccion_estimada`;

-- ---------------------------------------------------------------------------
-- 2. produccion_parcelas -> siembras
-- ---------------------------------------------------------------------------
--
-- Una parcela es el terreno; una siembra es un cultivo con su superficie. Un
-- terreno de 5 manzanas puede tener 3 de maiz y 2 de frijol, y eso son dos
-- filas de siembras, no dos parcelas.
RENAME TABLE `produccion_parcelas` TO `siembras`;

ALTER TABLE `siembras`
    CHANGE COLUMN `id_produccion` `id_siembra` int NOT NULL AUTO_INCREMENT,
    ADD COLUMN `superficie` decimal(10,2) DEFAULT NULL AFTER `ciclo`,
    ADD COLUMN `unidad_superficie` enum('hectarea','manzana') NOT NULL DEFAULT 'hectarea'
        AFTER `superficie`,
    ADD COLUMN `fecha_siembra` date DEFAULT NULL AFTER `unidad_superficie`;

-- Los nombres de indices viejos hablaban de produccion. Se renombran para que
-- el esquema se lea igual que el codigo.
ALTER TABLE `siembras`
    RENAME INDEX `uq_prod_parcela_ciclo` TO `uq_siembra_parcela_producto_ciclo`,
    RENAME INDEX `idx_prod_parcela` TO `idx_siembra_parcela`,
    RENAME INDEX `idx_prod_producto` TO `idx_siembra_producto`;

-- Si ya habia filas, se les copia el tamano de la parcela como superficie
-- inicial. Es una aproximacion: la migracion no puede saber cuanto se sembro
-- de verdad, pero es mejor que dejarlas sin superficie.
UPDATE `siembras` s
JOIN `parcelas` p ON p.id_parcela = s.id_parcela
SET s.superficie = p.tamano,
    s.unidad_superficie = p.unidad_superficie
WHERE s.superficie IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Catalogo de insumos
-- ---------------------------------------------------------------------------

CREATE TABLE `categorias_insumos` (
  `id_categoria_insumo` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) NOT NULL,
  PRIMARY KEY (`id_categoria_insumo`),
  UNIQUE KEY `uq_categoria_insumo` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `insumos` (
  `id_insumo` int NOT NULL AUTO_INCREMENT,
  `id_categoria_insumo` int NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `unidad_base` enum('kg','litro','unidad') NOT NULL DEFAULT 'kg',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id_insumo`),
  UNIQUE KEY `uq_insumo_nombre` (`nombre`),
  KEY `idx_insumo_categoria` (`id_categoria_insumo`),
  CONSTRAINT `fk_insumo_categoria`
    FOREIGN KEY (`id_categoria_insumo`) REFERENCES `categorias_insumos` (`id_categoria_insumo`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El documento oficial no escribe los nombres igual que el catalogo
-- ("UREA 46%" contra "Urea 46%"). Esta tabla guarda esas equivalencias.
CREATE TABLE `alias_insumos` (
  `id_alias` int NOT NULL AUTO_INCREMENT,
  `id_insumo` int NOT NULL,
  `alias` varchar(150) NOT NULL,
  PRIMARY KEY (`id_alias`),
  UNIQUE KEY `uq_alias_insumo` (`alias`),
  KEY `idx_alias_insumo` (`id_insumo`),
  CONSTRAINT `fk_alias_insumo`
    FOREIGN KEY (`id_insumo`) REFERENCES `insumos` (`id_insumo`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cada carga del documento queda registrada con su hash. Asi se puede saber
-- con que version de los precios se calculo una estimacion vieja.
CREATE TABLE `fuentes_precio` (
  `id_fuente` int NOT NULL AUTO_INCREMENT,
  `institucion` varchar(120) NOT NULL,
  `titulo` varchar(200) NOT NULL,
  `fecha_publicacion` date DEFAULT NULL,
  `url` varchar(500) DEFAULT NULL,
  `hash_sha256` char(64) DEFAULT NULL,
  `descargado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `es_ejemplo` tinyint(1) NOT NULL DEFAULT '0',
  `notas` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_fuente`),
  UNIQUE KEY `uq_fuente_hash` (`hash_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `precios_insumos` (
  `id_precio_insumo` int NOT NULL AUTO_INCREMENT,
  `id_insumo` int NOT NULL,
  `precio_unitario` decimal(12,4) NOT NULL,
  `moneda` char(3) NOT NULL DEFAULT 'USD',
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date DEFAULT NULL,
  `id_fuente` int NOT NULL,
  PRIMARY KEY (`id_precio_insumo`),
  KEY `idx_precio_insumo_vigencia` (`id_insumo`, `vigente_desde`),
  KEY `idx_precio_fuente` (`id_fuente`),
  CONSTRAINT `fk_precio_insumo`
    FOREIGN KEY (`id_insumo`) REFERENCES `insumos` (`id_insumo`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_precio_fuente`
    FOREIGN KEY (`id_fuente`) REFERENCES `fuentes_precio` (`id_fuente`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La receta: cuanto insumo lleva una hectarea de cada cultivo.
CREATE TABLE `requerimientos_cultivo` (
  `id_requerimiento` int NOT NULL AUTO_INCREMENT,
  `id_producto` int NOT NULL,
  `id_insumo` int NOT NULL,
  `cantidad_por_hectarea` decimal(12,4) NOT NULL,
  `etapa` varchar(40) NOT NULL DEFAULT 'general',
  `es_ejemplo` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id_requerimiento`),
  UNIQUE KEY `uq_requerimiento` (`id_producto`, `id_insumo`, `etapa`),
  KEY `idx_requerimiento_producto` (`id_producto`),
  KEY `idx_requerimiento_insumo` (`id_insumo`),
  CONSTRAINT `fk_requerimiento_producto`
    FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_requerimiento_insumo`
    FOREIGN KEY (`id_insumo`) REFERENCES `insumos` (`id_insumo`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 4. Estimaciones guardadas
-- ---------------------------------------------------------------------------
--
-- id_siembra no existe a proposito: el usuario consulta antes de registrar la
-- siembra. id_parcela es opcional por la misma razon. Lo que si es obligatorio
-- es id_fuente, para que el total se pueda explicar despues.
CREATE TABLE `estimaciones` (
  `id_estimacion` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `id_producto` int NOT NULL,
  `id_parcela` int DEFAULT NULL,
  `id_fuente` int NOT NULL,
  `superficie` decimal(10,2) NOT NULL,
  `unidad_superficie` enum('hectarea','manzana') NOT NULL DEFAULT 'hectarea',
  `superficie_ha` decimal(12,4) NOT NULL,
  `total_estimado` decimal(12,2) NOT NULL,
  `alcance` varchar(30) NOT NULL DEFAULT 'solo_insumos',
  `calculado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_estimacion`),
  KEY `idx_estimacion_usuario` (`id_usuario`, `calculado_en`),
  KEY `idx_estimacion_producto` (`id_producto`),
  KEY `idx_estimacion_fuente` (`id_fuente`),
  CONSTRAINT `fk_estimacion_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_estimacion_producto`
    FOREIGN KEY (`id_producto`) REFERENCES `productos` (`id_producto`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_estimacion_parcela`
    FOREIGN KEY (`id_parcela`) REFERENCES `parcelas` (`id_parcela`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_estimacion_fuente`
    FOREIGN KEY (`id_fuente`) REFERENCES `fuentes_precio` (`id_fuente`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `estimaciones_detalle` (
  `id_detalle` int NOT NULL AUTO_INCREMENT,
  `id_estimacion` int NOT NULL,
  `id_insumo` int NOT NULL,
  `unidad_base` varchar(20) NOT NULL,
  `cantidad` decimal(12,4) NOT NULL,
  `precio_unitario` decimal(12,4) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`id_detalle`),
  KEY `idx_detalle_estimacion` (`id_estimacion`),
  KEY `idx_detalle_insumo` (`id_insumo`),
  CONSTRAINT `fk_detalle_estimacion`
    FOREIGN KEY (`id_estimacion`) REFERENCES `estimaciones` (`id_estimacion`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_detalle_insumo`
    FOREIGN KEY (`id_insumo`) REFERENCES `insumos` (`id_insumo`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
