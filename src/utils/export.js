import * as XLSX from 'xlsx'

const PARAM_LABELS = {
  id:     'POINTID',
  lat:    'Latitud',
  lon:    'Longitud',
  dist_km:'Distancia (km)',
  pH:     'pH (CaCl₂)',
  pH_w:   'pH (H₂O)',
  OC:     'OC (g/kg)',
  MOS:    'MOS % (Waksman ×1,724)',
  N:      'N total (g/kg)',
  P:      'P (mg/kg)',
  P_lod:  'P < LOD (bajo límite detección)',
  K:      'K (mg/kg)',
  CaCO3:  'CaCO₃ (%)',
  EC:     'CE (µS/cm)',
  clay:   'Arcilla (%)',
  sand:   'Arena (%)',
  silt:   'Limo (%)',
  coarse: 'Fracción gruesa (%)',
  usda:   'Textura USDA',
  bd:     'Densidad aparente BD 0-20 (g/cm³)',
  bd10:   'BD 0-10 (g/cm³)',
  nuts1:  'NUTS 1',
  nuts2:  'NUTS 2',
  lc:     'Cobertura suelo',
  lu:     'Uso suelo',
  elev:   'Elevación (m)',
  date:   'Fecha muestreo',
}

function formatVal(key, val) {
  if (val == null) return '—'
  if (key === 'P_lod') return val ? 'Sí (P muy bajo)' : 'No'
  if (key === 'dist_km') return Math.round(val * 10) / 10
  return val
}

