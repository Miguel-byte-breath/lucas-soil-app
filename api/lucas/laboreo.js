// =====================================================================
// /api/lucas/laboreo
// =====================================================================
// Endpoint que sirve datos LUCAS interpolados al motor TEMPERO/LABOREO
// de Visual Sensor.
//
// Recibe (lat, lon) en WGS84 y devuelve los parámetros del suelo
// interpolados por IDW sobre los 8 puntos LUCAS más cercanos, junto
// con metadatos de calidad espacial.
//
// Patrón inspirado en api/sigpac.js (CommonJS, response cache).
// =====================================================================

const lucasData = require('../../public/data/lucas_spain_canonical.json')

// =====================================================================
// Helpers espaciales (replicados de src/utils/spatial.js)
// El endpoint serverless no puede importar desde src/, así que se
// replican aquí. Son las funciones canónicas, no se modifican.
// =====================================================================

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371 // km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// IDW por campo, ignorando nulls. Si el punto coincide exactamente
// con un punto LUCAS (d < 1m), devuelve directamente su valor.
function idwField(targetLat, targetLon, neighbors, field, power = 2) {
  const valid = neighbors.filter(pt => pt[field] != null)
  if (!valid.length) return null

  let weightSum = 0
  let valueSum  = 0

  for (const pt of valid) {
    const d = haversine(targetLat, targetLon, pt.lat, pt.lon)
    if (d < 0.001) return pt[field]
    const w = 1 / Math.pow(d, power)
    weightSum += w
    valueSum  += w * pt[field]
  }
  return weightSum > 0 ? valueSum / weightSum : null
}

// =====================================================================
// Handler
// =====================================================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  // Validación de entrada
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({
      error: 'Parámetros lat y lon requeridos (en grados decimales WGS84)',
      example: '/api/lucas/laboreo?lat=37.40&lon=-5.50'
    })
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({
      error: 'lat debe estar en [-90, 90] y lon en [-180, 180]'
    })
  }

  // 8 vecinos más cercanos por Haversine
  const ranked = lucasData.points
    .map(pt => ({
      ...pt,
      distance_km: haversine(lat, lon, pt.lat, pt.lon)
    }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 8)

  const nearest      = ranked[0]
  const nearest_distance_m = Math.round(nearest.distance_km * 1000)

  // Aviso de baja representatividad si el punto más cercano está lejos
  const warnings = []
  if (nearest_distance_m > 10000) {
    warnings.push({
      code: 'LOW_SPATIAL_REPRESENTATIVENESS',
      message: `Punto LUCAS más cercano a ${(nearest_distance_m/1000).toFixed(1)} km. Resultado de baja representatividad.`
    })
  }
  if (nearest_distance_m > 50000) {
    warnings.push({
      code: 'OUT_OF_LUCAS_COVERAGE',
      message: `La consulta parece estar fuera de la cobertura LUCAS de España. Verificar coordenadas.`
    })
  }

  // Interpolación IDW por cada campo, ignorando nulls
  // Solo se devuelven los campos que LABOREO/TEMPERO necesita
  const fields = [
    'clay', 'silt', 'sand',
    'OC', 'MOS', 'CaCO3',
    'coarse',         // % másico (heredado, fracción 0-100)
    'coarse_vol',     // fracción volumétrica 0-1 (paper, USADO POR EL MODELO)
    'BDfine',         // BD matriz fina g/cm3 (paper, USADO POR EL MODELO)
    'BDsample_paper', // BD suelo total g/cm3 (paper, metadato auxiliar)
    'bd', 'bd10',     // BD heredados, para trazabilidad/comparación
  ]

  const interpolated = {}
  for (const f of fields) {
    interpolated[f] = idwField(lat, lon, ranked, f)
  }

  // Determinar fuente de BD según jerarquía
  let bd_source
  if (interpolated.BDfine != null) {
    bd_source = 'jrc_bdfine_0_20'
  } else {
    bd_source = 'imputed_rawls'  // motor LABOREO aplicará Rawls 1983
  }

  // Construir payload
  const response = {
    query: { lat, lon },
    lucas: {
      // Variables interpoladas — el motor LABOREO consume estas
      ...interpolated,
      bd_source,
      nearest_distance_m,
      nearest_point_id: nearest.id,
    },
    neighbors: ranked.slice(0, 5).map(pt => ({
      id:          pt.id,
      lat:         pt.lat,
      lon:         pt.lon,
      distance_m:  Math.round(pt.distance_km * 1000),
      // Subset de campos reales (no interpolados) para trazabilidad
      clay:        pt.clay,
      silt:        pt.silt,
      sand:        pt.sand,
      OC:          pt.OC,
      MOS:         pt.MOS,
      coarse:      pt.coarse,
      coarse_vol:  pt.coarse_vol,
      BDfine:      pt.BDfine,
      bd10:        pt.bd10,
      usda:        pt.usda,
    })),
    metadata: {
      dataset_version: lucasData.meta.schema_version || '2.0',
      dataset_sources: lucasData.meta.sources,
      build_timestamp: lucasData.meta.build_timestamp,
      api_version:     '1.0',
    },
    warnings,
  }

  // Cache agresivo: las constantes del suelo no cambian
  res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000') // 30 días
  return res.status(200).json(response)
}
