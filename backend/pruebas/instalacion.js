/* Prueba de instalacion limpia (SQLite).

   Crea una base temporal con el mismo camino que usa un companero: schema.sql,
   catalogos.sql, catalogos_insumos.sql y precios_mag_2023.sql. Revisa la
   estructura, las cascadas y algunas restricciones. Al final borra la base de
   prueba y no toca agronomodigital.db. */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BASE = path.join(__dirname, "..");
const envTxt = fs.readFileSync(path.join(BASE, ".env"), "utf8");
const dbPathMatch = (envTxt.match(/^DB_PATH=(.*)$/m) || [])[1].trim() || "./data/agronomodigital.db";
const dbPath = path.isAbsolute(dbPathMatch) ? dbPathMatch : path.resolve(BASE, dbPathMatch);
const PRUEBA = path.join(require("os").tmpdir(), "agronomodigital_instalacion_prueba.db");

let ok = 0, fallos = 0;
const chequear = (n, c, e) => {
  if (c) { ok++; console.log("  OK    " + n); }
  else { fallos++; console.log("  FALLA " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); }
};

const sentencias = (sql) =>
  sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

const soloTablas = (sql) =>
  sentencias(sql).filter((s) => /CREATE TABLE/i.test(s));

const soloInsert = (sql) =>
  sentencias(sql).filter((s) => /INSERT/i.test(s));

