/* Prueba de instalacion limpia.

   Crea una base temporal con el mismo camino que usa un companero: schema.sql,
   catalogos.sql, las migraciones y catalogos_insumos.sql. Revisa la estructura,
   las cascadas y algunas restricciones. Al final borra la base de prueba y no
   toca agronomodigital. */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const BASE = path.join(__dirname, "..");
const envTxt = fs.readFileSync(path.join(BASE, ".env"), "utf8");
const pass = (envTxt.match(/^DB_PASSWORD=(.*)$/m) || [])[1].trim();
const PRUEBA = "agronodigital_instalacion_prueba";

let ok = 0, fallos = 0;
const chequear = (n, c, e) => {
  if (c) { ok++; console.log("  OK    " + n); }
  else { fallos++; console.log("  FALLA " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); }
};

// Quita comentarios de linea antes de partir por ';'. Si se parte primero, un
// comentario con punto y coma deja un fragmento suelto que MySQL rechaza.
const sentencias = (sql) =>
  sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

const soloTablas = (sql) =>
  sentencias(sql).filter((s) => /CREATE TABLE/i.test(s));

const soloInsert = (sql) =>
  sentencias(sql).filter((s) => /INSERT/i.test(s));

(async () => {
  const cx = await mysql.createConnection({ host: "localhost", user: "root", password: pass });

  console.log("\n=== Instalacion limpia ===");
  await cx.query("DROP DATABASE IF EXISTS `" + PRUEBA + "`");
  await cx.query("CREATE DATABASE `" + PRUEBA + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
  await cx.query("USE `" + PRUEBA + "`");

  await cx.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const stmt of soloTablas(fs.readFileSync(path.join(BASE, "schema.sql"), "utf8"))) {
    try { await cx.query(stmt); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  await cx.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("  schema.sql ejecutado");

  for (const stmt of soloInsert(fs.readFileSync(path.join(BASE, "catalogos.sql"), "utf8"))) {
    try { await cx.query(stmt); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  catalogos.sql ejecutado");

  const dirMigraciones = path.join(BASE, "migraciones");
  const archivos = fs.readdirSync(dirMigraciones)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  // La crea el runner de migraciones antes de aplicar la primera.
  await cx.query(
    "CREATE TABLE IF NOT EXISTS migraciones_aplicadas (" +
    "nombre varchar(255) NOT NULL, " +
    "aplicada_en timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
    "PRIMARY KEY (nombre)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
  );

  for (const archivo of archivos) {
    for (const stmt of sentencias(fs.readFileSync(path.join(dirMigraciones, archivo), "utf8"))) {
      try { await cx.query(stmt); }
      catch (e) { console.log("  Migracion " + archivo + " fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
    }
  }
  console.log("  " + archivos.length + " migraciones ejecutadas");

  for (const stmt of soloInsert(fs.readFileSync(path.join(BASE, "catalogos_insumos.sql"), "utf8"))) {
    try { await cx.query(stmt); }
    catch (e) { console.log("  catalogos_insumos.sql fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  catalogos_insumos.sql ejecutado");

  console.log("\n-- Estructura --");
  const [tb] = await cx.query("SHOW TABLES");
  const tablas = tb.map((x) => Object.values(x)[0]).sort();
  const esperadas = [
    "alias_insumos", "canales_venta", "categorias_insumos", "estimaciones",
    "estimaciones_detalle", "fuentes_precio", "historial_precios", "insumos",
    "migraciones_aplicadas", "parcelas", "precios_insumos", "productos",
    "publicaciones", "requerimientos_cultivo", "siembras", "usuarios"
  ].sort();
  chequear("16 tablas creadas", tablas.length === 16, tablas);
  chequear("Tablas esperadas", JSON.stringify(tablas) === JSON.stringify(esperadas), tablas);

  const columnas = async (tabla) => {
    const [r] = await cx.query(
      "SELECT COLUMN_NAME n FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", [PRUEBA, tabla]);
    return r.map((x) => x.n);
  };
  const colParcelas = await columnas("parcelas");
  chequear("parcelas tiene unidad_superficie", colParcelas.includes("unidad_superficie"), colParcelas);
  chequear("parcelas ya no tiene produccion_estimada", !colParcelas.includes("produccion_estimada"), colParcelas);

  const colSiembras = await columnas("siembras");
  chequear("siembras tiene superficie", colSiembras.includes("superficie"), colSiembras);
  chequear("siembras ya no se llama id_produccion", !colSiembras.includes("id_produccion"), colSiembras);

  console.log("\n-- Cascadas --");
  const fk = async (tabla) => {
    const [r] = await cx.query(
      "SELECT rc.CONSTRAINT_NAME n, rc.UPDATE_RULE upd, rc.DELETE_RULE del " +
      "FROM information_schema.REFERENTIAL_CONSTRAINTS rc " +
      "WHERE rc.CONSTRAINT_SCHEMA=? AND rc.TABLE_NAME=?", [PRUEBA, tabla]);
    return r;
  };
  const fp = await fk("parcelas");
  chequear("parcelas.id_usuario CASCADE", fp.some((f) => f.del === "CASCADE"), fp);
  const fs_ = await fk("siembras");
  chequear("siembras.id_parcela CASCADE", fs_.some((f) => f.del === "CASCADE"), fs_);
  chequear("siembras.id_producto RESTRICT", fs_.some((f) => f.del === "RESTRICT"), fs_);
  const fpub = await fk("publicaciones");
  chequear("publicaciones.id_parcela SET NULL", fpub.some((f) => f.del === "SET NULL"), fpub);
  chequear("publicaciones.id_usuario CASCADE", fpub.some((f) => f.del === "CASCADE"), fpub);
  const fest = await fk("estimaciones");
  chequear("estimaciones.id_usuario CASCADE", fest.some((f) => f.del === "CASCADE"), fest);
  chequear("estimaciones.id_fuente RESTRICT", fest.some((f) => f.del === "RESTRICT"), fest);
  const fdet = await fk("estimaciones_detalle");
  chequear("estimaciones_detalle.id_estimacion CASCADE", fdet.some((f) => f.del === "CASCADE"), fdet);

  console.log("\n-- Datos del catalogo --");
  const cuenta = async (t) => { const [r] = await cx.query("SELECT COUNT(*) n FROM " + t); return r[0].n; };
  chequear("14 productos", await cuenta("productos") === 14, await cuenta("productos"));
  chequear("4 canales", await cuenta("canales_venta") === 4, await cuenta("canales_venta"));
  chequear("7 categorias de insumos", await cuenta("categorias_insumos") === 7, await cuenta("categorias_insumos"));
  chequear("19 insumos", await cuenta("insumos") === 19, await cuenta("insumos"));
  chequear("19 precios", await cuenta("precios_insumos") === 19, await cuenta("precios_insumos"));
  chequear("48 requerimientos", await cuenta("requerimientos_cultivo") === 48, await cuenta("requerimientos_cultivo"));

  console.log("\n-- Cascada real --");
  await cx.query("INSERT INTO usuarios (nombre, usuario, correo, contrasena) VALUES ('Prueba','inst','inst@prueba.com','x')");
  const [u] = await cx.query("SELECT id_usuario FROM usuarios WHERE correo='inst@prueba.com'");
  const idU = u[0].id_usuario;
  await cx.query(
    "INSERT INTO parcelas (id_usuario, nombre_parcela, tamano, unidad_superficie) VALUES (?,'Lote',2,'manzana')",
    [idU]);
  const [p] = await cx.query("SELECT id_parcela FROM parcelas WHERE id_usuario=?", [idU]);
  const idP = p[0].id_parcela;
  await cx.query(
    "INSERT INTO siembras (id_parcela, id_producto, ciclo, superficie, unidad_superficie, produccion) " +
    "VALUES (?,1,'actual',2,'manzana',50)", [idP]);
  await cx.query(
    "INSERT INTO publicaciones (id_usuario,id_parcela,id_producto,id_canal,cantidad,precio_unitario,fecha) " +
    "VALUES (?,?,1,1,10,5,'2026-01-01')", [idU, idP]);
  await cx.query(
    "INSERT INTO estimaciones (id_usuario,id_producto,id_fuente,superficie,unidad_superficie,superficie_ha,total_estimado) " +
    "VALUES (?,1,1,2,'manzana',1.3978,100)", [idU]);
  const [e] = await cx.query("SELECT id_estimacion FROM estimaciones WHERE id_usuario=?", [idU]);
  await cx.query(
    "INSERT INTO estimaciones_detalle (id_estimacion,id_insumo,unidad_base,cantidad,precio_unitario,subtotal) " +
    "VALUES (?,1,'kg',10,2.5,25)", [e[0].id_estimacion]);

  chequear("Todo insertado",
    (await cuenta("parcelas")) === 1 && (await cuenta("siembras")) === 1 &&
    (await cuenta("publicaciones")) === 1 && (await cuenta("estimaciones")) === 1);

  await cx.query("DELETE FROM usuarios WHERE id_usuario=?", [idU]);
  chequear("Cascada: parcela eliminada", await cuenta("parcelas") === 0, await cuenta("parcelas"));
  chequear("Cascada: siembra eliminada", await cuenta("siembras") === 0, await cuenta("siembras"));
  chequear("Cascada: publicacion eliminada", await cuenta("publicaciones") === 0, await cuenta("publicaciones"));
  chequear("Cascada: estimacion eliminada", await cuenta("estimaciones") === 0, await cuenta("estimaciones"));
  chequear("Cascada: detalle eliminado", await cuenta("estimaciones_detalle") === 0, await cuenta("estimaciones_detalle"));

  console.log("\n-- Restricciones --");
  await cx.query("INSERT INTO usuarios (nombre, usuario, correo, contrasena) VALUES ('Prueba2','inst2','inst2@prueba.com','x')");
  const [u2] = await cx.query("SELECT id_usuario FROM usuarios WHERE correo='inst2@prueba.com'");
  await cx.query("INSERT INTO parcelas (id_usuario, nombre_parcela) VALUES (?,'Lote2')", [u2[0].id_usuario]);

  let bloqueada = false;
  try { await cx.query("INSERT INTO siembras (id_parcela,id_producto,produccion) VALUES (99999,1,5)"); }
  catch { bloqueada = true; }
  chequear("No acepta parcela inexistente", bloqueada);

  let repetida = false;
  await cx.query("INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',10)");
  try { await cx.query("INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',20)"); }
  catch { repetida = true; }
  chequear("No repite parcela+producto+ciclo", repetida);

  const otroCiclo = await cx.query(
    "INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'siembra-2',20)");
  chequear("Si admite otro ciclo del mismo producto", otroCiclo[0].affectedRows === 1);

  await cx.query("DROP DATABASE `" + PRUEBA + "`");
  console.log("\n  (base de prueba eliminada; agronomodigital intacta)");
  console.log("\n=== " + ok + " OK / " + fallos + " fallos ===");
  await cx.end();
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("EXCEPCION: " + e.message); process.exit(1); });
