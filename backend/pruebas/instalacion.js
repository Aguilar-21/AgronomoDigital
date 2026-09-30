/* Prueba de instalacion limpia: crea la base desde schema.sql + catalogos.sql
   en un esquema NUEVO y revisa que queden las 9 tablas y con las cascadas bien.
   Al final borra ese esquema, sin tocar agronomodigital. */

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

(async () => {
  const cx = await mysql.createConnection({ host:"localhost", user:"root", password:pass });

  console.log("\n=== Instalacion limpia desde schema.sql ===");
  await cx.query("DROP DATABASE IF EXISTS `" + PRUEBA + "`");
  await cx.query("CREATE DATABASE `" + PRUEBA + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
  await cx.query("USE `" + PRUEBA + "`");

  // schema.sql viene de un mysqldump, que crea las tablas en orden alfabetico y
  // apaga la verificacion de claves mientras tanto (linea 14 del propio archivo).
  // Sin esto, historial_precios se crearia antes que productos y MySQL fallaria
  // al no encontrar la tabla referenciada.
  await cx.query("SET FOREIGN_KEY_CHECKS = 0");

  // 1) schema.sql completo
  const schema = fs.readFileSync(path.join(BASE, "schema.sql"), "utf8");
  for (const stmt of schema.split(/;\s*\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/^\/\*!\d+ SET|^\/\*!\d+ SET SQL|^\/\*!\d+ SET CHARACTER|^\/\*!\d+ SET COLLATION|^\/\*!\d+ SET TIME_ZONE|^\/\*!\d+ SET NAMES|^\/\*!\d+ SET @OLD/i.test(stmt)) continue;
    if (/^--/.test(stmt) && !/^-- /.test(stmt)) continue;
    if (!/CREATE TABLE|ALTER TABLE/i.test(stmt)) continue;
    try { await cx.query(stmt.replace(/;$/, "")); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    stmt: " + stmt.slice(0, 90)); process.exit(1); }
  }
  await cx.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log("  schema.sql ejecutado");

  // 2) catalogos.sql
  const cat = fs.readFileSync(path.join(BASE, "catalogos.sql"), "utf8");
  for (const stmt of cat.split(/;\s*\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (!/INSERT/i.test(stmt)) continue;
    try { await cx.query(stmt.replace(/;$/, "")); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    stmt: " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  catalogos.sql ejecutado");

  console.log("\n-- Estructura --");
  const [tb] = await cx.query("SHOW TABLES");
  const tablas = tb.map(x => Object.values(x)[0]).sort();
  const esperadas = ["canales_venta","categorias_costos","historial_precios","parcelas",
    "produccion_parcelas","productos","publicaciones","transacciones_costos","usuarios"];
  console.log("  " + tablas.join(", "));
  chequear("9 tablas creadas", tablas.length === 9, tablas);
  chequear("produccion_parcelas existe", tablas.includes("produccion_parcelas"), tablas);
  chequear("Mismas tablas que la base viva", JSON.stringify(tablas) === JSON.stringify(esperadas), tablas);

  console.log("\n-- Cascadas --");
  const fk = async (tabla) => {
    const [r] = await cx.query(
      "SELECT rc.CONSTRAINT_NAME AS n, rc.UPDATE_RULE AS upd, rc.DELETE_RULE AS del " +
      "FROM information_schema.REFERENTIAL_CONSTRAINTS rc " +
      "WHERE rc.CONSTRAINT_SCHEMA=? AND rc.TABLE_NAME=?", [PRUEBA, tabla]);
    return r;
  };
  const fp = await fk("parcelas");
  chequear("parcelas.id_usuario ON DELETE CASCADE",
    fp.some(f => f.del === "CASCADE" && f.upd === "CASCADE"), fp);
  const fpr = await fk("produccion_parcelas");
  chequear("produccion_parcelas.id_parcela ON DELETE CASCADE",
    fpr.some(f => f.del === "CASCADE"), fpr);
  chequear("produccion_parcelas.id_producto ON DELETE RESTRICT",
    fpr.some(f => f.del === "RESTRICT"), fpr);
  const ftc = await fk("transacciones_costos");
  chequear("transacciones_costos.id_parcela ON DELETE CASCADE",
    ftc.some(f => f.del === "CASCADE"), ftc);
  const fpu = await fk("publicaciones");
  chequear("publicaciones.id_usuario ON DELETE CASCADE",
    fpu.some(f => f.del === "CASCADE"), fpu);
  chequear("publicaciones.id_parcela ON DELETE SET NULL",
    fpu.some(f => f.del === "SET NULL"), fpu);

  console.log("\n-- Datos del catalogo --");
  const cuenta = async (t) => { const [r] = await cx.query("SELECT COUNT(*) n FROM " + t); return r[0].n; };
  chequear("14 productos", await cuenta("productos") === 14, await cuenta("productos"));
  chequear("25 categorias", await cuenta("categorias_costos") === 25, await cuenta("categorias_costos"));
  chequear("4 canales", await cuenta("canales_venta") === 4, await cuenta("canales_venta"));

  console.log("\n-- Cascada real de extremo a extremo --");
  await cx.query("INSERT INTO usuarios (nombre, correo, contrasena) VALUES ('Prueba','inst@prueba.com','x')");
  const [u] = await cx.query("SELECT id_usuario FROM usuarios WHERE correo='inst@prueba.com'");
  const idU = u[0].id_usuario;
  await cx.query("INSERT INTO parcelas (id_usuario, nombre_parcela, tamano, produccion_quintales) VALUES (?,'Lote',2,100)", [idU]);
  const [p] = await cx.query("SELECT id_parcela FROM parcelas WHERE id_usuario=?", [idU]);
  const idP = p[0].id_parcela;
  await cx.query("INSERT INTO produccion_parcelas (id_parcela, id_producto, produccion) VALUES (?,1,50)", [idP]);
  await cx.query("INSERT INTO transacciones_costos (id_parcela, id_producto, tipo_costo, monto, fecha) VALUES (?,1,'Abono',10,'2026-01-01')", [idP]);
  await cx.query("INSERT INTO publicaciones (id_usuario,id_parcela,id_producto,id_canal,cantidad,precio_unitario,fecha) VALUES (?,?,1,1,10,5,'2026-01-01')", [idU, idP]);
  chequear("Todo insertado", (await cuenta("parcelas")) === 1 && (await cuenta("produccion_parcelas")) === 1);

  await cx.query("DELETE FROM usuarios WHERE id_usuario=?", [idU]);
  chequear("Cascada: parcela eliminada", await cuenta("parcelas") === 0, await cuenta("parcelas"));
  chequear("Cascada: produccion eliminada", await cuenta("produccion_parcelas") === 0, await cuenta("produccion_parcelas"));
  chequear("Cascada: costos eliminados", await cuenta("transacciones_costos") === 0, await cuenta("transacciones_costos"));
  chequear("Cascada: publicaciones eliminadas", await cuenta("publicaciones") === 0, await cuenta("publicaciones"));

  console.log("\n-- Restricciones activas --");
  let bloqueada = false;
  try { await cx.query("INSERT INTO produccion_parcelas (id_parcela, id_producto, produccion) VALUES (99999,1,5)"); }
  catch (e) { bloqueada = true; }
  chequear("No acepta parcela inexistente", bloqueada);
  let malCiclo = false;
  await cx.query("INSERT INTO usuarios (nombre, correo, contrasena) VALUES ('Prueba2','inst2@prueba.com','x')");
  const [u2] = await cx.query("SELECT id_usuario FROM usuarios WHERE correo='inst2@prueba.com'");
  const idU2 = u2[0].id_usuario;
  await cx.query("INSERT INTO parcelas (id_usuario, nombre_parcela) VALUES (?,'Lote2')", [idU2]);
  await cx.query("INSERT INTO produccion_parcelas (id_parcela, id_producto, ciclo, produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',10)");
  try { await cx.query("INSERT INTO produccion_parcelas (id_parcela, id_producto, ciclo, produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',20)"); }
  catch (e) { malCiclo = true; }
  chequear("No repite parcela+producto+ciclo", malCiclo);

  const otroCiclo = await cx.query(
    "INSERT INTO produccion_parcelas (id_parcela, id_producto, ciclo, produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'siembra-2',20)");
  chequear("Si admite otro ciclo del mismo producto", otroCiclo[0].affectedRows === 1);

  await cx.query("DROP DATABASE `" + PRUEBA + "`");
  console.log("\n  (base de prueba eliminada; agronomodigital intacta)");
  console.log("\n=== " + ok + " OK / " + fallos + " fallos ===");
  await cx.end();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("EXCEPCION: " + e.message); process.exit(1); });
