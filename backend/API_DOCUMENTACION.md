# API AgronoDigital

API REST del sistema de estimación de costos de insumos agrícolas.

- **Base URL:** `http://localhost:3002`
- **Formato:** JSON
- **Autenticación:** JWT en la cabecera `Authorization: Bearer <token>`
- **Base de datos:** SQLite, archivo `agronomodigital.db`

---

## Rutas públicas

No piden token:

```http
GET  /
GET  /productos
GET  /canales
GET  /canales/:id/productos
GET  /insumos
GET  /categorias-insumos
GET  /productos/:id/requerimientos
GET  /fuentes-precio
POST /registro
POST /login
GET  /health
```

El resto requiere `Authorization: Bearer <token>`. Sin token responde `401`.

---

## Registro y sesión

### POST /registro

```json
{
  "usuario": "jose",
  "nombre": "José Aguilar",
  "correo": "jose@mail.com",
  "contrasena": "clave12345"
}
```

- `usuario`: 3 a 30 caracteres, empieza con letra, luego letras, números, punto, guion o guion bajo. Se guarda en minúsculas y no se puede repetir.
- `correo`: se guarda en minúsculas y no se puede repetir.
- `contrasena`: mínimo 8 caracteres.

Respuesta `201`:

```json
{ "id_usuario": 12, "usuario": "jose" }
```

Errores: `400` datos inválidos, `409` usuario o correo ya registrado.

### POST /login

Acepta tres formas:

```json
{ "identificador": "jose", "contrasena": "clave12345" }
{ "usuario": "jose", "contrasena": "clave12345" }
{ "correo": "jose@mail.com", "contrasena": "clave12345" }
```

Respuesta `200`:

```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "mensaje": "Sesión iniciada" }
```

`401` con el mismo mensaje si la cuenta no existe o la contraseña es incorrecta.

El `id_usuario` nunca se recibe del cliente: sale del token. Todas las consultas filtran por ese id, así que un usuario no puede leer ni modificar datos de otro.

---

## Modelo de datos

16 tablas. Las de catálogo se cargan con SQL y el resto lo llena la API.

```
usuarios
  └── parcelas                     el terreno
        ├── siembras ──> productos cada cultivo con su superficie
        └── publicaciones ──> productos, canales_venta

productos
  ├── requerimientos_cultivo ──> insumos   dosis por hectárea
  ├── historial_precios ──> canales_venta  precio de venta
  └── estimaciones ──> fuentes_precio
        └── estimaciones_detalle ──> insumos

insumos ──> categorias_insumos
   ├── alias_insumos        nombres equivalentes del documento oficial
   └── precios_insumos ──> fuentes_precio
```

| Tabla | Para qué sirve |
|---|---|
| `usuarios` | Agricultores registrados. La contraseña va en bcrypt. |
| `parcelas` | Terreno del agricultor: nombre, ubicación, tamaño y unidad. |
| `siembras` | Un cultivo dentro de una parcela, con su superficie, ciclo y producción. |
| `productos` | Catálogo de cultivos: nombre, unidad de venta y tipo. |
| `canales_venta` | Mercado local, intermediario, exportación, procesadora. |
| `publicaciones` | Ofertas del mercado. Estado `disponible`, `vendido` o `retirado`. |
| `historial_precios` | Precios de venta por producto y canal. |
| `categorias_insumos` | Semillas, fertilizantes, protección de cultivo, etc. |
| `insumos` | Insumos comprables con su unidad base (`kg`, `litro`, `unidad`). |
| `alias_insumos` | Equivalencias entre los nombres del documento y el catálogo. |
| `fuentes_precio` | Documento oficial usado: institución, fecha, URL y hash. |
| `precios_insumos` | Precio por unidad, con vigencia y fuente. |
| `requerimientos_cultivo` | Dosis de cada insumo por hectárea para un cultivo. |
| `estimaciones` | Consulta guardada: cultivo, superficie, fuente y total. |
| `estimaciones_detalle` | Desglose de una estimación por insumo. |
| `migraciones_aplicadas` | Control interno del runner de migraciones. |

### Parcela y siembra no son lo mismo

Una parcela es el terreno. Una siembra es un cultivo con su superficie. Un terreno de 5 manzanas con 3 de maíz y 2 de frijol son **dos siembras**, no dos parcelas.

`parcelas.tamano` es el total del terreno y es informativo. El cálculo de insumos usa siempre `siembras.superficie`.

La unidad se guarda junto al número porque `5` no dice nada por sí solo: pueden ser 5 hectáreas o 5 manzanas.

Reglas `ON DELETE` que importan:

