#!/usr/bin/env python3
"""
build_lucas_canonical.py
========================

ETL puntual que enriquece el JSON LUCAS España actual con los campos
derivados del paper Ballabio et al. 2023 (Fine Earth Soil Bulk Density at
0.2m depth from LUCAS soil 2018).

Diseño:
- ESTRATEGIA ADITIVA. Todos los campos y puntos del JSON actual se preservan
  intactos. Esto garantiza que la app LUCAS Soil Explorer siga funcionando
  exactamente igual tras la migración.
- Se añaden cuatro campos nuevos del paper, todos opcionales (null cuando
  el punto no aparece en el dataset BD2018).
- El bloque `meta` se enriquece con auditoría: fuentes, fechas, hashes
  SHA256 de los inputs, cobertura por campo nuevo.

Ejecución una sola vez (o cuando JRC publique nueva versión de LUCAS).
"""

import csv
import gzip
import hashlib
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


# =====================================================================
# RUTAS DE ENTRADA
# =====================================================================

JSON_ACTUAL    = Path("/mnt/user-data/uploads/lucas_spain__1__json.gz")
BD_PAPER_ZIP   = Path("/mnt/user-data/uploads/BD_LUCAS_data_for_paper.zip")
BD_PAPER_CSV   = "BD2018_data_for_paper.csv"   # nombre dentro del zip

OUTPUT         = Path("/home/claude/lucas_spain_canonical.json")


# =====================================================================
# UTILIDADES
# =====================================================================

