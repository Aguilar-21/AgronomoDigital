# AgronoDigital

API para pequeÃ±os y medianos productores del estado Sucre. El productor registra sus parcelas y lo que siembra en cada una, y la API le estima el costo de insumos a partir de las dosis del cultivo y los precios vigentes de un documento oficial (o de un archivo de ejemplo, mientras tanto).

Este README es para el equipo de frontend. El detalle de cada endpoint esta en `backend/API_DOCUMENTACION.md`. Aca esta lo que hay que saber antes de tocar la interfaz.

## Arrancar el backend

```bash
cd backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run migrate
npm run dev
```

AbrÃ­ `.env` y ponÃ© tus datos de MySQL:

```env
DB_PATH=./data/agronomodigital.db
JWT_SECRETO=cualquier_cosa_larga_y_aleatoria_de_16_caracteres_o_mas
PUERTO=3002
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGENES=
```

La base de datos es SQLite y se crea sola al arrancar. Para cargar catalogos: schema.sql, catalogos.sql, catalogos_insumos.sql y precios_mag_2023.sql. Ver backend/API_DOCUMENTACION.md.

`JWT_SECRETO` tiene que tener 16 caracteres o mÃ¡s. Si falta o estÃ¡ corto, el servidor no arranca y dice quÃ©_variable revisar. Lo mismo pasa con DB_PATH: se valida al arrancar.

`HECTAREAS_POR_MANZANA` es opcional. Por defecto vale `0.6989`, que es la manzana salvadorena. Si en otro paÃ­s usan otra equivalencia, se cambia en el `.env` sin tocar el cÃ³digo.

---

## Las cosas que conviene saber antes de programar

### Los decimales llegan como texto

SQLite (better-sqlite3) devuelve los REAL como number de JavaScript, asi que no hace falta convertir. Los valores se redondean igual con num() y redondear2() por consistencia.

```js
const total = Number(est.total_estimado) + Number(otro.total_estimado);
```

Los `id_*`, `activo` y `es_ejemplo` llegan como nÃºmeros, esos no se tocan.

### El token viaja en cada peticiÃ³n

Estas rutas son abiertas: `GET /`, `GET /health`, `POST /registro`, `POST /login`, `GET /productos`, `GET /canales`, `GET /canales/:id/productos`, `GET /insumos`, `GET /categorias-insumos`, `GET /productos/:id/requerimientos` y `GET /fuentes-precio`. Todo lo demÃ¡s pide token:

```js
fetch('http://localhost:3002/parcelas', {
  headers: { Authorization: `Bearer ${token}` }
})
```

Tiene que ser exactamente `Bearer ` seguido del token. El token dura 2 horas: en algÃºn momento te va a tocar manejar el `401` con un interceptor que limpie la sesiÃ³n y mande al login.

### Nunca se manda el id del usuario

El backend lo saca del token, aunque lo mandes en el body se ignora. Eso es lo que impide que alguien vea o borre lo de otro cambiando un nÃºmero en el formulario.

### Las respuestas no vienen envueltas

`datos` es el nombre de la variable donde guardo el body parseado en el helper `api()` del frontend. El backend manda el objeto o el array directo:

```js
const parcelas = await api('GET', '/parcelas');          // array
const r = await api('GET', '/publicaciones');           // { publicaciones, total, limit, offset }
const h = await api('GET', '/estimaciones');            // { estimaciones, total, limit, offset }
```

Solo esas cuatro traen `total` porque son paginadas. `GET /precios` tambiÃ©n.

### La fecha la pone el servidor

En `POST /estimaciones` no se manda `fecha`. La fecha y la hora de cÃ¡lculo las pone el backend. AsÃ­ el historial no depende del reloj del navegador.

### Una estimaciÃ³n no es el costo total de producir

El total cubre **solo insumos**: semilla, fertilizantes, protecciÃ³n de cultivo. No incluye mano de obra, maquinaria, alquiler ni transporte. Cada respuesta lo dice en `alcance: "solo_insumos"` y en `advertencia`. Mostralo en pantalla, si no el usuario va a creer que ese nÃºmero es todo lo que le cuesta la cosecha.

Los precios y las dosis que hay cargados ahora son de ejemplo. La fuente estÃ¡ marcada con `es_ejemplo: 1` y la estimaciÃ³n viene con `datos_ejemplo: true`. PonÃ© un aviso en la interfaz hasta que se cargue el documento real.

---

## Registro y login

```
POST /registro   { usuario, nombre, correo, contrasena }   -> 201 { id_usuario, usuario }
POST /login      { identificador | usuario | correo, contrasena } -> 200 { token }
```