- `parcelas.id_usuario` → **CASCADE**: al borrar el usuario se van sus parcelas.
- `siembras.id_parcela` → **CASCADE**: al borrar la parcela se van sus siembras.
- `siembras.id_producto` → **RESTRICT**: no se borra un producto con siembras.
- `publicaciones.id_parcela` → **SET NULL**: la oferta sobrevive a la parcela.
- `publicaciones.id_usuario` → **CASCADE**: al borrar el usuario se van sus ofertas.
- `estimaciones.id_usuario` → **CASCADE**: al borrar el usuario se va su historial.
- `estimaciones_detalle.id_estimacion` → **CASCADE**.
- `precios_insumos.id_fuente` y `estimaciones.id_fuente` → **RESTRICT**: no se borra una fuente en uso.

Toda ruta con `:id` comprueba primero que el recurso sea del usuario del token. Si no es suyo responde `404`, no `403`, para no confirmar que el id existe.

---

## Catálogo

### GET /productos

```json
[{ "id_producto": 1, "nombre": "Maiz Blanco", "unidad": "quintal", "tipo_producto": "granos", "activo": 1 }]
```

### GET /canales

```json
[{ "id_canal": 1, "nombre": "Mercado local" }]
```

### GET /categorias-insumos

```json
[{ "id_categoria_insumo": 1, "nombre": "Semillas" }]
```

### GET /insumos

Acepta `?id_categoria_insumo=1`. Solo devuelve insumos activos.

```json
[{
  "id_insumo": 11,
  "id_categoria_insumo": 2,
  "categoria": "Fertilizantes",
  "nombre": "Urea 46%",
  "unidad_base": "kg",
  "activo": 1
}]
```

### GET /productos/:id/requerimientos

La receta del cultivo: qué insumos lleva y cuánto de cada uno por hectárea. Si el cultivo no tiene receta devuelve `[]`.

```json
[{
  "id_requerimiento": 2,
  "id_producto": 1,
  "id_insumo": 11,
  "insumo": "Urea 46%",
  "unidad_base": "kg",
  "cantidad_por_hectarea": "200.0000",
  "etapa": "general",
  "es_ejemplo": 1
}]
```

### GET /fuentes-precio

Documentos de precios cargados y cuántos precios trae cada uno.

```json
[{
  "id_fuente": 1,
  "institucion": "Datos de ejemplo",
  "titulo": "Precios y dosis de ejemplo para pruebas",
  "fecha_publicacion": "2026-01-01T06:00:00.000Z",
  "url": null,
  "descargado_en": "2026-11-23T22:38:56.000Z",
  "es_ejemplo": 1,
  "notas": "Cifras inventadas solo para probar el cálculo.",
  "precios": 19
}]
```

---

## Parcelas

### GET /parcelas

Solo las del usuario del token.

```json
[{
  "id_parcela": 12,
  "nombre_parcela": "Lote Norte",
  "ubicacion": "Cumana",
  "tamano": "5.00",
  "unidad_superficie": "manzana"
}]
```

### GET /parcelas/:id

La parcela completa. `404` si no existe o no es tuya.

### POST /parcelas

```json
{
  "nombre_parcela": "Lote Norte",
  "ubicacion": "Cumana",
  "tamano": 5,
  "unidad_superficie": "manzana"
}
```

`unidad_superficie` es `hectarea` o `manzana`; por defecto `hectarea`. `ubicacion` y `tamano` son opcionales.

Respuesta `201`:

```json
{ "mensaje": "Parcela creada", "id_parcela": 12 }
```

### PUT /parcelas/:id

Mismo cuerpo. Solo actualiza los campos que vienen. `404` si no es tuya.

### DELETE /parcelas/:id

Borra la parcela y, en cascada, sus siembras. Las publicaciones quedan con `id_parcela` en `NULL`.

---

## Siembras

### GET /parcelas/:id/siembras

Acepta `?id_producto=` y `?ciclo=`. Devuelve el producto y la unidad ya resueltos.

```json
[{
  "id_siembra": 9,
  "id_parcela": 12,
  "id_producto": 1,
  "ciclo": "actual",
  "superficie": "3.00",
  "unidad_superficie": "manzana",
  "fecha_siembra": "2026-11-23",
  "produccion": "100.00",
  "fecha_registro": "2026-11-23T22:40:00.000Z",
  "producto": "Maiz Blanco",
  "unidad": "quintal",
  "tipo_producto": "granos"
}]
```

`404` si la parcela no existe o no es tuya.

### POST /parcelas/:id/siembras

```json
{
  "id_producto": 1,
  "produccion": 100,
  "ciclo": "actual",
  "superficie": 3,
  "unidad_superficie": "manzana"
}
```

