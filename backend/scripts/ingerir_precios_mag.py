# -*- coding: utf-8 -*-
"""Ingresa precios reales desde la Guia MAG 2023 al catalogo de insumos.

Uso (desde la raiz del repo):
    python ingesta/ingerir_precios_mag.py

Salida:
  - backend/precios_mag_2023.sql (idempotente por fuente)
  - carga directa en la base (fuente id=2, es_ejemplo=0)
"""

import re, sys, os, subprocess, urllib.request
from pathlib import Path
import pymupdf

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent.parent
PDF = REPO / "datos" / "guia_precios_mag_2023.pdf"
SQL_OUT = REPO / "precios_mag_2023.sql"
URL = "https://www.mag.gob.sv/wp-content/uploads/2024/02/Guia-de-precios-de-Insumos-Agropecuarios-2023.pdf"

CLAVES = {
    11: ["46%"],
    16: ["glifosato"],
    17: ["2,4-d", "2,4 d", "2.4-d", "2,4d"],
    18: ["mancozeb"],
    19: ["cipermetrina"],
}

UNIDADES = {
    "litro": 1.0, "litros": 1.0,
    "kilogramo": 1.0, "kilogramos": 1.0, "kg": 1.0,
    "gramo": 0.001, "gramos": 0.001, "gr": 0.001, "g": 0.001,
    "cc": 0.001, "ml": 0.001,
    "galon": 3.78541, "galÃ³n": 3.78541, "galones": 3.78541,
    "libra": 0.453592, "libras": 0.453592,
}

def parse_precio(txt):
    m = re.search(r"\$\s*([\d,]+\.\d{2})", txt or "")
    if not m:
        return None
    return float(m.group(1).replace(",", ""))

def parse_presentacion(txt):
    t = (txt or "").lower().replace("\n", " ").strip()
    m = re.search(r"([\d.,]+)\s*(litro|litros|kg|kilogramo|kilogramos|gramo|gramos|cc|ml|galon|galÃ³n|galones|libra|libras)", t)
    if m:
        cant = float(m.group(1).replace(",", ""))
        uni = m.group(2)
        factor = UNIDADES.get(uni)
        if factor:
            base = "litro" if uni in ("litro", "litros", "cc", "ml", "galon", "galÃ³n", "galones") else "kg"
            return cant * factor, base
    if "quintal" in t:
        return 45.3592, "kg"
    m = re.search(r"([\d.,]+)\s*(kg|kilogramo|kilogramos|libra|libras|gramo|gramos)", t)
    if m:
        cant = float(m.group(1).replace(",", ""))
        uni = m.group(2)
        factor = UNIDADES.get(uni)
        if factor:
            base = "kg" if ("kg" in uni or "kilogram" in uni or "gram" in uni or "libra" in uni) else "litro"
            return cant * factor, base
    return None

def coincide(texto, claves):
    t = (texto or "").lower()
    return any(k.lower() in t for k in claves)

def descargar_pdf():
    PDF.parent.mkdir(parents=True, exist_ok=True)
    if PDF.exists():
        return
    try:
        print("Descargando PDF de la fuente MAG...")
        urllib.request.urlretrieve(URL, PDF)
        print("Descargado:", PDF)
    except Exception as e:
        print("No se pudo descargar automaticamente (el sitio del MAG bloquea descargas automaticas).")
        print("Descargalo manualmente desde:")
        print("  " + URL)
        print("y guardalo en:")
        print("  " + str(PDF))
        raise SystemExit(1)

