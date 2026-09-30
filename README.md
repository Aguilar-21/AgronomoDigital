# AgronoDigital

Sistema para pequeños y medianos productores agrícolas del estado Sucre. Cada agricultor
registra sus parcelas, anota lo que le cuesta producir (insumos, mano de obra, maquinaria) y
la API le dice si con el precio que hay en el mercado le sale a cuenta o está perdiendo plata.

Este README es la guía para el equipo de **frontend**. Si estás del lado de la interfaz, lo
que necesitas está aquí y en `backend/API_DOCUMENTACION.md`, que tiene el detalle de cada
endpoint. En `backend/src/server.ts` hay comentarios explicando el porqués de las decisiones
que no se ven solo leyendo el código.

---

## Arrancar el backend

```bash
cd backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```

Abrí `.env` y poné tus datos de MySQL:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_clave
DB_DATABASE=agronomodigital
JWT_SECRETO=cualquier_cosa_larga_y_aleatoria
PUERTO=3002
```

Después creá la base y las tablas:

```bash
mysql -u root -e "CREATE DATABASE agronomodigital CHARACTER SET utf8mb4"
mysql -u root agronomodigital < schema.sql
mysql -u root agronomodigital < catalogos.sql
```

Y por último:

```bash
npm run dev
```

Queda escuchando en `http://localhost:3002`. Fijate que responda con "Bienvenido a
AgronoDigital" antes de empezar a conectarte desde el frontend.

`npm run dev` usa `tsx watch`, o sea que reinicia solo cuando guardás un archivo. Si tocás
el código y te sigue dando error, mirá la terminal donde corre el servidor: casi siempre
explica mejor el problema que el 500 que recibís.

---

## Las cuatro cosas que hay que saber sí o sí

Antes de escribir código del frontend, hay cuatro detalles de esta API que te van a hacer
perder tiempo si no los tenés presentes.

**1. Los números decimales llegan como texto.**

MySQL guarda los `DECIMAL` como texto. Si pides los costos de una parcela te va a llegar así:

```js
{ "monto": "45.50", "tipo_costo": "Semillas" }
```

`"45.50"` es un string, no el número 45.5. Si sumás dos costos sin convertir:

```js
costos.reduce((a, c) => a + c.monto, 0)     // "45.50" + "20.00" = "45.5020.00"  ← mal
```

El `+` entre dos strings concatena en vez de sumar. Hay que convertir:

```js
costos.reduce((a, c) => a + Number(c.monto), 0)   // 65.5  ← bien
```

Esto aplica a: `monto`, `precio_unitario`, `precio_venta_quintal`, `cantidad`, `tamano`,
`produccion`, `produccion_quintales`, `costo_total`, `costo_quintal`. Los campos `id_*` y `es_fijo`
sí llegan como números, esos no los toques.

**2. El token viaja en cada petición.**

Solo tres rutas son abiertas. Todo lo demás pide el token:

```js
fetch('http://localhost:3002/parcelas', {
  headers: { Authorization: `Bearer ${token}` }
})
```

Si lo olvidás te devuelve `401` con `{ error: 'NO hay token' }`. El token dura 2 horas, así que
en algún momento te va a tocar manejar ese 401: lo ideal es un interceptor que, al recibirlo,
limpie la sesión y mande al usuario a la pantalla de login.

**3. Nunca se manda el id del usuario.**

El backend lo sabe solo, lo saca del token. Aunque lo mandes en el body se ignora. Eso es
intencionado: es lo que impide que alguien vea o borre las parcelas de otro modificando un
número en el formulario.

Por eso la API no tiene ningún endpoint de borrado de cuenta: si algún día lo necesita, se
agrega del lado del servidor.

**4. Las respuestas no vienen envueltas.**

`{ datos: [...] }` es el nombre que le puse a la variable que guarda el body parseado en el
helper `api()` del frontend, no una envoltura que mande el backend. El servidor manda el objeto
o el array directo:

```js
// GET /publicaciones  ->  es un array pelado
const r = await api("GET", "/publicaciones");
Array.isArray(r.datos) ? r.datos : []

// GET /parcelas/1/costo-quintal  ->  es un objeto pelado
const cq = (await api("GET", "/parcelas/1/costo-quintal")).datos;
cq.costo_quintal
```

