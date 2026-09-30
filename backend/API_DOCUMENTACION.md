# API AgronoDigital

Documentacion de la API REST del sistema de analisis de costos y precios agricolas.

- **Base URL:** `http://localhost:3002`
- **Formato:** JSON
- **Autenticacion:** JWT via header `Authorization: Bearer <token>`
- **Base de datos:** MySQL, base `agronomodigital`

---

## Como autenticarse

Tres rutas son publicas. **Todas las demas requieren token.**

```http
GET /                          -> publico (saludo)
POST /registro                 -> publico
POST /login                    -> publico
```

Cualquier otra ruta sin token devuelve `401`.

### POST /registro

```json
{ "nombre": "Jose Aguilar", "correo": "jose@agrono.com", "contrasena": "clave12345" }
```

Respuestas: `201` creada, `400` datos invalidos, `409` correo duplicado.

### POST /login

```json
{ "correo": "jose@agrono.com", "contrasena": "clave12345" }
```

Respuesta `200`:

```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "mensaje": "Sesión inciada" }
```

El token se manda en cada peticion:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

> `id_usuario` **nunca** se recibe del cliente. Sale del token (`res.locals.usuario.id`). Por eso
> las consultas filtran siempre por `id_usuario`: un usuario no puede ver ni modificar datos ajenos.

---

## Modelo de datos

9 tablas. Las de catalogo (`productos`, `categorias_costos`, `canales_venta`) son de solo lectura
y se cargan desde `catalogos.sql`.

```
usuarios
  └── parcelas
        ├── transacciones_costos ──> productos (id_producto, opcional)
        ├── produccion_parcelas ──> productos
        └── publicaciones ──> productos, canales_venta

productos
  ├── categorias_costos
  ├── transacciones_costos
  ├── produccion_parcelas
  ├── historial_precios ──> canales_venta
  └── publicaciones
```

| Tabla | Para que sirve |
|---|---|
| `usuarios` | Agricultores registrados. Contrasena en bcrypt. |
| `parcelas` | Terreno del agricultor. `produccion_quintales` es la produccion estimada del total. |
| `productos` | Catalogo: nombre, unidad de venta, tipo (`granos`, `hortalizas`, `frutales`, `lacteos`). |
| `categorias_costos` | Que categorias de gasto aplican a cada tipo de producto. |
| `canales_venta` | Mercado local (1), Intermediario (Coyote) (2), Exportacion / Bolsa (3), Procesadora (4). |
| `transacciones_costos` | Gastos registrados. `id_producto` nullable: si es NULL el costo es general de la parcela. |
| `produccion_parcelas` | Produccion por producto y ciclo. Es lo que hace que el costo por unidad de cada cultivo salga bien. |
| `historial_precios` | Precios de venta por producto y canal. |
| `publicaciones` | Ofertas del mercado. `estado` es `disponible`, `vendido` o `retirado`. |

### Dos tipos de produccion, y por que

`parcelas.produccion_quintales` es un solo numero para toda la parcela. Sirve cuando la parcela
tiene un unico cultivo, y es el que usan los calculos cuando no se filtra por producto.

`produccion_parcelas` guarda un registro por `(id_parcela, id_producto, ciclo)`, y la columna
`produccion` va **en la unidad del producto**: quintales para el maiz, cajas para el tomate,
libras para el queso. Una parcela con maiz y tomate necesita los dos registros, porque dividir
costos entre una suma de quintales y cajas daria un numero sin sentido.

Cuando se piden los calculos con `?id_producto=N`, la API suma los ciclos de ese producto. Si el
producto no tiene nada registrado, cae al total de la parcela y lo avisa con
`"origen_produccion": "parcela"`.

Reglas `ON DELETE` que importan:

- `parcelas.id_usuario` -> **CASCADE**: al borrar el usuario se borran sus parcelas.
- `transacciones_costos.id_parcela` -> **CASCADE**: al borrar una parcela se borran sus costos.
- `produccion_parcelas.id_parcela` -> **CASCADE**: al borrar una parcela se borra su produccion.
- `produccion_parcelas.id_producto` -> **RESTRICT**: no se puede borrar un producto con produccion registrada.
- `publicaciones.id_parcela` -> **SET NULL**: la oferta sobrevive a la parcela.
- `publicaciones.id_usuario` -> **CASCADE**: al borrar el usuario se borran sus publicaciones.

### Como se responde un recurso ajeno

Toda ruta que recibe un `:id` primero comprueba que el recurso pertenezca al usuario del token.
Si no es suyo responde **404**, no 403: con un 403 se confirmaria que ese id existe en el sistema,
lo cual ya es un dato. Aplica a parcelas, costos, produccion, publicaciones y los calculos.