`usuario` va de 3 a 30 caracteres, empieza con letra y sigue con letras, nÃºmeros, punto, guion o guion bajo. El correo y el usuario se guardan en minÃºsculas y no se pueden repetir. La contraseÃ±a necesita mÃ­nimo 8 caracteres.

El login devuelve el mismo mensaje de error si la cuenta no existe que si la contraseÃ±a estÃ¡ mal. Es a propÃ³sito: si distinguiera, el formulario se volverÃ­a un buscador de quÃ© correos tienen cuenta.

---

## Parcelas y siembras

Esto es lo que mÃ¡s cambiÃ³ respecto del sistema viejo. Una **parcela** es el terreno. Una **siembra** es un cultivo dentro de ese terreno, con su superficie y su producciÃ³n. Un lote de 5 manzanas con 3 de maÃ­z y 2 de frijol son **dos siembras**, no dos parcelas.

`parcelas.tamano` es el total del terreno y sirve solo como referencia. El cÃ¡lculo de insumos usa siempre la superficie de la siembra.

### Parcelas

```
GET    /parcelas              solo las tuyas
GET    /parcelas/:id
POST   /parcelas              { nombre_parcela, ubicacion?, tamano?, unidad_superficie? }
PUT    /parcelas/:id          actualiza solo los campos que mandes
DELETE /parcelas/:id
```

`unidad_superficie` es `hectarea` o `manzana`, por defecto `hectarea`. Al borrar la parcela se van sus siembras en cascada. Las publicaciones que se hicieron desde esa parcela quedan en el mercado con `id_parcela: null`.

### Siembras

```
GET    /parcelas/:id/siembras              acepta ?id_producto= y ?ciclo=
POST   /parcelas/:id/siembras
DELETE /siembras/:id
```

```json
{
  "id_producto": 1,
  "produccion": 100,
  "ciclo": "actual",
  "superficie": 3,
  "unidad_superficie": "manzana"
}
```

`produccion` va en la unidad del producto (quintales para el maÃ­z, cajas para el tomate). El backend no la convierte. `ciclo` vale `"actual"` si no lo mandÃ¡s; sirve para llevar dos temporadas del mismo cultivo por separado.

La combinaciÃ³n `(id_parcela, id_producto, ciclo)` es Ãºnica, asÃ­ que `POST` es un upsert: crea con `201`, actualiza con `200`. La respuesta trae `unidad` del catÃ¡logo para que no tengas que cruzar ids.

---

## EstimaciÃ³n de insumos

La cuenta es:

```
superficie en hectÃ¡reas Ã— dosis por hectÃ¡rea Ã— precio vigente
```

El usuario elige el cultivo y la superficie, y el servidor busca las dosis y los precios. No manda dosis ni precios: si pudiera mandarlos, el nÃºmero dejarÃ­a de ser una estimaciÃ³n basada en una fuente.

```
POST /estimaciones
GET  /estimaciones              historial, con ?limit= y ?offset=
GET  /estimaciones/:id          con su desglose
```

```json
{
  "id_producto": 1,
  "superficie": 3,
  "unidad_superficie": "manzana",
  "id_fuente": 1,
  "id_parcela": 12
}
```

`id_fuente` es obligatorio para saber despuÃ©s con quÃ© precios se calculÃ³. `id_parcela` es opcional: se puede estimar antes de registrar la parcela. La fecha la pone el servidor.

Respuesta:

```json
{
  "id_estimacion": 5,
  "superficie_ha": 2.0967,
  "total_estimado": 501.35,
  "moneda": "USD",
  "alcance": "solo_insumos",
  "advertencia": "El total cubre solo insumos...",
  "datos_ejemplo": true,
  "detalle": [
    { "insumo": "Urea 46%", "cantidad": 419.34, "precio_unitario": 0.55, "subtotal": 230.64 }
  ]
}
```

Errores propios de esta ruta: `409` si el cultivo no tiene dosis registradas o la fuente no tiene precio para algÃºn insumo; `404` si el cultivo, la fuente o la parcela no existen o no son tuyos.

Para mostrar la receta antes de estimar, `GET /productos/:id/requerimientos` devuelve los insumos y las dosis por hectÃ¡rea de ese cultivo. Un cultivo sin receta devuelve `[]`; la estimaciÃ³n devuelve `409`.

---

## CatÃ¡logo de insumos

Son pÃºblicos, no piden token:

```
GET /categorias-insumos
GET /insumos?id_categoria_insumo=1
GET /fuentes-precio
GET /productos/:id/requerimientos
```

