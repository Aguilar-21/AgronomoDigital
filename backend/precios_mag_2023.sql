-- precios_mag_2023.sql (SQLite)
-- Precios reales extraidos de la Guia MAG 2023.
-- Fuente: https://www.mag.gob.sv/wp-content/uploads/2024/02/Guia-de-precios-de-Insumos-Agropecuarios-2023.pdf

INSERT OR REPLACE INTO fuentes_precio
  (id_fuente, institucion, titulo, fecha_publicacion, url, hash_sha256, es_ejemplo, notas)
VALUES
  (2, 'Ministerio de Agricultura y Ganaderia (MAG)', 'Guia de Precios de Insumos Agropecuarios 2023',
   '2023-07-31', 'https://www.mag.gob.sv/wp-content/uploads/2024/02/Guia-de-precios-de-Insumos-Agropecuarios-2023.pdf', NULL, 0, 'Precios actualizados al 31/07/2023, IVA incluido. Cargados por ingesta automatica.');

-- Limpiar precios anteriores de esta fuente (idempotente)
DELETE FROM precios_insumos WHERE id_fuente = 2;

INSERT INTO precios_insumos
  (id_insumo, precio_unitario, moneda, vigente_desde, vigente_hasta, id_fuente)
VALUES
  (11, 0.7444, 'USD', '2023-07-31', NULL, 2),
  (16, 4.1640, 'USD', '2023-07-31', NULL, 2),
  (17, 4.4429, 'USD', '2023-07-31', NULL, 2),
  (18, 7.3700, 'USD', '2023-07-31', NULL, 2),
  (19, 9.9800, 'USD', '2023-07-31', NULL, 2);

INSERT OR REPLACE INTO alias_insumos (id_insumo, alias) VALUES (11, 'urea 46% n perlada    nitrógeno total 46%,   saco 45 kg  $33');
INSERT OR REPLACE INTO alias_insumos (id_insumo, alias) VALUES (16, 'glifosato 5 litros $20.82 agrozela s.a. de c.v');
INSERT OR REPLACE INTO alias_insumos (id_insumo, alias) VALUES (17, '2,4-d 3.5 litros $15.55 proagro de c.a., s.a. de c.v.');
INSERT OR REPLACE INTO alias_insumos (id_insumo, alias) VALUES (18, 'ridodur 40 sc mancozeb 40%   1 litro $7.37 agrozella, s.a. d');
INSERT OR REPLACE INTO alias_insumos (id_insumo, alias) VALUES (19, 'cipermetrina   500 ml $4.99 proagro de c.a., s.a. de c.v.');