Si venís escribiendo `r.datos.datos`, ahí está el error.

---

## Cómo es el login

```
POST /registro   { nombre, correo, contrasena }   → 201
POST /login      { correo, contrasena }           → 200 { token }
```

Después del login, `token` es lo único que guardás:

```js
const { token } = await (await fetch('http://localhost:3002/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ correo, contrasena })
})).json()
```

Un par de detalles: la contraseña necesita mínimo 8 caracteres, y si el correo ya está
registrado el registro devuelve `409`, no `400`. El `409` es a propósito, para que puedas
mostrar "ese correo ya tiene cuenta" sin estar adivinando por el texto del error.

El login devuelve `401` con `"Correo o contraseña incorrectos"` tanto si el correo no existe
como si la contraseña está mal, y también si mandaste el body incompleto. El mensaje es
exactamente el mismo en los tres casos, a propósito: si distinguiera entre "ese correo no
existe" y "esa contraseña no es la correcta", el formulario de login se volvería un buscador
de qué correos tienen cuenta en la plataforma.

---

## Catálogos

Son tres endpoints de solo lectura que existen para llenar los `<select>` del frontend. No se
crean ni se editan desde la interfaz.

**`GET /productos`** te da el catálogo completo:

```json
[
  { "id_producto": 1, "nombre": "Maiz Blanco", "unidad": "quintal", "tipo_producto": "granos" },
  { "id_producto": 6, "nombre": "Chile Verde", "unidad": "caja",     "tipo_producto": "hortalizas" }
]
```

Son 14 productos repartidos en cuatro tipos: `granos`, `hortalizas`, `frutales`, `lacteos`.
El campo `unidad` es importante: un producto se puede vender en quintal, en caja, en libra o
en unidad, y de eso depende cómo se lea el costo que te devuelven los cálculos.

**`GET /canales`** son los cuatro canales de venta: Mercado local, Intermediario (Coyote),
Exportacion / Bolsa, Procesadora. Ojo, el tercero viene sin tilde en la base: si lo comparás
con `"Exportación / Bolsa"` no va a hacer match.

**`GET /categorias-costos?tipo=granos`** es el que más te va a interesar. Devuelve qué
categorías de gasto aplican a un tipo de producto:

```json
[
  { "id_categoria": 3, "nombre": "Semillas",     "tipo_producto": "granos", "es_fijo_default": false },
  { "id_categoria": 7, "nombre": "Mano de obra", "tipo_producto": "granos", "es_fijo_default": true  }
]
```

La idea del formulario de costos es esta: el usuario elige el producto, y vos hacés
`GET /categorias-costos` con el `tipo_producto` de ese producto y le mostrás los campos de
gasto que de verdad le aplican. Si cultiva maíz le sale Semillas, Abono, Herbicida, Mano de
obra. Si cultiva tomate, le sale Agua, Plaguicida, Insecticida. No hay que mostrarle las 25
categorías juntas.

`es_fijo_default` te dice si esa categoría viene fijada como costo fijo o variable. Es un
default, o sea una sugerencia para marcar la casilla, pero el usuario debería poder cambiarla
porque depende de su parcela.

Si el `tipo` no existe, esta ruta devuelve `404`. Ojo con eso: el mensaje **no** incluye la
lista de tipos válidos, así que no podés sacarla de ahí. Hay dos formas de resolverlo: sacarla
de `GET /productos`, que trae un `tipo_producto` por producto, o tenerla fija en el frontend
como `granos`, `hortalizas`, `frutales`, `lacteos`. La primera se mantiene sola si mañana se
agrega un tipo nuevo.

---

## Parcelas

Es la base de todo lo demás, así que conviene entenderla bien. Cada parcela es de un solo
usuario y las demás personas no la ven.

**`GET /parcelas`** te devuelve las tuyas, y solo las tuyas. Si no tienes ninguna devuelve
`[]`, no `null`.

**`POST /parcelas`**

```json
{
  "nombre_parcela": "Lote sur",
  "ubicacion": "Sector El Zinc",
  "tamano": 2.5,
  "produccion_quintales": 100
}
```