---

## Catalogo (solo lectura, requiere token)

### GET /productos

```json
[{ "id_producto": 1, "nombre": "Maiz Blanco", "unidad": "quintal", "tipo_producto": "granos" }]
```

### GET /canales

```json
[{ "id_canal": 1, "nombre": "Mercado local" }]
```

### GET /categorias-costos?tipo=granos

Devuelve las categorias de gasto de ese tipo de producto. Vienen ordenadas por nombre, y si
el tipo no existe en la base devuelve 404 en vez de un arreglo vacio (el mensaje no incluye
la lista de tipos validos, asi que no la puedes sacar de ahi).

```json
[
  { "id_categoria": 2, "nombre": "Abono",       "tipo_producto": "granos", "es_fijo_default": false },
  { "id_categoria": 7, "nombre": "Mano de obra", "tipo_producto": "granos", "es_fijo_default": true },
  { "id_categoria": 3, "nombre": "Semillas",     "tipo_producto": "granos", "es_fijo_default": false }
]
```

`?tipo=` acepta: `granos`, `hortalizas`, `frutales`, `lacteos`.
Si el tipo no existe devuelve `404`.

---

## Parcelas

### GET /parcelas

Solo las del usuario del token.

### POST /parcelas

```json
{ "nombre_parcela": "Lote Norte", "ubicacion": "Cumana", "tamano": 2.5, "produccion_quintales": 100 }
```

`produccion_quintales` en `0` o vacio se guarda como `NULL`. Respuesta `201`.

```json
{ "mensaje": "Parcela creada", "id_parcela": 12 }
```

Se devuelve el id para que el cliente pueda usar la parcela nueva sin volver a pedir el listado.

### PUT /parcelas/:id

Mismo cuerpo. Solo tuyos. `404` si no es tuya.

### DELETE /parcelas/:id

Borra la parcela y, en cascada, sus costos y sus registros de produccion por producto.
Las publicaciones vinculadas no se borran: quedan con `id_parcela` en `NULL`, porque una oferta
del mercado puede seguir existiendo aunque el agricultor borre la parcela de origen.

---

## Produccion por producto

Permite que una parcela cultive mas de un producto. Sin esto, una parcela con 100 quintales de
maiz y 200 cajas de tomate solo podria guardar "300 quintales", que mezcla unidades.

### GET /parcelas/:id/produccion

Lista la produccion de la parcela con el nombre y la unidad del producto ya resueltos.
Acepta `?id_producto=N` para filtrar.

```json
[
  {
    "id_produccion": 9,
    "id_parcela": 12,
    "id_producto": 1,
    "ciclo": "actual",
    "produccion": "100.00",
    "producto": "Maiz Blanco",
    "unidad": "quintal",
    "tipo_producto": "granos"
  }
]
```

`404` si la parcela no existe o no es tuya.

### POST /parcelas/:id/produccion

```json
{ "id_producto": 1, "produccion": 100, "ciclo": "actual" }
```

`ciclo` es opcional y por defecto vale `"actual"`. Sirve para llevar dos siembras del mismo
producto por separado: `actual` y `siembra-2`.

La combinacion `(id_parcela, id_producto, ciclo)` es unica, asi que esta ruta es un upsert:

- Si no existe esa combinacion, **crea** y responde `201`.
- Si ya existe, **actualiza** la produccion y responde `200`.

```json
{ "mensaje": "Produccion registrada", "unidad": "quintal" }
{ "mensaje": "Produccion actualizada", "unidad": "quintal" }
```

La `unidad` viene del catalogo de productos, para que el frontend pueda mostrarla sin consultar
`GET /productos`.

Errores: `400` falta `id_producto`, la produccion no es un numero o es menor o igual a cero.
`404` la parcela no es tuya o el producto no existe.

### DELETE /produccion/:id

Borra un registro puntual de produccion. `404` si no existe o no es tuyo.

---

## Costos

### POST /costos

```json
{
  "id_parcela": 1,
  "id_producto": 1,
  "tipo_costo": "Semillas",
  "descripcion": "Semilla certificada",
  "monto": 45.50,
  "fecha": "2026-09-29",
  "es_fijo": false
}
```

`id_producto` es opcional. Si no se manda, el costo se registra como general de la parcela.
`es_fijo` va a `TINYINT(1)`: `true`/1 = fijo, `false`/0 = variable.

Respuesta `201`:

```json
{ "mensaje": "Costo registrado", "id_transaccion": 31 }
```

Errores: `400` monto menor o igual a cero o falta `tipo_costo`,
`404` parcela ajena o producto inexistente.

### GET /parcelas/:id/costos

