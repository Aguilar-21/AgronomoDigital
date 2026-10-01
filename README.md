# AgronoDigital

Sistema para pequeños y medianos productores agrícolas del estado Sucre. Cada agricultor
registra sus parcelas, anota lo que le cuesta producir (insumos, mano de obra, maquinaria) y
la API le dice si con el precio que hay en el mercado le sale a cuenta o está perdiendo plata.

Este README es la guía para el equipo de **frontend**. Si estás del lado de la interfaz, lo
que necesitas está aquí y en `backend/API_DOCUMENTACION.md`, que tiene el detalle de cada
endpoint. En `backend/src/` hay comentarios explicando el porqué de las decisiones que no se
ven solo leyendo el código.

---

## Arrancar el backend

```bash
cd backend
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```

Abri `.env` y ponete tus datos de MySQL:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_clave
DB_DATABASE=agronomodigital
JWT_SECRETO=cualquier_cosa_larga_y_aleatoria_de_16_caracteres_o_mas
PUERTO=3002
NODE_ENV=development
LOG_LEVEL=debug
```

`JWT_SECRETO` tiene que tener **16 caracteres o más**, y el servidor se niega a arrancar si es
más corta. Generala con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Ese es el único secreto que de verdad protege algo: si se filtra, cualquiera puede hacerse su
propio token y entrar como cualquier usuario.

Después crea la base y las tablas:

```bash
mysql -u root -e "CREATE DATABASE agronomodigital CHARACTER SET utf8mb4"
mysql -u root agronomodigital < schema.sql
mysql -u root agronomodigital < catalogos.sql
```

Y por último, corre las migraciones:

```bash
npm run migrate
```

Esto es **imprescindible**: el código actual consulta columnas con nombres nuevos
(`precio_venta`, `produccion_estimada`, `ciclo`, `notas`) que `schema.sql` todavia no crea. Sin
`npm run migrate` el servidor arranca bien y falla en la primera consulta con un error de
"columna desconocida".

`npm run migrate` es idempotente: guarda en la tabla `migraciones_aplicadas` quais ya corrieron
y solo aplica las que faltan. Podés ejecutarlo las veces que quieras.

Y al final:

```bash
npm run dev
```

Queda escuchando en `http://localhost:3002`. Fijate que responda con "Bienvenido a
AgronoDigital" antes de empezar a conectarte desde el frontend.

`npm run dev` usa `tsx watch`, o sea que reinicia solo cuando guardas un archivo. Si tocas el
código y te sigue dando error, mira la terminal donde corre el servidor: casi siempre explica
mejor el problema que el 500 que recibes.

### Los scripts

```bash
npm run dev           # servidor con recarga automatica
npm run build         # compila TypeScript a dist/
npm start             # corre el build (node dist/server.js)
npm run migrate       # aplica las migraciones pendientes
npm test              # e2e.js: 107 comprobaciones contra la API local
npm run test:unit     # Vitest: calculos puros, sin base de datos
npm run test:instalacion  # arma una base temporal desde schema.sql y la valida
npm run typecheck     # TypeScript sin emitir archivos
```

`npm run test:unit` es el que conviene correr mientras se programa: son 27 pruebas de la
aritmetica de cálculos, corren en milisegundos y no tocan MySQL.

---

## Las seis cosas que hay que saber si o si

Antes de escribir código del frontend, hay seis detalles de esta API que te van a hacer
perder tiempo si no los tenes presentes.

### 1. Los números decimales llegan como texto.

MySQL guarda los `DECIMAL` como texto. Si pides los costos de una parcela te va a llegar así:

```js
{ "monto": "45.50", "tipo_costo": "Semillas" }
```

`"45.50"` es un string, no el número 45.5. Si sumas dos costos sin convertir:

```js
costos.reduce((a, c) => a + c.monto, 0)     // "45.50" + "20.00" = "45.5020.00"  <- mal
```

El `+` entre dos strings concatena en vez de sumar. Hay que convertir:

```js
costos.reduce((a, c) => a + Number(c.monto), 0)   // 65.5  <- bien
```

Esto aplica a todo lo que venga de una columna `DECIMAL`: `monto`, `precio_unitario`,
`precio_venta`, `cantidad`, `tamano`, `produccion`, `costo_total`, `costo_unitario`. Los campos
`id_*` y `es_fijo` si llegan como números, esos no los toques.

Ojo: los cálculos de la API ya salen redondeados y convertidos. Los `DECIMAL` sin convertir son
los de las listas CRUD: costos, producción, parcelas, precios.

### 2. El token viaja en cada petición.

Ocho rutas son abiertas: `GET /`, `POST /registro`, `POST /login`, los cuatro de catálogos
(`/productos`, `/categorias-costos`, `/canales`, `/canales/:id/productos`) y `GET /health`.
Todo lo demas pide el token:

```js
fetch('http://localhost:3002/parcelas', {
  headers: { Authorization: `Bearer ${token}` }
})
```

Si lo olvidas te devuelve `401`. El token dura 2 horas, así que en algun momento te va a tocar
manejar ese 401: lo ideal es un interceptor que, al recibirlo, limpie la sesión y mande al
usuario a la pantalla de login.

