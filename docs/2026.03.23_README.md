# LUCAS Soil Explorer — España

**Explorador interactivo de datos de suelo LUCAS 2018 para España**

🌐 **Producción:** https://lucas-soil-app.vercel.app  
📁 **Repositorio:** https://github.com/Miguel-byte-breath/lucas-soil-app  
🏢 **Desarrollado por:** VisualNACert S.L.

---

## ¿Qué es?

LUCAS Soil Explorer es una aplicación web que permite explorar los datos de suelo del survey LUCAS 2018 del Joint Research Centre (JRC) de la Comisión Europea para el territorio español. Combina 3.867 puntos de muestreo con datos SIGPAC (FEGA) para ofrecer una caracterización agronómica del entorno edáfico de cualquier parcela.

El objetivo principal es proporcionar una **unidad edáfica de referencia** coherente con el RD 1051/2022, que exige caracterización del suelo para la elaboración de planes de abonado en explotaciones agrarias españolas.

---

## Stack técnico

| Componente | Tecnología |
|---|---|
| Frontend | React + Vite |
| Mapa | Leaflet + Leaflet-Draw |
| Datos suelo | JSON estático (lucas_spain.json, 1.35 MB) |
| Geometría | @turf/turf |
| Exportación | SheetJS (Excel), JSZip (GeoJSON/ZIP) |
| API proxy | Vercel Serverless Function (api/sigpac.js) |
| Despliegue | GitHub + Vercel (CI/CD automático) |

---

## Estructura del repositorio

```
lucas-soil-app/
├── api/
│   └── sigpac.js               # Proxy Vercel para API SIGPAC
├── public/
│   └── data/
│       └── lucas_spain.json    # 3.867 puntos LUCAS España
├── src/
│   ├── components/
│   │   ├── ParamPanel.jsx      # Panel atributos punto LUCAS
│   │   ├── GridControls.jsx    # Control grid + leyenda agronómica
│   │   ├── SearchBox.jsx       # Buscador municipio
│   │   └── SigpacPanel.jsx     # Panel datos recinto SIGPAC
│   ├── utils/
│   │   ├── spatial.js          # Haversine, IDW, pointInPolygon
│   │   ├── grid.js             # Grid parcelario con clasificación agronómica
│   │   ├── raster.js           # Raster continuo adaptativo al zoom
│   │   ├── agronomic.js        # Baremación agronómica + IVA
│   │   ├── sigpac.js           # Utils SIGPAC
│   │   └── export.js           # Excel (4 hojas) + GeoJSON + ZIP
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── vercel.json
├── package.json
└── vite.config.js
```

---

## Dataset — LUCAS Soil 2018

- **Fuente:** LUCAS Soil 2018 — Joint Research Centre (JRC), Comisión Europea
- **Puntos España:** 3.867 (de 18.984 totales Europa)
- **Campos por punto:** 26 (id, lat, lon, pH, pH_w, OC, MOS, N, P, K, CaCO3, EC, clay, sand, silt, coarse, usda, bd, bd10, nuts1, nuts2, lc, lu, elev, date, P_lod)
- **CRS:** EPSG:4326 WGS84
- **MOS:** calculado como OC × 1,724 (coeficiente de Waksman)
- **P < LOD:** tratado como 5,0 mg/kg centinela con flag P_lod=true
- **pH usado para baremación:** pH_w (H₂O)
- **Textura:** LUCAS Texture All 2018 (clasificación USDA)
- **Densidad aparente:** LUCAS Bulk Density 2018 (cobertura ~34% puntos España)

### Cita obligatoria del dataset

> Fernandez-Ugalde, O; Scarpa, S; Orgiazzi, A.; Panagos, P.; Van Liedekerke, M; Marechal A. & Jones, A. *LUCAS 2018 Soil Module. Presentation of dataset and results*, EUR 31144 EN, Publications Office of the European Union, Luxembourg. 2022, ISBN 978-92-76-54832-4, doi:10.2760/215013, JRC129926

