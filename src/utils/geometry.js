import * as turf from '@turf/turf'

/**
 * src/utils/geometry.js — LUCAS Soil Explorer
 *
 * Utilidades de geometría centralizadas:
 *   - centroide(feature) → { lat, lon } garantizado DENTRO de la geometría,
 *     robusto frente a parcelas multipart (Polygon con anillos disjuntos o
 *     MultiPolygon con varias partes).
 */

// Ray-cast multi-anillo. Maneja Polygon simple, Polygon con agujero real,
// Polygon multipart mal codificado (anillos disjuntos como un Polygon, salida
// típica del parser shapefile casero) y MultiPolygon. Por paridad de cruces
// se resuelven los cuatro casos sin código especial.
function _ptInGeom(pt, geom) {
  if (!geom) return false
  const [x, y] = pt
  let parts
  if (geom.type === 'Polygon')           parts = [geom.coordinates]
  else if (geom.type === 'MultiPolygon') parts = geom.coordinates
  else return false
  for (const rings of parts) {
    let inside = false
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
    }
    if (inside) return true
  }
  return false
}

// Extrae las "partes" reales de una geometría. Distingue entre Polygon con
// agujero real (anillos interiores contenidos en el exterior) y Polygon mal
// codificado por el parser shapefile como anillos disjuntos.
//   Polygon 1 anillo                → [coords]
//   Polygon con hole real           → [coords] (outer + hole = 1 parte)
//   Polygon con anillos disjuntos   → [[ring0], [ring1], ...] (N partes)
//   MultiPolygon                    → coords tal cual
function _extraerPartes(geom) {
  if (!geom) return []
  if (geom.type === 'MultiPolygon') return geom.coordinates
  if (geom.type !== 'Polygon')      return []
  const coords = geom.coordinates
  if (!coords?.length) return []
  if (coords.length === 1) return [coords]
  const outerGeom = { type: 'Polygon', coordinates: [coords[0]] }
  const parteCero = [coords[0]]
  const disjuntas = []
  for (let i = 1; i < coords.length; i++) {
    const ring = coords[i]
    if (!ring?.length) continue
    const testPt = ring[Math.floor(ring.length / 2)]
    if (_ptInGeom(testPt, outerGeom)) parteCero.push(ring)
    else                              disjuntas.push([ring])
  }
  return [parteCero, ...disjuntas]
}

/**
 * Calcula un punto representativo dentro de un GeoJSON Feature, garantizando
 * que el punto cae DENTRO de la geometría.
 *
 * Estrategia híbrida en tres pasos:
 *  1. turf.pointOnFeature global (Pole of Inaccessibility — punto interior
 *     más alejado de cualquier borde). Suficiente para Polygon simple,
 *     Polygon con hole real, MultiPolygon de una parte.
 *  2. Si el punto cae FUERA (caso multipart disjunto, ya sea MultiPolygon
 *     con varias partes o Polygon mal codificado con anillos disjuntos),
 *     fallback a la parte de mayor área.
 *  3. Último recurso: media aritmética del primer anillo.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {{ lat: number, lon: number }}
 */
export function centroide(feature) {
  if (!feature?.geometry) return { lat: 0, lon: 0 }
  const geom = feature.geometry

  // 1) pointOnFeature global
  try {
    const cGlobal = turf.pointOnFeature(feature).geometry.coordinates
    if (_ptInGeom(cGlobal, geom)) {
      return { lon: cGlobal[0], lat: cGlobal[1] }
    }
  } catch { /* sigue al fallback */ }

  // 2) Fallback: parte de mayor área (cubre MultiPolygon disjunto y Polygon
  // con anillos disjuntos del parser shapefile)
  const partes = _extraerPartes(geom)
  if (partes.length >= 2) {
    let bestSub = null, bestArea = -1
    for (const parte of partes) {
      try {
        const sub = { type: 'Feature', geometry: { type: 'Polygon', coordinates: parte }, properties: {} }
        const a = turf.area(sub)
        if (a > bestArea) { bestArea = a; bestSub = sub }
      } catch { /* parte inválida, saltar */ }
    }
    if (bestSub) {
      try {
        const c = turf.pointOnFeature(bestSub).geometry.coordinates
        return { lon: c[0], lat: c[1] }
      } catch { /* sigue al último recurso */ }
    }
  }

  // 3) Último recurso: media aritmética del primer anillo
  const ring = geom.type === 'MultiPolygon'
    ? geom.coordinates[0]?.[0]
    : geom.coordinates?.[0]
  if (ring?.length) {
    let lon = 0, lat = 0
    for (const c of ring) { lon += c[0]; lat += c[1] }
    return { lon: lon / ring.length, lat: lat / ring.length }
  }
  return { lat: 0, lon: 0 }
}
