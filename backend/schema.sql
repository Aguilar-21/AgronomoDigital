-- schema.sql (SQLite)
-- Esquema final de AgronoDigital. Idempotente: todas las tablas usan
-- CREATE TABLE IF NOT EXISTS, asi que se puede ejecutar varias veces.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL UNIQUE,
    contrasena TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parcelas (
    id_parcela INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    nombre_parcela TEXT NOT NULL,
    ubicacion TEXT,
    tamano REAL,
    unidad_superficie TEXT NOT NULL DEFAULT 'hectarea' CHECK (unidad_superficie IN ('hectarea','manzana')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS siembras (
    id_siembra INTEGER PRIMARY KEY AUTOINCREMENT,
    id_parcela INTEGER NOT NULL,
    id_producto INTEGER NOT NULL,
    ciclo TEXT NOT NULL DEFAULT 'actual',
    superficie REAL,
    unidad_superficie TEXT NOT NULL DEFAULT 'hectarea' CHECK (unidad_superficie IN ('hectarea','manzana')),
    fecha_siembra TEXT,
    produccion REAL NOT NULL,
    fecha_registro TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (id_parcela, id_producto, ciclo),
    FOREIGN KEY (id_parcela) REFERENCES parcelas(id_parcela) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS productos (
    id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    unidad TEXT NOT NULL,
    tipo_producto TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS canales_venta (
    id_canal INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS publicaciones (
    id_publicacion INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    id_parcela INTEGER,
    id_producto INTEGER NOT NULL,
    id_canal INTEGER NOT NULL,
    cantidad REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','vendido','retirado')),
    fecha TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    ciclo TEXT NOT NULL DEFAULT 'actual',
    notas TEXT,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_parcela) REFERENCES parcelas(id_parcela) ON DELETE SET NULL,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    FOREIGN KEY (id_canal) REFERENCES canales_venta(id_canal)
);

CREATE TABLE IF NOT EXISTS historial_precios (
    id_precio INTEGER PRIMARY KEY AUTOINCREMENT,
    id_producto INTEGER,
    id_canal INTEGER,
    fecha TEXT NOT NULL,
    precio_venta REAL NOT NULL,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    FOREIGN KEY (id_canal) REFERENCES canales_venta(id_canal)
);

CREATE TABLE IF NOT EXISTS categorias_insumos (
    id_categoria_insumo INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS insumos (
    id_insumo INTEGER PRIMARY KEY AUTOINCREMENT,
    id_categoria_insumo INTEGER NOT NULL,
    nombre TEXT NOT NULL UNIQUE,
    unidad_base TEXT NOT NULL DEFAULT 'kg' CHECK (unidad_base IN ('kg','litro','unidad')),
    activo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (id_categoria_insumo) REFERENCES categorias_insumos(id_categoria_insumo) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS alias_insumos (
    id_alias INTEGER PRIMARY KEY AUTOINCREMENT,
    id_insumo INTEGER NOT NULL,
    alias TEXT NOT NULL UNIQUE,
    FOREIGN KEY (id_insumo) REFERENCES insumos(id_insumo) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS fuentes_precio (
    id_fuente INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion TEXT NOT NULL,
    titulo TEXT NOT NULL,
    fecha_publicacion TEXT,
    url TEXT,
    hash_sha256 TEXT,
    descargado_en TEXT NOT NULL DEFAULT (datetime('now')),
    es_ejemplo INTEGER NOT NULL DEFAULT 0,
    notas TEXT,
    UNIQUE (hash_sha256)
);

CREATE TABLE IF NOT EXISTS precios_insumos (
    id_precio_insumo INTEGER PRIMARY KEY AUTOINCREMENT,
    id_insumo INTEGER NOT NULL,
    precio_unitario REAL NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'USD',
    vigente_desde TEXT NOT NULL,
    vigente_hasta TEXT,
    id_fuente INTEGER NOT NULL,
    FOREIGN KEY (id_insumo) REFERENCES insumos(id_insumo) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_fuente) REFERENCES fuentes_precio(id_fuente) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS requerimientos_cultivo (
    id_requerimiento INTEGER PRIMARY KEY AUTOINCREMENT,
    id_producto INTEGER NOT NULL,
    id_insumo INTEGER NOT NULL,
    cantidad_por_hectarea REAL NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'general',
    es_ejemplo INTEGER NOT NULL DEFAULT 0,
    UNIQUE (id_producto, id_insumo, etapa),
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_insumo) REFERENCES insumos(id_insumo) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS estimaciones (
    id_estimacion INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    id_producto INTEGER NOT NULL,
    id_parcela INTEGER,
    id_fuente INTEGER NOT NULL,
    superficie REAL NOT NULL,
    unidad_superficie TEXT NOT NULL DEFAULT 'hectarea' CHECK (unidad_superficie IN ('hectarea','manzana')),
    superficie_ha REAL NOT NULL,
    total_estimado REAL NOT NULL,
    alcance TEXT NOT NULL DEFAULT 'solo_insumos',
    calculado_en TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (id_parcela) REFERENCES parcelas(id_parcela) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (id_fuente) REFERENCES fuentes_precio(id_fuente) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS estimaciones_detalle (
    id_detalle INTEGER PRIMARY KEY AUTOINCREMENT,
    id_estimacion INTEGER NOT NULL,
    id_insumo INTEGER NOT NULL,
    unidad_base TEXT NOT NULL,
    cantidad REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (id_estimacion) REFERENCES estimaciones(id_estimacion) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_insumo) REFERENCES insumos(id_insumo) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre TEXT NOT NULL PRIMARY KEY,
    aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_siembra_parcela ON siembras(id_parcela);
CREATE INDEX IF NOT EXISTS idx_siembra_producto ON siembras(id_producto);
CREATE INDEX IF NOT EXISTS idx_precio_insumo_vigencia ON precios_insumos(id_insumo, vigente_desde);
CREATE INDEX IF NOT EXISTS idx_estimacion_usuario ON estimaciones(id_usuario, calculado_en);