Ojo con el formato: tiene que ser exactamente `Bearer ` seguido del token. `basico abc` no
funciona y devuelve 401.

### 3. Nunca se manda el id del usuario.

El backend lo sabe solo, lo saca del token. Aunque lo mandes en el body se ignora. Eso es
intencionado: es lo que impide que alguien vea o borre las parcelas de otro modificando un
número en el formulario.

Por eso la API no tiene ningun endpoint de borrado de cuenta: si algun día lo necesita, se
agrega del lado del servidor.

### 4. Las respuestas no vienen envueltas.

`{ datos: [...] }` es el nombre que le puse a la variable que guarda el body parseado en el
helper `api()` del frontend, no una envoltura que mande el backend. El servidor manda el objeto
o el array directo:

```js
// GET /publicaciones  ->  es un objeto con las publicaciones adentro
const r = await api("GET", "/publicaciones");
r.publicaciones    // el array
r.total            // cuanto hay en total, para el boton de "siguiente"

// GET /parcelas  ->  es un array pelado
const p = await api("GET", "/parcelas");
Array.isArray(p) ? p : []

// GET /parcelas/1/costo-unitario  ->  es un objeto pelado
const cu = (await api("GET", "/parcelas/1/costo-unitario?id_producto=1")).datos;
cu.costo_unitario
```

`GET /publicaciones` y `GET /precios` son las únicas dos que devuelven un envoltorio, porque son
las únicas dos paginadas y necesitan `total`, `limit` y `offset`. Todas las demas devuelven el
recurso directo.

### 5. Los campos viejos todavia salen, pero se van a quitar.

Hubo un renombrado de columnas que mintian sobre lo que guardaban. El backend acepta y devuelve
los dos nombres durante la transicion:

| nombre viejo | nombre nuevo | cuando se va |
|---|---|---|
| `precio_venta_quintal` | `precio_venta` | cuando el frontend mande el nuevo |
| `produccion_quintales` | `produccion_estimada` | cuando el frontend mande el nuevo |
| `costo_quintal` | `costo_unitario` | cuando el frontend lea el nuevo |
| `costo-total` (ruta) | `costo-unitario` (ruta) | cuando el frontend llame a la nueva |

Los nombres viejos no son aliases de adorno: siguen funcionando a proposito. Si actualizas el
frontend a medias, el backend te sostiene. Lo que hay que evitar es la combinación inversa,
porque ahí es donde aparecen los errores que nadie entiende.

Cuando uses el nuevo, la respuesta te dice que migraste. En el caso de los precios viene un
`aviso_deprecado`.

El porqué del renombrado está en la sección "Los cálculos", más abajo. Es corto: hay 14 productos
en 6 unidades y decir "quintal" era mentira.

### 6. `null` y `0` no son lo mismo.

En los cálculos, `null` significa "no hay con que calcular" y `0` significa "el cálculo dio
cero". No los trates igual:

- `costo_unitario: null` -> mostrar "faltan datos"
- `costo_unitario: 0` -> mostrar 0, es real
- `punto_equilibrio_unidades: 0` -> no tenes costos fijos, no necesitas vender nada
- `punto_equilibrio_unidades: null` -> falta producción o falta precio

El `null` viene con un campo `motivo` o `avisos` que dice que falta. Usalo.

---

## Como es el login

```
POST /registro   { nombre, correo, contrasena }   -> 201
POST /login      { correo, contrasena }           -> 200 { token }
```

Después del login, `token` es lo único que guardas:

```js
const { token } = await (await fetch('http://localhost:3002/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ correo, contrasena })
})).json()
```

Un par de detalles:

El correo se normaliza solo (recorta espacios y pasa a minúsculas), así que `Juan@Correo.COM` y
`juan@correo.com` son la misma cuenta. No hace falta que lo hagas vos.

La contraseña necesita mínimo 8 caracteres. Si el correo ya está registrado el registro devuelve
`409`, no `400`. El `409` es a proposito, para que puedas mostrar "ese correo ya tiene cuenta" sin
estar adivinando por el texto del error.

El login devuelve `401` con `"Correo o contrasena incorrectos"` tanto si el correo no existe como
si la contraseña está mal. El mensaje es exactamente el mismo en los dos casos, a proposito: si
distinguiera entre "ese correo no existe" y "esa contraseña no es la correcta", el formulario de
login se volveria un buscador de que correos tienen cuenta en la plataforma.

---

## Catálogos

Son cuatro endpoints de solo lectura que existen para llenar los `<select>` del frontend. No se
crean ni se editan desde la interfaz, y **no piden token**.

**`GET /productos`** te da el catálogo completo:

```json
[
  { "id_producto": 1, "nombre": "Maiz Blanco", "unidad": "quintal", "tipo_producto": "granos" },
  { "id_producto": 6, "nombre": "Chile Verde", "unidad": "caja", "tipo_producto": "hortalizas" }
]
```

Son 14 productos repartidos en cuatro tipos: `granos`, `hortalizas`, `frutales`, `lacteos`. El
campo `unidad` es importante: un producto se puede vender en quintal, en caja, en libra o en
unidad, y de eso depende como se lea el costo que te devuelven los cálculos.