De esos cuatro campos solo `nombre_parcela` es obligatorio. `tamano` y `produccion_quintales`
son opcionales y se guardan como `null` si no los mandás.

Sobre la producción: el `0` y el `null` significan cosas distintas acá. `null` es "todavía no
sé cuánto va a producir", que es un dato perfectamente válido para alguien que acaba de sembrar.
El `0` es "produje cero", que casi siempre es un error de captura. La API trata `0` como
`null`, así que no te vas a trovajar: si mandás `0` te guarda `null` y los cálculos te van a
pedir la producción más adelante en vez de dividir entre cero.

Cuando la producción cambia, `PUT /parcelas/:id` la actualiza y ahí sí se recalcula todo al
pedir `/costo-quintal` o `/punto-equilibrio`.

**`DELETE /parcelas/:id`** borra la parcela y también todos sus costos y sus registros de
producción por producto, porque las llaves foráneas están en cascada. No hay que ir a borrarlos
uno por uno. Las publicaciones que se habían hecho desde esa parcela **no** se borran: quedan en
el mercado con la parcela en `null`, porque el lote ya se vendió y ese dato le sigue sirviendo al
comprador. Si la parcela no es tuya te devuelve `404`.

---

## Producción por producto

`parcelas.produccion_quintales` es **un solo número para toda la parcela**. Sirve cuando la
parcela tiene un solo cultivo, y es lo que usan los cálculos cuando no filtrás por producto.

El problema aparece cuando una parcela cultiva más de una cosa. Si el maíz da 100 quintales y el
tomate 200 cajas, el total "300 quintales" mezcla dos unidades que no se suman. Dividir los
costos entre eso da un número que no significa nada.

Por eso existe `produccion_parcelas`: un registro por `(parcela, producto, ciclo)`, con la
producción **en la unidad del producto**.

**`POST /parcelas/:id/produccion`**

```json
{ "id_producto": 1, "produccion": 100, "ciclo": "actual" }
{ "id_producto": 5, "produccion": 200, "ciclo": "actual" }
```

`ciclo` es opcional y vale `"actual"` si no lo mandás. Sirve para llevar dos siembras del mismo
producto por separado (`actual` y `siembra-2`); los cálculos suman los ciclos.

Como `(id_parcela, id_producto, ciclo)` es único, esta ruta es un **upsert**: si esa combinación
ya existe la actualiza y devuelve `200`, si no la crea y devuelve `201`.

```json
{ "mensaje": "Produccion registrada", "unidad": "quintal" }
{ "mensaje": "Produccion actualizada", "unidad": "quintal" }
```

Fijate que la respuesta trae `unidad`: sale del catálogo de productos, así no tenés que cruzar
ids contra `GET /productos`.

**`GET /parcelas/:id/produccion`** devuelve la lista con nombre y unidad ya resueltos, y acepta
`?id_producto=N`.

**`DELETE /produccion/:id`** borra un registro puntual.

Cuando la parcela tiene varios cultivos, el resumen **tiene** que filtrar por producto
(`?id_producto=N`). Sin filtro la API divide entre el total de la parcela, que es correcto solo
si cultivas una sola cosa. Para eso está `origen_produccion` en la respuesta: si vale `parcela`
estás viendo la mezcla.

---

## Precios de mercado

El historial de precios es lo único global del sistema, junto con los catálogos. Le sirve
igual a todos los usuarios, así que no lleva `id_usuario` y cualquiera autenticado puede
escribir y leer.

**`POST /precios`**

```json
{
  "id_producto": 1,
  "id_canal": 1,
  "fecha": "2026-09-29",
  "precio_venta_quintal": 55.00
}
```

Los tres primeros campos son opcionales menos la fecha: si no mandás producto ni canal, el
precio queda como referencia general.

El nombre `precio_venta_quintal` es engañoso y conviene saber por qué. Cuando el sistema se
armó todos los productos se medían en quintales, y así se quedó el nombre de la columna. Pero
la realidad es que el valor es el precio de **una unidad del producto**: si el producto se
vende en caja, esos `55.00` son 55 por caja. Por eso el frontend tiene que armar la etiqueta
usando la `unidad` que devuelve `GET /productos`, tipo "55.00 / caja", y no "55.00 / quintal".

