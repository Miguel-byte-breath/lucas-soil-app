// Distancia Haversine en km entre dos puntos (lat/lon en grados)
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Devuelve los N puntos más cercanos a {lat, lng}, ordenados por distancia
export function findNearest(origin, points, n = 5) {
  return points
    .map(pt => ({
      ...pt,
      dist_km: haversine(origin.lat, origin.lng, pt.lat, pt.lon),
    }))
    .sort((a, b) => a.dist_km - b.dist_km)
    .slice(0, n)
}

// ¿Un punto (lat, lon) está dentro de un polígono GeoJSON?
//
// Maneja correctamente:
//   - Polygon con un solo anillo (caso simple).
//   - Polygon con agujeros reales (anillo interior contenido en el exterior):
//     el punto en el agujero cuenta como FUERA — toggle por paridad.
//   - Polygon multipart MAL codificado (dos anillos disjuntos en lugar de
//     MultiPolygon, típico del parser shapefile): el punto en la segunda
//     parte cuenta como DENTRO — el mismo toggle por paridad lo resuelve
//     porque solo cruza el anillo de su propia parte.
//   - MultiPolygon: dentro si está dentro de cualquier parte.
//
// Antes solo se leía coordinates[0], lo que ignoraba la segunda parte de
// las parcelas multipart y dejaba sin grid esa zona.
export function pointInPolygon(lat, lon, geojson) {
  const geom = geojson?.geometry || geojson
  if (!geom) return false

  let parts
  if (geom.type === 'Polygon')      parts = [geom.coordinates]
  else if (geom.type === 'MultiPolygon') parts = geom.coordinates
  else return false

  for (const rings of parts) {
    let inside = false
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]  // xi=lon, yi=lat
        const [xj, yj] = ring[j]
        const intersect =
          (yi > lat) !== (yj > lat) &&
          lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
        if (intersect) inside = !inside
      }
    }
    if (inside) return true
  }
  return false
}

// IDW: Inverse Distance Weighting — valor interpolado en un punto
// dado un array de puntos con su valor del parámetro
export function idw(targetLat, targetLon, neighbors, param, power = 2) {
  const valid = neighbors.filter(pt => pt[param] != null)
  if (!valid.length) return null

  let weightSum = 0
  let valueSum  = 0

  for (const pt of valid) {
    const d = haversine(targetLat, targetLon, pt.lat, pt.lon)
    if (d < 0.001) return pt[param]  // coincide con el punto
    const w = 1 / Math.pow(d, power)
    weightSum += w
    valueSum  += w * pt[param]
  }

  return weightSum > 0 ? valueSum / weightSum : null
}