`ciclo` es opcional y vale `"actual"` por defecto. `superficie` y `unidad_superficie` son opcionales, pero sin superficie la siembra no aporta al cálculo de insumos.

La combinación `(id_parcela, id_producto, ciclo)` es única, así que la ruta es un upsert:

- No existe: crea y responde `201`.
- Ya existe: actualiza y responde `200`.

```json
{
  "mensaje": "Siembra registrada",
  "id_siembra": 9,
  "id_producto": 1,
  "unidad": "quintal",
  "ciclo": "actual",
  "superficie": 3,
  "unidad_superficie": "manzana"
}
```

La producción va en la unidad del producto: quintales para el maíz, cajas para el tomate. El backend no la convierte.

### DELETE /siembras/:id

`404` si no existe o no es tuya.

---

## Estimaciones de insumos

La cuenta es:

```
superficie en hectáreas × dosis por hectárea × precio vigente
```

El resultado cubre **solo insumos**. No incluye mano de obra, maquinaria ni otros gastos, y cada respuesta lo advierte en el campo `alcance` y en `advertencia`.

### POST /estimaciones

```json
{
  "id_producto": 1,
  "superficie": 3,
  "unidad_superficie": "manzana",
  "id_fuente": 1,
  "id_parcela": 12
}
```

- La fecha no se manda: la pone el servidor.
- `id_fuente` es obligatorio para poder explicar después con qué precios se calculó.
- `id_parcela` es opcional: se puede consultar antes de registrar la parcela.

Respuesta `201`:

```json
{
  "id_estimacion": 5,
  "id_producto": 1,
  "id_parcela": 12,
  "id_fuente": 1,
  "fuente": "Datos de ejemplo",
  "superficie": 3,
  "unidad_superficie": "manzana",
  "superficie_ha": 2.0967,
  "total_estimado": 501.35,
  "moneda": "USD",
  "alcance": "solo_insumos",
  "advertencia": "El total cubre solo insumos... Los precios y las dosis usados son de ejemplo, no oficiales.",
  "datos_ejemplo": true,
  "calculado_en": "2026-11-23T22:40:00.000Z",
  "detalle": [
    {
      "id_insumo": 11,
      "insumo": "Urea 46%",
      "unidad_base": "kg",
      "cantidad_por_hectarea": 200,
      "cantidad": 419.34,
      "precio_unitario": 0.55,
      "subtotal": 230.64
    }
  ]
}
```

Errores:

| Código | Cuándo |
|---|---|
| `400` | Falta un campo o la superficie no es válida. |
| `404` | El cultivo, la fuente o la parcela no existen / no son del usuario. |
| `409` | El cultivo no tiene dosis registradas, o la fuente no tiene precio vigente para algún insumo. |

### GET /estimaciones

Historial del usuario, con `?limit=` y `?offset=` (máximo 100).

```json
{ "estimaciones": [], "total": 0, "limit": 50, "offset": 0 }
```

### GET /estimaciones/:id

La estimación con su desglose. También trae `alcance`, `advertencia` y `datos_ejemplo` para que la pantalla repita el aviso. `404` si no existe o no es tuya.

---

## Precios de venta

### GET /precios

Filtros opcionales: `?id_producto=1`, `?id_canal=1`, `?limit=` y `?offset=`.

```json
{
  "precios": [{
    "id_precio": 1,
    "id_producto": 1,
    "id_canal": 1,
    "fecha": "2026-09-29T06:00:00.000Z",
    "precio_venta": "55.00",
    "precio_venta_quintal": "55.00",
    "producto": "Maiz Blanco",
    "unidad": "quintal",
    "canal": "Mercado local"
  }],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "aviso_deprecado": "..."
}
```

`precio_venta_quintal` es el nombre viejo y se devuelve con el mismo valor mientras se termina de migrar el frontend. `DECIMAL` llega como texto: convertir con `Number(...)`.

### GET /precios/ultimo?id_producto=1&id_canal=1

El último precio registrado para ese producto y canal. Si no hay ninguno devuelve `precio_venta: null` y un mensaje.

### POST /precios

```json
{ "id_producto": 1, "id_canal": 1, "fecha": "2026-09-29", "precio_venta": 55 }
```

Se acepta `precio_venta_quintal` en lugar de `precio_venta`, pero la respuesta avisa con `aviso_deprecado`. `id_producto` e `id_canal` son opcionales: si se omiten, el precio queda como referencia general. `404` si el producto o el canal no existen.

### DELETE /precios/:id

`200` o `404`. Cualquier usuario autenticado puede borrar un precio, porque el historial es global.

---

## Publicaciones (mercado)

### POST /publicaciones