Solo devuelve los productos activos (`activo = 1`). Los dados de baja no se ofrecen para vender.

**`GET /canales`** son los cuatro canales de venta: Mercado local, Intermediario (Coyote),
Exportacion / Bolsa, Procesadora. Ojo, el tercero viene sin tilde en la base: si lo comparas con
`"Exportacion / Bolsa"` no va a hacer match.

**`GET /canales/:id/productos`** devuelve que productos se venden por ese canal, con nombre y
unidad ya resueltos. Antes cada precio traia el nombre del canal y había que filtrar en el
frontend; esto lo resuelve la base.

**`GET /categorias-costos?tipo=granos`** es el que más te va a interesar. Devuelve que categorías
de gasto aplican a un tipo de producto:

```json
[
  { "id_categoria": 3, "nombre": "Semillas",     "tipo_producto": "granos", "es_fijo_default": false },
  { "id_categoria": 7, "nombre": "Mano de obra", "tipo_producto": "granos", "es_fijo_default": true  }
]
```

La idea del formulario de costos es esta: el usuario elige el producto, y vos hace
`GET /categorias-costos` con el `tipo_producto` de ese producto y le mostras los campos de gasto
que de verdad le aplican. Si cultiva maiz le sale Semillas, Abono, Herbicida, Mano de obra. Si
cultiva tomate, le sale Agua, Plaguicida, Insecticida. No hay que mostrarle las 25 categorías
juntas.

`es_fijo_default` te dice si esa categoría viene fijada como costo fijo o variable. Es un default,
o sea una sugerencia para marcar la casilla, pero el usuario debería poder cambiarla porque
depende de su parcela.

Si falta el `?tipo=`, la API devuelve `400` diciendo "Falta el parámetro ?tipo=". El `400` es
mejor que devolver `[]`: una lista vacía no te dice si te equivocaste en el nombre del tipo o si
ese tipo no tiene categorías.

---

## Parcelas

Es la base de todo lo demas, así que conviene entenderla bien. Cada parcela es de un solo usuario
y las demas personas no la ven.

**`GET /parcelas`** te devuelve las tuyas, y solo las tuyas. Si no tienes ninguna devuelve `[]`,
no `null`.

**`GET /parcelas/:id`** (ruta nueva) devuelve una sola parcela. Antes para ver una parcela había
que bajar el listado completo y buscar a mano.

**`POST /parcelas`**

```json
{
  "nombre_parcela": "Lote sur",
  "ubicacion": "Sector El Zinc",
  "tamano": 2.5,
  "produccion_estimada": 100
}
```

De esos cuatro campos solo `nombre_parcela` es obligatorio. `tamano` y `produccion_estimada` son
opcionales y se guardan como `null` si no los mandas.

Sobre `produccion_estimada`: es un **número único para toda la parcela**, no por producto. Sirve
cuando la parcela tiene un solo cultivo. Si tiene más de uno, el total mezcla unidades y no
significa nada: por eso existe la producción por producto (más abajo).

**`PUT /parcelas/:id`** es parcial de verdad: actualiza solo los campos que le mandes. Podés
mandar únicamente `{ "ubicacion": "otro sitio" }` y el nombre, el tamano y la producción se quedan
como estaban. Antes un PUT parcial borraba los campos que no venian.

**`DELETE /parcelas/:id`** borra la parcela y también todos sus costos y sus registros de
producción por producto, porque las llaves foraneas están en cascada. No hay que ir a borrarlos
uno por uno. Las publicaciones que se habían hecho desde esa parcela **no** se borran: quedan en
el mercado con la parcela en `null`. Si la parcela no es tuya te devuelve `404`.

---

## Producción por producto

`produccion_parcelas` es un registro por `(parcela, producto, ciclo)`, con la producción **en la
unidad del producto**: quintales si se vende en quintales, cajas si se vende en cajas.

Esto importa por una razón concreta: una parcela puede tener 200 cajas de tomate y 50 quintales
de maiz. Si divides los costos entre "250 de algo", el producto que tiene más cajas se lleva la
mayoría del reparto solo porque los números son más grandes, no porque valga más.

**`POST /parcelas/:id/produccion`**

```json
{ "id_producto": 1, "produccion": 100, "ciclo": "actual" }
{ "id_producto": 5, "produccion": 200, "ciclo": "actual" }
```

`ciclo` es opcional y vale `"actual"` si no lo mandas. Sirve para llevar dos siembras del mismo
producto por separado (`2026-A` y `2026-B`); los cálculos suman los ciclos.

Como `(id_parcela, id_producto, ciclo)` es único, esta ruta es un **upsert**: si esa combinación
ya existe la actualiza y devuelve `200`, si no la crea y devuelve `201`.

```json
{ "mensaje": "Produccion registrada", "id_producto": 1, "unidad": "quintal", "ciclo": "actual" }
{ "mensaje": "Produccion actualizada", "id_producto": 5, "unidad": "caja", "ciclo": "actual" }
```

Fijate que la respuesta trae `unidad`: sale del catálogo de productos, así no tenes que cruzar
ids contra `GET /productos`.

