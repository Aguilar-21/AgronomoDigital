-- catalogos_insumos.sql
--
-- Datos iniciales del catalogo de insumos, las recetas por cultivo y una
-- fuente de precios de ejemplo.
--
-- Ojo: los precios y las dosis de aca son inventados para probar el calculo.
-- La fuente lleva es_ejemplo = 1 y la API lo avisa en cada estimacion. Hay que
-- reemplazarla cuando se cargue el documento oficial.
--
-- Se puede ejecutar varias veces: todas las filas usan ON DUPLICATE KEY UPDATE.

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
INSERT INTO `categorias_insumos` (`id_categoria_insumo`, `nombre`) VALUES
  (1, 'Semillas'),
  (2, 'Fertilizantes'),
  (3, 'Proteccion de cultivo'),
  (4, 'Riego'),
  (5, 'Mano de obra'),
  (6, 'Maquinaria'),
  (7, 'Otros')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- ---------------------------------------------------------------------------
-- Insumos
-- ---------------------------------------------------------------------------
-- Riego, mano de obra y maquinaria quedan sin insumos por ahora: el documento
-- de precios que se va a cargar trae insumos fisicos. Se agregan cuando exista
-- una fuente para jornales y horas de maquina.
INSERT INTO `insumos` (`id_insumo`, `id_categoria_insumo`, `nombre`, `unidad_base`, `activo`) VALUES
  (1, 1, 'Semilla de maiz', 'kg', 1),
  (2, 1, 'Semilla de frijol', 'kg', 1),
  (3, 1, 'Semilla de arroz', 'kg', 1),
  (4, 1, 'Semilla de tomate', 'kg', 1),
  (5, 1, 'Semilla de chile', 'kg', 1),
  (6, 1, 'Plantin de loroco', 'unidad', 1),
  (7, 1, 'Hijuelo de platano', 'unidad', 1),
  (8, 1, 'Plantin de naranja', 'unidad', 1),
  (9, 1, 'Plantin de cafe', 'unidad', 1),
  (10, 1, 'Plantin de cacao', 'unidad', 1),
  (11, 2, 'Urea 46%', 'kg', 1),
  (12, 2, 'Formula 12-24-12', 'kg', 1),
  (13, 2, 'Muriato de potasio', 'kg', 1),
  (14, 2, 'Cal agricola', 'kg', 1),
  (15, 2, 'Abono organico', 'kg', 1),
  (16, 3, 'Glifosato', 'litro', 1),
  (17, 3, '2,4-D', 'litro', 1),
  (18, 3, 'Mancozeb', 'kg', 1),
  (19, 3, 'Cipermetrina', 'litro', 1)
ON DUPLICATE KEY UPDATE
  `id_categoria_insumo` = VALUES(`id_categoria_insumo`),
  `nombre` = VALUES(`nombre`),
  `unidad_base` = VALUES(`unidad_base`),
  `activo` = VALUES(`activo`);

-- ---------------------------------------------------------------------------
-- Alias para la ingesta del documento
-- ---------------------------------------------------------------------------
INSERT INTO `alias_insumos` (`id_alias`, `id_insumo`, `alias`) VALUES
  (1, 11, 'UREA 46%'),
  (2, 11, 'Urea'),
  (3, 11, 'Fertilizante urea'),
  (4, 12, '12-24-12'),
  (5, 12, 'Formula 12-24-12'),
  (6, 16, 'Glifosato 48%'),
  (7, 18, 'Mancozeb 80%'),
  (8, 19, 'Cipermetrina 20%'),
  (9, 1, 'Semilla maiz'),
  (10, 2, 'Semilla frijol')
ON DUPLICATE KEY UPDATE `id_insumo` = VALUES(`id_insumo`);

-- ---------------------------------------------------------------------------
-- Fuente de ejemplo
-- ---------------------------------------------------------------------------
INSERT INTO `fuentes_precio`
  (`id_fuente`, `institucion`, `titulo`, `fecha_publicacion`, `url`,
   `hash_sha256`, `es_ejemplo`, `notas`)
VALUES
  (1, 'Datos de ejemplo', 'Precios y dosis de ejemplo para pruebas', '2026-01-01', NULL,
   NULL, 1, 'Cifras inventadas solo para probar el calculo. Reemplazar por la fuente oficial.')
ON DUPLICATE KEY UPDATE
  `institucion` = VALUES(`institucion`),
  `titulo` = VALUES(`titulo`),
  `fecha_publicacion` = VALUES(`fecha_publicacion`),
  `es_ejemplo` = VALUES(`es_ejemplo`),
  `notas` = VALUES(`notas`);

-- ---------------------------------------------------------------------------
-- Precios por unidad base
-- ---------------------------------------------------------------------------
INSERT INTO `precios_insumos`
  (`id_precio_insumo`, `id_insumo`, `precio_unitario`, `moneda`,
   `vigente_desde`, `vigente_hasta`, `id_fuente`)
