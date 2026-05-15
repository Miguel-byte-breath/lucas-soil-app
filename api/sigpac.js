const https = require('https')
const fetch = require('node-fetch')
const turf = require('@turf/turf')

const agent = new https.Agent({ rejectUnauthorized: false })

/**
 * api/sigpac.js
 * Proxy serverless para SIGPAC (FEGA).
 *
 *  ?type=point&lon=&lat=  -> recinto que contiene el punto (recinfobypoint).
 *  ?type=bbox&bbox=       -> TODOS los recintos que intersecan el bbox.
 *
 * Resiliencia / exactitud (rev. 2026-05-15):
 *  - type=bbox ya NO muestrea una rejilla de 16 puntos (ese metodo se dejaba
 *    recintos sin contar -> superficie de interseccion infravalorada). Ahora
 *    pide la lista COMPLETA a la OGC API (items?bbox=) y reenriquece cada
 *    recinto via recinfobypoint para conservar wkt + superficie + coef_regadio
 *    + admisibilidad + incidencias (campos que la OGC API no expone).
 *  - Todas las llamadas con timeout (AbortController) + reintento con backoff
 *    ante 502/503/504/429 y errores de red. Antes no habia timeout ni retry.
 *  - Guard de tiempo: si se agota el presupuesto, los recintos restantes se
 *    devuelven con los datos del OGC API + wkt convertido (nunca se pierde un
 *    recinto, aunque pierda los atributos extra).
 *
 * La forma de respuesta se mantiene identica a la version anterior
 * ({features:[{properties:<registro>}]} en bbox, array crudo en point) para
 * no tocar el frontend.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA - Ministerio de Agricultura)
 */

// -- Config de resiliencia ---------------------------------------------------
const FUNCTION_BUDGET_MS = 24000   // maxDuration en vercel.json = 30s
const FETCH_TIMEOUT_MS   = 6000
const MAX_RETRIES        = 2       // 1 intento + 2 reintentos
const ENRICH_BATCH       = 10      // recintos reenriquecidos por lote
const OGC_LIMIT          = 50

const OGC_BASE = 'https://sigpac-hubcloud.es/ogcapi/collections/recintos/items'
const SCS_BASE = 'https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326'

/**
 * fetch con timeout (AbortController) + reintento con backoff exponencial.
 * Reintenta ante 502/503/504/429 y ante errores de red (incluido timeout).
 * Devuelve la Response (sea ok o no); lanza si agota reintentos por error de red.
 */
async function fetchConReintento(url, { timeoutMs = FETCH_TIMEOUT_MS, maxRetries = MAX_RETRIES } = {}) {
  let ultimoError
  for (let intento = 0; intento <= maxRetries; intento++) {
    if (intento > 0) {
      // backoff: 400ms, 800ms, 1600ms...
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, intento - 1)))
    }
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { agent, signal: controller.signal })
      clearTimeout(timeoutId)
      if ([502, 503, 504, 429].includes(res.status) && intento < maxRetries) {
        ultimoError = new Error('upstream ' + res.status)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timeoutId)
      ultimoError = err
      if (intento >= maxRetries) throw err
    }
  }
  throw ultimoError || new Error('fetchConReintento: agotados los reintentos')
}

/** Clave de recinto: provincia-municipio-poligono-parcela-recinto */
function refKey(p) {
  return [p.provincia, p.municipio, p.poligono, p.parcela, p.recinto].map(Number).join('-')
}

/** GeoJSON Polygon/MultiPolygon -> WKT POLYGON (anillo exterior; sirve de fallback). */
function geometryToWkt(geom) {
  try {
    if (!geom) return null
    let rings
    if (geom.type === 'Polygon') rings = geom.coordinates
    else if (geom.type === 'MultiPolygon') rings = geom.coordinates[0]
    else return null
    const ringStr = rings
      .map(ring => '(' + ring.map(c => c[0] + ' ' + c[1]).join(', ') + ')')
      .join(', ')
    return 'POLYGON(' + ringStr + ')'
  } catch {
    return null
  }
}

/**
 * Reenriquece un recinto del OGC API: consulta recinfobypoint en un punto
 * interior para recuperar wkt + superficie + coef_regadio + admisibilidad +
 * incidencias. Si falla, fallback con los datos del OGC API + wkt convertido
 * desde su geometria. Devuelve siempre { properties: <registro> }.
 */
async function enriquecerRecinto(feature) {
  const ogcProps = feature.properties || {}
  const key = refKey(ogcProps)
  try {
    const pt = turf.pointOnFeature(feature)
    const [lon, lat] = pt.geometry.coordinates
    const res = await fetchConReintento(SCS_BASE + '/' + lon + '/' + lat + '.json')
    if (res.ok) {
      const arr = await res.json()
      const lista = Array.isArray(arr) ? arr : [arr]
      const match = lista.find(r => r && refKey(r) === key)
      if (match) return { properties: match }
    }
  } catch {
    /* cae al fallback */
  }
  // Fallback: datos del OGC API + geometria convertida a WKT
  return {
    properties: {
      ...ogcProps,
      wkt: geometryToWkt(feature.geometry),
    },
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const start = Date.now()
  const { type, lon, lat, bbox } = req.query

  // -- type=point ------------------------------------------------------------
  if (type === 'point') {
    if (!lon || !lat) return res.status(400).json({ error: 'lon y lat requeridos' })
    const url = SCS_BASE + '/' + lon + '/' + lat + '.json'
    try {
      const response = await fetchConReintento(url)
      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        return res.status(response.status).json({
          error: 'SIGPAC error: ' + response.status, detail: errText, url,
        })
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.status(200).json(data)
    } catch (err) {
      return res.status(502).json({ error: 'Error conectando con SIGPAC', detail: err.message })
    }
  }

  // -- type=bbox -------------------------------------------------------------
  if (type === 'bbox') {
    if (!bbox) return res.status(400).json({ error: 'bbox requerido' })

    // 1. OGC API -> lista COMPLETA de recintos que intersecan el bbox
    const ogcUrl = OGC_BASE + '?f=json&bbox=' + bbox + '&limit=' + OGC_LIMIT
    let ogc
    try {
      const r = await fetchConReintento(ogcUrl)
      if (!r.ok) {
        return res.status(r.status).json({ error: 'SIGPAC OGC respondio ' + r.status })
      }
      ogc = await r.json()
    } catch (err) {
      return res.status(502).json({ error: 'Error conectando con SIGPAC', detail: err.message })
    }

    const feats = Array.isArray(ogc.features) ? ogc.features : []
    if (!feats.length) {
      res.setHeader('Cache-Control', 's-maxage=600')
      return res.status(200).json({ features: [] })
    }

    // 2. Reenriquecer cada recinto via recinfobypoint, en lotes, con guard de tiempo
    const enriched = []
    for (let i = 0; i < feats.length; i += ENRICH_BATCH) {
      if (Date.now() - start > FUNCTION_BUDGET_MS) {
        // Sin presupuesto: el resto va con datos OGC + wkt convertido
        for (const f of feats.slice(i)) {
          enriched.push({
            properties: { ...(f.properties || {}), wkt: geometryToWkt(f.geometry) },
          })
        }
        break
      }
      const lote = feats.slice(i, i + ENRICH_BATCH)
      const resultados = await Promise.all(lote.map(enriquecerRecinto))
      enriched.push(...resultados)
    }

    res.setHeader('Cache-Control', 's-maxage=600')
    return res.status(200).json({ features: enriched })
  }

  return res.status(400).json({ error: 'type debe ser point o bbox' })
}