def sha256_of(path):
    """Hash SHA256 de un fichero, para trazabilidad en el meta."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_float_or_none(s):
    """Convierte string a float, devolviendo None si vacío o inválido."""
    if s is None:
        return None
    s = s.strip()
    if s in ("", "NA", "null", "N/A"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


# =====================================================================
# 1. CARGAR JSON ACTUAL (BASE INTACTA)
# =====================================================================

print("=" * 60)
print("ETL LUCAS canónico — VisualNACert / LUCAS Soil Explorer")
print("=" * 60)

print(f"\n[1/4] Cargando JSON base: {JSON_ACTUAL.name}")
with gzip.open(JSON_ACTUAL, "rt", encoding="utf-8") as f:
    base = json.load(f)

base_meta   = base["meta"]
base_points = base["points"]
print(f"      OK — {len(base_points)} puntos LUCAS España")
print(f"      Campos por punto: {len(base_points[0])}")

# Indexar por POINT_ID para enriquecimiento posterior
points_by_id = {str(p["id"]): p for p in base_points}


# =====================================================================
# 2. CARGAR Y PARSEAR CSV DEL PAPER (Ballabio 2023)
# =====================================================================

print(f"\n[2/4] Cargando datos del paper Ballabio 2023: {BD_PAPER_ZIP.name}")
paper_data = {}
with zipfile.ZipFile(BD_PAPER_ZIP) as zf:
    with zf.open(BD_PAPER_CSV) as raw:
        # CSV con DOS cabeceras (la abreviada y la descriptiva), descartamos la 2ª
        text = raw.read().decode("utf-8")
        lines = text.splitlines()
        reader = csv.reader(lines)
        header_short = next(reader)  # POINT_ID, LC0_Desc, BDsample_0, ...
        _header_long = next(reader)  # descripción, descartar

        for row in reader:
            if len(row) < 6:
                continue
            pid = row[0].strip()
            if not pid:
                continue
            paper_data[pid] = {
                "BDsample_0_20_2018":         parse_float_or_none(row[2]),
                "coarse_mass_fraction":        parse_float_or_none(row[3]),
                "BDfine_0_20_2018_approx":     parse_float_or_none(row[4]),
                "coarse_volume_fraction_approx": parse_float_or_none(row[5]),
            }

print(f"      OK — {len(paper_data)} puntos en el dataset paper (Europa entera)")


# =====================================================================
# 3. ENRIQUECER LOS PUNTOS ESPAÑOLES
# =====================================================================

print(f"\n[3/4] Enriqueciendo {len(base_points)} puntos LUCAS España...")

n_match              = 0
n_BDsample           = 0
n_BDfine             = 0
n_coarse_mass        = 0
n_coarse_vol         = 0

# QC: detectar valores fuera de rango plausible
qc_warnings = []

for pid, point in points_by_id.items():
    paper = paper_data.get(pid)

    if paper is None:
        # Punto sin entrada en el paper: añadir nulls explícitos
        point["BDsample_paper"]    = None
        point["BDfine"]            = None
        point["coarse_mass_paper"] = None
        point["coarse_vol"]        = None
    else:
        n_match += 1

        # Valores con verificación de rango
        bds = paper["BDsample_0_20_2018"]
        bdf = paper["BDfine_0_20_2018_approx"]
        cm  = paper["coarse_mass_fraction"]
        cv  = paper["coarse_volume_fraction_approx"]

        # QC: BD plausible (0.1 – 2.0 g/cm3). Suelos turbosos pueden bajar a 0.1
        # incluso por debajo en casos extremos. Suelos compactados llegan a 1.8-2.0.
        if bds is not None:
            if not (0.1 <= bds <= 2.0):
                qc_warnings.append(f"  POINT_ID={pid}: BDsample fuera de rango [0.1, 2.0]: {bds}")
            n_BDsample += 1
        if bdf is not None:
            if not (0.1 <= bdf <= 2.0):
                qc_warnings.append(f"  POINT_ID={pid}: BDfine fuera de rango [0.1, 2.0]: {bdf}")
            n_BDfine += 1
        # coarse en fracción [0, 1]
        if cm is not None:
            if not (0 <= cm <= 1):
                qc_warnings.append(f"  POINT_ID={pid}: coarse_mass fuera de rango [0, 1]: {cm}")
            n_coarse_mass += 1
        if cv is not None:
            if not (0 <= cv <= 1):
                qc_warnings.append(f"  POINT_ID={pid}: coarse_vol fuera de rango [0, 1]: {cv}")
            n_coarse_vol += 1

        point["BDsample_paper"]    = bds
        point["BDfine"]            = bdf
        point["coarse_mass_paper"] = cm
        point["coarse_vol"]        = cv

n_es = len(base_points)
print(f"      Match con dataset paper:   {n_match}/{n_es} ({n_match*100/n_es:.1f}%)")
print(f"        BDsample_paper rellenado: {n_BDsample} ({n_BDsample*100/n_es:.1f}%)")
print(f"        BDfine rellenado:         {n_BDfine} ({n_BDfine*100/n_es:.1f}%)")
print(f"        coarse_mass_paper:        {n_coarse_mass} ({n_coarse_mass*100/n_es:.1f}%)")
print(f"        coarse_vol rellenado:     {n_coarse_vol} ({n_coarse_vol*100/n_es:.1f}%)")
if qc_warnings:
    print(f"\n      ⚠ {len(qc_warnings)} warnings de QC:")
    for w in qc_warnings[:10]:
        print(w)
    if len(qc_warnings) > 10:
        print(f"      ... ({len(qc_warnings)-10} más)")
else:
    print(f"      ✓ Sin warnings de QC. Todos los valores en rango.")


# =====================================================================
# 4. CONSTRUIR META Y ESCRIBIR JSON CANÓNICO
# =====================================================================

print(f"\n[4/4] Construyendo meta y escribiendo JSON canónico...")

# Hashes para trazabilidad
hash_json_base = sha256_of(JSON_ACTUAL)
hash_bd_paper  = sha256_of(BD_PAPER_ZIP)

new_meta = {
    "schema_version": "2.0",
    "build_timestamp": datetime.now(timezone.utc).isoformat(),
    "country": base_meta.get("country", "ES"),
    "n_points": n_es,
    "sources": {
        "lucas_principal_via_app_actual": {
            "description": base_meta.get("source", "LUCAS Soil 2018 (JRC)"),
            "input_file": JSON_ACTUAL.name,
            "input_sha256": hash_json_base,
        },
        "bd_paper_ballabio_2023": {
            "description": "Fine Earth Soil Bulk Density at 0.2m depth (Ballabio et al. 2023, EJSS)",
            "doi": "10.1111/ejss.13391",
            "input_file": BD_PAPER_ZIP.name,
            "input_sha256": hash_bd_paper,
        },
    },
    "field_definitions": {
        # Campos preexistentes — heredados sin tocar del JSON actual
        "id":           "POINTID LUCAS",
        "lat,lon":      "WGS84 EPSG:4326",
        "pH":           "pH en CaCl2 (LUCAS principal)",
        "pH_w":         "pH en H2O (LUCAS principal)",
        "OC":           "Carbono orgánico (g/kg) (LUCAS principal)",
        "MOS":          "Materia orgánica % (= OC × 1.724, coeficiente de Waksman)",
        "N":            "N total (g/kg) (LUCAS principal)",
        "P":            "Fósforo (mg/kg) (LUCAS principal)",
        "P_lod":        "True si P < límite de detección, valor sentinela 5.0",
        "K":            "Potasio (mg/kg) (LUCAS principal)",
        "CaCO3":        "Carbonato cálcico (%) (LUCAS principal)",
        "EC":           "Conductividad eléctrica (μS/cm)",
        "clay,sand,silt": "Fracciones texturales (%) (LUCAS Texture 2018)",
        "coarse":       "Fragmento grueso másico (%) (LUCAS Texture 2018, valor heredado)",
        "usda":         "Clase textural USDA",
        "bd":           "BD 0-20 cm (g/cm3) — fuente: BulkDensity_2018_final (33.9% cobertura ES)",
        "bd10":         "BD 0-10 cm (g/cm3) — fuente: BulkDensity_2018_final (37.1% cobertura ES)",
        "nuts1,nuts2":  "Códigos NUTS",
        "lc":           "Land Cover",
        "lu":           "Land Use",
        "elev":         "Elevación (m)",
        "date":         "Fecha del muestreo",
        # Campos NUEVOS del paper Ballabio 2023
        "BDsample_paper": (
            "BD del suelo total a 0-20 cm, medida (g/cm3). "
            "Fuente: BD2018 paper (Ballabio 2023). "
            "Equivalente conceptual al campo 'bd' pero del dataset del paper "
            "(cobertura prácticamente idéntica)."
        ),
        "BDfine": (
            "BD de la tierra fina a 0-20 cm (g/cm3). Derivada matemáticamente "
            "por JRC a partir de BDsample y la fracción volumétrica de gruesos, "
            "asumiendo densidad de fragmentos = 2.65 g/cm3. "
            "ES EL CAMPO QUE EL MODELO LABOREO/TEMPERO CONSUME para el balance "
            "hídrico, porque representa la matriz que retiene agua."
        ),
        "coarse_mass_paper": (
            "Fragmento grueso másico (fracción 0-1) — versión del paper. "
            "Equivalente al campo 'coarse' del JSON pero como fracción decimal "
            "(0.18) en lugar de porcentaje (18.0)."
        ),
        "coarse_vol": (
            "Fragmento grueso volumétrico (fracción 0-1). Aproximado por JRC. "
            "ES EL CAMPO QUE EL MODELO LABOREO/TEMPERO CONSUME para las "
            "correcciones físicas (FC efectivo, divisor del Índice de Tempero), "
            "porque las piedras desplazan volumen, no masa."
        ),
    },
    "coverages": {
        "old_fields": {
            "bd_0_20":       round(base_meta.get("bd_coverage_pct", 33.9) / 100, 3),
            "bd10_0_10":     0.371,  # observado en JSON base
            "usda":          base_meta.get("usda_coverage_pct", 95.5) / 100,
        },
        "new_fields_from_paper": {
            "BDsample_paper":     round(n_BDsample / n_es, 3),
            "BDfine":             round(n_BDfine / n_es, 3),
            "coarse_mass_paper":  round(n_coarse_mass / n_es, 3),
            "coarse_vol":         round(n_coarse_vol / n_es, 3),
        },
    },
    "mos_method":   base_meta.get("mos_method", "OC * 1.724 (Waksman coefficient)"),
    "p_lod_value":  base_meta.get("p_lod_value", 5.0),
    "p_lod_note":   base_meta.get("p_lod_note", ""),
    "crs":          base_meta.get("crs", "EPSG:4326"),
    "qc": {
        "warnings_count": len(qc_warnings),
        "rules_applied": [
            "BDsample y BDfine deben estar en [0.1, 2.0] g/cm3 (rango amplio que admite turbas)",
            "coarse_mass y coarse_vol deben estar en [0, 1]",
        ],
    },
    "fallback_note": (
        "Cuando BDfine es null (puntos sin match en paper), el motor LABOREO "
        "aplica fallback Rawls 1983: BD = 1.35 + 0.0045·%Sand − 0.06·%OC"
    ),
}

canonical = {
    "meta": new_meta,
    "points": base_points,
}

# Escritura compacta sin ASCII-only para preservar tildes en strings
with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(canonical, f, ensure_ascii=False, separators=(",", ":"))

size_kb = OUTPUT.stat().st_size / 1024
print(f"      ✓ Escrito {OUTPUT}")
print(f"        Tamaño: {size_kb:.1f} KB ({size_kb/1024:.2f} MB)")
print(f"        Hash:   {sha256_of(OUTPUT)[:16]}...")

print(f"\n{'='*60}")
print("ETL completado correctamente.")
print(f"{'='*60}")
