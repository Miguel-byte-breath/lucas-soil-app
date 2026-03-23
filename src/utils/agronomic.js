// Agrupación de texturas USDA en 3 grupos para P y K
export function textureGroup(usda) {
  if (!usda) return 'media'
  const u = usda.toLowerCase().trim()
  if (['sand', 'loamy sand', 'sandy loam'].includes(u)) return 'gruesa'
  if (['loam', 'silt loam', 'silt'].includes(u)) return 'media'
  return 'fina'
}

export function classifyTextura(usda) {
  if (!usda) return null
  const scores = {
    'loam':             5.0,
    'silt loam':        4.5,
    'sandy loam':       4.0,
    'clay loam':        4.0,
    'silty clay loam':  3.5,
    'sandy clay loam':  3.5,
    'loamy sand':       2.5,
    'silt':             2.5,
    'silty clay':       2.0,
    'sandy clay':       2.0,
    'clay':             1.5,
    'sand':             1.0,
  }
  const key   = usda.toLowerCase().trim()
  const score = scores[key] ?? 2.5
  return { label: usda, score, color: '#888' }
}
// pH — usa pH_H2O directamente (comparable con tabla FertiPRO)
export function classifyPH(pH_w) {
  if (pH_w == null) return null
  if (pH_w < 5.5)  return { label: 'Muy ácido',  score: 1, color: '#A32D2D' }
  if (pH_w < 6.5)  return { label: 'Ácido',       score: 2, color: '#EF9F27' }
  if (pH_w <= 7.5) return { label: 'Neutro',      score: 5, color: '#639922' }
  if (pH_w <= 8.5) return { label: 'Básico',      score: 3, color: '#378ADD' }
  return                   { label: 'Muy básico', score: 1, color: '#7F77DD' }
}

// MOS % — por sistema secano/regadío
export function classifyMOS(mos, sistema) {
  if (mos == null) return null
  if (sistema === 'regadio') {
    if (mos <= 1.5) return { label: 'Bajo',   score: 2, color: '#E24B4A' }
    if (mos <= 2.0) return { label: 'Normal', score: 5, color: '#639922' }
    return                 { label: 'Alto',   score: 4, color: '#378ADD' }
  } else {
    if (mos <= 1.0) return { label: 'Bajo',   score: 2, color: '#E24B4A' }
    if (mos <= 1.5) return { label: 'Normal', score: 5, color: '#639922' }
    return                 { label: 'Alto',   score: 4, color: '#378ADD' }
  }
}

// P mg/kg — por grupo textural x sistema
const P_RANGES = {
  gruesa: {
    secano:  [4.8,  10.0, 13.1, 20.0],
    regadio: [6.1,  11.8, 17.9, 28.8],
  },
  media: {
    secano:  [7.0,  11.8, 17.9, 27.9],
    regadio: [7.8,  16.1, 24.0, 31.8],
  },
  fina: {
    secano:  [7.8,  16.1, 24.0, 40.1],
    regadio: [10.0, 20.1, 30.1, 40.1],
  },
}

export function classifyP(p, usda, sistema) {
  if (p == null) return null
  const group = textureGroup(usda)
  const sys   = sistema === 'regadio' ? 'regadio' : 'secano'
  const [mb, b, n, a] = P_RANGES[group][sys]
  if (p <= mb) return { label: 'Muy bajo', score: 1, color: '#A32D2D' }
  if (p <= b)  return { label: 'Bajo',     score: 2, color: '#EF9F27' }
  if (p <= n)  return { label: 'Normal',   score: 5, color: '#639922' }
  if (p <= a)  return { label: 'Alto',     score: 4, color: '#378ADD' }
  return               { label: 'Muy alto', score: 3, color: '#7F77DD' }
}

// K mg/kg — por grupo textural x sistema
const K_RANGES = {
  gruesa: {
    secano:  [41.5,  74.7, 107.9, 149.4],
    regadio: [49.8,  83.0, 124.5, 199.2],
  },
  media: {
    secano:  [53.9, 107.9, 166.0, 215.8],
    regadio: [49.8,  83.0, 124.5, 199.2],
  },
  fina: {
    secano:  [66.4, 116.2, 182.6, 273.9],
    regadio: [74.7, 124.5, 199.2, 290.5],
  },
}