Incluye `producto` y `unidad` del costo, ordenado por fecha descendente.
`404` si la parcela no existe o no es tuya.

### PUT /costos/:id

Actualiza solo los campos que se manden (los demas quedan igual).

```json
{ "monto": 50.00, "tipo_costo": "Abono", "es_fijo": true }
```

Respuestas: `200`, `400` monto menor o igual a cero, `404` no existe o no es tuyo.

### DELETE /costos/:id

Respuestas: `200`, `404`.

---

## Precios

### GET /precios

Acepta filtros opcionales: `?id_producto=1` y `?id_canal=1`. Se pueden combinar.

```json
[{
  "id_precio": 1, "id_producto": 1, "id_canal": 1,
  "fecha": "2026-09-29T06:00:00.000Z", "precio_venta_quintal": "55.00",
  "producto": "Maiz Blanco", "unidad": "quintal", "canal": "Mercado local"
}]
```

> `DECIMAL` llega como **string**. El cliente debe convertir con `Number(...)`.

### POST /precios

```json
{ "id_producto": 1, "id_canal": 1, "fecha": "2026-09-29", "precio_venta_quintal": 55.00 }
```

`id_producto` e `id_canal` son opcionales: sin ellos el precio queda como referencia general.
Respuestas: `201`, `400` falta fecha o precio no positivo, `404` producto o canal inexistente.

### DELETE /precios/:id

Respuestas: `200`, `404`.

---

## Calculos financieros

Los dos endpoints aceptan `?id_producto=` y `?id_canal=` para calcular sobre un producto
o canal especifico. **Sin filtro calculan sobre todos los costos de la parcela.**

### GET /parcelas/:id/costo-quintal

```
GET /parcelas/1/costo-quintal
GET /parcelas/1/costo-quintal?id_producto=1
```

```json
{
  "id_producto": 1,
  "producto": "Maiz Blanco",
  "unidad": "quintal",
  "costo_total": 150,
  "costos_fijos": 0,
  "costos_variables": 150,
  "produccion": 200,
  "produccion_quintales": 200,
  "origen_produccion": "por_producto",
  "costo_quintal": 0.75
}
```

| Campo | Que es |
|---|---|
| `produccion` | Produccion usada en la division, en la unidad de `unidad`. |
| `origen_produccion` | `por_producto` si viene de `produccion_parcelas`, `parcela` si cayo al total de `parcelas`. |
| `costo_quintal` | `costo_total / produccion`. `null` si `produccion` es 0 o `NULL`. |
| `produccion_quintales` | Alias de `produccion`, se mantiene por compatibilidad. |

> **Por que importa `origen_produccion`.** Si pides un producto que no tiene produccion registrada,
> la API divide los costos de ese producto entre la produccion total de la parcela. El numero sale,
> pero mezcla unidades y no sirve para decidir. Cuando veas `parcela` con un `id_producto` presente,
> registra la produccion del producto en `POST /parcelas/:id/produccion`.

Sin `?id_producto=` la respuesta usa el total de la parcela y siempre trae
`"origen_produccion": "parcela"`.

### GET /parcelas/:id/punto-equilibrio

```
GET /parcelas/1/punto-equilibrio
GET /parcelas/1/punto-equilibrio?id_producto=1&id_canal=1
```

```json
{
  "id_producto": 1,
  "producto": "Maiz Blanco",
  "unidad": "quintal",
  "costos_fijos": 300,
  "costos_variables": 150,
  "produccion": 200,
  "produccion_quintales": 200,
  "origen_produccion": "por_producto",
  "precio_venta": 30,
  "costo_variable_unidad": 0.75,
  "margen_contribucion": 29.25,
  "punto_equilibrio_unidades": 10.2564
}
```

Como se calcula:

```
costo_variable_unidad     = costos_variables / produccion
margen_contribucion       = precio_venta - costo_variable_unidad
punto_equilibrio_unidades = costos_fijos / margen_contribucion
```

`punto_equilibrio_unidades` da **0** cuando no hay costos fijos, y eso es un resultado valido:
no hay nada fijo que recuperar, asi que cualquier venta deja plata. No lo trates como "faltan datos".
Es `null` solo cuando de verdad falta un insumo: no hay precio, o el margen es 0 o negativo.

El precio que se usa es el **mas reciente** del producto y canal indicados. Si hay dos precios
el mismo dia gana el de `id_precio` mayor (desempate determinista).

> Los nombres dicen `unidad` y no `quintal` porque el producto puede vender en quintal, caja,
> jaba, ciento, botella o libra. La produccion de `produccion_parcelas` va en la unidad del
> producto; `parcelas.produccion_quintales` sigue siendo el total generico en quintales y solo
> se usa cuando no se filtra por producto.