```json
{
  "id_parcela": 12,
  "id_producto": 1,
  "id_canal": 1,
  "cantidad": 60,
  "precio_unitario": 25,
  "fecha": "2026-02-01",
  "ciclo": "actual"
}
```

No se puede publicar más de lo producido en esa siembra y ese ciclo. Si se intenta, responde `409`.

`estado` no se recibe: una publicación nace `disponible`.

Respuesta `201`:

```json
{ "mensaje": "Publicacion creada", "id_publicacion": 12, "unidad": "quintal" }
```

### GET /publicaciones

Sin filtros devuelve el mercado completo. Devuelve `{ publicaciones, total, limit, offset }`.

| Parámetro | Efecto |
|---|---|
| `?estado=disponible` | `disponible`, `vendido` o `retirado`. |
| `?id_producto=1` | Filtra por producto. |
| `?mias=true` | Solo las del usuario del token. |
| `?limit=` y `?offset=` | Paginación. |

Cada fila trae `mia` (`1` si es del usuario del token, `0` si no) para que el frontend no tenga que comparar ids por su cuenta. `nombre_parcela` puede ser `null` si la parcela se borró.

### PUT /publicaciones/:id/estado

```json
{ "estado": "vendido" }
```

Solo sobre publicaciones propias. `disponible` puede pasar a `vendido` o `retirado`; esos dos son estados finales. `409` si la transición no es válida.

### GET /publicaciones/:id/estado?estado=vendido

Indica si la publicación puede pasar al estado pedido, para deshabilitar botones antes de que el usuario reciba un `409`.

---

## Consultas auxiliares

### GET /parcelas/:id/disponible?id_producto=1&ciclo=actual

Cuánto queda sin publicar de ese producto en esa parcela y ciclo.

```json
{
  "id_parcela": 12,
  "id_producto": 1,
  "unidad": "quintal",
  "ciclo": "actual",
  "disponible": 40,
  "publicado": 60,
  "mensaje": "Quedan 40 sin publicar"
}
```

`disponible` puede ser `null`: significa que no hay siembra registrada, no que no quede nada.

---

## Códigos de error

| Código | Cuándo |
|---|---|
| `400` | Faltan datos o un valor no es válido. |
| `401` | Sin token, token inválido o expirado. |
| `404` | El recurso no existe o no es del usuario. |
| `409` | Duplicado, transición de estado inválida, o faltan dosis/precios. |
| `500` | Error inesperado. El detalle va al log, no al cliente. |

Formato de error:

```json
{ "error": "Parcela no encontrada o no es tuya" }
```

---

## Instalar la base de datos (SQLite)

No hay servidor que instalar. La base es un archivo (`agronomodigital.db`) que se crea al arrancar.

```bash
cd backend
npm install
cp .env.example .env
# Editar .env: DB_PATH=./data/agronomodigital.db
npm run migrate
```

Para cargar los catalogos de ejemplo, ejecutar los scripts SQL con sqlite3 o el ingester:

```bash
# Los archivos .sql son compatibles con SQLite.
# schema.sql ya contiene el esquema final (16 tablas).
```

`schema.sql` ya contiene el esquema final. `catalogos.sql` carga productos y canales. `catalogos_insumos.sql` carga categorias, insumos, precios y recetas de ejemplo. `precios_mag_2023.sql` carga precios reales del MAG.

La conversión de manzanas a hectáreas usa `0.6989 ha` por manzana (El Salvador). Se puede cambiar con `HECTAREAS_POR_MANZANA` en el `.env` sin tocar el código.

> Los precios y las dosis de `catalogos_insumos.sql` son **ilustrativos** (fuente 1, `es_ejemplo = 1`). Los precios reales se cargan con `ingesta/ingerir_precios_mag.py`, que extrae la Guia de Precios de Insumos Agropecuarios 2023 del MAG (El Salvador) y crea la fuente 2 (`es_ejemplo = 0`). Las dosis siguen siendo de ejemplo (`requerimientos_cultivo.es_ejemplo = 1`). La API avisa `datos_ejemplo` en cada estimacion segun la fuente elegida.

Para comprobar la instalación:

```bash
npm run test:instalacion
```

Crea una base temporal con el mismo camino, revisa estructura, cascadas y restricciones, y la borra al final.

---

## Pruebas

```bash
npm run typecheck       # TypeScript sin errores
npm run test:unit       # pruebas unitarias
npm run test:instalacion
npm test                # E2E contra la API en el puerto 3002
```

La prueba E2E registra usuarios con correos únicos y los borra al terminar.

---

## Levantar el servidor

```bash
cd backend
npm run dev
```

Corre en `http://localhost:3002`.