export function classifyK(k, usda, sistema) {
  if (k == null) return null
  const group = textureGroup(usda)
  const sys   = sistema === 'regadio' ? 'regadio' : 'secano'
  const [mb, b, n, a] = K_RANGES[group][sys]
  if (k <= mb) return { label: 'Muy bajo', score: 1, color: '#A32D2D' }
  if (k <= b)  return { label: 'Bajo',     score: 2, color: '#EF9F27' }
  if (k <= n)  return { label: 'Normal',   score: 5, color: '#639922' }
  if (k <= a)  return { label: 'Alto',     score: 4, color: '#378ADD' }
  return               { label: 'Muy alto', score: 3, color: '#7F77DD' }
}

// N total g/kg — por textura USDA individual
const N_RANGES = {
  'sand':            [0.3, 0.6, 1.0],
  'loamy sand':      [0.4, 0.8, 1.2],
  'sandy loam':      [0.5, 1.0, 1.5],
  'loam':            [0.7, 1.3, 2.0],
  'silt loam':       [0.8, 1.5, 2.3],
  'silt':            [0.9, 1.7, 2.5],
  'sandy clay loam': [0.7, 1.4, 2.1],
  'clay loam':       [0.8, 1.6, 2.4],
  'silty clay loam': [0.9, 1.8, 2.7],
  'sandy clay':      [0.8, 1.5, 2.3],
  'silty clay':      [1.0, 2.0, 3.0],
  'clay':            [1.0, 2.0, 3.0],
}

export function classifyN(n, usda) {
  if (n == null) return null
  const key    = usda ? usda.toLowerCase().trim() : 'loam'
  const ranges = N_RANGES[key] || N_RANGES['loam']
  const [mb, b, m] = ranges
  if (n < mb) return { label: 'Muy bajo', score: 1, color: '#A32D2D' }
  if (n < b)  return { label: 'Bajo',     score: 2, color: '#EF9F27' }
  if (n < m)  return { label: 'Medio',    score: 4, color: '#639922' }
  return              { label: 'Alto',    score: 5, color: '#378ADD' }
}

// BD g/cm³ — rango habitual por textura
const BD_RANGES = {
  'sand':            [1.50, 1.80],
  'loamy sand':      [1.45, 1.75],
  'sandy loam':      [1.40, 1.65],
  'loam':            [1.30, 1.55],
  'silt loam':       [1.25, 1.50],
  'silt':            [1.20, 1.45],
  'sandy clay loam': [1.35, 1.60],
  'clay loam':       [1.30, 1.50],
  'silty clay loam': [1.25, 1.45],
  'sandy clay':      [1.40, 1.60],
  'silty clay':      [1.25, 1.45],
  'clay':            [1.20, 1.40],
}

export function classifyBD(bd, usda) {
  if (bd == null) return null
  const key    = usda ? usda.toLowerCase().trim() : 'loam'
  const ranges = BD_RANGES[key] || BD_RANGES['loam']
  const [min, max] = ranges
  if (bd < min)  return { label: 'Baja densidad', score: 3, color: '#378ADD' }
  if (bd <= max) return { label: 'Normal',         score: 5, color: '#639922' }
  return                { label: 'Compactado',     score: 1, color: '#A32D2D' }
}

// Índice agronómico compuesto (0-100)
const PESOS = { pH: 25, textura: 25, MOS: 20, P: 15, K: 15 }
const MAX_SCORE = 5

export function indiceAgronomico(pt, sistema) {
  const usda = pt.usda
  const clases = {
    pH:      classifyPH(pt.pH_w),
    textura: classifyTextura(pt.usda),
    MOS:     classifyMOS(pt.MOS, sistema),
    P:       classifyP(pt.P, usda, sistema),
    K:       classifyK(pt.K, usda, sistema),
  }
  let pesoTotal = 0
  let suma = 0
  for (const [param, peso] of Object.entries(PESOS)) {
    const c = clases[param]
    if (c != null) {
      suma      += (c.score / MAX_SCORE) * peso
      pesoTotal += peso
    }
  }
  const indice = pesoTotal > 0 ? Math.round((suma / pesoTotal) * 100) : null
  return { indice, clases }
}

export function colorIndice(indice) {
  if (indice == null) return '#cccccc'
  if (indice >= 80) return '#639922'
  if (indice >= 60) return '#9FCC52'
  if (indice >= 40) return '#EF9F27'
  if (indice >= 20) return '#E24B4A'
  return '#A32D2D'
}

// Clasificar un punto completo para mostrar en panel lateral
export function classifyPoint(pt, sistema) {
  return {
    pH:      classifyPH(pt.pH_w),
    textura: classifyTextura(pt.usda),
    MOS:     classifyMOS(pt.MOS, sistema),
    P:       classifyP(pt.P, pt.usda, sistema),
    K:       classifyK(pt.K, pt.usda, sistema),
  }
}