`GET /fuentes-precio` sirve para armar el `<select>` de `id_fuente` y para mostrar de dÃ³nde vienen los precios. Trae instituciÃ³n, tÃ­tulo, fecha, URL, `es_ejemplo` y cuÃ¡ntos precios tiene cargados.

TambiÃ©n estÃ¡n `GET /productos` (14 cultivos activos, con su unidad de venta) y `GET /canales` (4 canales). El campo `unidad` del producto es el que hay que usar en las etiquetas: "55 / caja", no "55 / quintal".

---

## Mercado

```
POST /publicaciones              { id_parcela, id_producto, id_canal?, cantidad, precio_unitario, fecha, ciclo? }
GET  /publicaciones              mercado completo, con filtros y paginaciÃ³n
PUT  /publicaciones/:id/estado   { estado: "vendido" | "retirado" }
GET  /publicaciones/:id/estado?estado=vendido
GET  /parcelas/:id/disponible?id_producto=1&ciclo=actual
```

`estado` no se manda en el `POST`: la publicaciÃ³n nace `disponible`. `disponible` puede pasar a `vendido` o `retirado`, y esos dos son finales. Una transiciÃ³n invÃ¡lida da `409`.

No se puede publicar mÃ¡s de lo que se registrÃ³ en esa siembra y ese ciclo. El error dice cuÃ¡nto pediste y cuÃ¡nto queda. Para no hacer un viaje de ida y vuelta en cada intento, consultÃ¡ `GET /parcelas/:id/disponible` antes de mostrar el formulario. Ojo: `disponible: null` significa que no hay siembra registrada, `0` significa que hay y no queda nada.

`GET /publicaciones` ve el mercado de todos (por eso no filtra por usuario), pero sigue pidiendo token. Acepta `?estado=`, `?id_producto=`, `?mias=true`, `?limit=` y `?offset=`. Cada fila trae `mia: 1` si es tuya y `0` si no, para que no tengas que comparar ids en el frontend. `nombre_parcela` puede venir `null` si la parcela se borrÃ³.

---

## Precios de venta

El historial de precios es global: lo ven y lo escriben todos los usuarios autenticados. No confundir con los precios de insumos, que vienen de una fuente y se consultan en `GET /fuentes-precio`.

```
GET    /precios?id_producto=1&id_canal=1&limit=50&offset=0   -> { precios, total, limit, offset }
GET    /precios/ultimo?id_producto=1
POST   /precios    { id_producto, id_canal, fecha, precio_venta }
DELETE /precios/:id
```

El nombre correcto es `precio_venta`. El viejo `precio_venta_quintal` todavÃ­a se acepta y se devuelve con el mismo valor, pero la respuesta trae `aviso_deprecado`. El valor es el precio de **una unidad del producto**: armÃ¡ la etiqueta con la `unidad` de `GET /productos`.

---

## Errores

| cÃ³digo | quÃ© pasÃ³ | quÃ© hacer en el frontend |
|---|---|---|
| `400` | falta un campo o un nÃºmero no es vÃ¡lido | mostrar `error` junto al campo |
| `401` | sin token, token vencido o mal formado | limpiar sesiÃ³n e ir al login |
| `404` | no existe o no es tuyo | mensaje de "no encontrado" |
| `409` | duplicado, estado invÃ¡lido, o faltan dosis/precios | mostrar el mensaje concreto |
| `500` | error inesperado | mensaje genÃ©rico; el detalle queda en el log |

El `404` se usa tanto para "no existe" como para "es de otro usuario", a propÃ³sito: asÃ­ no se puede usar la API para averiguar quÃ© ids existen en cuentas ajenas. El `403` no se usa.

Casi todos los errores vienen como `{ "error": "..." }`. Si es un error de validaciÃ³n, el mensaje nombra el campo que estÃ¡ mal.

---

## Estructura del proyecto

