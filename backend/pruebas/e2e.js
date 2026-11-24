/* Prueba E2E contra la API local.

   Cubre registro y login, parcelas, siembras, estimaciones de insumos, mercado,
   precios, permisos entre dos usuarios y borrado en cascada.

   Como se ejecuta:  npm test
   (con la API corriendo en el puerto 3002)

   Registra usuarios con correos unicos y los borra al terminar. No toca datos de
   otros usuarios. */

const fs = require("fs");
const path = require("path");
const API = "http://localhost:3002";
const sello = Date.now();
const correoA = "e2e" + sello + "@test.com";
const correoB = "e2e" + sello + "b@test.com";
const usuarioA = "e2e" + sello;
const usuarioB = "e2e" + sello + "b";

const envTxt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const pass = (envTxt.match(/^DB_PASSWORD=(.*)$/m) || [])[1].trim();

let ok = 0, fallos = 0;
const chequear = (nombre, cond, extra) => {
  if (cond) { ok++; console.log("  OK    " + nombre); }
  else { fallos++; console.log("  FALLA " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
};

const lista = (d) => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.publicaciones)) return d.publicaciones;
  if (Array.isArray(d?.precios)) return d.precios;
  if (Array.isArray(d?.estimaciones)) return d.estimaciones;
  return [];
};

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
  console.log("\n=== E2E AgronoDigital ===");

  console.log("\n-- Registro y login --");
  const a = await llamar("POST", "/registro", { usuario: usuarioA, nombre: "E2E A", correo: correoA, contrasena: "clave12345" });
  const b = await llamar("POST", "/registro", { usuario: usuarioB, nombre: "E2E B", correo: correoB, contrasena: "clave12345" });
  chequear("Registro usuario A (201)", a.status === 201, a);
  chequear("Registro usuario B (201)", b.status === 201, b);
  chequear("Devuelve id_usuario", Number(a.datos.id_usuario) > 0, a.datos);
  chequear("Devuelve el usuario", a.datos.usuario === usuarioA, a.datos);

  const la = await llamar("POST", "/login", { correo: correoA, contrasena: "clave12345" });
  const lb = await llamar("POST", "/login", { usuario: usuarioB, contrasena: "clave12345" });
  chequear("Login A por correo", la.status === 200 && !!la.datos.token, la);
  chequear("Login B por usuario", lb.status === 200 && !!lb.datos.token, lb);
  const tokenA = la.datos.token, tokenB = lb.datos.token;
  const idA = a.datos.id_usuario;

  const dupCorreo = await llamar("POST", "/registro", { usuario: "otro" + sello, nombre: "XX", correo: correoA, contrasena: "clave12345" });
  chequear("Correo duplicado da 409", dupCorreo.status === 409, dupCorreo);
  const dupUsuario = await llamar("POST", "/registro", { usuario: usuarioA, nombre: "XX", correo: "otro" + sello + "@test.com", contrasena: "clave12345" });
  chequear("Usuario duplicado da 409", dupUsuario.status === 409, dupUsuario);

  console.log("\n-- Parcela --");
  const pa = await llamar("POST", "/parcelas",
    { nombre_parcela: "E2E Lote", ubicacion: "Prueba", tamano: 5, unidad_superficie: "manzana" }, tokenA);
  chequear("Crear parcela (201)", pa.status === 201, pa);
  const idParcela = pa.datos.id_parcela;
  chequear("Devuelve id_parcela", Number(idParcela) > 0, pa.datos);

  const parcela = await llamar("GET", "/parcelas/" + idParcela, null, tokenA);
  chequear("Parcela trae la unidad", parcela.datos.unidad_superficie === "manzana", parcela.datos);

  console.log("\n-- Siembras --");
  const sMaiz = await llamar("POST", "/parcelas/" + idParcela + "/siembras",
    { id_producto: 1, produccion: 100, ciclo: "actual", superficie: 3, unidad_superficie: "manzana" }, tokenA);
  chequear("Maiz 100 quintales crea (201)", sMaiz.status === 201, sMaiz);
  chequear("Respuesta trae unidad", sMaiz.datos.unidad === "quintal", sMaiz.datos);

  const sFrijol = await llamar("POST", "/parcelas/" + idParcela + "/siembras",
    { id_producto: 3, produccion: 40, ciclo: "actual", superficie: 2, unidad_superficie: "manzana" }, tokenA);
  chequear("Frijol 40 quintales crea (201)", sFrijol.status === 201, sFrijol);

  const sMaiz2 = await llamar("POST", "/parcelas/" + idParcela + "/siembras",
    { id_producto: 1, produccion: 120, ciclo: "actual", superficie: 3, unidad_superficie: "manzana" }, tokenA);
  chequear("Repetir mismo ciclo actualiza (200)", sMaiz2.status === 200, sMaiz2);
  chequear("Mensaje dice actualizada", /actualiz/i.test(sMaiz2.datos.mensaje || ""), sMaiz2.datos);

  const sOtro = await llamar("POST", "/parcelas/" + idParcela + "/siembras",
    { id_producto: 1, produccion: 60, ciclo: "siembra-2", superficie: 1, unidad_superficie: "manzana" }, tokenA);
  chequear("Ciclo distinto crea otra fila (201)", sOtro.status === 201, sOtro);

  const ls = await llamar("GET", "/parcelas/" + idParcela + "/siembras", null, tokenA);
  chequear("GET siembras: 3 filas", lista(ls.datos).length === 3, lista(ls.datos));

  const fMaiz = await llamar("GET", "/parcelas/" + idParcela + "/siembras?id_producto=1", null, tokenA);
  chequear("Filtro por producto", lista(fMaiz.datos).length === 2, lista(fMaiz.datos));

  const negativa = await llamar("POST", "/parcelas/" + idParcela + "/siembras", { id_producto: 1, produccion: -5 }, tokenA);
  chequear("Produccion negativa rechazada (400)", negativa.status === 400, negativa);
  const sinProducto = await llamar("POST", "/parcelas/" + idParcela + "/siembras", { produccion: 10 }, tokenA);
  chequear("Siembra sin producto rechazada (400)", sinProducto.status === 400, sinProducto);
  const prodX = await llamar("POST", "/parcelas/" + idParcela + "/siembras", { id_producto: 99999, produccion: 10 }, tokenA);
  chequear("Producto inexistente rechazado (404)", prodX.status === 404, prodX);
  const parcX = await llamar("POST", "/parcelas/99999/siembras", { id_producto: 1, produccion: 10 }, tokenA);
  chequear("Parcela inexistente rechazada (404)", parcX.status === 404, parcX);

  console.log("\n-- Estimacion de insumos --");
  const fuentes = await llamar("GET", "/fuentes-precio", null, tokenA);
  chequear("GET fuentes-precio", fuentes.status === 200 && lista(fuentes.datos).length >= 1, fuentes);
  const idFuente = lista(fuentes.datos)[0].id_fuente;

  const insumos = await llamar("GET", "/insumos", null, tokenA);
  chequear("GET insumos", insumos.status === 200 && lista(insumos.datos).length === 19, lista(insumos.datos).length);
  const categorias = await llamar("GET", "/categorias-insumos", null, tokenA);
  chequear("GET categorias de insumos", lista(categorias.datos).length === 7, lista(categorias.datos).length);
  const receta = await llamar("GET", "/productos/1/requerimientos", null, tokenA);
  chequear("GET receta del maiz", lista(receta.datos).length > 0, lista(receta.datos).length);

  const est = await llamar("POST", "/estimaciones",
    { id_producto: 1, superficie: 3, unidad_superficie: "manzana", id_fuente: idFuente }, tokenA);
  chequear("Crear estimacion (201)", est.status === 201, est);
  chequear("Total mayor que cero", Number(est.datos.total_estimado) > 0, est.datos);
  chequear("Convierte manzanas a hectareas", Math.abs(Number(est.datos.superficie_ha) - 2.0967) < 0.01, est.datos.superficie_ha);
  chequear("Trae el desglose", Array.isArray(est.datos.detalle) && est.datos.detalle.length > 0, est.datos.detalle);
  chequear("Avisa que los datos son de ejemplo", est.datos.datos_ejemplo === true, est.datos);
  const idEstimacion = est.datos.id_estimacion;

  const sinReceta = await llamar("POST", "/estimaciones", { id_producto: 12, superficie: 1, id_fuente: idFuente }, tokenA);
  chequear("Cultivo sin receta da 409", sinReceta.status === 409, sinReceta);
  const supCero = await llamar("POST", "/estimaciones", { id_producto: 1, superficie: 0, id_fuente: idFuente }, tokenA);
  chequear("Superficie cero da 400", supCero.status === 400, supCero);
  const fuenteMala = await llamar("POST", "/estimaciones", { id_producto: 1, superficie: 1, id_fuente: 99999 }, tokenA);
  chequear("Fuente inexistente da 404", fuenteMala.status === 404, fuenteMala);

  const hist = await llamar("GET", "/estimaciones", null, tokenA);
  chequear("Historial trae la estimacion", hist.datos.total === 1, hist.datos);
  const detalle = await llamar("GET", "/estimaciones/" + idEstimacion, null, tokenA);
  chequear("Detalle de la estimacion", detalle.status === 200 && detalle.datos.detalle.length > 0, detalle);
  chequear("Detalle avisa datos de ejemplo", detalle.datos.datos_ejemplo === true, detalle.datos);
  const detalleAjeno = await llamar("GET", "/estimaciones/" + idEstimacion, null, tokenB);
  chequear("B no ve la estimacion de A (404)", detalleAjeno.status === 404, detalleAjeno);

  console.log("\n-- Mercado --");
  const pub = await llamar("POST", "/publicaciones",
    { id_parcela: idParcela, id_producto: 1, id_canal: 1, cantidad: 60, precio_unitario: 25, fecha: "2026-02-01" }, tokenA);
  chequear("Crear publicacion (201)", pub.status === 201, pub);
  const idPub = pub.datos.id_publicacion;

  const pubA = await llamar("GET", "/publicaciones", null, tokenA);
  const filaA = lista(pubA.datos).find((x) => x.id_publicacion == idPub);
  chequear("La publicacion aparece en el listado", !!filaA, lista(pubA.datos));
  chequear("mia = 1 para el dueno", Number(filaA.mia) === 1, filaA);
  chequear("estado inicial disponible", filaA.estado === "disponible", filaA);
  chequear("Trae el nombre de la parcela", filaA.nombre_parcela === "E2E Lote", filaA);

  const pubB = await llamar("GET", "/publicaciones", null, tokenB);
  const filaB = lista(pubB.datos).find((x) => x.id_publicacion == idPub);
  chequear("B ve la oferta", !!filaB, lista(pubB.datos));
  chequear("mia = 0 para otro usuario", Number(filaB.mia) === 0, filaB);

  const miasB = await llamar("GET", "/publicaciones?mias=true", null, tokenB);
  chequear("mias=true de B no incluye la de A", !lista(miasB.datos).some((x) => x.id_publicacion == idPub), lista(miasB.datos));
  const miasA = await llamar("GET", "/publicaciones?mias=true", null, tokenA);
  chequear("mias=true de A si incluye la suya", lista(miasA.datos).some((x) => x.id_publicacion == idPub), lista(miasA.datos));

  const fProd = await llamar("GET", "/publicaciones?id_producto=1", null, tokenA);
  chequear("Filtro por producto", lista(fProd.datos).every((x) => x.id_producto == 1), lista(fProd.datos));
  const fMalo = await llamar("GET", "/publicaciones?estado=inventado", null, tokenA);
  chequear("Estado invalido da 400", fMalo.status === 400, fMalo);

  const exceso = await llamar("POST", "/publicaciones",
    { id_parcela: idParcela, id_producto: 1, id_canal: 1, cantidad: 500, precio_unitario: 25, fecha: "2026-02-01" }, tokenA);
  chequear("No publica mas de lo producido (409)", exceso.status === 409, exceso);

  const estadoAjeno = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "vendido" }, tokenB);
  chequear("B no cambia estado ajeno (404)", estadoAjeno.status === 404, estadoAjeno);

  const estado = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "vendido" }, tokenA);
  chequear("A marca vendido (200)", estado.status === 200 && estado.datos.estado === "vendido", estado);
  const reabrir = await llamar("PUT", "/publicaciones/" + idPub + "/estado", { estado: "retirado" }, tokenA);
  chequear("Vendido es estado final (409)", reabrir.status === 409, reabrir);

  console.log("\n-- Precios de venta --");
  const preciosAntes = lista((await llamar("GET", "/precios", null, tokenA)).datos).length;
  await llamar("POST", "/precios", { id_producto: 1, id_canal: 1, fecha: "2026-01-20", precio_venta_quintal: 30 }, tokenA);
  const precios = await llamar("GET", "/precios", null, tokenA);
  chequear("GET precios trae el nuevo", lista(precios.datos).length === preciosAntes + 1, lista(precios.datos));
  const idPrecio = lista(precios.datos).find((x) => x.id_producto == 1 && Number(x.precio_venta_quintal) === 30).id_precio;
  const precioMalo = await llamar("POST", "/precios", { id_producto: 1, id_canal: 1, fecha: "2026-01-01", precio_venta_quintal: -3 }, tokenA);
  chequear("Precio negativo da 400", precioMalo.status === 400, precioMalo);
  const delP = await llamar("DELETE", "/precios/" + idPrecio, null, tokenA);
  chequear("DELETE precio 200", delP.status === 200, delP);
  const trasP = await llamar("GET", "/precios", null, tokenA);
  chequear("Volvio al conteo inicial", lista(trasP.datos).length === preciosAntes, lista(trasP.datos));

  console.log("\n-- Aislamiento entre usuarios --");
  const parcB = await llamar("GET", "/parcelas", null, tokenB);
  chequear("B no ve parcelas de A", lista(parcB.datos).length === 0, parcB.datos);
  const editAjena = await llamar("PUT", "/parcelas/" + idParcela, { nombre_parcela: "hack" }, tokenB);
  chequear("B no edita parcela de A (404)", editAjena.status === 404, editAjena);
  const siembraAjena = await llamar("GET", "/parcelas/" + idParcela + "/siembras", null, tokenB);
  chequear("B no lista siembras de A (404)", siembraAjena.status === 404, siembraAjena);

  console.log("\n-- Sin token --");
  const sinToken = await llamar("GET", "/parcelas");
  chequear("GET parcelas sin token da 401", sinToken.status === 401, sinToken);
  const tokenMalo = await llamar("GET", "/parcelas", null, "abc.def.ghi");
  chequear("Token invalido da 401", tokenMalo.status === 401, tokenMalo);

  console.log("\n-- Catalogo --");
  const prods = await llamar("GET", "/productos", null, tokenA);
  chequear("14 productos", lista(prods.datos).length === 14, lista(prods.datos).length);
  const canales = await llamar("GET", "/canales", null, tokenA);
  chequear("4 canales", lista(canales.datos).length === 4, lista(canales.datos).length);

  console.log("\n-- Borrado en cascada --");
  const delParcela = await llamar("DELETE", "/parcelas/" + idParcela, null, tokenA);
  chequear("DELETE parcela 200", delParcela.status === 200, delParcela);
  const siembrasHuerfanas = await llamar("GET", "/parcelas/" + idParcela + "/siembras", null, tokenA);
  chequear("Siembras de la parcela borrada dan 404", siembrasHuerfanas.status === 404, siembrasHuerfanas);
  const pubTrasBorrar = await llamar("GET", "/publicaciones?mias=true", null, tokenA);
  const filaHuerfana = lista(pubTrasBorrar.datos).find((x) => x.id_publicacion == idPub);
  chequear("La publicacion sobrevive con parcela null", !!filaHuerfana && filaHuerfana.id_parcela === null, filaHuerfana);

  console.log("\n-- Limpieza --");
  const mysql = require("mysql2/promise");
  const cx = await mysql.createConnection({ host: "localhost", user: "root", password: pass, database: "agronomodigital" });
  const [r] = await cx.execute("DELETE FROM usuarios WHERE correo IN (?, ?)", [correoA, correoB]);
  chequear("Usuarios de prueba borrados", r.affectedRows === 2, r);

  const contar = async (tabla, columna = "id_usuario") => {
    const [x] = await cx.query("SELECT COUNT(*) n FROM " + tabla + " WHERE " + columna + " IN (?, ?)", [idA, b.datos.id_usuario]);
    return Number(x[0].n);
  };
  chequear("Sin parcelas de prueba", await contar("parcelas") === 0);
  chequear("Sin estimaciones de prueba", await contar("estimaciones") === 0);
  chequear("Sin publicaciones de prueba", await contar("publicaciones") === 0);
  chequear("Sin precios de prueba (global)", lista(trasP.datos).length === preciosAntes);
  await cx.end();

  console.log("\n=== " + ok + " OK / " + fallos + " fallos ===");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("\nEXCEPCION: " + e.message + "\n" + e.stack); process.exit(1); });