(async () => {
  // borrar base de prueba previa
  try { fs.unlinkSync(PRUEBA); } catch (e) { /* no existe */ }
  try { fs.unlinkSync(PRUEBA + "-wal"); } catch (e) {}
  try { fs.unlinkSync(PRUEBA + "-shm"); } catch (e) {}

  console.log("\n=== Instalacion limpia (SQLite) ===");
  const cx = new Database(PRUEBA);
  cx.pragma("foreign_keys = ON");
  cx.pragma("journal_mode = WAL");

  // schema.sql (todas las tablas)
  cx.exec("PRAGMA foreign_keys = OFF");
  for (const stmt of soloTablas(fs.readFileSync(path.join(BASE, "schema.sql"), "utf8"))) {
    try { cx.exec(stmt); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  cx.exec("PRAGMA foreign_keys = ON");
  console.log("  schema.sql ejecutado");

  for (const stmt of soloInsert(fs.readFileSync(path.join(BASE, "catalogos.sql"), "utf8"))) {
    try { cx.exec(stmt); }
    catch (e) { console.log("  SQL fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  catalogos.sql ejecutado");

  for (const stmt of soloInsert(fs.readFileSync(path.join(BASE, "catalogos_insumos.sql"), "utf8"))) {
    try { cx.exec(stmt); }
    catch (e) { console.log("  catalogos_insumos.sql fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  catalogos_insumos.sql ejecutado");

  for (const stmt of soloInsert(fs.readFileSync(path.join(BASE, "precios_mag_2023.sql"), "utf8"))) {
    try { cx.exec(stmt); }
    catch (e) { console.log("  precios_mag_2023.sql fallo: " + e.message + "\n    " + stmt.slice(0, 90)); process.exit(1); }
  }
  console.log("  precios_mag_2023.sql ejecutado");

  console.log("\n-- Estructura --");
  const tablas = cx.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  const esperadas = [
    "alias_insumos", "canales_venta", "categorias_insumos", "estimaciones",
    "estimaciones_detalle", "fuentes_precio", "historial_precios", "insumos",
    "migraciones_aplicadas", "parcelas", "precios_insumos", "productos",
    "publicaciones", "requerimientos_cultivo", "siembras", "usuarios"
  ].sort();
  chequear("16 tablas creadas", tablas.length === 16, tablas);
  chequear("Tablas esperadas", JSON.stringify(tablas) === JSON.stringify(esperadas), tablas);

  const columnas = (tabla) => cx.prepare("PRAGMA table_info(" + tabla + ")").all().map((r) => r.name);
  const colParcelas = columnas("parcelas");
  chequear("parcelas tiene unidad_superficie", colParcelas.includes("unidad_superficie"), colParcelas);
  chequear("parcelas ya no tiene produccion_estimada", !colParcelas.includes("produccion_estimada"), colParcelas);

  const colSiembras = columnas("siembras");
  chequear("siembras tiene superficie", colSiembras.includes("superficie"), colSiembras);
  chequear("siembras ya no se llama id_produccion", !colSiembras.includes("id_produccion"), colSiembras);

  console.log("\n-- Datos del catalogo --");
  const cuenta = (t) => cx.prepare("SELECT COUNT(*) n FROM " + t).get().n;
  chequear("14 productos", cuenta("productos") === 14, cuenta("productos"));
  chequear("4 canales", cuenta("canales_venta") === 4, cuenta("canales_venta"));
  chequear("7 categorias de insumos", cuenta("categorias_insumos") === 7, cuenta("categorias_insumos"));
  chequear("19 insumos", cuenta("insumos") === 19, cuenta("insumos"));
  chequear("24 precios", cuenta("precios_insumos") === 24, cuenta("precios_insumos"));
  chequear("48 requerimientos", cuenta("requerimientos_cultivo") === 48, cuenta("requerimientos_cultivo"));

  console.log("\n-- Cascada real --");
  cx.prepare("INSERT INTO usuarios (nombre, usuario, correo, contrasena) VALUES ('Prueba','inst','inst@prueba.com','x')").run();
  const idU = cx.prepare("SELECT id_usuario FROM usuarios WHERE correo='inst@prueba.com'").get().id_usuario;
  cx.prepare("INSERT INTO parcelas (id_usuario, nombre_parcela, tamano, unidad_superficie) VALUES (?,?,2,'manzana')").run(idU, 'Lote');
  const idP = cx.prepare("SELECT id_parcela FROM parcelas WHERE id_usuario=?").get(idU).id_parcela;
  cx.prepare("INSERT INTO siembras (id_parcela, id_producto, ciclo, superficie, unidad_superficie, produccion) VALUES (?,?, 'actual', 2, 'manzana', 50)").run(idP, 1);
  cx.prepare("INSERT INTO publicaciones (id_usuario,id_parcela,id_producto,id_canal,cantidad,precio_unitario,fecha) VALUES (?,?,?,?,10,5,'2026-01-01')").run(idU, idP, 1, 1);
  cx.prepare("INSERT INTO estimaciones (id_usuario,id_producto,id_fuente,superficie,unidad_superficie,superficie_ha,total_estimado) VALUES (?,?,1,2,'manzana',1.3978,100)").run(idU, 1);
  const idE = cx.prepare("SELECT id_estimacion FROM estimaciones WHERE id_usuario=?").get(idU).id_estimacion;
  cx.prepare("INSERT INTO estimaciones_detalle (id_estimacion,id_insumo,unidad_base,cantidad,precio_unitario,subtotal) VALUES (?,?, 'kg', 10, 2.5, 25)").run(idE, 1);

  chequear("Todo insertado",
    cuenta("parcelas") === 1 && cuenta("siembras") === 1 &&
    cuenta("publicaciones") === 1 && cuenta("estimaciones") === 1);

  cx.prepare("DELETE FROM usuarios WHERE id_usuario=?").run(idU);
  chequear("Cascada: parcela eliminada", cuenta("parcelas") === 0, cuenta("parcelas"));
  chequear("Cascada: siembra eliminada", cuenta("siembras") === 0, cuenta("siembras"));
  chequear("Cascada: publicacion eliminada", cuenta("publicaciones") === 0, cuenta("publicaciones"));
  chequear("Cascada: estimacion eliminada", cuenta("estimaciones") === 0, cuenta("estimaciones"));
  chequear("Cascada: detalle eliminado", cuenta("estimaciones_detalle") === 0, cuenta("estimaciones_detalle"));

  console.log("\n-- Restricciones --");
  cx.prepare("INSERT INTO usuarios (nombre, usuario, correo, contrasena) VALUES ('Prueba2','inst2','inst2@prueba.com','x')").run();
  const idU2 = cx.prepare("SELECT id_usuario FROM usuarios WHERE correo='inst2@prueba.com'").get().id_usuario;
  cx.prepare("INSERT INTO parcelas (id_usuario, nombre_parcela) VALUES (?,'Lote2')").run(idU2);

  let bloqueada = false;
  try { cx.prepare("INSERT INTO siembras (id_parcela,id_producto,produccion) VALUES (99999,1,5)").run(); }
  catch { bloqueada = true; }
  chequear("No acepta parcela inexistente", bloqueada);

  let repetida = false;
  cx.prepare("INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',10)").run();
  try { cx.prepare("INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'actual',20)").run(); }
  catch { repetida = true; }
  chequear("No repite parcela+producto+ciclo", repetida);

  const otroCiclo = cx.prepare("INSERT INTO siembras (id_parcela,id_producto,ciclo,produccion) VALUES ((SELECT MAX(id_parcela) FROM parcelas),1,'siembra-2',20)").run();
  chequear("Si admite otro ciclo del mismo producto", otroCiclo.changes === 1);

  cx.close();
  try { fs.unlinkSync(PRUEBA); } catch (e) {}
  try { fs.unlinkSync(PRUEBA + "-wal"); } catch (e) {}
  try { fs.unlinkSync(PRUEBA + "-shm"); } catch (e) {}

  console.log("\n  (base de prueba eliminada; agronomodigital intacta)");
  console.log("\n=== " + ok + " OK / " + fallos + " fallos ===");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("EXCEPCION: " + e.message); process.exit(1); });
