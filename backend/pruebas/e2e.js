/* Prueba E2E: produccion por producto, campo mia, aislamiento y cascadas.
   Corre solo contra la API local y borra por correo exacto lo que crea.

   Como se ejecuta:  npm run test:e2e
   (con la API ya corriendo en el puerto 3002: npm run dev en otra terminal)

   IMPORTANTE: esta prueba registra usuarios con correos unicos y los borra al
   terminar. No toca datos de otros usuarios. Aun asi, no la corras contra una
   base de produccion.

   OJO: la API no envuelve las respuestas. /api() del frontend llama "datos" al
   body parseado, pero el backend manda el objeto o el array directo.

   Las aserciones de conteo (precios, filtrados) son relativas al estado de
   partida, porque la base puede tener datos de pruebas anteriores. */

const fs = require("fs");
const path = require("path");
const API = "http://localhost:3002";
const sello = Date.now();
const correoA = "e2e" + sello + "@test.com";
const correoB = "e2e" + sello + "b@test.com";

const envTxt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const pass = (envTxt.match(/^DB_PASSWORD=(.*)$/m) || [])[1].trim();

let ok = 0, fallos = 0;
const chequear = (nombre, cond, extra) => {
  if (cond) { ok++; console.log("  OK    " + nombre); }
  else { fallos++; console.log("  FALLA " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
};

// Normaliza: si vino {datos: X} lo desenvuelve, si vino X plano lo deja igual.
const arr  = d => Array.isArray(d) ? d : (d && Array.isArray(d.datos) ? d.datos : []);
const obj  = d => (d && d.datos && !Array.isArray(d.datos) && typeof d.datos === "object") ? d.datos : (d || {});

async function llamar(metodo, ruta, cuerpo, token) {
  const cab = { "Content-Type": "application/json" };
  if (token) cab.Authorization = "Bearer " + token;
  const r = await fetch(API + ruta, {
    method: metodo, headers: cab,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  let datos = null;
  try { datos = await r.json(); } catch { datos = null; }
  return { status: r.status, datos };
}

(async () => {
  console.log("\n=== E2E produccion + mia ===");

  const a = await llamar("POST", "/registro", { nombre: "E2E A", correo: correoA, contrasena: "clave123" });
  const b = await llamar("POST", "/registro", { nombre: "E2E B", correo: correoB, contrasena: "clave123" });
  chequear("Registro usuario A (201)", a.status === 201, a);
  chequear("Registro usuario B (201)", b.status === 201, b);
  chequear("Registro devuelve id_usuario", Number(a.datos.id_usuario) > 0, a.datos);

  const la = await llamar("POST", "/login", { correo: correoA, contrasena: "clave123" });
  const lb = await llamar("POST", "/login", { correo: correoB, contrasena: "clave123" });
  chequear("Login A", la.status === 200 && !!la.datos.token, la);
  chequear("Login B", lb.status === 200 && !!lb.datos.token, lb);
  const tokenA = la.datos.token, tokenB = lb.datos.token;

  const dup = await llamar("POST", "/registro", { nombre: "X", correo: correoA, contrasena: "clave123" });
  chequear("Correo duplicado da 409", dup.status === 409, dup);

  // Estado de partida de los listados globales, para comparar despues.
  const preciosAntes = arr((await llamar("GET", "/precios", null, tokenA)).datos).length;
  const pubsAntes = arr((await llamar("GET", "/publicaciones", null, tokenA)).datos).length;
  console.log("  (listados globales al inicio: " + preciosAntes + " precios, " + pubsAntes + " publicaciones)");

  console.log("\n-- Parcela --");
  const pa = await llamar("POST", "/parcelas",
    { nombre_parcela: "E2E Lote", ubicacion: "Cumana", tamano: 3, produccion_quintales: 300 }, tokenA);
  chequear("Crear parcela", pa.status === 201, pa);
  const idParcela = pa.datos.id_parcela;
  chequear("Devuelve id_parcela", Number(idParcela) > 0, pa.datos);

  console.log("\n-- Produccion por producto --");
  const pMaiz = await llamar("POST", "/parcelas/" + idParcela + "/produccion",
    { id_producto: 1, produccion: 100, ciclo: "actual" }, tokenA);
  chequear("Maiz 100 quintales crea (201)", pMaiz.status === 201, pMaiz);
  chequear("Respuesta trae unidad", pMaiz.datos.unidad === "quintal", pMaiz.datos);

  const pTomate = await llamar("POST", "/parcelas/" + idParcela + "/produccion",
    { id_producto: 5, produccion: 200, ciclo: "actual" }, tokenA);
  chequear("Tomate 200 cajas crea (201)", pTomate.status === 201, pTomate);
  chequear("Unidad del tomate es caja", pTomate.datos.unidad === "caja", pTomate.datos);

  const pMaiz2 = await llamar("POST", "/parcelas/" + idParcela + "/produccion",
    { id_producto: 1, produccion: 140, ciclo: "actual" }, tokenA);
  chequear("Repetir mismo ciclo actualiza (200)", pMaiz2.status === 200, pMaiz2);
  chequear("Mensaje dice actualizada", /actualiz/i.test(pMaiz2.datos.mensaje || ""), pMaiz2.datos);

  const pOtro = await llamar("POST", "/parcelas/" + idParcela + "/produccion",
    { id_producto: 1, produccion: 60, ciclo: "siembra-2" }, tokenA);
  chequear("Ciclo distinto crea otra fila (201)", pOtro.status === 201, pOtro);

  const listo = await llamar("GET", "/parcelas/" + idParcela + "/produccion", null, tokenA);
  chequear("GET produccion: 3 filas", arr(listo.datos).length === 3, arr(listo.datos));

  const malo = await llamar("POST", "/parcelas/" + idParcela + "/produccion", { id_producto: 1, produccion: -5 }, tokenA);
  chequear("Produccion negativa rechazada (400)", malo.status === 400, malo);
  const cero = await llamar("POST", "/parcelas/" + idParcela + "/produccion", { id_producto: 1, produccion: 0 }, tokenA);
  chequear("Produccion cero rechazada (400)", cero.status === 400, cero);
  const sinProd = await llamar("POST", "/parcelas/" + idParcela + "/produccion", { produccion: 10 }, tokenA);
  chequear("Produccion sin producto rechazada (400)", sinProd.status === 400, sinProd);
  const prodX = await llamar("POST", "/parcelas/" + idParcela + "/produccion", { id_producto: 99999, produccion: 10 }, tokenA);
  chequear("Producto inexistente rechazado (404)", prodX.status === 404, prodX);
  const parcX = await llamar("POST", "/parcelas/99999/produccion", { id_producto: 1, produccion: 10 }, tokenA);
  chequear("Parcela inexistente rechazada (404)", parcX.status === 404, parcX);

  console.log("\n-- Calculos por producto --");
  await llamar("POST", "/costos", { id_parcela: idParcela, id_producto: 1, tipo_costo: "Abono", monto: 150, fecha: "2026-01-15" }, tokenA);
  await llamar("POST", "/costos", { id_parcela: idParcela, id_producto: 5, tipo_costo: "Abono", monto: 200, fecha: "2026-01-15" }, tokenA);
  await llamar("POST", "/precios", { id_producto: 1, id_canal: 1, fecha: "2026-01-20", precio_venta_quintal: 30 }, tokenA);

  const cqM = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal?id_producto=1", null, tokenA);
  // Maiz quedo con 140 (ciclo actual) + 60 (ciclo siembra-2) = 200 quintales.
  // Costo 150 / 200 = 0.75
  chequear("costo por unidad maiz = 0.75", Number(obj(cqM.datos).costo_quintal) === 0.75, obj(cqM.datos));
  chequear("produccion maiz suma ciclos = 200", Number(obj(cqM.datos).produccion) === 200, obj(cqM.datos));
  chequear("origen = por_producto", obj(cqM.datos).origen_produccion === "por_producto", obj(cqM.datos));
  chequear("unidad maiz = quintal", obj(cqM.datos).unidad === "quintal", obj(cqM.datos));
  chequear("costo_total del producto = 150", Number(obj(cqM.datos).costo_total) === 150, obj(cqM.datos));

  const cqT = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal?id_producto=5", null, tokenA);
  chequear("costo por unidad tomate = 1", Number(obj(cqT.datos).costo_quintal) === 1, obj(cqT.datos));
  chequear("unidad tomate = caja", obj(cqT.datos).unidad === "caja", obj(cqT.datos));
  chequear("alias produccion_quintales sigue", obj(cqT.datos).produccion_quintales !== undefined, obj(cqT.datos));

  const cqTodos = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal", null, tokenA);
  chequear("sin filtro usa produccion legada 300", Number(obj(cqTodos.datos).produccion) === 300, obj(cqTodos.datos));
  chequear("sin filtro origen = parcela", obj(cqTodos.datos).origen_produccion === "parcela", obj(cqTodos.datos));
  chequear("sin filtro unidad = quintal", obj(cqTodos.datos).unidad === "quintal", obj(cqTodos.datos));

  const prod5 = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal?id_producto=9", null, tokenA);
  chequear("producto sin produccion cae a parcela", obj(prod5.datos).origen_produccion === "parcela", obj(prod5.datos));
  chequear("producto sin produccion avisa con unidad real", obj(prod5.datos).unidad === "ciento", obj(prod5.datos));

  const pe = await llamar("GET", "/parcelas/" + idParcela + "/punto-equilibrio?id_producto=1", null, tokenA);
  chequear("Punto de equilibrio responde 200", pe.status === 200, pe);
  chequear("PE usa produccion por producto", Number(obj(pe.datos).produccion) === 200, obj(pe.datos));
  chequear("PE trae precio de venta", Number(obj(pe.datos).precio_venta) === 30, obj(pe.datos));
  chequear("PE vale 0 sin costos fijos", Number(obj(pe.datos).punto_equilibrio_unidades) === 0, obj(pe.datos));
  chequear("PE no es null (0 es un valor valido)", obj(pe.datos).punto_equilibrio_unidades !== null, obj(pe.datos));

  // Ahora se agrega un costo fijo para comprobar la formula real del PE.
  await llamar("POST", "/costos", { id_parcela: idParcela, id_producto: 1, tipo_costo: "Mano de obra", monto: 300, fecha: "2026-01-15", es_fijo: true }, tokenA);
  const pe2 = await llamar("GET", "/parcelas/" + idParcela + "/punto-equilibrio?id_producto=1", null, tokenA);
  // fijos 300 / margen (30 - 0.75 = 29.25) = 10.2564...
  chequear("PE con costo fijo = 300/29.25",
    Math.abs(Number(obj(pe2.datos).punto_equilibrio_unidades) - (300 / 29.25)) < 0.01, obj(pe2.datos));
  chequear("PE ahora marca costos fijos 300", Number(obj(pe2.datos).costos_fijos) === 300, obj(pe2.datos));
  chequear("costo variable por unidad = 0.75", Number(obj(pe2.datos).costo_variable_unidad) === 0.75, obj(pe2.datos));
  chequear("margen = 29.25", Number(obj(pe2.datos).margen_contribucion) === 29.25, obj(pe2.datos));
  // El costo por unidad ahora usa 450 de total (150 variable + 300 fijo)
  const cqM2 = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal?id_producto=1", null, tokenA);
  chequear("costo por unidad con fijo = 2.25", Number(obj(cqM2.datos).costo_quintal) === 2.25, obj(cqM2.datos));

  const ct = await llamar("GET", "/parcelas/" + idParcela + "/costo-total", null, tokenA);
  chequear("costo-total de la parcela = 650", Number(obj(ct.datos).costo_total) === 650, obj(ct.datos));

  console.log("\n-- Campo mia en publicaciones --");
  const pub = await llamar("POST", "/publicaciones",
    { id_parcela: idParcela, id_producto: 1, id_canal: 1, cantidad: 100, precio_unitario: 25, fecha: "2026-02-01" }, tokenA);
  chequear("Crear publicacion (201)", pub.status === 201, pub);
  const idPub = pub.datos.id_publicacion;
  chequear("Devuelve id_publicacion", Number(idPub) > 0, pub.datos);

  const pubA = await llamar("GET", "/publicaciones", null, tokenA);
  chequear("GET publicaciones 200", pubA.status === 200, pubA);
  const filaA = arr(pubA.datos).find(x => x.id_publicacion == idPub);
  chequear("Fila del dueno trae campos", !!filaA, arr(pubA.datos));
  chequear("mia = 1 para el dueno", Number(filaA.mia) === 1, filaA);
  chequear("estado inicial = disponible", filaA.estado === "disponible", filaA);
  chequear("trae nombre de parcela", filaA.nombre_parcela === "E2E Lote", filaA);

  const pubB = await llamar("GET", "/publicaciones", null, tokenB);
  const filaB = arr(pubB.datos).find(x => x.id_publicacion == idPub);
  chequear("B ve la oferta en el mercado", !!filaB, arr(pubB.datos));
  chequear("mia = 0 para otro usuario", Number(filaB.mia) === 0, filaB);

  const miasB = await llamar("GET", "/publicaciones?mias=true", null, tokenB);
  chequear("mias=true de B no incluye la de A",
    !arr(miasB.datos).some(x => x.id_publicacion == idPub), arr(miasB.datos));
  const miasA = await llamar("GET", "/publicaciones?mias=true", null, tokenA);
  chequear("mias=true de A si incluye la suya",
    arr(miasA.datos).some(x => x.id_publicacion == idPub), arr(miasA.datos));

  const fProd = await llamar("GET", "/publicaciones?id_producto=1", null, tokenA);
  chequear("filtro por producto trae solo id_producto 1",
    arr(fProd.datos).length > 0 && arr(fProd.datos).every(x => x.id_producto == 1), arr(fProd.datos));
  chequear("filtro por producto incluye la oferta propia",
    arr(fProd.datos).some(x => x.id_publicacion == idPub), arr(fProd.datos));
  const fProd2 = await llamar("GET", "/publicaciones?id_producto=5", null, tokenA);
  chequear("filtro por otro producto excluye la oferta",
    !arr(fProd2.datos).some(x => x.id_publicacion == idPub), arr(fProd2.datos));
  const fVend = await llamar("GET", "/publicaciones?estado=vendido", null, tokenA);
  chequear("filtro por estado devuelve solo vendidos",
    arr(fVend.datos).every(x => x.estado === "vendido"), arr(fVend.datos));
  const fMalo = await llamar("GET", "/publicaciones?estado=inventado", null, tokenA);
  chequear("Estado invalido en filtro da 400", fMalo.status === 400, fMalo);

  console.log("\n-- Estados y permisos --");
  const estadoAjeno = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "vendido" }, tokenB);
  chequear("B no cambia estado ajeno (404)", estadoAjeno.status === 404, estadoAjeno);
  const mal = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "comprado" }, tokenA);
  chequear("Estado invalido rechazado (400)", mal.status === 400, mal);
  const estado = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "vendido" }, tokenA);
  chequear("A cambia su estado", estado.status === 200, estado);
  chequear("estado quedo vendido", (estado.datos.estado) === "vendido", estado.datos);
  const retiro = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "retirado" }, tokenA);
  chequear("Puede retirar", retiro.status === 200 && retiro.datos.estado === "retirado", retiro.datos);

  console.log("\n-- Costos: editar y borrar --");
  const costos = await llamar("GET", "/parcelas/" + idParcela + "/costos", null, tokenA);
  chequear("GET costos devuelve 3", arr(costos.datos).length === 3, arr(costos.datos));
  const idCosto = arr(costos.datos)[0].id_transaccion;
  const put = await llamar("PUT", "/costos/" + idCosto, { monto: 175 }, tokenA);
  chequear("PUT costo 200", put.status === 200, put);
  const tras = await llamar("GET", "/parcelas/" + idParcela + "/costos", null, tokenA);
  chequear("monto quedo en 175", Number(arr(tras.datos).find(c => c.id_transaccion == idCosto).monto) === 175, arr(tras.datos));
  const putMalo = await llamar("PUT", "/costos/" + idCosto, { monto: -1 }, tokenA);
  chequear("Monto negativo rechazado (400)", putMalo.status === 400, putMalo);
  const del = await llamar("DELETE", "/costos/" + idCosto, null, tokenA);
  chequear("DELETE costo 200", del.status === 200, del);
  const tras2 = await llamar("GET", "/parcelas/" + idParcela + "/costos", null, tokenA);
  chequear("Quedaron 2 costos", arr(tras2.datos).length === 2, arr(tras2.datos));

  console.log("\n-- Precios: borrar --");
  const precios = await llamar("GET", "/precios", null, tokenA);
  chequear("GET precios trae el que se registro", arr(precios.datos).length === preciosAntes + 1, arr(precios.datos));
  const idPrecio = arr(precios.datos).find(x => x.id_producto == 1 && Number(x.precio_venta_quintal) === 30).id_precio;
  const precioMalo = await llamar("POST", "/precios", { id_producto: 1, id_canal: 1, fecha: "2026-01-01", precio_venta_quintal: -3 }, tokenA);
  chequear("Precio negativo rechazado (400)", precioMalo.status === 400, precioMalo);
  const delP = await llamar("DELETE", "/precios/" + idPrecio, null, tokenA);
  chequear("DELETE precio 200", delP.status === 200, delP);
  const trasP = await llamar("GET", "/precios", null, tokenA);
  chequear("Volvio al conteo inicial", arr(trasP.datos).length === preciosAntes, arr(trasP.datos));
  chequear("El precio borrado ya no esta", !arr(trasP.datos).some(x => x.id_precio == idPrecio), arr(trasP.datos));

  console.log("\n-- Produccion: borrar --");
  const prod = await llamar("GET", "/parcelas/" + idParcela + "/produccion", null, tokenA);
  const idProd = arr(prod.datos)[0].id_produccion;
  const delProd = await llamar("DELETE", "/produccion/" + idProd, null, tokenB);
  chequear("B no borra produccion ajena (404)", delProd.status === 404, delProd);
  const delProdOk = await llamar("DELETE", "/produccion/" + idProd, null, tokenA);
  chequear("DELETE produccion 200", delProdOk.status === 200, delProdOk);
  const trasProd = await llamar("GET", "/parcelas/" + idParcela + "/produccion", null, tokenA);
  chequear("Quedaron 2 filas", arr(trasProd.datos).length === 2, arr(trasProd.datos));

  console.log("\n-- Aislamiento entre usuarios --");
  const parcB = await llamar("GET", "/parcelas", null, tokenB);
  chequear("B no ve parcelas de A", arr(parcB.datos).length === 0, parcB.datos);
  const parcAjena = await llamar("PUT", "/parcelas/" + idParcela, { nombre_parcela: "hack" }, tokenB);
  chequear("B no edita parcela de A (404)", parcAjena.status === 404, parcAjena);
  const costoAjeno = await llamar("PUT", "/costos/" + arr(tras2.datos)[0].id_transaccion, { monto: 1 }, tokenB);
  chequear("B no edita costo de A (404)", costoAjeno.status === 404, costoAjeno);
  const calAjena = await llamar("GET", "/parcelas/" + idParcela + "/costo-total", null, tokenB);
  chequear("B no calcula costo-total sobre parcela ajena (404)", calAjena.status === 404, calAjena);
  const costosAjena = await llamar("GET", "/parcelas/" + idParcela + "/costos", null, tokenB);
  chequear("B no lista costos de parcela ajena (404)", costosAjena.status === 404, costosAjena);
  const prodAjena = await llamar("GET", "/parcelas/" + idParcela + "/produccion", null, tokenB);
  chequear("B no lista produccion de parcela ajena (404)", prodAjena.status === 404, prodAjena);
  const peAjeno = await llamar("GET", "/parcelas/" + idParcela + "/punto-equilibrio", null, tokenB);
  chequear("B no calcula PE de parcela ajena (404)", peAjeno.status === 404, peAjeno);
  const cqAjena = await llamar("GET", "/parcelas/" + idParcela + "/costo-quintal", null, tokenB);
  chequear("B no calcula costo-unitario de parcela ajena (404)", cqAjena.status === 404, cqAjena);

  console.log("\n-- Sin token --");
  const sinToken = await llamar("GET", "/parcelas");
  chequear("GET parcelas sin token da 401", sinToken.status === 401, sinToken);
  const tokenMalo = await llamar("GET", "/parcelas", null, "abc.def.ghi");
  chequear("Token invalido da 401", tokenMalo.status === 401, tokenMalo);

  console.log("\n-- Catalogo --");
  const prods = await llamar("GET", "/productos", null, tokenA);
  chequear("Catalogo tiene 14 productos", arr(prods.datos).length === 14, arr(prods.datos).length);
  const catsSinTipo = await llamar("GET", "/categorias-costos", null, tokenA);
  chequear("categorias-costos sin ?tipo da 400", catsSinTipo.status === 400, catsSinTipo);
  const catsGranos = await llamar("GET", "/categorias-costos?tipo=granos", null, tokenA);
  chequear("categorias de granos responde", catsGranos.status === 200 && arr(catsGranos.datos).length > 0, arr(catsGranos.datos));
  const catsLeche = await llamar("GET", "/categorias-costos?tipo=lacteos", null, tokenA);
  chequear("categorias de lacteos responde", catsLeche.status === 200 && arr(catsLeche.datos).length > 0, arr(catsLeche.datos));
  const catsX = await llamar("GET", "/categorias-costos?tipo=inexistente", null, tokenA);
  chequear("tipo sin categorias da 404", catsX.status === 404, catsX);
  const canales = await llamar("GET", "/canales", null, tokenA);
  chequear("4 canales de venta", arr(canales.datos).length === 4, arr(canales.datos).length);

  console.log("\n-- Borrado en cascada de la parcela --");
  const delParcela = await llamar("DELETE", "/parcelas/" + idParcela, null, tokenA);
  chequear("DELETE parcela 200", delParcela.status === 200, delParcela);
  const costoHuerfano = await llamar("GET", "/parcelas/" + idParcela + "/costos", null, tokenA);
  chequear("Costos de la parcela borrada dan 404", costoHuerfano.status === 404, costoHuerfano);
  const totalHuerfano = await llamar("GET", "/parcelas/" + idParcela + "/costo-total", null, tokenA);
  chequear("costo-total de la parcela borrada da 404", totalHuerfano.status === 404, totalHuerfano);
  const prodHuerfano = await llamar("GET", "/parcelas/" + idParcela + "/produccion", null, tokenA);
  chequear("Produccion de la parcela borrada da 404", prodHuerfano.status === 404, prodHuerfano);

  console.log("\n-- Limpieza (DELETE usuarios por correo exacto) --");
  const mysql = require("mysql2/promise");
  const cx = await mysql.createConnection({
    host: "localhost", user: "root", password: pass, database: "agronomodigital"
  });
  const sqlContar =
    "SELECT (SELECT COUNT(*) FROM parcelas) parcelas,(SELECT COUNT(*) FROM transacciones_costos) costos," +
    "(SELECT COUNT(*) FROM produccion_parcelas) produccion,(SELECT COUNT(*) FROM publicaciones) publicaciones," +
    "(SELECT COUNT(*) FROM historial_precios) precios,(SELECT COUNT(*) FROM usuarios) usuarios";

  const [antes] = await cx.query(sqlContar);
  console.log("  Antes de limpiar: " + JSON.stringify(antes[0]));

  // Primero se van las publicaciones de las parcelas ya borradas (su parcela es NULL
  // por el ON DELETE SET NULL, asi que la cascada por usuario no las alcanza).
  const [huerf] = await cx.query(
    "DELETE FROM publicaciones WHERE id_usuario IN (SELECT id_usuario FROM usuarios WHERE correo IN (?, ?))",
    [correoA, correoB]
  );
  const [r] = await cx.execute("DELETE FROM usuarios WHERE correo IN (?, ?)", [correoA, correoB]);
  chequear("Publicaciones de prueba borradas (" + huerf.affectedRows + ")", huerf.affectedRows >= 1, huerf);
  chequear("Usuarios de prueba borrados (" + r.affectedRows + ")", r.affectedRows === 2, r);

  const [despues] = await cx.query(sqlContar);
  await cx.end();
  console.log("  Despues de limpiar: " + JSON.stringify(despues[0]));
  const d = despues[0];
  chequear("Sin parcelas huerfanas", Number(d.parcelas) === 0, d);
  chequear("Sin costos huerfanos", Number(d.costos) === 0, d);
  chequear("Sin produccion huerfana", Number(d.produccion) === 0, d);
  chequear("Sin publicaciones huerfanas", Number(d.publicaciones) === 0, d);
  chequear("Sin precios huerfanos", Number(d.precios) === 0, d);

  console.log("\n=== " + ok + " OK / " + fallos + " fallos ===");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("\nEXCEPCION: " + e.message + "\n" + e.stack); process.exit(1); });
