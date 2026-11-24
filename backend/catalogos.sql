-- catalogos.sql (SQLite)
-- Productos y canales de venta. Idempotente por UNIQUE.

INSERT INTO productos (id_producto, nombre, unidad, tipo_producto, activo) VALUES
  (1, 'Maiz blanco', 'quintal', 'grano', 1),
  (2, 'Maiz amarillo', 'quintal', 'grano', 1),
  (3, 'Frijol rojo', 'quintal', 'grano', 1),
  (4, 'Arroz blanco', 'quintal', 'grano', 1),
  (5, 'Tomate', 'caja', 'hortaliza', 1),
  (6, 'Chile verde', 'caja', 'hortaliza', 1),
  (7, 'Loroco', 'libra', 'hortaliza', 1),
  (8, 'Platano', 'racimo', 'fruta', 1),
  (9, 'Naranja', 'quintal', 'fruta', 1),
  (10, 'Cafe oro', 'quintal', 'grano', 1),
  (11, 'Cacao', 'quintal', 'grano', 1),
  (12, 'Yuca', 'quintal', 'tuberculo', 1),
  (13, 'Ayote', 'unidad', 'hortaliza', 1),
  (14, 'Pepino', 'unidad', 'hortaliza', 1)
ON CONFLICT(id_producto) DO UPDATE SET
  nombre = excluded.nombre,
  unidad = excluded.unidad,
  tipo_producto = excluded.tipo_producto,
  activo = excluded.activo;

INSERT INTO canales_venta (id_canal, nombre) VALUES
  (1, 'Mercado local'),
  (2, 'Intermediario'),
  (3, 'Exportacion'),
  (4, 'Venta directa')
ON CONFLICT(id_canal) DO UPDATE SET nombre = excluded.nombre;