> Orgiazzi, A., Ballabio, C., Panagos, P., Jones, A., Fernández-Ugalde, O. 2018. LUCAS Soil, the largest expandable soil dataset for Europe: A review. *European Journal of Soil Science*, 69(1): 140–153. https://doi.org/10.1111/ejss.12499

### Cita del ESDAC

> Panagos, P., Van Liedekerke, M., Borrelli, P., et al. 2022. European Soil Data Centre 2.0: Soil data and knowledge in support of the EU policies. *European Journal of Soil Science*, 73(6), e13315. DOI: 10.1111/ejss.13315

> European Soil Data Centre (ESDAC), esdac.jrc.ec.europa.eu, European Commission, Joint Research Centre

Contacto técnico datos LUCAS: ec-esdac@ec.europa.eu

---

## Funcionalidades

### Mapa interactivo
- Capas base: Esri Satellite (defecto), PNOA IGN España, OpenStreetMap
- Overlay activable: Raster agronómico adaptativo al zoom (≥ zoom 9)
- 3.867 puntos LUCAS como marcadores clicables
- Escala métrica y coordenadas en tiempo real (EPSG:4326)
- Buscador de municipio con Nominatim + fallback CartoCiudad (IGN)

### Clic en mapa / punto LUCAS
- Identificación del punto LUCAS más cercano (Haversine)
- 5 vecinos más próximos con todos sus atributos
- Consulta automática SIGPAC al punto clicado
- Panel SIGPAC: uso, referencia catastral, superficie, admisibilidad, zona nitratos, coef. regadío, altitud, incidencias

### Dibujo de polígono (parcela)
- Grid parcelario con clasificación agronómica por parámetro
- Tamaño celda mínimo compatible SIEX (≥ 100×100 m)
- Toggle Secano / Regadío que afecta a la baremación de MOS, P y K
- Leyenda con categorías y número de celdas
- Consulta automática de recintos SIGPAC en el bbox del polígono
- Intersección geométrica turf.js con cada recinto SIGPAC

### Raster agronómico continuo
- Activable desde control de capas (arriba derecha)
- Se regenera automáticamente al mover el mapa
- Parámetros disponibles: pH, MOS, P, K, N, Textura USDA, BD, IVA
- Tamaño de celda adaptativo al zoom (0,08° a zoom 9 → 0,002° a zoom 13+)
- Interpolación IDW sobre los 8 puntos LUCAS más cercanos (radio máx. 120 km)

### Exportación
- **Excel (4 hojas):**
  1. Puntos vecinos: 5 puntos LUCAS con todos los atributos + IVA individual y scores por variable
  2. Estadísticas del entorno: media, mín, máx por parámetro + IVA IDW del centroide desglosado
  3. Metadatos: fuente, metodología, aviso legal
  4. Recintos SIGPAC: recintos intersectados con superficie de intersección
- **GeoJSON:** puntos LUCAS + polígono dibujado
- **Shapefile ZIP:** mismo contenido en GeoJSON dentro de ZIP con README

---

## Marco agronómico — Baremación y IVA

### IVA — Índice de Variabilidad Agronómica (0–100)

El IVA es un índice compuesto que mide la aptitud agronómica del entorno edáfico de una parcela. Se calcula mediante interpolación IDW sobre los puntos LUCAS del entorno y se aplica al centroide de la geometría dibujada.

**Fórmula:**

```
IVA = Σ (score_i / 5 × peso_i) / Σ peso_i × 100
```

Los pesos se redistribuyen proporcionalmente si algún parámetro no tiene dato disponible.

**Pesos definitivos:**

| Parámetro | Peso |
|---|---|
| pH (H₂O) | 25% |
| Textura USDA | 25% |
| MOS | 20% |
| P | 15% |
| K | 15% |

> N total y BD se muestran como datos informativos pero no entran en el IVA. La BD tiene cobertura del ~34% en España y el N es un indicador indirecto de mineralización, no de disponibilidad inmediata.

