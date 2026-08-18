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
 * Paginacion OGC (rev. 2026-08-18):
 *  - El paso 1 (items?bbox=) pedia una unica pagina con limit=50 y usaba
 *    ogc.features tal cual. En bboxes de parcelario denso (>50 recintos
 *    dentro de la bbox, no solo de la parcela del usuario) la OGC API
 *    trunca en silencio -> 200 OK con menos recintos de los que hay,
 *    incluido a veces algun recinto de la propia parcela del usuario.
 *    Mismo bug ya detectado y arreglado en fertipro-api-sativum, fertipro
 *    y fertipro-zonas-normativas (ver skill gis-foundation, seccion
 *    "Paginacion de la OGC API").
 *  - Ahora se pagina por offset creciente hasta cubrir numberMatched, con
 *    tope duro OGC_MAX_FEATURES y compartiendo presupuesto con la fase de
 *    reenriquecido (OGC_PAGINATION_SHARE de FUNCTION_BUDGET_MS). Si se
 *    agota el tope o el presupuesto antes de cubrir numberMatched, se
 *    devuelve lo acumulado con truncado:true en vez de reventar.
 *
 * La forma de respuesta se mantiene practicamente identica a la version
 * anterior ({features:[{properties:<registro>}]} en bbox, array crudo en
 * point); en bbox se anade un campo truncado (bool) informativo, ignorable
 * por el frontend si no lo usa.
 *
 * Licencia datos: CC BY 4.0 HVD SIGC (FEGA - Ministerio de Agricultura)
 */

// -- Config de resiliencia ---------------------------------------------------
const FUNCTION_BUDGET_MS = 24000   // maxDuration en vercel.json = 30s
const FETCH_TIMEOUT_MS   = 6000
const MAX_RETRIES        = 2       // 1 intento + 2 reintentos
const ENRICH_BATCH       = 10      // recintos reenriquecidos por lote
const OGC_LIMIT          = 50      // tamano de pagina de la OGC API
const OGC_MAX_FEATURES   = 300     // tope duro de seguridad (bbox anomalamente densa)
const OGC_PAGINATION_SHARE = 0.5   // cuota de FUNCTION_BUDGET_MS para paginar (el resto es para el reenriquecido)

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

/**
 * Pagina la OGC API de recintos (items?bbox=) hasta cubrir numberMatched.
 * Para de paginar cuando: se cubre numberMatched, una pagina viene vacia,
 * se alcanza el tope OGC_MAX_FEATURES, o se agota el presupuesto de tiempo
 * reservado para esta fase (OGC_PAGINATION_SHARE de FUNCTION_BUDGET_MS,
 * medido desde `start`, el mismo reloj que usa la fase de reenriquecido).
 *
 * Si la PRIMERA pagina falla (error de red o status no-ok), se relanza el
 * error para que el handler devuelva el mismo tipo de respuesta de error
 * que antes. Si falla una pagina intermedia, se conserva lo ya acumulado
 * (nunca se tira todo por un fallo tardio).
 *
 * Devuelve { features, numberMatched, truncado }.
 */
async function paginarOgcApi(bbox, start) {
  const budgetMs = FUNCTION_BUDGET_MS * OGC_PAGINATION_SHARE
  let features = []
  let numberMatched = null
  let offset = 0
  let truncado = false

  while (true) {
    const url = OGC_BASE + '?f=json&bbox=' + bbox + '&limit=' + OGC_LIMIT + '&offset=' + offset
    let r
    try {
      r = await fetchConReintento(url)
    } catch (err) {
      if (offset === 0) throw err
      truncado = true
      break
    }
    if (!r.ok) {
      if (offset === 0) {
        const err = new Error('SIGPAC OGC respondio ' + r.status)
        err.status = r.status
        throw err
      }
      truncado = true
      break
    }

    const data = await r.json()
    const pageFeats = Array.isArray(data.features) ? data.features : []
    features = features.concat(pageFeats)
    numberMatched = data.numberMatched ?? numberMatched

    const cubierto       = numberMatched != null && features.length >= numberMatched
    const sinMasPaginas  = pageFeats.length === 0
    const topeAlcanzado  = features.length >= OGC_MAX_FEATURES
    const sinPresupuesto = (Date.now() - start) >= budgetMs

    if ((topeAlcanzado || sinPresupuesto) && !cubierto) truncado = true
    if (cubierto || sinMasPaginas || topeAlcanzado || sinPresupuesto) break
    offset += OGC_LIMIT
  }

  return { features: features.slice(0, OGC_MAX_FEATURES), numberMatched, truncado }
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

    // 1. OGC API -> recintos que intersecan el bbox, paginando por offset
    //    hasta cubrir numberMatched (ver paginarOgcApi arriba).
    let paginado
    try {
      paginado = await paginarOgcApi(bbox, start)
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: 'SIGPAC OGC respondio ' + err.status })
      return res.status(502).json({ error: 'Error conectando con SIGPAC', detail: err.message })
    }

    const feats = paginado.features
    if (!feats.length) {
      res.setHeader('Cache-Control', 's-maxage=600')
      return res.status(200).json({ features: [], truncado: paginado.truncado })
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
    return res.status(200).json({ features: enriched, truncado: paginado.truncado })
  }

  return res.status(400).json({ error: 'type debe ser point o bbox' })
}
