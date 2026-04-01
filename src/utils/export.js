import * as XLSX from 'xlsx'
import * as turf from '@turf/turf'
import { calcularInterseccion } from './sigpac.js'
import { indiceAgronomico, classifyTextura } from './agronomic.js'
import { idw, haversine } from './spatial.js'

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
  if (typeof val === 'number') return val
  return val
}

export function exportExcel(neighbors, gridParam, sistema = 'secano', polygon = null) {
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Puntos vecinos ──
  const keys = Object.keys(PARAM_LABELS)
  const header = [...keys.map(k => PARAM_LABELS[k]), 'IVA (0-100)', 'Categoría IVA', 'pH score', 'Textura score', 'MOS score', 'P score', 'K score']
  const rows = neighbors.map(pt => {
    const { indice, clases } = indiceAgronomico(pt, sistema)
    return [
      ...keys.map(k => formatVal(k, pt[k])),
      indice ?? '—',
      indice == null ? '—' : indice >= 80 ? 'Muy buena aptitud' : indice >= 60 ? 'Buena aptitud' : indice >= 40 ? 'Aptitud moderada' : indice >= 20 ? 'Limitaciones importantes' : 'Limitaciones severas',
      clases.pH?.score      ?? '—',
      clases.textura?.score ?? '—',
      clases.MOS?.score     ?? '—',
      clases.P?.score       ?? '—',
      clases.K?.score       ?? '—',
    ]
  })
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
  // Fila IVA IDW centroide (solo si hay polígono)
  if (polygon) {
    const coords = polygon.geometry.coordinates[0]
    const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const synth = {
      pH_w: idw(centLat, centLon, neighbors.filter(p => p.pH_w != null), 'pH_w'),
      MOS:  idw(centLat, centLon, neighbors.filter(p => p.MOS  != null), 'MOS'),
      P:    idw(centLat, centLon, neighbors.filter(p => p.P    != null), 'P'),
      K:    idw(centLat, centLon, neighbors.filter(p => p.K    != null), 'K'),
      usda: neighbors[0]?.usda || 'loam',
    }
    const { indice, clases } = indiceAgronomico(synth, sistema)
    const catIva = indice == null ? '—' : indice >= 80 ? 'Muy buena aptitud' : indice >= 60 ? 'Buena aptitud' : indice >= 40 ? 'Aptitud moderada' : indice >= 20 ? 'Limitaciones importantes' : 'Limitaciones severas'
    statsRows.push(
      ['', '', '', '', '', ''],
      ['IVA — Índice Variabilidad Agronómica (IDW centroide)', '', '', '', '', ''],
      ['IVA calculado', indice ?? '—', '', '', '', catIva],
      ['pH (H₂O) — score/5', clases.pH?.score ?? '—', '', '', '', clases.pH?.label ?? '—'],
      ['Textura USDA — score/5', clases.textura?.score ?? '—', '', '', '', clases.textura?.label ?? '—'],
      ['MOS — score/5', clases.MOS?.score ?? '—', '', '', '', clases.MOS?.label ?? '—'],
      ['P — score/5', clases.P?.score ?? '—', '', '', '', clases.P?.label ?? '—'],
      ['K — score/5', clases.K?.score ?? '—', '', '', '', clases.K?.label ?? '—'],
    )
  }
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
    ['Licencia datos SIGPAC', 'FEGA — Fondo Español de Garantía Agraria. Datos SIGPAC bajo licencia Creative Commons BY 4.0. https://www.fega.gob.es'],
    ['Fecha exportación', new Date().toLocaleDateString('es-ES')],
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(meta)
  ws3['!cols'] = [{ wch: 28 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Metadatos')

  // ── Hoja 4: Recintos SIGPAC ──
  if (window._sigpacRecintos && window._sigpacRecintos.length > 0) {
    const sigpacHeader = [
      'Provincia', 'Municipio', 'Polígono', 'Parcela', 'Recinto',
      'Uso SIGPAC', 'Descripción uso', 'Agrícola',
      'Superficie recinto (ha)', 'Sup. intersección (ha)',
      'Admisibilidad (%)', 'Coef. regadío (%)',
      'Zona nitratos', 'Altitud media (m)', 'Incidencias',
    ]
    const poligono = window._sigpacPoligono || null
    const sigpacRows = window._sigpacRecintos
      .filter(r => {
        if (!poligono || !r.wkt) return true
        const calc = calcularInterseccion(poligono, r.wkt)
        return calc !== null
      })
      .map(r => {
        const supInterseccion = poligono && r.wkt
          ? parseFloat(calcularInterseccion(poligono, r.wkt))
          : '—'
        return [
          r.provincia    || '—',
          r.municipio    || '—',
          r.poligono     || '—',
          r.parcela      || '—',
          r.recinto      || '—',
          r.uso          || '—',
          r.usoDesc      || '—',
          r.agricola     ? 'Sí' : 'No',
          r.superficie   || '—',
          supInterseccion,
          r.admisibilidad|| '—',
          r.regadio      || '—',
          r.nitratos     || '—',
          r.altitud      || '—',
          r.incidencias  || '—',
        ]
      })
    const ws4 = XLSX.utils.aoa_to_sheet([sigpacHeader, ...sigpacRows])
    ws4['!cols'] = [
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 8 },  { wch: 28 }, { wch: 10 },
      { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
      { wch: 14 }, { wch: 16 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, ws4, 'Recintos SIGPAC')
  }

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

export function exportExcelComparativo(parcelas, allPoints, sistema = 'secano') {
  const wb = XLSX.utils.book_new()

  // Calcular IVA y datos por parcela
  const datosParcelas = parcelas.map(parcela => {
    const coords = parcela.geojson.geometry.coordinates[0]
    const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const neighbors = allPoints
      .map(pt => ({ ...pt, _d: Math.sqrt((pt.lat - centLat) ** 2 + (pt.lon - centLon) ** 2) }))
      .sort((a, b) => a._d - b._d)
      .slice(0, 8)
    const synth = {
      pH_w: idw(centLat, centLon, neighbors.filter(p => p.pH_w != null), 'pH_w'),
      MOS:  idw(centLat, centLon, neighbors.filter(p => p.MOS  != null), 'MOS'),
      P:    idw(centLat, centLon, neighbors.filter(p => p.P    != null), 'P'),
      K:    idw(centLat, centLon, neighbors.filter(p => p.K    != null), 'K'),
      usda: neighbors[0]?.usda || 'loam',
    }
    const { indice, clases } = indiceAgronomico(synth, sistema)
    return { parcela, synth, indice, clases, centLat, centLon }
  })

  // ── Hoja 1: Comparativa IVA ──
  const colHeaders = ['Parametro', ...parcelas.map(p => p.nombre)]
  if (parcelas.length === 2) {
    colHeaders.push('Diferencia', 'Interpretacion RD 1051/2022')
  }

  const params = [
    { label: 'IVA (0-100)',        key: d => d.indice ?? '—' },
    { label: 'Categoria IVA',      key: d => d.indice == null ? '—' : d.indice >= 80 ? 'Muy buena aptitud' : d.indice >= 60 ? 'Buena aptitud' : d.indice >= 40 ? 'Aptitud moderada' : d.indice >= 20 ? 'Limitaciones importantes' : 'Limitaciones severas' },
    { label: 'pH (H2O)',           key: d => d.synth.pH_w ?? '—' },
    { label: 'pH score/5',         key: d => d.clases.pH?.score ?? '—' },
    { label: 'pH categoria',       key: d => d.clases.pH?.label ?? '—' },
    { label: 'Textura USDA',       key: d => d.synth.usda ?? '—' },
    { label: 'Textura score/5',    key: d => d.clases.textura?.score ?? '—' },
    { label: 'MOS (%)',            key: d => d.synth.MOS ?? '—' },
    { label: 'MOS score/5',        key: d => d.clases.MOS?.score ?? '—' },
    { label: 'MOS categoria',      key: d => d.clases.MOS?.label ?? '—' },
    { label: 'P (mg/kg)',          key: d => d.synth.P ?? '—' },
    { label: 'P score/5',          key: d => d.clases.P?.score ?? '—' },
    { label: 'P categoria',        key: d => d.clases.P?.label ?? '—' },
    { label: 'K (mg/kg)',          key: d => d.synth.K ?? '—' },
    { label: 'K score/5',          key: d => d.clases.K?.score ?? '—' },
    { label: 'K categoria',        key: d => d.clases.K?.label ?? '—' },
    { label: 'Centroide Lat',      key: d => d.centLat },
    { label: 'Centroide Lon',      key: d => d.centLon },
  ]

  const compRows = params.map(p => {
    const row = [p.label, ...datosParcelas.map(d => p.key(d))]
    if (parcelas.length === 2) {
      const v1 = datosParcelas[0].indice
      const v2 = datosParcelas[1].indice
      if (p.label === 'IVA (0-100)' && v1 != null && v2 != null) {
        const diff = Math.abs(v1 - v2)
        const interp = diff < 10
          ? 'Mismo plan de abonado justificado'
          : diff <= 20
          ? 'Un plan con observaciones diferenciadas'
          : 'Planes independientes recomendados'
        row.push(diff, interp)
      } else {
        row.push('', '')
      }
    }
    return row
  })

  const ws1 = XLSX.utils.aoa_to_sheet([colHeaders, ...compRows])
  ws1['!cols'] = colHeaders.map((_, i) => ({ wch: i === 0 ? 28 : i === colHeaders.length - 1 ? 40 : 18 }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Comparativa parcelas')

  // ── Hoja 2: Metadatos ──
  const meta = [
    ['Fuente de datos', 'LUCAS Soil 2018 — Joint Research Centre (JRC), Comision Europea'],
    ['MOS', 'Calculado como OC x 1,724 (coeficiente de Waksman)'],
    ['CRS', 'EPSG:4326 — WGS84'],
    ['Nota orientativa', 'Densidad media LUCAS ~1 punto/18 km2. Datos de referencia, no de precision parcelaria.'],
    ['Marco normativo', 'RD 1051/2022 — Nutricion sostenible de suelos agrarios'],
    ['Generado con', 'LUCAS Soil Explorer — VisualNACert'],
    ['Licencia datos SIGPAC', 'FEGA — Creative Commons BY 4.0. https://www.fega.gob.es'],
    ['Fecha exportacion', new Date().toLocaleDateString('es-ES')],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(meta)
  ws2['!cols'] = [{ wch: 28 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Metadatos')

  // ── Hoja 3: Puntos vecinos LUCAS por parcela ──
  const lucasHeader = ['Parcela', 'Rank', 'POINTID', 'Lat', 'Lon', 'Dist (km)', 'pH (H2O)', 'MOS (%)', 'OC (g/kg)', 'N (g/kg)', 'P (mg/kg)', 'K (mg/kg)', 'CaCO3 (%)', 'Arcilla (%)', 'Arena (%)', 'Limo (%)', 'Textura USDA', 'BD (g/cm3)', 'IVA', 'Categoria IVA']
  const lucasRows = []
  datosParcelas.forEach(({ parcela }) => {
    const coords = parcela.geojson.geometry.coordinates[0]
    const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
    const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const neighbors = allPoints
      .map(pt => ({ ...pt, _d: Math.sqrt((pt.lat - centLat) ** 2 + (pt.lon - centLon) ** 2) }))
      .sort((a, b) => a._d - b._d)
      .slice(0, 5)
    neighbors.forEach((pt, i) => {
      const { indice } = indiceAgronomico(pt, sistema)
      const catIva = indice == null ? '—' : indice >= 80 ? 'Muy buena aptitud' : indice >= 60 ? 'Buena aptitud' : indice >= 40 ? 'Aptitud moderada' : indice >= 20 ? 'Limitaciones importantes' : 'Limitaciones severas'
      lucasRows.push([
        parcela.nombre, i + 1, pt.id, pt.lat, pt.lon,
        Math.round(pt._d * 111 * 10) / 10,
        pt.pH_w ?? '—', pt.MOS ?? '—', pt.OC ?? '—', pt.N ?? '—',
        pt.P ?? '—', pt.K ?? '—', pt.CaCO3 ?? '—',
        pt.clay ?? '—', pt.sand ?? '—', pt.silt ?? '—',
        pt.usda ?? '—', pt.bd ?? '—',
        indice ?? '—', catIva,
      ])
    })
  })
  const ws3 = XLSX.utils.aoa_to_sheet([lucasHeader, ...lucasRows])
  ws3['!cols'] = lucasHeader.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, ws3, 'Puntos vecinos LUCAS')

  // ── Hoja 4: Recintos SIGPAC por parcela ──
  if (window._sigpacRecintos && window._sigpacRecintos.length > 0) {
    const sigpacHeader = [
      'Parcela', 'Provincia', 'Municipio', 'Poligono', 'Recinto',
      'Uso SIGPAC', 'Descripcion uso', 'Agricola',
      'Superficie (ha)', 'Sup. interseccion (ha)',
      'Admisibilidad (%)', 'Coef. regadio (%)',
      'Zona nitratos', 'Altitud (m)', 'Incidencias',
    ]
    const sigpacRows = []
   datosParcelas.forEach(({ parcela }) => {
      const datosSigpac = window._sigpacRecintosPorParcela?.[parcela.id]
      const poligono = datosSigpac?.geojson || parcela.geojson
      const recintos = datosSigpac?.recintos || []
      recintos
        .filter(r => {
          if (!poligono || !r.wkt) return true
          return calcularInterseccion(poligono, r.wkt) !== null
        })
        .forEach(r => {
          const supInterseccion = poligono && r.wkt
            ? parseFloat(calcularInterseccion(poligono, r.wkt))
            : '—'
          sigpacRows.push([
            parcela.nombre,
            r.provincia || '—', r.municipio || '—',
            r.poligono || '—', r.recinto || '—',
            r.uso || '—', r.usoDesc || '—',
            r.agricola ? 'Si' : 'No',
            r.superficie || '—', supInterseccion,
            r.admisibilidad || '—', r.regadio || '—',
            r.nitratos || '—', r.altitud || '—',
            r.incidencias || '—',
          ])
        })
    })
    const ws4 = XLSX.utils.aoa_to_sheet([sigpacHeader, ...sigpacRows])
    ws4['!cols'] = sigpacHeader.map((_, i) => ({ wch: i === 6 ? 28 : 14 }))
    XLSX.utils.book_append_sheet(wb, ws4, 'Recintos SIGPAC')
  }

  XLSX.writeFile(wb, `LUCAS_comparativa_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