**Categorías IVA:**

| Rango | Categoría |
|---|---|
| 80–100 | Muy buena aptitud |
| 60–80 | Buena aptitud |
| 40–60 | Aptitud moderada |
| 20–40 | Limitaciones importantes |
| 0–20 | Limitaciones severas |

**Ejemplo de cálculo (secano, textura franco-arcillosa, entorno castellano-manchego):**

| Parámetro | Valor | Categoría | Score/5 | Peso | Aportación |
|---|---|---|---|---|---|
| pH (H₂O) | 8,2 | Básico | 3 | 25% | (3/5)×25 = 15,0 |
| Textura USDA | clay loam | Franco-arcilloso | 4 | 25% | (4/5)×25 = 20,0 |
| MOS | 0,8% | Bajo | 2 | 20% | (2/5)×20 = 8,0 |
| P | 8 mg/kg | Bajo | 2 | 15% | (2/5)×15 = 6,0 |
| K | 180 mg/kg | Alto | 4 | 15% | (4/5)×15 = 12,0 |
| **IVA** | | | | | **(15+20+8+6+12)/100 × 100 = 61 → Buena aptitud** |

**Umbrales homogeneidad edáfica (RD 1051/2022):**

| Diferencia IVA entre parcelas | Interpretación |
|---|---|
| < 10 | Un único plan de abonado justificado |
| 10–20 | Un plan con observaciones diferenciadas |
| > 20 | Planes independientes recomendados |

---

### Baremación por variable

#### pH (H₂O) — independiente de textura

| Rango | Categoría | Score | Justificación agronómica |
|---|---|---|---|
| < 5,5 | Muy ácido | 1 | Toxicidad por Al³⁺ y Mn²⁺; bloqueo de P, Ca, Mg y Mo |
| 5,5–6,5 | Ácido | 2 | Disponibilidad de P y Mo subóptima; riesgo de lixiviación de bases |
| 6,5–7,5 | Neutro | 5 | Máxima disponibilidad de macro y micronutrientes; óptimo para la mayoría de cultivos |
| 7,5–8,5 | Básico | 3 | Riesgo de precipitación de P y Fe; frecuente en suelos calcáreos mediterráneos |
| > 8,5 | Muy básico | 1 | Bloqueo severo de micronutrientes; riesgo de fitotoxicidad por exceso de Na y CO₃²⁻ |

#### Textura USDA

| Clase USDA | Nombre español | Score | Justificación agronómica |
|---|---|---|---|
| Loam | Franco | 5,0 | Equilibrio perfecto entre retención hídrica, aireación y laboreo. Máxima versatilidad |
| Silt loam | Franco-limoso | 4,5 | Excelente retención de agua y CIC; riesgo de sellado superficial en lluvias intensas |
| Sandy loam | Franco-arenoso | 4,0 | Fácil laboreo y buen drenaje; requiere abonado más frecuente por menor CIC |
| Clay loam | Franco-arcilloso | 4,0 | Alta fertilidad química y CIC; requiere maquinaria potente y buen manejo hídrico |
| Silty clay loam | Franco-limo-arcilloso | 3,5 | Buena fertilidad; riesgo de asfixia radicular y compactación en condiciones húmedas |
| Sandy clay loam | Franco-areno-arcilloso | 3,5 | Buen equilibrio químico-físico; menor riesgo de encharcamiento que arcillas puras |
| Loamy sand | Arena franca | 2,5 | Baja retención de nutrientes; alto riesgo de lixiviación de N y K |
| Silt | Limo | 2,5 | Tendencia a apelmazarse y formar costra superficial que impide la nascencia |
| Silty clay | Arcilla limosa | 2,0 | Suelo "frío" y pesado; drenaje deficiente y lenta mineralización de MOS |
| Sandy clay | Arcilla arenosa | 2,0 | Comportamiento físico difícil; buena base química pero gestión compleja |
| Clay | Arcillosa | 1,5 | Muy fértil químicamente pero con graves problemas de compactación y drenaje |
| Sand | Arenosa | 1,0 | Baja retención de agua y nutrientes; exige riego y abonado muy técnico y frecuente |