export function exportExcel(neighbors, gridParam) {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Puntos vecinos ──
  const keys = Object.keys(PARAM_LABELS)
  const header = keys.map(k => PARAM_LABELS[k])
  const rows = neighbors.map(pt =>
    keys.map(k => formatVal(k, pt[k]))
  )
  const ws1 = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws1['!cols'] = header.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Puntos vecinos')

  // ── Hoja 2: Estadísticas del entorno ──
  const numParams = ['pH','MOS','OC','N','P','K','CaCO3','clay','sand','silt','bd']
  const statsHeader = ['Parámetro', 'n', 'Media', 'Mín', 'Máx', 'Nota']
  const statsRows = numParams.map(p => {
    const vals = neighbors
      .filter(pt => pt[p] != null)
      .map(pt => pt[p])
    if (!vals.length) return [PARAM_LABELS[p] || p, 0, '—', '—', '—', 'Sin datos en entorno']
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const note = p === 'P' && neighbors.some(pt => pt.P_lod)
      ? 'Incluye puntos con P < LOD (tratados como 5 mg/kg)'
      : p === 'bd' && vals.length < neighbors.length
      ? `BD disponible en ${vals.length} de ${neighbors.length} puntos`
      : ''
    return [
      PARAM_LABELS[p] || p,
      vals.length,
      Math.round(mean * 100) / 100,
      Math.min(...vals),
      Math.max(...vals),
      note,
    ]
  })
  const ws2 = XLSX.utils.aoa_to_sheet([statsHeader, ...statsRows])
  ws2['!cols'] = [{ wch: 28 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas entorno')

  // ── Hoja 3: Metadatos ──
  const meta = [
    ['Fuente de datos', 'LUCAS Soil 2018 — Joint Research Centre (JRC), Comisión Europea'],
    ['Textura', 'LUCAS Texture All 2018 — clasificación USDA'],
    ['Densidad aparente', 'LUCAS Bulk Density 2018 (cobertura ~34% puntos España)'],
    ['MOS', 'Calculado como OC × 1,724 (coeficiente de Waksman)'],
    ['P < LOD', 'Fósforo bajo límite de detección (~10 mg/kg). Valor asignado: 5 mg/kg'],
    ['CRS', 'EPSG:4326 — WGS84'],
    ['Nota orientativa', 'Densidad media LUCAS ~1 punto/18 km². Datos de referencia, no de precisión parcelaria.'],
    ['Generado con', 'LUCAS Soil Explorer — VisualNACert'],
    ['Fecha exportación', new Date().toLocaleDateString('es-ES')],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(meta)
  ws3['!cols'] = [{ wch: 28 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Metadatos')

  // Descargar
  XLSX.writeFile(wb, `LUCAS_suelo_${new Date().toISOString().slice(0,10)}.xlsx`)
}
export function exportGeoJSON(neighbors, polygon) {
  const features = []

  neighbors.forEach((pt, i) => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pt.lon, pt.lat],
      },
      properties: {
        rank:    i + 1,
        pointid: pt.id,
        dist_km: pt.dist_km ? Math.round(pt.dist_km * 100) / 100 : null,
        pH:      pt.pH,
        MOS:     pt.MOS,
        OC:      pt.OC,
        N:       pt.N,
        P:       pt.P,
        P_lod:   pt.P_lod ? 'si' : 'no',
        K:       pt.K,
        CaCO3:   pt.CaCO3,
        usda:    pt.usda || '',
        clay:    pt.clay,
        sand:    pt.sand,
        silt:    pt.silt,
        bd:      pt.bd,
        nuts1:   pt.nuts1 || '',
        nuts2:   pt.nuts2 || '',
        lc:      pt.lc || '',
        date:    pt.date || '',
        source:  'LUCAS Soil 2018 JRC',
      },
    })
  })

  if (polygon) {
    features.push({
      type: 'Feature',
      geometry: polygon.geometry,
      properties: {
        tipo:   'parcela_referencia',
        fuente: 'LUCAS Soil Explorer',
        fecha:  new Date().toLocaleDateString('es-ES'),
      },
    })
  }

  const geojson = {
    type: 'FeatureCollection',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  }

  const blob = new Blob(
    [JSON.stringify(geojson, null, 2)],
    { type: 'application/geo+json' }
  )
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = `LUCAS_suelo_${new Date().toISOString().slice(0, 10)}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportShapefile(neighbors, polygon) {
  // Generamos dos GeoJSON separados y los descargamos como .zip usando JSZip
  const { default: JSZip } = await import('jszip')

  const pointFeatures = neighbors.map((pt, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
    properties: {
      rank:    i + 1,
      pointid: pt.id,
      dist_km: pt.dist_km ? Math.round(pt.dist_km * 100) / 100 : null,
      pH:      pt.pH,
      MOS:     pt.MOS,
      OC:      pt.OC,
      N:       pt.N,
      P:       pt.P,
      P_lod:   pt.P_lod ? 'si' : 'no',
      K:       pt.K,
      CaCO3:   pt.CaCO3,
      usda:    pt.usda || '',
      clay:    pt.clay,
      sand:    pt.sand,
      silt:    pt.silt,
      bd:      pt.bd,
      nuts1:   pt.nuts1 || '',
      nuts2:   pt.nuts2 || '',
      source:  'LUCAS 2018 JRC',
    },
  }))

  const fcPuntos = {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: pointFeatures,
  }

  const zip = new JSZip()
  zip.file('LUCAS_puntos.geojson', JSON.stringify(fcPuntos, null, 2))

  if (polygon) {
    const fcParcela = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features: [{
        type: 'Feature',
        geometry: polygon.geometry,
        properties: {
          tipo:   'parcela_referencia',
          fuente: 'LUCAS Soil Explorer',
          fecha:  new Date().toLocaleDateString('es-ES'),
        },
      }],
    }
    zip.file('parcela_referencia.geojson', JSON.stringify(fcParcela, null, 2))
  }

  zip.file('README.txt',
    'LUCAS Soil Explorer — Exportacion geometrica\n' +
    '=============================================\n' +
    'Fuente: LUCAS Soil 2018 (JRC, Comision Europea)\n' +
    'CRS: EPSG:4326 WGS84\n' +
    'Contenido:\n' +
    '  LUCAS_puntos.geojson   — Puntos de muestreo LUCAS con atributos\n' +
    '  parcela_referencia.geojson — Poligono dibujado por el usuario\n' +
    'Abrir con QGIS, ArcGIS o cualquier GIS compatible con GeoJSON.\n'
  )

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `LUCAS_geometrias_${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