**`GET /parcelas/:id/produccion`** devuelve la lista con nombre y unidad ya resueltos, y acepta
`?id_producto=N` y `?ciclo=`.

**`DELETE /produccion/:id`** borra un registro puntual.

### El fallback se elimino

Antes, si un producto no tenia producción registrada, la API caía a
`parcelas.produccion_estimada` como plan B. Eso mezclaba unidades: una parcela con 100 quintales
de maiz consultada por tomate devolvia "100 cajas de tomate", y el costo por caja salia de un
número que no era de cajas.

El número salia y parecia legitimo, que es peor que no devolver nada.

Ahora, si el producto no tiene producción registrada, el cálculo devuelve `null` y te dice por que
en `avisos`. Si el usuario quiere calcular sobre toda la parcela sin filtrar por producto, para
eso está `produccion_estimada`, y la respuesta lo declara con `origen_produccion: "parcela"`.

Los tres valores posibles de `origen_produccion`:

| valor | que significa |
|---|---|
| `por_producto` | el número viene de `produccion_parcelas`, es de ese cultivo |
| `parcela` | el número es el total de la parcela, no de un cultivo. Mezcla unidades |
| `sin_datos` | no hay producción registrada, el cálculo da `null` |

**El `parcela` con un `id_producto` es el caso que tenes que avisarle al usuario.** Significa que
le estas mostrando un costo por unidad calculado sobre un total que no es de ese producto.

---

## Precios de mercado

El historial de precios es lo único global del sistema, junto con los catálogos. Le sirve igual a
todos los usuarios, así que no lleva `id_usuario` y cualquiera autenticado puede escribir y leer.

**`POST /precios`**

```json
{
  "id_producto": 1,
  "id_canal": 1,
  "fecha": "2026-09-29",
  "precio_venta": 55.00
}
```

El nombre `precio_venta` es el nuevo. El viejo `precio_venta_quintal` todavia se acepta y durante
la transicion te responde con `aviso_deprecado` si lo usaste. Si mandas los dos, gana
`precio_venta`.

Los tres primeros campos son opcionales menos la fecha: si no mandas producto ni canal, el precio
queda como referencia general.

El porqué del renombrado: cuando el sistema se armo todos los productos se median en quintales, y
así se quedo el nombre de la columna. Pero el valor es el precio de **una unidad del producto**: si
el producto se vende en caja, esos `55.00` son 55 por caja. El frontend tiene que armar la
etiqueta usando la `unidad` de `GET /productos`, tipo "55.00 / caja", no "55.00 / quintal".

**`GET /precios`** devuelve el historial, paginado. Acepta `?id_producto=`, `?id_canal=`,
`?limit=` y `?offset=`.

```js
const r = await api("GET", "/precios?id_producto=1&limit=20");
r.precios   // el array
r.total     // cuantos hay en total
```

**`GET /precios/ultimo?id_producto=N`** (ruta nueva) devuelve solo el último precio, que es lo que
necesita la pantalla de punto de equilibrio. Antes había que bajar el historial entero y tomar el
primero. Acepta `?id_canal=` también. Si no hay ningun precio devuelve `precio_venta: null`.

