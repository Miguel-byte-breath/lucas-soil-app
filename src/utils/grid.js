import L from 'leaflet'
import { pointInPolygon, idw, haversine } from './spatial.js'
import { classifyPH, classifyMOS, classifyP, classifyK, classifyN, classifyBD } from './agronomic.js'

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
    case 'pH':   return classifyPH(val)
    case 'MOS':  return classifyMOS(val, sistema)
    case 'P':    return classifyP(val, usda, sistema)
    case 'K':    return classifyK(val, usda, sistema)
    case 'N':    return classifyN(val, usda)
    case 'bd':   return classifyBD(val, usda)
    default:     return null
  }
}

// Para parámetros sin tabla agronómica (clay, sand) usamos escala continua
function valueToColorContinuous(norm) {
  const RAMP = [
    [0.00, [68,  1,  84]],
    [0.25, [59, 130, 175]],
    [0.50, [33, 170, 119]],
    [0.75, [253, 231,  37]],
    [1.00, [220,  50,  32]],
  ]
  const n = Math.max(0, Math.min(1, norm))
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, c0] = RAMP[i - 1]
    const [t1, c1] = RAMP[i]
    if (n <= t1) {
      const t = (n - t0) / (t1 - t0)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t)
      return `rgba(${r},${g},${b},0.70)`
    }
  }
  return 'rgba(220,50,32,0.70)'
}

const AGRONOMIC_PARAMS = ['pH', 'MOS', 'P', 'K', 'N', 'bd']

export function paintGrid(polygon, points, param, layer, sistema = 'secano') {
  layer.clearLayers()

  const { minLat, maxLat, minLon, maxLon } = getBBox(polygon)
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon
  const CELL_DEG = 0.0008   // ~90m — unidad mínima SIEX compatible
  const autoStep = Math.min(latSpan, lonSpan) / 8
  const step     = Math.min(autoStep, CELL_DEG)

  // Campo real en el punto según parámetro seleccionado
  const fieldMap = { pH: 'pH_w', MOS: 'MOS', P: 'P', K: 'K', N: 'N', bd: 'bd', clay: 'clay', sand: 'sand' }
  const field = fieldMap[param] || param

  const validPoints = points.filter(pt => pt[field] != null)
  if (!validPoints.length) return

  // Para escala continua necesitamos rango
  const values  = validPoints.map(pt => pt[field])
  const minVal  = Math.min(...values)
  const maxVal  = Math.max(...values)
  const range   = maxVal - minVal || 1

  // Textura dominante del punto más cercano al centroide (para clasificar P, K, N, BD)
  const centLat = (minLat + maxLat) / 2
  const centLon = (minLon + maxLon) / 2
  const nearest = validPoints
    .map(pt => ({ ...pt, _d: haversine(centLat, centLon, pt.lat, pt.lon) }))
    .sort((a, b) => a._d - b._d)[0]
  const dominantUSDA = nearest?.usda || 'loam'

  const useAgronomic = AGRONOMIC_PARAMS.includes(param)
  const categories   = {}
  const cells        = []

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

      const val = idw(centerLat, centerLon, neighbors, field)
      if (val == null) continue

      let fillColor
      let catLabel = null

      if (useAgronomic) {
        const cls = classifyValue(param, val, dominantUSDA, sistema)
        fillColor = cls ? cls.color + 'b3' : '#ccccccb3'
        catLabel  = cls ? cls.label : 'Sin dato'
        if (catLabel) categories[catLabel] = (categories[catLabel] || 0) + 1
      } else {
        const norm = (val - minVal) / range
        fillColor  = valueToColorContinuous(norm)
      }

      const bounds = [[lat, lon], [lat + step, lon + step]]
      const rect   = L.rectangle(bounds, {
        color:       '#44444433',
        weight:      0.5,
        fillColor,
        fillOpacity: 0.75,
      })

      rect.bindTooltip(
        `<strong>${param.toUpperCase()}</strong>: ${val.toFixed(2)}` +
        (catLabel ? `<br><em>${catLabel}</em>` : '') +
        `<br><small>IDW ${neighbors.length} puntos LUCAS</small>`,
        { sticky: true }
      )

      cells.push({ rect, val, catLabel })
      layer.addLayer(rect)
    }
  }

  window.dispatchEvent(new CustomEvent('grid-legend', {
    detail: {
      param,
      cells:      cells.length,
      minVal,
      maxVal,
      categories,
      useAgronomic,
      sistema,
    }
  }))
}