VALUES
  (1, 1, 2.5000, 'USD', '2026-01-01', NULL, 1),
  (2, 2, 3.0000, 'USD', '2026-01-01', NULL, 1),
  (3, 3, 1.2000, 'USD', '2026-01-01', NULL, 1),
  (4, 4, 60.0000, 'USD', '2026-01-01', NULL, 1),
  (5, 5, 80.0000, 'USD', '2026-01-01', NULL, 1),
  (6, 6, 0.3500, 'USD', '2026-01-01', NULL, 1),
  (7, 7, 0.3000, 'USD', '2026-01-01', NULL, 1),
  (8, 8, 1.5000, 'USD', '2026-01-01', NULL, 1),
  (9, 9, 0.4000, 'USD', '2026-01-01', NULL, 1),
  (10, 10, 0.4500, 'USD', '2026-01-01', NULL, 1),
  (11, 11, 0.5500, 'USD', '2026-01-01', NULL, 1),
  (12, 12, 0.6500, 'USD', '2026-01-01', NULL, 1),
  (13, 13, 0.6000, 'USD', '2026-01-01', NULL, 1),
  (14, 14, 0.1500, 'USD', '2026-01-01', NULL, 1),
  (15, 15, 0.2000, 'USD', '2026-01-01', NULL, 1),
  (16, 16, 6.0000, 'USD', '2026-01-01', NULL, 1),
  (17, 17, 5.0000, 'USD', '2026-01-01', NULL, 1),
  (18, 18, 8.0000, 'USD', '2026-01-01', NULL, 1),
  (19, 19, 7.0000, 'USD', '2026-01-01', NULL, 1)
ON DUPLICATE KEY UPDATE
  `precio_unitario` = VALUES(`precio_unitario`),
  `moneda` = VALUES(`moneda`),
  `vigente_desde` = VALUES(`vigente_desde`),
  `vigente_hasta` = VALUES(`vigente_hasta`),
  `id_fuente` = VALUES(`id_fuente`);

-- ---------------------------------------------------------------------------
-- Recetas por cultivo (dosis por hectarea, ilustrativas)
-- ---------------------------------------------------------------------------
INSERT INTO `requerimientos_cultivo`
  (`id_requerimiento`, `id_producto`, `id_insumo`, `cantidad_por_hectarea`, `etapa`, `es_ejemplo`)
VALUES
  -- Maiz blanco
  (1, 1, 1, 20.0000, 'general', 1),
  (2, 1, 11, 200.0000, 'general', 1),
  (3, 1, 12, 250.0000, 'general', 1),
  (4, 1, 16, 2.0000, 'general', 1),
  (5, 1, 19, 1.0000, 'general', 1),
  -- Maiz amarillo
  (6, 2, 1, 20.0000, 'general', 1),
  (7, 2, 11, 200.0000, 'general', 1),
  (8, 2, 12, 250.0000, 'general', 1),
  (9, 2, 16, 2.0000, 'general', 1),
  (10, 2, 19, 1.0000, 'general', 1),
  -- Frijol rojo
  (11, 3, 2, 25.0000, 'general', 1),
  (12, 3, 11, 100.0000, 'general', 1),
  (13, 3, 12, 200.0000, 'general', 1),
  (14, 3, 18, 2.0000, 'general', 1),
  (15, 3, 19, 1.0000, 'general', 1),
  -- Arroz blanco
  (16, 4, 3, 80.0000, 'general', 1),
  (17, 4, 11, 180.0000, 'general', 1),
  (18, 4, 12, 150.0000, 'general', 1),
  (19, 4, 16, 2.0000, 'general', 1),
  -- Tomate
  (20, 5, 4, 0.3000, 'general', 1),
  (21, 5, 15, 2000.0000, 'general', 1),
  (22, 5, 12, 300.0000, 'general', 1),
  (23, 5, 18, 3.0000, 'general', 1),
  (24, 5, 19, 2.0000, 'general', 1),
  -- Chile verde
  (25, 6, 5, 0.5000, 'general', 1),
  (26, 6, 15, 2000.0000, 'general', 1),
  (27, 6, 12, 300.0000, 'general', 1),
  (28, 6, 18, 3.0000, 'general', 1),
  (29, 6, 19, 2.0000, 'general', 1),
  -- Loroco
  (30, 7, 6, 2500.0000, 'general', 1),
  (31, 7, 15, 1500.0000, 'general', 1),
  (32, 7, 12, 200.0000, 'general', 1),
  -- Platano
  (33, 8, 7, 1500.0000, 'general', 1),
  (34, 8, 11, 300.0000, 'general', 1),
  (35, 8, 13, 200.0000, 'general', 1),
  (36, 8, 15, 1000.0000, 'general', 1),
  -- Naranja
  (37, 9, 8, 400.0000, 'general', 1),
  (38, 9, 11, 150.0000, 'general', 1),
  (39, 9, 12, 250.0000, 'general', 1),
  (40, 9, 18, 2.0000, 'general', 1),
  -- Cafe oro
  (41, 10, 9, 2500.0000, 'general', 1),
  (42, 10, 11, 200.0000, 'general', 1),
  (43, 10, 12, 250.0000, 'general', 1),
  (44, 10, 18, 2.0000, 'general', 1),
  -- Cacao
  (45, 11, 10, 1200.0000, 'general', 1),
  (46, 11, 11, 100.0000, 'general', 1),
  (47, 11, 12, 200.0000, 'general', 1),
  (48, 11, 15, 1000.0000, 'general', 1)
ON DUPLICATE KEY UPDATE
  `cantidad_por_hectarea` = VALUES(`cantidad_por_hectarea`),
  `etapa` = VALUES(`etapa`),
  `es_ejemplo` = VALUES(`es_ejemplo`);
