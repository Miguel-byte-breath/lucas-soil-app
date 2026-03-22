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
export function pointInPolygon(lat, lon, geojson) {
  const coords = geojson.geometry.type === 'Polygon'
    ? geojson.geometry.coordinates[0]
    : geojson.geometry.coordinates[0][0]

  let inside = false
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i]  // xi=lon, yi=lat en GeoJSON
    const [xj, yj] = coords[j]
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
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