Si no hay que renombrar nada de la base, la solución más limpia sería un alias en la consulta
para que llegue como `precio_unitario` y los dos nombres no se mezclen. Está pendiente.

**`GET /precios`** devuelve el historial. Acepta `?id_producto=` y `?id_canal=` para filtrar,
que es como lo usa el cálculo de punto de equilibrio: toma el precio más reciente que
coincida con el producto y el canal que le pediste.

**`DELETE /precios/:id`** borra un registro del historial. Ojo con esto, porque es distinto a
los otros borrados del sistema: los precios son globales, así que cualquier usuario puede
borrar un precio que otro registró. Es aceptable porque es un dato de referencia público, pero
si más adelante querés que solo quien lo registró pueda tocarlo, hay que agregar `id_usuario`
a la tabla.

---

## Costos

**`POST /costos`**

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

`id_producto` es opcional. Si no lo mandás, el costo queda como general de la parcela. Si lo
mandás, ese costo se suma solo en los cálculos de ese producto.

`es_fijo` va como `true` o `false`, no como 1 y 0 — la API recibe los dos, pero desde
JavaScript mandá el booleano que queda más claro.

**`GET /parcelas/:id/costos`** te devuelve la lista con `producto` y `unidad` ya resueltos,
para que puedas mostrar "Semillas — Maiz Blanco (quintal)" sin hacer una consulta extra por
cada costo.

También tenés `PUT /costos/:id` y `DELETE /costos/:id`. El PUT actualiza solo los campos que
le mandes, los demás se quedan como estaban, así que podés mandar únicamente `{ "monto": 50 }`
si solo querés corregir el monto.

---

## Los cálculos

Acá está la parte que conviene mirar con calma, porque los nombres cambiaron a mitad de
desarrollo y hay dos campos que se llaman distinto de lo que quizás habías visto antes.

**`GET /parcelas/:id/costo-quintal`** y **`GET /parcelas/:id/punto-equilibrio`** aceptan dos
parámetros opcionales: `?id_producto=N` y `?id_canal=N`.

Sin `id_producto` calculan sobre **todos** los costos de la parcela. Con `id_producto`
filtran por ese producto, y es lo que casi siempre vas a querer. La diferencia se nota
mucho: si en un lote tenés arroz y tomate, el costo del arroz no debería incluir lo que
gastaste en el tomate.

```js
// esto mezcla los costos del arroz con los del tomate
fetch('/parcelas/1/costo-quintal')

// esto solo cuenta los costos del arroz
fetch('/parcelas/1/costo-quintal?id_producto=1')
```

Respuesta del primero:

```json
{
  "id_producto": null,
  "producto": null,
  "unidad": "quintal",
  "costo_total": 240,
  "costos_fijos": 150,
  "costos_variables": 90,
  "produccion": 100,
  "produccion_quintales": 100,
  "origen_produccion": "parcela",
  "costo_quintal": 2.4
}
```

Con filtro, `producto` y `unidad` vienen con el nombre real:

```json
{
  "id_producto": 1,
  "producto": "Maiz Blanco",
  "unidad": "quintal",
  "costo_total": 150,
  "costos_fijos": 100,
  "costos_variables": 50,
  "produccion": 200,
  "produccion_quintales": 200,
  "origen_produccion": "por_producto",
  "costo_quintal": 0.75
}
```

Ahí hay tres cosas nuevas que conviene mirar:

- **`produccion`** es la producción usada en la división, en la unidad de `unidad`. Si el
  producto es tomate, viene en cajas. Reemplaza a `produccion_quintales`.
- **`produccion_quintales`** sigue ahí como alias de `produccion`, por compatibilidad.
- **`origen_produccion`** te dice de dónde salió el número: `por_producto` si vino de
  `produccion_parcelas`, `parcela` si cayó al total genérico de la parcela.

**Por qué importa `origen_produccion`.** Si pedís el costo del tomate y el tomate no tiene
producción registrada, la API divide los costos del tomate entre los quintales de la parcela. El
número sale y parece normal, pero está mezclando unidades. Cuando veas `parcela` junto a un
`id_producto`, lo correcto es avisarle al usuario que registre la producción de ese producto.