**`DELETE /precios/:id`** borra un registro del historial. Ojo con esto, porque es distinto a los
otros borrados del sistema: los precios son globales, así que **cualquier usuario puede borrar un
precio que otro registro**. Es aceptable porque es un dato de referencia público, pero si más
adelante queres que solo quien lo registro pueda tocarlo, hay que agregar `id_usuario` a la tabla.

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
  "es_fijo": false,
  "ciclo": "actual"
}
```

`id_parcela` es obligatorio y se valida contra el usuario: si no es tuya te devuelve 404.

`id_producto` es opcional. Si no lo mandas, el costo queda como **general** de la parcela. Si lo
mandas, ese costo se suma solo en los cálculos de ese producto.

`es_fijo` va como `true` o `false`, no como 1 y 0. Desde JavaScript manda el booleano, que queda
más claro.

`ciclo` es opcional y vale `"actual"`. Esto es importante: sin ciclo, los costos de dos temporadas
se suman contra la producción de una sola, y el punto de equilibrio sale de una mezcla que no
describe ninguna temporada. El detalle está en la migración `002_ciclos.sql`.

`fecha` es obligatoria y se valida como fecha. Antes si no la mandabas MySQL rechazaba la fila con
un 500 que decia "Field 'fecha' doesn't have a default value", que no le dice nada a nadie.

**`GET /parcelas/:id/costos`** te devuelve la lista con `producto` y `unidad` ya resueltos, para que
puedas mostrar "Semillas - Maiz Blanco (quintal)" sin hacer una consulta extra por cada costo.
Acepta `?id_producto=`, `?ciclo=` y `?es_fijo=true|false`.

**`PUT /costos/:id`** actualiza solo los campos que le mandes. Podés mandar únicamente
`{ "monto": 50 }` si solo queres corregir el monto.

**`DELETE /costos/:id`** lo borra. Solo si es tuyo.

---

## Los cálculos

Acá está la parte que conviene mirar con calma.

Hay dos rutas y hacen cosas distintas:

| ruta | que devuelve |
|---|---|
| `GET /parcelas/:id/costo-total` | solo la suma de costos |
| `GET /parcelas/:id/costo-unitario` | el costo por unidad del producto |
| `GET /parcelas/:id/punto-equilibrio` | cuántas unidades hay que vender |

La primera acepta `?id_producto=` y `?ciclo=` y nada más. Las otras dos aceptan además
`?id_canal=` y `?repartir_generales=`.

**Sin `id_producto` no funcionan los dos últimos** y devuelven `400` con un mensaje que lo explica.
No es un detalle: "costo unitario" de que si hay 14 productos en 6 unidades distintas. Si solo
necesitas saber cuánto gastaste en total, para eso está `costo-total`, que si funciona sin filtro.

Además hay una ruta nueva, **`GET /parcelas/:id/disponible`**, que te dice cuánta mercadería
queda sin publicar. Sirve para que el formulario de publicar no deje mandar una cantidad que el
backend va a rechazar:

```js
const d = await api("GET", "/parcelas/1/disponible?id_producto=1");
d.disponible   // cuanto queda sin publicar
d.publicado    // cuanto se publico ya
d.unidad       // "quintal"
```

`disponible: null` significa que no hay producción registrada para ese producto. `0` significa que
hay producción y no queda nada.

### Los costos generales

Un costo sin `id_producto` es general de la parcela: el alquiler, la vigilancia, el transporte. No
es de ningun cultivo en particular.

Antes, al calcular el costo de un producto, esos costos se perdían en silencio: el costo del maiz
no incluia el alquiler, y nadie se enteraba de que faltaba una parte. Ahora los generales se
devuelven **aparte**:

```json
{
  "costosProductoTotal": 5000,
  "costosGenerales": 2000,
  "costosGeneralesAtribuidos": 0,
  "costoUnitarioDirecto": 50,
  "costoUnitario": 50
}
```

Con `?repartir_generales=true` se atribuyen al producto:

```json
{
  "costosProductoTotal": 5000,
  "costosGenerales": 2000,
  "costosGeneralesAtribuidos": 1000,
  "costoUnitarioDirecto": 50,
  "costoUnitarioGeneral": 10,
  "costoUnitario": 60
}
```

**Por que es opcional y no automático.** El reparto es una estimación, no un dato. Depende de que
los precios esten actualizados y de que la producción registrada sea completa. Si va por defecto
dentro del número que el usuario usa para fijar su precio de venta, estarias metiendo una
suposición dentro de un dato sin que nada en la pantalla lo diga.

Como opción del lado del cliente, podés mostrar las dos cosas: el costo directo, que es un dato, y
el costo con generales repartidos, que es una estimación. Que se vea cuál es cuál.

**Como se reparte.** Por **valor de la producción**: `precio x cantidad` de cada producto. El
resultado de esa multiplicación es dinero, y el dinero si se puede sumar entre cultivos distintos.
Las cantidades no: "200 cajas + 50 quintales" no es 250 de nada.

Si algun producto de la parcela no tiene precio registrado, **no se reparte nada** y te avisa por
que en `motivo`. Repartir a partes iguales entre los que si tienen precio asignaria al maiz una
parte de la cosecha de tomate sin ninguna base, que es peor que decir que no se puede repartir.

### La fórmula del punto de equilibrio

```
costo_variable_unidad      = costos_variables / produccion
margen_contribucion        = precio_venta - costo_variable_unidad
punto_equilibrio_unidades  = costos_fijos / margen_contribucion
```

Qué en palabras es: cuánto te cuesta cada unidad, cuánto te queda después de venderla, y cuántas
unidades tenes que vender para tapar los costos fijos. Si te da 1.83 quintales, significa que
vendiendo 2 quintales ya empezaste a ganar.

El campo `punto_equilibrio_unidades_redondeado` viene redondeado hacia arriba. Vender 100.4
unidades no alcanza: hay que vender 101. Es el número que tenes que mostrar al usuario.

### Los casos que hay que no mezclar

`punto_equilibrio_unidades` llega en `null` en tres situaciones distintas, y **las tres son
"faltan datos"**:

- no hay producción registrada para el producto
- no hay precio registrado para ese producto o canal
- el precio es igual o menor que el costo variable

En el último caso el `null` es importante: si el margen es exactamente 0, la fórmula da fijos
dividido por 0, que es infinito, y al serializar a JSON eso se convierte en `null`. Antes el
cliente recibia un `null` sin saber por que. Ahora hay un `motivo` que lo explica.

El `0` es un resultado **válido** y es un caso distinto: si no tenes **costos fijos**, el punto de
equilibrio da `0` porque no hay nada que recuperar. No lo trates como "faltan datos", porque el
usuario registro todo y lo que le corresponde es "no necesitas vender nada para no perder".

### Los nombres de los campos

| antes | ahora |
|---|---|
| `costo_variable_quintal` | `costo_variable_unidad` |
| `punto_equilibrio_quintales` | `punto_equilibrio_unidades` |
| `costo_quintal` | `costo_unitario` |
| `precio_venta_quintal` | `precio_venta` |
| `produccion_quintales` | `produccion_estimada` |

Los nombres nuevos no son capricho. Como los productos tienen unidades distintas, decir "quintal"
mentia: el cálculo es sobre la unidad del producto, que puede ser una caja, una jaba, un ciento o
una libra.

Y `produccion_quintales` era la peor de todas, porque esa columna es un único total para toda la
parcela y el código la usaba como plan B cuando un producto no tenia producción registrada. El
nombre hacia creer que el dato estaba en quintales cuando en realidad no era de ningun producto en
particular. Ver "El fallback se elimino", más abajo.

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
  "fecha": "2026-09-29",
  "ciclo": "actual",
  "notas": "Cosecha de esta semana"
}
```

