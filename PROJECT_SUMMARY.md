# LUCAS Soil Explorer — Resumen completo del proyecto

## URL producción
https://lucas-soil-app.vercel.app

## Repositorio
https://github.com/Miguel-byte-breath/lucas-soil-app

---

## Stack técnico
- **Frontend:** React + Vite
- **Mapa:** Leaflet + Leaflet-Draw
- **Datos:** JSON estático en /public/data/lucas_spain.json
- **Despliegue:** GitHub + Vercel (CI/CD automático)
- **Geometría:** @turf/turf (intersecciones)
- **Excel:** SheetJS (xlsx)
- **ZIP/GeoJSON:** JSZip
- **API proxy:** Vercel Serverless Function (api/sigpac.js)

---

## Estructura del repositorio
```
lucas-soil-app/
├── api/
│   └── sigpac.js          # Proxy Vercel para API SIGPAC (bypass cert caducado)
├── public/
│   └── data/
│       └── lucas_spain.json  # 3.867 puntos LUCAS España (1.35MB)
├── src/
│   ├── components/
│   │   ├── ParamPanel.jsx     # Panel atributos punto LUCAS
│   │   ├── GridControls.jsx   # Control grid + leyenda agronómica
│   │   ├── SearchBox.jsx      # Buscador municipio (Nominatim + CartoCiudad)
│   │   └── SigpacPanel.jsx    # Panel datos recinto SIGPAC
│   ├── utils/
│   │   ├── spatial.js         # Haversine, IDW, pointInPolygon, findNearest
│   │   ├── grid.js            # Grid parcelario con clasificación agronómica
│   │   ├── raster.js          # Raster continuo adaptativo al zoom
│   │   ├── agronomic.js       # Tablas baremación + IVA (índice variabilidad)
│   │   ├── sigpac.js          # Utils SIGPAC (consultas, formateo, intersección)
│   │   └── export.js          # Excel (4 hojas) + GeoJSON + Shapefile ZIP
│   ├── App.jsx                # Componente principal
│   ├── main.jsx
│   └── index.css
├── vercel.json
├── package.json
├── vite.config.js
└── AGRONOMIC_README.md
```

---

## Dataset — lucas_spain.json
- **Fuente:** LUCAS Soil 2018 JRC + LUCAS Texture 2018 + Bulk Density 2018
- **Puntos España:** 3.867
- **Campos:** 26 por punto (id, lat, lon, pH, pH_w, OC, MOS, N, P, P_lod, K, CaCO3, EC, clay, sand, silt, coarse, usda, bd, bd10, nuts1, nuts2, lc, lu, elev, date)
- **MOS:** calculado como OC × 1.724 (coeficiente Waksman)
- **P < LOD:** tratado como 5.0 mg/kg centinela, flag P_lod=true
- **pH usado para baremación:** pH_w (H₂O) — diferencia media +0.52 vs CaCl₂
- **CRS:** EPSG:4326 WGS84

---

## Funcionalidades implementadas

### 1. Mapa interactivo
- Capas base: Esri Satellite (defecto), PNOA IGN España, OpenStreetMap
- Overlay: Raster agronómico (activable/desactivable desde control capas)
- Escala visible (metros/km)
- Coordenadas en tiempo real al mover el ratón (EPSG:4326)
- 3.867 puntos LUCAS como círculos verdes clicables

### 2. Buscador de municipio
- Nominatim (OpenStreetMap) con fallback a CartoCiudad (IGN)
- Debounce 400ms
- Centra el mapa al seleccionar resultado

### 3. Clic en punto / mapa
- Nearest point (Haversine) — 5 vecinos más cercanos
- Panel lateral con todos los atributos LUCAS
- Consulta automática SIGPAC al punto clicado
- Panel SIGPAC: uso, referencia catastral, superficie, admisibilidad, zona nitratos, altitud, coef. regadío, incidencias

### 4. Raster continuo adaptativo
- Se activa automáticamente a zoom ≥ 9
- Se regenera al mover el mapa (evento moveend)
- Se desactiva al dibujar polígono
- Tamaño de celda adaptativo al zoom:
  - zoom 9-10: 0.025° (~2.5km)
  - zoom 11-12: 0.008° (~800m)
  - zoom 13+: 0.002° (~200m)
- Filtro: no pinta celdas a >50km del punto LUCAS más cercano
- Parámetros disponibles: pH, MOS, P, K, N, Textura USDA, BD, IVA