El punto de equilibrio se calcula así adentro:

```
costo_variable_unidad    = costos_variables / produccion
margen_contribucion      = precio_venta - costo_variable_unidad
punto_equilibrio_unidades = costos_fijos / margen_contribucion
```

Que en palabras es: cuánto te cuesta cada unidad, cuánto te queda después de venderla, y
cuántas unidades tienes que vender para tapar los costos fijos. Si te da 1.83 quintales,
significa que vendiendo 2 quintales ya empezaste a ganar.

Un par de casos a los que hay que estar atento: `costo_quintal` y `punto_equilibrio_unidades`
llegan en `null` cuando no hay producción registrada en la parcela o cuando no hay ningún
precio guardado para ese producto. No es un error, es que no hay con qué calcular. Mostralo
como "faltan datos" en vez de imprimir `null` o `$NaN` en pantalla.

El `0` sí es un resultado válido, y es un caso distinto que conviene no mezclar: si no tenés
**costos fijos**, el punto de equilibrio da `0` porque no hay nada fijo que recuperar. No lo
trates como "faltan datos", porque el usuario registró todo y lo que le corresponde es el
mensaje "no necesitás vender nada para no perder". Solo `null` significa que falta un insumo.

También cambia el nombre de dos campos que quizás ya tenías anotados:

| antes | ahora |
|---|---|
| `costo_variable_quintal` | `costo_variable_unidad` |
| `punto_equilibrio_quintales` | `punto_equilibrio_unidades` |

El nombre nuevo no es capricho. Como los productos tienen unidades distintas, decir
"quintal" en el nombre mentía: el cálculo es sobre la unidad del producto, que puede ser una
caja, una jaba, un ciento o una libra.

---

## El mercado

**`POST /publicaciones`**

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

`id_parcela` es opcional: a veces la cosecha viene de varias parcelas y no hay una sola que
poder señalar como origen de la oferta.

Fijate que **`estado` no va en el body**. La publicación nace `disponible` sola, y después se
cambia con el endpoint siguiente. Si el cliente pudiera mandar el estado, podría publicar ya
"vendido" y saltarse la regla de negocio.

**`GET /publicaciones`** es la única ruta del proyecto que **no** filtra por usuario, y es a
propósito: el mercado es público, todos tienen que poder ver lo que ofrece la demás gente.
El token sigue siendo obligatorio para que la API no quede abierta, pero no se usa para
filtrar.

Acepta tres filtros que se pueden combinar:

```js
GET /publicaciones                              // todas
GET /publicaciones?estado=disponible            // solo las que siguen disponibles
GET /publicaciones?estado=disponible&id_producto=3
GET /publicaciones?mias=true                    // solo las del usuario logueado
```

Los valores válidos de estado son `disponible`, `vendido` y `retirado`. Si mandás algo
distinto te devuelve `400` con un mensaje que incluye la lista, así que podés usar esa lista
para armar tu `<select>` sin tenerla duplicada en el frontend.

Cada publicación llega con todo resuelto: nombre del producto, unidad, canal, nombre del
agricultor y nombre de la parcela. No hace falta un GET por cada id.

Además trae un campo `mia`:

```json
{ "id_publicacion": 1, "producto": "Maiz Blanco", ..., "mia": 1 }
```

`mia` vale `1` si la oferta es del usuario logueado y `0` si es de otro. Sirve para que el
frontend decida si muestra los botones de "marcar vendido" y "retirar" sin guardar el
`id_usuario` en el navegador. Ojo igual: mostrar el botón es decisión del cliente, pero la
validación real la hace el servidor en cada `PUT`, así que el `mia` es solo para la interfaz.

`nombre_parcela` puede venir en `null` si la parcela de origen se borró.

**`PUT /publicaciones/:id/estado`** con `{ "estado": "vendido" }` para marcarla como
vendida cuando alguien la compra. Solo funciona sobre publicaciones del usuario logueado.

Los `POST` devuelven el id de lo creado, así que no hace falta volver a pedir el listado para
seguir trabajando con el recurso nuevo:

```json
{ "mensaje": "Publicación creada", "id_publicacion": 12 }
{ "mensaje": "Parcela creada", "id_parcela": 12 }
{ "mensaje": "Costo registrado", "id_transaccion": 31 }
{ "mensaje": "Precio Registrado", "id_precio": 7 }
{ "mensaje": "Usuario registrado", "id_usuario": 4 }
```

---

## Códigos de error y qué hacer con cada uno

| Código | Qué pasó | Qué hay que hacer en el frontend |
|---|---|---|
| `400` | Falta un campo, o un número vino en cero, negativo, o con letras | Mostrar el mensaje de `error` junto al campo que corresponda |
| `401` | No hay token, o ya expiró | Limpiar sesión y mandar a login |
| `403` | No se usa, nunca llega | — |
| `404` | No existe, o no es tuyo, o el `id_producto` no existe | Mensaje de "no encontrado", no de "error del sistema" |
| `409` | `POST /registro` con un correo que ya tiene cuenta | Poner "ese correo ya está registrado" en el formulario |
| `500` | Se rompió algo adentro | Mostrar algo genérico, no el detalle |

El `404` cumple doble función a propósito: tanto "este recurso no existe" como "este recurso
es de otro usuario" devuelven `404` y no `403`. Así no se puede usar la API para averiguar qué
ids existen en cuentas ajenas.

Casi todas las rutas devuelven el detalle en `{ error: "..." }`, así que podés mostrar ese
texto directamente. La excepción son los `500`, esos van con un mensaje genérico y el detalle
real se queda en el log del servidor.

---

## Estructura del proyecto

```
AgronomoDigital/
├── backend/
│   ├── src/
│   │   ├── server.ts            ← toda la API, con comentarios para el equipo
│   │   └── db.ts                ← la conexión a MySQL
│   ├── pruebas/
│   │   ├── e2e.js               ← 107 comprobaciones contra la API local
│   │   └── instalacion.js       ← arma una base desde schema.sql y revisa cascadas
│   ├── schema.sql               ← las 9 tablas, con sus llaves foráneas
│   ├── catalogos.sql            ← los 14 productos, 25 categorías y 4 canales
│   ├── API_DOCUMENTACION.md     ← referencia de cada endpoint
│   └── .env.example
└── frontend_agronodigital/     ← equipo de interfaz
    └── index.html              ← toda la UI en un solo archivo
```

El modelo de datos completo está en `backend/API_DOCUMENTACION.md`. Lo mínimo para
trabajar es saber esto:

- Un usuario tiene parcelas. Las parcelas son suyas y nadie más las ve.
- Cada parcela tiene costos. Cada costo puede estar asociado a un producto o ser general.
- Cada parcela puede registrar producción por producto y ciclo, en la unidad de cada producto.
- Los productos tienen un tipo, y cada tipo tiene sus propias categorías de gasto.
- El historial de precios es global. El precio del arroz le sirve a todos por igual.
- Las publicaciones son públicas y las maneja el mercado.

### Las pruebas

Con la API corriendo en otra terminal:

```bash
cd backend
npm test                  # e2e.js: registro, cálculos, mercado, permisos, cascadas
npm run test:instalacion  # crea una base temporal desde schema.sql y la valida
npm run typecheck         # TypeScript sin emitir archivos
```

`npm test` registra dos usuarios con correos únicos y los borra al terminar. Las aserciones de
conteo son relativas al estado de partida, así que convive con datos que ya estén.

`npm run test:instalacion` crea una base llamada `agronodigital_instalacion_prueba`, la llena
desde los `.sql`, revisa que existan las 9 tablas con sus cascadas, y la borra. No toca
`agronomodigital`.

---

## Lo que falta

- El registro de la contraseña pide 8 caracteres sin más. Se puede agregar exigir mayúscula,
  número y símbolo.
- No hay paginación en el listado de publicaciones ni en el historial de precios. Con
  suficientes registros las respuestas se van a poner pesadas.
- `parcelas.produccion_quintales` sigue siendo un número único para toda la parcela. Se mantiene
  por compatibilidad con los cálculos sin filtro, pero la producción real debería vivirse en
  `produccion_parcelas`. Si algún día se quiere quitar, hay que decidir qué pasa con las
  parcelas que solo tienen el número viejo.
- No hay endpoint para borrar la cuenta. Si se necesita, se agrega del lado del servidor.