`id_parcela` es **obligatorio**, aunque en el esquema sea `NOT NULL` de todas formas y antes se
podia omitir. Se necesita para comprobar que hay producción disponible. Si mandas una parcela que
no es tuya te devuelve 404.

`id_canal` es opcional: si no lo mandas se usa el primer canal de la base.

**`fecha` y `ciclo` son cosas distintas, y confundirlas te da un error que miente.**

- `fecha` es **cuándo** se publica. Va en formato ISO, tipo `"2026-09-29"`.
- `ciclo` es **de qué temporada** es la mercadería. Valores como `"actual"` o `"2026-A"`.

La regla de "no publicar más de lo que se produjo" compara contra la producción del **mismo ciclo**,
así que lo que se usa para buscarla es `ciclo`, no `fecha`. `ciclo` es opcional y vale `"actual"`,
que es el mismo valor que usa `POST /parcelas/:id/produccion` cuando no le mandás ciclo. En el caso
común no tenés que mandar nada.

Vale la pena que lo sepas porque el error engaña: si mandás `ciclo: "2026-09-29"` te devuelve un
`409` de "no hay producción registrada" aunque la parcela tenga de sobra. Es que esa fecha es una
fecha y no un nombre de temporada, y la búsqueda no encuentra nada con ese valor.

Si registraste producción con un ciclo propio, mandá **el mismo** en los dos endpoints.

Fijate que **`estado` no va en el body**. La publicación nace `disponible` sola, y después se cambia
con el endpoint siguiente. Si el cliente pudiera mandar el estado, podría publicar ya "vendido" y
saltarse la regla de negocio. Si lo mandas igual, el backend lo ignora.

### No se puede publicar más de lo que se produjo

Esta es la regla de fondo del mercado y es nueva. El backend comprueba la producción registrada
del mismo ciclo y rechaza lo que sobra, con `409`:

```
No hay suficiente produccion disponible. Pediste 500 caja y hay 100 caja sin publicar
(ya publicados: 0).
```

Antes el backend aceptaba cualquier cantidad y el error se descubria en la vida real: 500 cajas
publicadas de una parcela que dio 100.

Si el producto no tiene producción registrada en esa parcela, también `409`, con un mensaje que
dice que registre la producción primero.

Para no hacer un viaje de ida y vuelta en cada intento, consulta
`GET /parcelas/:id/disponible` antes de mostrar el formulario.

### Los estados

Una publicación nace `disponible` y se mueve desde ahí:

```
disponible  ->  vendido
disponible  ->  retirado
vendido     ->  (nada)
retirado    ->  (nada)
```

Qué `vendido` y `retirado` sean finales es una decisión. Una venta cerrada no se reabre desde el
tablero: si el comprador devolvio la mercadería, el camino correcto es retirar la publicación vieja
y crear una nueva, que queda registrada con su fecha y su historial. Reabrir en el sitio borra el
rastro de que hubo una venta.

Una transicion inválida devuelve `409` diciendo cuál era el estado actual y a que si se puede ir.

**`GET /publicaciones/:id/estado?estado=vendido`** (ruta nueva) te dice si la publicación puede
pasar a ese estado, sin intentar:

```json
{ "puede": false, "estado_actual": "vendido", "estado_destino": "vendido", "ya_esta_ahi": true }
{ "puede": false, "estado_actual": "vendido", "estado_destino": "retirado", "motivo": "..." }
```

Sirve para que deshabilites el botón de "marcar vendido" en vez de dejar que el usuario lo pulse y
reciba un 409.

### El listado

**`GET /publicaciones`** es la única ruta del proyecto que **no** filtra por usuario, y es a
proposito: el mercado es público, todos tienen que poder ver lo que ofrece la demas gente. El token
sigue siendo obligatorio para que la API no quede abierta, pero no se usa para filtrar.

Acepta filtros que se pueden combinar, más paginación:

```js
GET /publicaciones                                     // todas
GET /publicaciones?estado=disponible                   // solo las que siguen disponibles
GET /publicaciones?estado=disponible&id_producto=3
GET /publicaciones?mias=true                           // solo las del usuario logueado
GET /publicaciones?limit=20&offset=40                  // segunda pagina
```

Los valores válidos de estado son `disponible`, `vendido` y `retirado`. Si mandas algo distinto te
devuelve `400` con un mensaje que incluye la lista, así que podés usar esa lista para armar tu
selector sin tenerla duplicada en el frontend.

`limit` va de 1 a 100, con 50 por defecto. `offset` arranca en 0.