#### MOS — Materia Orgánica del Suelo (%)

Calculada como OC × 1,724 (coeficiente de Waksman).

**Secano:**

| Rango | Categoría | Score | Justificación agronómica |
|---|---|---|---|
| ≤ 1,0% | Bajo | 2 | Suelo con baja actividad biológica y escasa retención de nutrientes |
| 1,0–1,5% | Normal | 5 | Nivel adecuado para cultivos de secano mediterráneo |
| > 1,5% | Alto | 4 | Buena reserva orgánica; valorar si es mineralizable o estabilizada |

**Regadío:**

| Rango | Categoría | Score | Justificación agronómica |
|---|---|---|---|
| ≤ 1,5% | Bajo | 2 | Insuficiente para sostener la demanda biótica de cultivos intensivos de regadío |
| 1,5–2,0% | Normal | 5 | Nivel óptimo para regadío; buena actividad microbiana y retención hídrica |
| > 2,0% | Alto | 4 | Excelente reserva; verificar tasa de mineralización para evitar excesos de N |

#### P — Fósforo (mg/kg) por grupo textural y sistema

Las tablas de baremación siguen la metodología FertiPRO / MAPA, diferenciando tres grupos texturales:
- **Gruesa:** sand, loamy sand, sandy loam
- **Media:** loam, silt loam, silt
- **Fina:** resto de clases arcillosas

Los umbrales entre categorías (muy bajo / bajo / normal / alto / muy alto) varían según textura y sistema. El score máximo (5) se asigna a la categoría Normal, que representa el rango de suficiencia sin riesgo de bloqueo por exceso.

> Un P "muy alto" recibe score 3 porque el exceso puede bloquear la absorción de Zn y Fe y supone un riesgo medioambiental por lixiviación.

#### K — Potasio (mg/kg) por grupo textural y sistema

Misma lógica que P. El potasio "muy alto" (score 3) indica riesgo de antagonismo con Mg²⁺ y Ca²⁺, además de posible contaminación de acuíferos.

---

## Integración SIGPAC

- Proxy Vercel (`api/sigpac.js`) para bypass de certificado SSL caducado en sigpac-hubcloud.es
- Consulta por punto: `recinfobypoint/4326/{lon}/{lat}.json`
- Consulta por bbox: cuadrícula 4×4 de puntos con deduplicación por referencia catastral
- Intersección geométrica con `turf.intersect()` sobre WKT del FEGA
- 32 códigos de uso SIGPAC clasificados (agrícola / no agrícola)
- Licencia datos SIGPAC: Creative Commons BY 4.0 — FEGA

---

## Marco normativo

| Norma | Relevancia |
|---|---|
| RD 1051/2022, de 27 de diciembre | Nutrición sostenible de suelos agrarios. Exige caracterización edáfica para planes de abonado |
| Orden APA/204/2023 | Desarrollo del RD 1051/2022 |
| RD 1054/2022 | Cuaderno digital de explotación (SIEX) |

---

## Concepto clave — Unidad edáfica de referencia

Los datos LUCAS tienen una densidad media de ~1 punto/18 km² en España. El grid y el raster **no caracterizan la variabilidad intraparcelaria** sino la variabilidad del entorno edáfico en el que se inserta la parcela.

El IVA permite comparar dos parcelas y determinar si pertenecen a la misma unidad edáfica de referencia, lo que constituye una **justificación técnica para un único plan de abonado** en el marco del RD 1051/2022.

---

## Licencias de datos

| Fuente | Licencia |
|---|---|
| LUCAS Soil 2018 (JRC) | Uso libre con atribución (ver citas obligatorias arriba) |
| SIGPAC (FEGA) | Creative Commons BY 4.0 |

---

*VisualNACert S.L. — LUCAS Soil Explorer*  
*Datos: JRC European Commission + FEGA España*
