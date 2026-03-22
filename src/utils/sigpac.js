import * as turf from '@turf/turf'

// Convierte WKT POLYGON a GeoJSON Feature
function wktToGeoJSON(wkt) {
  if (!wkt) return null
  try {
    const inner = wkt.replace(/^POLYGON\s*\(\s*/i, '').replace(/\s*\)$/, '')
    const rings = []
    let depth = 0, start = 0
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '(') { if (depth === 0) start = i + 1; depth++ }
      else if (inner[i] === ')') {
        depth--
        if (depth === 0) {
          const ring = inner.slice(start, i).trim()
          rings.push(ring.split(',').map(pair => {
            const [lon, lat] = pair.trim().split(/\s+/).map(Number)
            return [lon, lat]
          }))
          start = i + 1
        }
      }
    }
    if (!rings.length) return null
    return turf.polygon(rings)
  } catch {
    return null
  }
}

// Calcula superficie de intersección en hectáreas
export function calcularInterseccion(poligonoUsuario, wktRecinto) {
  try {
    const recinto = wktToGeoJSON(wktRecinto)
    if (!recinto || !poligonoUsuario) return null
    const interseccion = turf.intersect(poligonoUsuario, recinto)
    if (!interseccion) return null
    const areaM2 = turf.area(interseccion)
    return (areaM2 / 10000).toFixed(4)
  } catch {
    return null
  }
}
// Códigos de uso SIGPAC
export const USO_SIGPAC = {
  CF: 'Asoc. Cítricos-Frutales',
  CS: 'Asoc. Cítricos-Frutos Secos',
  CV: 'Asoc. Cítricos-Viñedo',
  FF: 'Asoc. Frutales-Frutos Secos',
  OC: 'Asoc. Olivar-Cítricos',
  CI: 'Cítricos',
  AG: 'Agua',
  ED: 'Edificaciones',
  EP: 'Elemento del Paisaje',
  FO: 'Forestal',
  FY: 'Frutales',
  FS: 'Frutos Secos',
  FL: 'Frutos Secos y Olivar',
  FV: 'Frutos Secos y Viñedo',
  TH: 'Huerta',
  IV: 'Invernaderos / Bajo plástico',
  IM: 'Improductivos',
  MT: 'Matorral',
  OV: 'Olivar',
  OF: 'Olivar-Frutal',
  OP: 'Otros Cultivos Permanentes',
  PS: 'Pastizal',
  PR: 'Pasto Arbustivo',
  PA: 'Pasto Permanente con Arbolado',
  TA: 'Tierras Arables',
  CA: 'Viales',
  VI: 'Viñedo',
  VF: 'Viñedo-Frutal',
  VO: 'Viñedo-Olivar',
  ZV: 'Zona Censurada',
  ZC: 'Zona Concentrada',
  ZU: 'Zona Urbana',
}

export const USOS_AGRICOLAS = new Set([
  'IV','TA','TH',
  'OP','CF','CI','CS','CV',
  'FF','FL','FS','FV','FY',
  'OC','OF','OV','VF','VI','VO',
  'PA','PR','PS',
])

export const USOS_NO_AGRICOLAS = new Set([
  'AG','CA','ED','FO','MT','IM','ZU','EP','ZC','ZV',
])

export function esAgricola(uso) {
  return USOS_AGRICOLAS.has(uso)
}

const PROXY = '/api/sigpac'

// Consulta recinto por punto (clic en mapa)
export async function consultarPunto(lat, lon) {
  try {
    const url = `${PROXY}?type=point&lon=${lon}&lat=${lat}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data
  } catch {
    return null
  }
}

// Consulta recintos por bbox (polígono dibujado)
export async function consultarBbox(minLon, minLat, maxLon, maxLat) {
  try {
    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`
    const url  = `${PROXY}?type=bbox&bbox=${bbox}`
    const res  = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.features || []
  } catch {
    return []
  }
}

// Obtener todos los usos SIGPAC de una vista del mapa (para filtro raster)
export async function consultarUsosVista(bounds) {
  const { minLon, minLat, maxLon, maxLat } = bounds
  const features = await consultarBbox(minLon, minLat, maxLon, maxLat)
  // Construir mapa de uso por punto centroide para lookup rápido
  return features.map(f => ({
    uso:  f.properties?.uso_sigpac || f.properties?.uso || null,
    bbox: f.bbox || null,
    geom: f.geometry || null,
    props: f.properties || {},
  }))
}

// Formatear datos de recinto para mostrar en panel
export function formatearRecinto(data) {
  if (!data) return null
  // La API devuelve un array — cogemos el primer elemento
  const r = Array.isArray(data) ? data[0] : (data.properties || data)
  if (!r) return null
  return {
    uso:        r.uso_sigpac || '—',
    usoDesc:    USO_SIGPAC[r.uso_sigpac] || '—',
    agricola:   esAgricola(r.uso_sigpac),
    provincia:  r.provincia  != null ? String(r.provincia)  : '—',
    municipio:  r.municipio  != null ? String(r.municipio)  : '—',
    poligono:   r.poligono   != null ? String(r.poligono)   : '—',
    parcela:    r.parcela    != null ? String(r.parcela)    : '—',
    recinto:    r.recinto    != null ? String(r.recinto)    : '—',
    superficie: r.superficie != null ? r.superficie.toFixed(4) + ' ha' : '—',
    admisibilidad: r.admisibilidad != null ? r.admisibilidad + '%' : '—',
    nitratos:   r.zona_nitrato ? 'Sí' : 'No',
    altitud:    r.altitud    != null ? r.altitud + ' m'    : '—',
    regadio:    r.coef_regadio != null ? r.coef_regadio + '%' : '—',
    incidencias: r.incidencias || '—',
    wkt:        r.wkt || null,
  }
}