def main():
    descargar_pdf()
    doc = pymupdf.open(PDF)
    filas = []
    for n in range(doc.page_count):
        tabs = doc[n].find_tables()
        for t in tabs.tables:
            for row in t.extract():
                cells = [(c or "").strip() for c in row]
                texto_fila = " ".join(cells).lower()
                precio = None
                for c in cells:
                    m = re.search(r"\$\s*([\d,]+\.\d{2})", c or "")
                    if m:
                        precio = float(m.group(1).replace(",", ""))
                        break
                if precio is None:
                    continue
                pres = None
                for c in cells:
                    if re.search(r'(Litro|Kg|Gal[oÃ³]n|cc|Gramo|Libra|Saco|Quintal|ml|Bolsa)', c, re.I) and len(c) < 60:
                        pres = c
                        break
                if pres is None:
                    continue
                conv = parse_presentacion(pres)
                if conv is None:
                    continue
                qty, base = conv
                if qty <= 0:
                    continue
                ppu = precio / qty
                for id_ins, claves in CLAVES.items():
                    if coincide(texto_fila, claves):
                        empresa = cells[-1] if cells else ""
                        filas.append((id_ins, texto_fila[:60], pres, precio, empresa, qty, base, ppu))
    doc.close()

    mejor = {}
    for f in filas:
        id_ins = f[0]
        if id_ins not in mejor or f[7] < mejor[id_ins][7]:
            mejor[id_ins] = f

    print("=== Coincidencias por insumo ===")
    for id_ins in sorted(CLAVES):
        if id_ins in mejor:
            f = mejor[id_ins]
            print("  insumo %d: pres: %s | precio: $%.2f | p/u: $%.4f/%s | fuente: %s"
                  % (id_ins, f[2], f[3], f[7], f[6], f[4][:30]))
        else:
            print("  insumo %d: SIN COINCIDENCIA" % id_ins)
    print("\nTotal filas parseadas: %d" % len(filas))
    from collections import Counter
    c = Counter(f[0] for f in filas)
    for k, v in c.items():
        print("  insumo %d: %d filas" % (k, v))

    lineas = []
    lineas.append("-- precios_mag_2023.sql")
    lineas.append("-- Precios reales extraidos de la Guia MAG 2023 (insumos agropecuarios).")
    lineas.append("-- Fuente: " + URL)
    lineas.append("-- Generado automaticamente por backend/scripts/ingerir_precios_mag.py")
    lineas.append("")
    lineas.append("INSERT INTO fuentes_precio")
    lineas.append("  (id_fuente, institucion, titulo, fecha_publicacion, url, hash_sha256, es_ejemplo, notas)")
    lineas.append("VALUES")
    lineas.append("  (2, 'Ministerio de Agricultura y Ganaderia (MAG)', 'Guia de Precios de Insumos Agropecuarios 2023',")
    lineas.append("   '2023-07-31', '" + URL + "', NULL, 0, 'Precios actualizados al 31/07/2023, IVA incluido. Cargados por ingesta automatica.')")
    lineas.append("ON DUPLICATE KEY UPDATE institucion = VALUES(institucion), titulo = VALUES(titulo),")
    lineas.append("  fecha_publicacion = VALUES(fecha_publicacion), url = VALUES(url), es_ejemplo = VALUES(es_ejemplo),")
    lineas.append("  notas = VALUES(notas);")
    lineas.append("")
    lineas.append("-- Limpiar precios anteriores de esta fuente (idempotente)")
    lineas.append("DELETE FROM precios_insumos WHERE id_fuente = 2;")
    lineas.append("")
    lineas.append("INSERT INTO precios_insumos")
    lineas.append("  (id_insumo, precio_unitario, moneda, vigente_desde, vigente_hasta, id_fuente)")
    lineas.append("VALUES")
    vals = []
    for id_ins in sorted(mejor):
        f = mejor[id_ins]
        vals.append("  (%d, %.4f, 'USD', '2023-07-31', NULL, 2)" % (id_ins, f[7]))
    lineas.append(",\n".join(vals) + ";")
    lineas.append("")
    for id_ins in sorted(mejor):
        f = mejor[id_ins]
        alias = f[1].strip().replace("'", "''")[:80]
        lineas.append("INSERT INTO alias_insumos (id_insumo, alias) VALUES (%d, '%s') ON DUPLICATE KEY UPDATE id_insumo = VALUES(id_insumo);" % (id_ins, alias))
    SQL_OUT.write_text("\n".join(lineas), encoding="utf-8")
    print("\nSQL generado:", SQL_OUT)

    cfg = {}
    for line in (REPO / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        t = line.strip()
        if t and not t.startswith("#") and "=" in t:
            k, v = t.split("=", 1)
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    ENV = dict(os.environ); ENV["MYSQL_PWD"] = cfg.get("DB_PASSWORD", "")
    MYSQL = r"C:\Program Files\MySQL\MySQL Server 9.6\bin\mysql.exe"
    DB = cfg["DB_DATABASE"]
    rc = subprocess.run([MYSQL, "-h", cfg["DB_HOST"], "-u", cfg["DB_USER"], DB],
                        input=SQL_OUT.read_text(encoding="utf-8"),
                        capture_output=True, text=True, encoding="utf-8", errors="replace", env=ENV)
    print("Carga en BD:", "OK" if rc.returncode == 0 else "FALLO " + rc.stderr[:500])

if __name__ == "__main__":
    main()