Cada publicación llega con todo resuelto: nombre del producto, unidad, canal, nombre del
agricultor y nombre de la parcela. No hace falta un GET por cada id.

El `total` va aparte porque es lo que permite el botón de "siguiente página": sin el, el frontend
no sabe si hay más y tendría que traer una página extra para enterarse.

---

## códigos de error y que hacer con cada uno

| código | que paso | que hay que hacer en el frontend |
|---|---|---|
| `400` | falta un campo, o un número vino en cero, negativo, o con letras | mostrar el mensaje de `error` junto al campo que corresponda |
| `401` | no hay token, ya expiro, o tiene formato incorrecto | limpiar sesión y mandar a login |
| `403` | no se usa, nunca llega | - |
| `404` | no existe, o no es tuyo, o el `id_producto` no existe | mensaje de "no encontrado", no de "error del sistema" |
| `409` | correo duplicado, o no hay producción disponible para publicar | mensaje específico, el texto dice cuál de las dos cosas |
| `500` | se rompio algo adentro | mostrar algo genérico, no el detalle |

El `404` cumple doble función a proposito: tanto "este recurso no existe" como "este recurso es de
otro usuario" devuelven `404` y no `403`. así no se puede usar la API para averiguar que ids
existen en cuentas ajenas.

La validación de los parámetros es la que evita la mayoría de los 500. Antes, mandar
`?id_producto=abc` a un endpoint de cálculo reventaba el servidor con un 500, porque el backend
hacia la conversion a número y le restaba a `undefined`. Ahora devuelve `400` diciendo que espera
un número.

Ojo con un caso que cambio: un filtro con un valor que no se puede convertir **no se ignora**, se
rechaza. Antes `?id_producto=abc` se trataba como "sin filtro", y eso devolvia la lista COMPLETA de
costos o de precios sin avisar, que es peor que un error: el usuario creeria que vio todo cuando
en realidad vio otra cosa.

Casi todas las rutas devuelven el detalle en `{ error: "..." }`, así que podés mostrar ese texto
directamente. La excepcion son los `500`, esos van con un mensaje genérico y el detalle real se
queda en el log del servidor.

Si el error es de validación de un esquema, el mensaje incluye el campo concreto que está mal.

---

## Estructura del proyecto

```
AgronomoDigital/
├── backend/
│   ├── src/
│   │   ├── app.ts                  ← construye la app Express. NO escucha en ningun puerto
│   │   ├── server.ts               ← solo arranca y apaga limpio (115 lineas)
│   │   ├── db.ts                   ← el pool de MySQL
│   │   ├── logger.ts               ← Pino
│   │   ├── config/
│   │   │   └── env.ts              ← valida el .env al arrancar, con Zod
│   │   ├── auth/
│   │   │   └── tipos.ts            ← la forma del token, en un solo lugar
│   │   ├── middleware/
│   │   │   ├── auth.ts             ← verificar el Bearer y extraer el usuario
│   │   │   ├── errores.ts          ← manejador central de errores
│   │   │   └── validar.ts          ← valida body, params y query con Zod
│   │   ├── routes/
│   │   │   ├── auth.ts             ← registro y login
│   │   │   ├── catalogos.ts        ← productos, categorias, canales, GET /
│   │   │   ├── parcelas.ts         ← CRUD de parcelas
│   │   │   ├── produccion.ts       ← produccion por producto y ciclo
│   │   │   ├── costos.ts           ← CRUD de costos
│   │   │   ├── precios.ts          ← historial de precios
│   │   │   ├── mercado.ts          ← publicaciones y estados
│   │   │   └── consultas.ts        ← costo-total, costo-unitario, punto-equilibrio
│   │   ├── schemas/                ← un archivo de Zod por area
│   │   ├── services/
│   │   │   ├── calculos.ts         ← funciones PURAS: reparto, costo, punto de equilibrio
│   │   │   └── consultas.ts        ← el SQL
│   │   ├── migraciones/
│   │   │   └── correr.ts           ← aplica las migraciones pendientes
│   │   └── types/
│   │       └── express.d.ts        ← le da tipo a res.locals.usuario
│   ├── migraciones/
│   │   ├── 001_renombres.sql       ← precio_venta, produccion_estimada
│   │   ├── 002_ciclos.sql          ← ciclo en costos y publicaciones
│   │   └── 003_indices.sql         ← notas + indices de consulta
│   ├── pruebas/
│   │   ├── unitarias/              ← 27 pruebas de calculos, sin base de datos
│   │   ├── e2e.js                  ← 107 comprobaciones contra la API local
│   │   └── instalacion.js          ← arma una base desde schema.sql y revisa cascadas
│   ├── schema.sql                  ← las 9 tablas, con sus llaves foraneas
│   ├── catalogos.sql               ← los 14 productos, 25 categorias y 4 canales
│   ├── API_DOCUMENTACION.md        ← referencia de cada endpoint
│   └── .env.example
└── frontend_agronodigital/         ← equipo de interfaz
    └── index.html                  ← toda la UI en un solo archivo
```

### Por qué `app.ts` está separado de `server.ts`

