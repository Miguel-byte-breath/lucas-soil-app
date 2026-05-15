import L from 'leaflet'
import { pointInPolygon, idw, haversine } from './spatial.js'
import { classifyPH, classifyMOS, classifyP, classifyK, classifyN, classifyBD, indiceAgronomico, colorIndice } from './agronomic.js'

const USDA_COLORS = {
  'sand':            '#F5DEB3',
  'loamy sand':      '#DEB887',
  'sandy loam':      '#D2B48C',
  'loam':            '#8B9A46',
  'silt loam':       '#6B8E23',
  'silt':            '#556B2F',
  'sandy clay loam': '#CD853F',
  'clay loam':       '#A0522D',
  'silty clay loam': '#8B4513',
  'sandy clay':      '#D2691E',
  'silty clay':      '#7B3F00',
  'clay':            '#4A2C0A',
}

// bbox sobre la geometría COMPLETA: todos los anillos del Polygon (incluido
// el segundo anillo en parcelas multipart mal codificadas) y todas las
// partes del MultiPolygon. Antes solo se usaba coordinates[0] y el grid
// se construía solo sobre la primera parte.
function getBBox(geojson) {
  const geom = geojson?.geometry || geojson
  let allRings = []
  if (geom?.type === 'Polygon')           allRings = geom.coordinates
  else if (geom?.type === 'MultiPolygon') allRings = geom.coordinates.flat()

  let minLon = Infinity, maxLon = -Infinity
  let minLat = Infinity, maxLat = -Infinity
  for (const ring of allRings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return { minLat, maxLat, minLon, maxLon }
}

function classifyValue(param, val, usda, sistema) {
  if (val == null) return null
  switch (param) {
    case 'pH':  return classifyPH(val)
    case 'MOS': return classifyMOS(val, sistema)
    case 'P':   return classifyP(val, usda, sistema)
    case 'K':   return classifyK(val, usda, sistema)
    case 'N':   return classifyN(val, usda)
    case 'bd':  return classifyBD(val, usda)
    default:    return null
  }
}

const AGRONOMIC_PARAMS = ['pH', 'MOS', 'P', 'K', 'N', 'bd']

const fieldMap = {
  pH:   'pH_w',
  MOS:  'MOS',
  P:    'P',
  K:    'K',
  N:    'N',
  bd:   'bd',
  usda: 'usda',
  iva:  'pH_w',
}

export function paintGrid(polygon, points, param, layer, sistema = 'secano') {
  layer.clearLayers()

  const { minLat, maxLat, minLon, maxLon } = getBBox(polygon)
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon

  const CELL_DEG = 0.0008
  const autoStep = Math.min(latSpan, lonSpan) / 8
  const step     = Math.min(autoStep, CELL_DEG)

  const field       = fieldMap[param] || param
  const validPoints = points.filter(pt => pt[field] != null)
  if (!validPoints.length) return

  const numVals = validPoints.map(pt => pt[field]).filter(v => typeof v === 'number')
  const minVal  = numVals.length ? Math.min(...numVals) : 0
  const maxVal  = numVals.length ? Math.max(...numVals) : 1
  const range   = maxVal - minVal || 1

  const centLat = (minLat + maxLat) / 2
  const centLon = (minLon + maxLon) / 2
  const nearest = validPoints
    .map(pt => ({ ...pt, _d: haversine(centLat, centLon, pt.lat, pt.lon) }))
    .sort((a, b) => a._d - b._d)[0]
  const dominantUSDA = nearest?.usda || 'loam'

  const isUSDA      = param === 'usda'
  const isIVA       = param === 'iva'
  const isAgronomic = AGRONOMIC_PARAMS.includes(param)
  const categories  = {}

  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lon = minLon; lon < maxLon; lon += step) {
      const centerLat = lat + step / 2
      const centerLon = lon + step / 2
      if (!pointInPolygon(centerLat, centerLon, polygon)) continue

      const neighbors = points
        .map(pt => ({ ...pt, _d: haversine(centerLat, centerLon, pt.lat, pt.lon) }))
        .filter(pt => pt._d < 80)
        .sort((a, b) => a._d - b._d)
        .slice(0, 8)

      if (!neighbors.length) continue

      let fillColor = '#ccccccb3'
      let catLabel  = null

      if (isIVA) {
        const synth = {
          pH_w: idw(centerLat, centerLon, neighbors.filter(p => p.pH_w != null), 'pH_w'),
          MOS:  idw(centerLat, centerLon, neighbors.filter(p => p.MOS  != null), 'MOS'),
          P:    idw(centerLat, centerLon, neighbors.filter(p => p.P    != null), 'P'),
          K:    idw(centerLat, centerLon, neighbors.filter(p => p.K    != null), 'K'),
          usda: dominantUSDA,
          bd:   null,
        }
        const { indice } = indiceAgronomico(synth, sistema)
        fillColor = colorIndice(indice) + 'b3'
        if (indice != null) {
          if (indice >= 80)      catLabel = 'Muy buena aptitud (80-100)'
          else if (indice >= 60) catLabel = 'Buena aptitud (60-80)'
          else if (indice >= 40) catLabel = 'Aptitud moderada (40-60)'
          else if (indice >= 20) catLabel = 'Limitaciones importantes (20-40)'
          else                   catLabel = 'Limitaciones severas (0-20)'
          categories[catLabel] = (categories[catLabel] || 0) + 1
        }

      } else if (isUSDA) {
        const cls = neighbors[0]?.usda?.toLowerCase().trim()
        fillColor  = (USDA_COLORS[cls] || '#cccccc') + 'b3'
        catLabel   = neighbors[0]?.usda || 'Sin dato'
        categories[catLabel] = (categories[catLabel] || 0) + 1

      } else if (isAgronomic) {
        const val = idw(centerLat, centerLon, neighbors, field)
        if (val == null) continue
        const cls = classifyValue(param, val, dominantUSDA, sistema)
        fillColor  = cls ? cls.color + 'b3' : '#ccccccb3'
        catLabel   = cls ? cls.label : 'Sin dato'
        categories[catLabel] = (categories[catLabel] || 0) + 1

      } else {
        const val = idw(centerLat, centerLon, neighbors, field)
        if (val == null) continue
        const norm = (val - minVal) / range
        const r = Math.round(68  + (220 - 68)  * norm)
        const g = Math.round(1   + (50  - 1)   * norm)
        const b = Math.round(84  + (32  - 84)  * norm)
        fillColor = `rgba(${r},${g},${b},0.70)`
      }

      const bounds = [[lat, lon], [lat + step, lon + step]]
      const rect   = L.rectangle(bounds, {
        color: '#44444433', weight: 0.5, fillColor, fillOpacity: 0.75,
      })

      rect.bindTooltip(
        `<strong>${param.toUpperCase()}</strong>: ${catLabel || ''}` +
        `<br><small>IDW ${neighbors.length} pts LUCAS</small>`,
        { sticky: true }
      )

      layer.addLayer(rect)
    }
  }

  window.dispatchEvent(new CustomEvent('grid-legend', {
    detail: {
      param,
      cells:       layer.getLayers().length,
      minVal,
      maxVal,
      categories,
      useAgronomic: isAgronomic || isUSDA || isIVA,
      sistema,
    }
  }))
}