### GET /parcelas/:id/costo-total

```json
{ "costo_total": 650 }
```

Suma simple de todos los costos de la parcela, sin filtro de producto y sin separar fijos de
variables. No acepta `?id_producto=`: para el total de un producto concreto usá
`costo-quintal?id_producto=N`, que trae `costo_total` ya desglosado.

Devuelve `404` si la parcela no existe o no es tuya.

---

## Publicaciones (mercado)

### POST /publicaciones

```json
{
  "id_parcela": 1,
  "id_producto": 1,
  "id_canal": 1,
  "cantidad": 100,
  "precio_unitario": 55.00,
  "fecha": "2026-09-29"
}
```

`id_parcela` es opcional (una oferta puede no venir de una parcela concreta).
`estado` **no se recibe**: MySQL le pone `disponible` por defecto.

Respuesta `201`:

```json
{ "mensaje": "Publicación creada", "id_publicacion": 12 }
```

Errores: `400` cantidad o precio no positivos o falta producto/canal,
`404` producto, canal o parcela inexistente o ajena.

### GET /publicaciones

El mercado es publico: sin filtros devuelve las publicaciones de **todos** los agricultores.

| Parametro | Efecto |
|---|---|
| `?estado=disponible` | Filtra por estado. Acepta `disponible`, `vendido`, `retirado`. |
| `?id_producto=1` | Filtra por producto. |
| `?mias=true` | Solo las del usuario del token. |

```json
[{
  "id_publicacion": 1, "id_usuario": 2, "id_parcela": 1, "id_producto": 1, "id_canal": 1,
  "cantidad": "100.00", "precio_unitario": "55.00",
  "estado": "disponible", "fecha": "2026-09-29T06:00:00.000Z",
  "producto": "Maiz Blanco", "unidad": "quintal", "canal": "Mercado local",
  "agricultor": "Jose Aguilar", "nombre_parcela": "Lote Norte",
  "mia": 1
}]
```

| Campo | Que es |
|---|---|
| `mia` | `1` si la oferta es del usuario del token, `0` si es de otro. |

`mia` viene del servidor justamente para que el frontend no tenga que guardar el `id_usuario`
en el navegador y comparar contra el. Mostrar el boton de "marcar vendido" es cosa del cliente,
pero la decision real de a quien pertenece la oferta la toma el servidor en cada `PUT`.

`estado` con valor invalido devuelve `400` con la lista de valores validos.
`nombre_parcela` puede venir en `null`: la oferta sobrevive al borrado de su parcela.

### PUT /publicaciones/:id/estado

```json
{ "estado": "vendido" }
```

Solo funciona sobre publicaciones del usuario del token.
Respuestas: `200`, `400` estado ausente o invalido, `404` no existe o no es tuya.

---

## Resumen de codigos de error

| Codigo | Cuando |
|---|---|
| `400` | Faltan datos o un valor no es valido (negativo, cero, texto en vez de numero). |
| `401` | Sin token, token invalido o expirado. |
| `403` | No se usa: un recurso ajeno responde `404` para no confirmar que existe. |
| `404` | El recurso no existe, no es tuyo, o el `id_producto`/`id_canal` no existe. |
| `409` | `POST /registro` con un correo que ya tiene cuenta. |
| `500` | Error inesperado en el servidor. El detalle va al log, no al cliente. |

---

## Instalar la base de datos desde cero

```bash
mysql -u root -e "CREATE DATABASE agronomodigital CHARACTER SET utf8mb4"
mysql -u root agronomodigital < schema.sql
mysql -u root agronomodigital < catalogos.sql
```

`schema.sql` contiene las 9 tablas con sus llaves foraneas y reglas `ON DELETE`.
`catalogos.sql` carga los 14 productos, las 25 categorias de costo y los 4 canales.

Los datos de los agricultores no se incluyen: cada quien se registra desde la API.

Para comprobar que la instalacion quedo bien, con la API corriendo:

```bash
npm run test:instalacion
```

Crea una base temporal desde `schema.sql` + `catalogos.sql`, revisa las 9 tablas, las cascadas y
las restricciones, y la borra al final. No toca `agronomodigital`.

---

## Probar la API

Con el servidor corriendo en otra terminal:

```bash
npm test
```

Ejecuta `pruebas/e2e.js`: 107 comprobaciones sobre registro, parcelas, produccion por producto,
calculos, costos, precios, mercado, permisos entre dos usuarios, errores y cascadas. Registra
usuarios con correos unicos y los borra al terminar.

---

## Levantar el servidor

```bash
cd backend
npm run dev
```

Corre en `http://localhost:3002`.