Antes toda la app estaba en `server.ts`, que además era el punto de entrada. Para testear algo
había que importarlo, y al importarlo arrancaba el servidor y se quedaba escuchando en un puerto.
Las pruebas unitarias no podian correr sin pelearse con el puerto 3002.

Ahora `app.ts` construye la app y la **exporta sin escuchar en ningun puerto**, y `server.ts` solo
la monta y maneja el apagado limpio. Por eso `npm run test:unit` corre en milisegundos.

### Dónde está cada cosa

- **Una ruta** -> `src/routes/`
- **La forma de un body, params o query** -> `src/schemas/`
- **Un cálculo de negocio** -> `src/services/calculos.ts` (si no toca MySQL) o `src/services/consultas.ts` (si hace SQL)
- **Un código de error** -> `src/middleware/errores.ts`
- **El porqué de una decisión** -> está en el comentario de arriba del archivo

El modelo de datos completo está en `backend/API_DOCUMENTACION.md`. Lo mínimo para trabajar es saber
esto:

- Un usuario tiene parcelas. Las parcelas son suyas y nadie más las ve.
- Cada parcela tiene costos. Cada costo puede estar asociado a un producto o ser general.
- Cada parcela puede registrar producción por producto y ciclo, en la unidad de cada producto.
- Los productos tienen un tipo, y cada tipo tiene sus propias categorías de gasto.
- El historial de precios es global. El precio del arroz le sirve a todos por igual.
- Las publicaciones son publicas y las maneja el mercado.

### Las migraciones

Los archivos `.sql` de `migraciones/` van en orden numérico y se aplican con `npm run migrate`.

Cada uno lleva arriba un comentario explicando **por que** existe, no que hace. Por ejemplo, por que
`002_ciclos.sql` pone `'actual'` a los costos que ya estaban en la base: porque la migración no
puede saber a que temporada pertenecia cada costo, y `'actual'` es lo único que no inventa
información.

No hay rollback automático. MySQL no puede deshacer un `ALTER TABLE` a medias, así que un rollback
automático dejaria columnas mal renombradas sin avisar. Para volver atras hay que escribir el SQL a
mano.

### Las pruebas

```bash
cd backend

npm run test:unit           # 27 pruebas de calculos. No tocan MySQL. ~8 ms
npm test                    # e2e.js: registro, calculos, mercado, permisos, cascadas
npm run test:instalacion   # crea una base temporal desde schema.sql y la valida
npm run typecheck           # TypeScript sin emitir archivos
```

`npm test` y `npm run test:instalacion` necesitan la API corriendo en otra terminal (`npm run dev`),
salvo el de instalación, que arma su propia base.

`npm run test:unit` es el que conviene correr siempre: no necesita MySQL, no abre puertos y corre en
milisegundos. Es donde viven las reglas de negocio.

`npm test` registra dos usuarios con correos únicos y los borra al terminar. Las aserciones de
conteo son relativas al estado de partida, así que convive con datos que ya esten.

`npm run test:instalacion` crea una base llamada `agronodigital_instalacion_prueba`, la llena desde
los `.sql`, revisa que existan las 9 tablas con sus cascadas, y la borra. No toca
`agronomodigital`.

---

## Lo que falta

- **Las dos decisiones abiertas.** Hay dos cosas que quedaron a medio camino y conviene resolver
  antes de tocar el frontend:
  - `publicaciones.id_parcela` es obligatorio en el esquema, y así quedo en la API. Si el caso
    "una oferta junta varias parcelas" te importa de verdad, hay que cambiar el esquema, porque hoy
    la regla de "no publicar más de lo producido" no tiene con que comparar.
  - La migración `002` les puso `'actual'` a todos los costos que ya estaban en la base. Agrupa los
    datos viejos juntos, pero **mezcla anios distintos**. Si me pasas los ciclos reales, lo ajusto.
- **El frontend todavia usa los nombres viejos.** `precio_venta_quintal`, `produccion_quintales`,
  `costo_quintal` y la ruta `/costo-quintal`. El backend los sostiene, pero hay que migrarlos.
- **`CORS_ORIGENES` está vacío**, así que la API acepta peticiones de cualquier origen. Es lo que
  hace falta para trabajar con el frontend abierto como archivo, pero es un agujero si el backend
  se publica. Hay que poner los dominios reales antes de desplegar.
- **`DELETE /precios/:id` deja borrar precios de otros.** Es una decisión consciente (el precio es
  un dato de referencia público) pero si hay que restringuirlo, se agrega `id_usuario` a
  `historial_precios`.
- **La API de precios es global y cualquiera autenticado escribe.** Si el negocio necesita que cada
  usuario registre sus propios precios, hay que agregar `id_usuario` también ahí.
- El registro de la contraseña pide 8 caracteres sin más. Se puede agregar exigir mayúscula, número
  y símbolo.
- No hay endpoint para borrar la cuenta. Si se necesita, se agrega del lado del servidor.
- No hay tests de integración con la base real. Hay unitarios de cálculo y e2e, pero falta una capa
  que pruebe el SQL contra MySQL (que es donde suelen estar los errores de orden de parámetros).
- No hay OpenAPI generado. `API_DOCUMENTACION.md` está escrito a mano y hay que acordarse de
  actualizarlo cuando cambie una ruta.
