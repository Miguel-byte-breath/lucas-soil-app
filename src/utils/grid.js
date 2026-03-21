import L from 'leaflet'
import { pointInPolygon, idw, haversine } from './spatial.js'

// Paleta de color continua: azul (bajo) → verde → amarillo → rojo (alto)
const RAMP = [
  [0.00, [68,  1,  84]],
  [0.25, [59, 130, 175]],
  [0.50, [33, 170, 119]],
  [0.75, [253, 231,  37]],
  [1.00, [220,  50,  32]],
]

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function valueToColor(norm) {
  const n = Math.max(0, Math.min(1, norm))
  for (let i = 1; i < RAMP.length; i++) {
    const [t0, c0] = RAMP[i - 1]
    const [t1, c1] = RAMP[i]
    if (n <= t1) {
      const t = (n - t0) / (t1 - t0)
      const r = lerp(c0[0], c1[0], t)
      const g = lerp(c0[1], c1[1], t)
      const b = lerp(c0[2], c1[2], t)
      return `rgba(${r},${g},${b},0.65)`
    }
  }
  return `rgba(220,50,32,0.65)`
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

export function paintGrid(polygon, points, param, layer) {
  layer.clearLayers()

  const { minLat, maxLat, minLon, maxLon } = getBBox(polygon)
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon

  // Tamaño de celda: ~10 celdas en el lado más corto
  const step = Math.min(latSpan, lonSpan) / 10

  // Puntos con valor válido del parámetro
  const validPoints = points.filter(pt => pt[param] != null)
  if (!validPoints.length) return

  // Rango de valores para normalizar color
  const values = validPoints.map(pt => pt[param])
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range  = maxVal - minVal || 1

  // Generar celdas
  const cells = []
  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lon = minLon; lon < maxLon; lon += step) {
      const centerLat = lat + step / 2
      const centerLon = lon + step / 2

      // Solo si el centro de la celda está dentro del polígono
      if (!pointInPolygon(centerLat, centerLon, polygon)) continue

      // Vecinos más cercanos para IDW (máx 8, radio 80 km)
      const neighbors = validPoints
        .map(pt => ({ ...pt, _d: haversine(centerLat, centerLon, pt.lat, pt.lon) }))
        .filter(pt => pt._d < 80)
        .sort((a, b) => a._d - b._d)
        .slice(0, 8)

      const val = idw(centerLat, centerLon, neighbors, param)
      if (val == null) continue

      const norm  = (val - minVal) / range
      const color = valueToColor(norm)

      const bounds = [[lat, lon], [lat + step, lon + step]]
      const rect = L.rectangle(bounds, {
        color:       '#555',
        weight:      0.5,
        fillColor:   color,
        fillOpacity: 0.7,
      })

      rect.bindTooltip(
        `<strong>${param.toUpperCase()}</strong>: ${val.toFixed(2)}<br>
         <small>IDW de ${neighbors.length} puntos LUCAS</small>`,
        { sticky: true }
      )

      cells.push({ rect, val })
      layer.addLayer(rect)
    }
  }

  // Leyenda en el panel (evento custom)
  window.dispatchEvent(new CustomEvent('grid-legend', {
    detail: { minVal, maxVal, param, cells: cells.length }
  }))
}
