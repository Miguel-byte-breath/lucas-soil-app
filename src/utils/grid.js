import L from 'leaflet'
import { pointInPolygon, idw, haversine } from './spatial.js'
import { classifyPH, classifyMOS, classifyP, classifyK, classifyN, classifyBD } from './agronomic.js'

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

function getBBox(geojson) {
  const coords = geojson.geometry.type === 'Polygon'
    ? geojson.geometry.coordinates[0]
    : geojson.geometry.coordinates[0][0]
  let minLon = Infinity, maxLon = -Infinity
  let minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
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

export function paintGrid(polygon, points, param, layer, sistema = 'secano') {
  layer.clearLayers()

  const { minLat, maxLat, minLon, maxLon } = getBBox(polygon)
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon

  const CELL_DEG  = 0.0008
  const autoStep  = Math.min(latSpan, lonSpan) / 8
  const step      = Math.min(autoStep, CELL_DEG)

  const fieldMap = {
    pH:   'pH_w',
    MOS:  'MOS',
    P:    'P',
    K:    'K',
    N:    'N',
    bd:   'bd',
    usda: 'usda',
  }
  const field = fieldMap[param] || param

  const validPoints = points.filter(pt => pt[field] != null)
  if (!validPoints.length) return

  // Rango para escala continua (BD solo)
  const values = validPoints.map(pt => pt[field]).filter(v => typeof v === 'number')
  const minVal = values.length ? Math.min(...values) : 0
  const maxVal = values.length ? Math.max(...values) : 1
  const range  = maxVal - minVal || 1

  // Textura dominante del centroide para clasificar P, K, N, BD
  const centLat = (minLat + maxLat) / 2
  const centLon = (minLon + maxLon) / 2
  const nearest = validPoints
    .map(pt => ({ ...pt, _d: haversine(centLat, centLon, pt.lat, pt.lon) }))
    .sort((a, b) => a._d - b._d)[0]
  const dominantUSDA = nearest?.usda || 'loam'

  const isAgronomic = AGRONOMIC_PARAMS.includes(param)
  const isUSDA      = param === 'usda'
  const categories  = {}
  const cells       = []

  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lon = minLon; lon < maxLon; lon += step) {
      const centerLat = lat + step / 2
      const centerLon = lon + step / 2
      if (!pointInPolygon(centerLat, centerLon, polygon)) continue

      const neighbors = validPoints
        .map(pt => ({ ...pt, _d: haversine(centerLat, centerLon, pt.lat, pt.lon) }))
        .filter(pt => pt._d < 80)
        .sort((a, b) => a._d - b._d)
        .slice(0, 8)

      if (!neighbors.length) continue

      let fillColor = '#ccccccb3'
      let catLabel  = null

      if (isUSDA) {
        // Para USDA: tomar la clase del vecino más cercano (no IDW)
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

        const bounds = [[lat, lon], [lat + step, lon + step]]
        const rect   = L.rectangle(bounds, {
          color: '#44444433', weight: 0.5, fillColor, fillOpacity: 0.75,
        })
        rect.bindTooltip(
          `<strong>${param.toUpperCase()}</strong>: ${val.toFixed(2)}` +
          `<br><em>${catLabel}</em>` +
          `<br><small>IDW ${neighbors.length} puntos LUCAS</small>`,
          { sticky: true }
        )
        cells.push({ rect, val, catLabel })
        layer.addLayer(rect)
        continue

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
        `<br><small>${neighbors.length} puntos LUCAS</small>`,
        { sticky: true }
      )
      cells.push({ rect, catLabel })
      layer.addLayer(rect)
    }
  }

  window.dispatchEvent(new CustomEvent('grid-legend', {
    detail: {
      param,
      cells:       cells.length,
      minVal,
      maxVal,
      categories,
      useAgronomic: isAgronomic || isUSDA,
      sistema,
    }
  }))
}
