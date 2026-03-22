import L from 'leaflet'
import { haversine, idw } from './spatial.js'
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

function stepFromZoom(zoom) {
  if (zoom <= 9)  return 0.08
  if (zoom <= 11) return 0.025
  if (zoom <= 13) return 0.008
  return 0.002
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
}

export function paintRaster(map, points, param, layer, sistema = 'secano') {
  layer.clearLayers()

  const zoom   = map.getZoom()
  const bounds = map.getBounds()
  const step   = stepFromZoom(zoom)
  
  // No renderizar a zoom muy bajo — demasiadas celdas
  if (zoom < 9) {
    window.dispatchEvent(new CustomEvent('raster-legend', {
      detail: { param, categories: {}, useAgronomic: false, sistema, zoom, blocked: true }
    }))
    return
  }

  const minLat = bounds.getSouth()
  const maxLat = bounds.getNorth()
  const minLon = bounds.getWest()
  const maxLon = bounds.getEast()

  const isUSDA      = param === 'usda'
  const isIVA       = param === 'iva'
  const isAgronomic = AGRONOMIC_PARAMS.includes(param)

  const field       = isIVA ? 'pH_w' : (fieldMap[param] || param)
  const validPoints = points.filter(pt => pt[field] != null)
  if (!validPoints.length) return

  const numVals = validPoints.map(pt => pt[field]).filter(v => typeof v === 'number')
  const minVal  = numVals.length ? Math.min(...numVals) : 0
  const maxVal  = numVals.length ? Math.max(...numVals) : 1
  const range   = maxVal - minVal || 1

  const categories = {}

  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lon = minLon; lon < maxLon; lon += step) {
      const centerLat = lat + step / 2
      const centerLon = lon + step / 2

      const neighbors = points
        .map(pt => ({ ...pt, _d: haversine(centerLat, centerLon, pt.lat, pt.lon) }))
        .filter(pt => pt._d < 120)
        .sort((a, b) => a._d - b._d)
        .slice(0, 8)

      if (!neighbors.length || neighbors[0]._d > 50) continue

      const dominantUSDA = neighbors[0]?.usda || 'loam'
      let fillColor = '#cccccc55'
      let catLabel  = null

      if (isIVA) {
        // Punto sintético con valores IDW para calcular IVA
        const synth = {
          pH_w: idw(centerLat, centerLon, neighbors.filter(p => p.pH_w != null), 'pH_w'),
          MOS:  idw(centerLat, centerLon, neighbors.filter(p => p.MOS  != null), 'MOS'),
          P:    idw(centerLat, centerLon, neighbors.filter(p => p.P    != null), 'P'),
          K:    idw(centerLat, centerLon, neighbors.filter(p => p.K    != null), 'K'),
          usda: dominantUSDA,
          bd:   null,
        }
        const { indice } = indiceAgronomico(synth, sistema)
        fillColor = colorIndice(indice) + '99'

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
        fillColor  = (USDA_COLORS[cls] || '#cccccc') + '99'
        catLabel   = neighbors[0]?.usda || 'Sin dato'
        categories[catLabel] = (categories[catLabel] || 0) + 1

      } else if (isAgronomic) {
        const val = idw(centerLat, centerLon, neighbors, field)
        if (val == null) continue
        const cls = classifyValue(param, val, dominantUSDA, sistema)
        fillColor  = cls ? cls.color + '99' : '#cccccc99'
        catLabel   = cls ? cls.label : 'Sin dato'
        categories[catLabel] = (categories[catLabel] || 0) + 1

      } else {
        const val = idw(centerLat, centerLon, neighbors, field)
        if (val == null) continue
        const norm = (val - minVal) / range
        const r = Math.round(68  + (220 - 68)  * norm)
        const g = Math.round(1   + (50  - 1)   * norm)
        const b = Math.round(84  + (32  - 84)  * norm)
        fillColor = `rgba(${r},${g},${b},0.55)`
      }

      const rect = L.rectangle(
        [[lat, lon], [lat + step, lon + step]],
        { color: 'transparent', weight: 0, fillColor, fillOpacity: 1 }
      )

      if (catLabel) {
        rect.bindTooltip(
          `<strong>${param.toUpperCase()}</strong>: ${catLabel}` +
          `<br><small>IDW ${neighbors.length} pts LUCAS · zoom ${zoom}</small>`,
          { sticky: true }
        )
      }

      layer.addLayer(rect)
    }
  }

  window.dispatchEvent(new CustomEvent('raster-legend', {
    detail: {
      param,
      categories,
      useAgronomic: isAgronomic || isUSDA || isIVA,
      sistema,
      zoom,
    }
  }))
}