```
AgronomoDigital/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ app.ts              construye Express, NO escucha en un puerto
â”‚   â”‚   â”œâ”€â”€ server.ts           arranca y apaga limpio
â”‚   â”‚   â”œâ”€â”€ db.ts               pool de MySQL
â”‚   â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â”‚   â”œâ”€â”€ env.ts          valida el .env al arrancar
â”‚   â”‚   â”‚   â””â”€â”€ constantes.ts   unidades de superficie y manzana -> ha
â”‚   â”‚   â”œâ”€â”€ auth/tipos.ts
â”‚   â”‚   â”œâ”€â”€ middleware/         auth, validar, errores
â”‚   â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”‚   â”œâ”€â”€ auth.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ catalogos.ts    productos, canales, insumos, fuentes
â”‚   â”‚   â”‚   â”œâ”€â”€ parcelas.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ siembras.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ estimaciones.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ precios.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ mercado.ts
â”‚   â”‚   â”‚   â””â”€â”€ consultas.ts    disponible para publicar
â”‚   â”‚   â”œâ”€â”€ schemas/            un archivo de Zod por Ã¡rea
â”‚   â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”‚   â”œâ”€â”€ calculos.ts     redondeo y conversiÃ³n de DECIMAL
â”‚   â”‚   â”‚   â”œâ”€â”€ consultas.ts    SQL de parcelas y disponibilidad
â”‚   â”‚   â”‚   â””â”€â”€ estimaciones.ts cÃ¡lculo y guardado de estimaciones
â”‚   â”‚   â”œâ”€â”€ migraciones/correr.ts
â”‚   â”‚   â””â”€â”€ types/express.d.ts
â”‚   â”œâ”€â”€ migraciones/            001 a 005
â”‚   â”œâ”€â”€ pruebas/
â”‚   â”‚   â”œâ”€â”€ unitarias/
â”‚   â”‚   â”œâ”€â”€ e2e.js
â”‚   â”‚   â””â”€â”€ instalacion.js
â”‚   â”œâ”€â”€ schema.sql              esquema base (se completa con migraciones)
â”‚   â”œâ”€â”€ catalogos.sql           productos y canales
â”‚   â”œâ”€â”€ catalogos_insumos.sql   categorÃ­as, insumos, precios y recetas de ejemplo
â”‚   â”œâ”€â”€ API_DOCUMENTACION.md
â”‚   â””â”€â”€ .env.example
```

El repositorio es solo el backend. La interfaz vive en otro proyecto.

Si buscÃ¡s la forma de un body, params o query, mirÃ¡ `src/schemas/`. Si buscÃ¡s una regla de negocio, mirÃ¡ `src/services/`. Si buscÃ¡s por quÃ© se hizo algo, estÃ¡ en el comentario de arriba del archivo.

`app.ts` estÃ¡ separado de `server.ts` para poder importar la app en las pruebas sin abrir un puerto. Por eso `npm run test:unit` corre en menos de un segundo.

### Migraciones

La base de datos es SQLite: un solo archivo (agronomodigital.db). No hay servidor que instalar. schema.sql ya contiene el esquema final (16 tablas), asi que npm run migrate solo registra las migraciones como aplicadas. Para desarrollo local o despliegue en Vercel (con el archivo en /tmp), basta con arrancar el servidor.

`schema.sql` es solo la base. Las migraciones agregan `usuario`, `unidad_superficie`, `siembras`, las tablas de insumos y las estimaciones. Instalar sin correrlas deja la API rota.

### Pruebas

```bash
cd backend
npm run test:unit         # sin base ni puertos
npm run typecheck
npm run test:instalacion  # arma una base temporal, la revisa y la borra
npm test                  # E2E contra la API en el puerto 3002
```

`npm test` necesita la API corriendo en otra terminal. Registra dos usuarios con correos Ãºnicos y los borra al terminar, asÃ­ que convive con los datos que ya haya.

---

## Lo que queda pendiente

- **Fuente oficial de precios y dosis.** Se cargo la Guia de Precios de Insumos Agropecuarios 2023 del MAG (El Salvador) con `ingesta/ingerir_precios_mag.py`. Quedan como ejemplo las dosis (`requerimientos_cultivo.es_ejemplo = 1`) y los insumos sin coincidencia en la guia (semillas por kg, riego, mano de obra, maquinaria). El script es idempotente: se vuelve a correr cuando se publique una guia nueva.
- **Dosis por cultivo.** Las recetas actuales son ilustrativas. Si el agrÃ³nomo tiene las dosis reales, se cargan en `requerimientos_cultivo`.
- **Equivalencia de la manzana.** Se usa `0.6989 ha` (El Salvador). Si el proyecto se usa en otro paÃ­s, cambiar `HECTAREAS_POR_MANZANA` en el `.env`.
- **`CORS_ORIGENES` estÃ¡ vacÃ­o**, asÃ­ que cualquier pÃ¡gina puede llamar a la API. EstÃ¡ bien para trabajar en local con el frontend abierto como archivo, pero hay que poner los dominios reales antes de publicar.
- **Los precios de venta son globales** y cualquier usuario autenticado puede borrarlos. Es una decisiÃ³n consciente, pero si hay que restringirlo se agrega `id_usuario` a `historial_precios`.
- **No hay endpoint para borrar la cuenta.** Si se necesita, se agrega del lado del servidor.
