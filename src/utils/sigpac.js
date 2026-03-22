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

const BASE = 'https://sigpac-hubcloud.es/servicioconsultassigpac/query'

// Consulta recinto por punto (clic en mapa)
export async function consultarPunto(lat, lon) {
  try {
    const url = `${BASE}/recinfobypoint/4326/${lon}/${lat}.json`
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
    const url = `https://sigpac-hubcloud.es/ogcapisigpac/collections/recintos/items?bbox=${minLon},${minLat},${maxLon},${maxLat}&f=json&limit=100`
    const res = await fetch(url)
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
  const props = data.properties || data
  return {
    uso:        props.uso_sigpac || props.uso || '—',
    usoDesc:    USO_SIGPAC[props.uso_sigpac || props.uso] || '—',
    agricola:   esAgricola(props.uso_sigpac || props.uso),
    provincia:  props.provincia || '—',
    municipio:  props.municipio || '—',
    poligono:   props.poligono  || '—',
    parcela:    props.parcela   || '—',
    recinto:    props.recinto   || '—',
    superficie: props.superficie ? (props.superficie / 10000).toFixed(4) + ' ha' : '—',
    admisibilidad: props.coef_admisibilidad != null ? props.coef_admisibilidad + '%' : '—',
    nitratos:   props.zona_nitrato ? 'Sí' : 'No',
    altitud:    props.altitud_media ? props.altitud_media + ' m' : '—',
  }
}