### 5. Grid parcelario (polígono dibujado)
- Tamaño celda: min(lado_menor/8, 0.0008°) — compatible SIEX mínimo 100×100m
- Clasificación agronómica por parámetro con baremación oficial
- Toggle Secano/Regadío (afecta a MOS, P, K)
- Leyenda con categorías y número de celdas
- Tooltip por celda con valor IDW y categoría

### 6. Sistema de baremación agronómica
**pH (H₂O) — independiente de textura:**
- Muy ácido < 5.5 | Ácido 5.5-6.5 | Neutro 6.5-7.5 | Básico 7.5-8.5 | Muy básico > 8.5

**MOS % — por sistema:**
- Secano: Bajo ≤1% | Normal 1-1.5% | Alto >1.5%
- Regadío: Bajo ≤1.5% | Normal 1.5-2% | Alto >2%

**P y K — por grupo textural × sistema (tablas FertiPRO/MAPA)**
- Gruesa: sand, loamy sand, sandy loam
- Media: loam, silt loam, silt
- Fina: resto de arcillosas

**N total — por textura USDA individual (12 clases)**
**BD — rango habitual por textura USDA**
**Textura USDA — colores por clase (12 clases)**

### 7. IVA — Índice de Variabilidad Agronómica (0-100)
**Pesos definitivos:**
- pH: 25%
- Textura USDA: 25%
- MOS: 20%
- P: 15%
- K: 15%
- BD: excluida (34% cobertura)
- N: excluido (indicador indirecto)

**Categorías IVA:**
- 80-100: Muy buena aptitud
- 60-80: Buena aptitud
- 40-60: Aptitud moderada
- 20-40: Limitaciones importantes
- 0-20: Limitaciones severas

**Umbrales homogeneidad edáfica (RD 1051/2022):**
- Diferencia IVA < 10: un único plan de abonado justificado
- 10-20: un plan con observaciones diferenciadas
- > 20: planes independientes recomendados

### 8. Exportación
**Excel (4 hojas):**
1. Puntos vecinos: 5 puntos LUCAS con todos los atributos
2. Estadísticas entorno: media, min, max por parámetro
3. Metadatos: fuente, metodología, aviso legal
4. Recintos SIGPAC: solo recintos que intersectan con el polígono, con superficie de intersección calculada con turf.js

**GeoJSON:** puntos LUCAS + polígono dibujado en un fichero
**Shapefile ZIP:** mismo contenido en formato GeoJSON dentro de ZIP con README

### 9. Integración SIGPAC (API FEGA)
- Proxy Vercel (api/sigpac.js) para bypass certificado SSL caducado de sigpac-hubcloud.es
- Consulta por punto: recinfobypoint/4326/{lon}/{lat}.json
- Consulta bbox: cuadrícula 4×4 de puntos con deduplicación por referencia catastral
- Intersección geométrica: turf.intersect() con WKT del FEGA convertido a GeoJSON
- Soporte polígonos con anillos interiores (huecos)
- 32 códigos de uso SIGPAC clasificados (agrícola / no agrícola)
- Licencia datos SIGPAC: Creative Commons BY 4.0

---

## Marco legal
- **Datos suelo:** LUCAS Soil 2018 JRC — uso libre con atribución
- **Datos SIGPAC:** FEGA — Creative Commons BY 4.0
- **Marco normativo:** RD 1051/2022, de 27 de diciembre — nutrición sostenible suelos agrarios

---

## Pendiente / próximas funcionalidades
1. Fix dibujo rectángulo (tooltips en inglés, posible bug Leaflet-Draw)
2. Filtro raster por uso SIGPAC (no pintar zonas no agrícolas)
3. Módulo comparación de parcelas (homogeneidad edáfica entre 2+ polígonos)
4. Informe PDF de homogeneidad edáfica para justificación RD 1051/2022
5. Favicon (actualmente 404)
6. Internacionalización tooltips Leaflet-Draw a español

---

## Concepto clave — Unidad edáfica de referencia
Los datos LUCAS tienen densidad ~1 punto/18 km² en España. El grid y raster
no caracterizan variabilidad intraparcelaria sino la **variabilidad del entorno
edáfico** en el que se inserta la parcela. Este concepto es coherente con el
RD 1051/2022 que exige caracterización por unidad representativa.

El IVA permite comparar dos parcelas y determinar si pertenecen a la misma
unidad edáfica de referencia → justificación técnica para un único plan de
abonado.

---

*VisualNACert S.L. — LUCAS Soil Explorer*
*Datos: JRC European Commission + FEGA España*
