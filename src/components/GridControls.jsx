import { useEffect, useState } from 'react'

const CAT_COLORS = {
  'Muy ácido':     '#A32D2D',
  'Ácido':         '#EF9F27',
  'Neutro':        '#639922',
  'Básico':        '#378ADD',
  'Muy básico':    '#7F77DD',
  'Muy bajo':      '#A32D2D',
  'Bajo':          '#EF9F27',
  'Normal':        '#639922',
  'Medio':         '#639922',
  'Alto':          '#378ADD',
  'Muy alto':      '#7F77DD',
  'Baja densidad': '#378ADD',
  'Compactado':    '#A32D2D',
  'Muy buena aptitud (80-100)':        '#27500A',
  'Buena aptitud (60-80)':             '#639922',
  'Aptitud moderada (40-60)':          '#EF9F27',
  'Limitaciones importantes (20-40)':  '#E24B4A',
  'Limitaciones severas (0-20)':       '#A32D2D',
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

const USDA_LABELS = {
  'sand':            'Arenoso',
  'loamy sand':      'Arenoso franco',
  'sandy loam':      'Franco arenoso',
  'loam':            'Franco',
  'silt loam':       'Franco limoso',
  'silt':            'Limoso',
  'sandy clay loam': 'Franco arcillo arenoso',
  'clay loam':       'Franco arcilloso',
  'silty clay loam': 'Franco arcillo limoso',
  'sandy clay':      'Arcillo arenoso',
  'silty clay':      'Arcillo limoso',
  'clay':            'Arcilloso',
}

const CAT_ORDER = [
  'Muy buena aptitud (80-100)',
  'Buena aptitud (60-80)',
  'Aptitud moderada (40-60)',
  'Limitaciones importantes (20-40)',
  'Limitaciones severas (0-20)',
  'Muy ácido','Ácido','Neutro','Básico','Muy básico',
  'Muy bajo','Bajo','Normal','Medio','Alto','Muy alto',
  'Baja densidad','Compactado',
]

function LegendItem({ color, label, count, faded }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 5, opacity: faded ? 0.35 : 1,
    }}>
      <div style={{
        width: 14, height: 14, borderRadius: 3,
        background: color, flexShrink: 0,
        border: faded ? '1px solid #ccc' : '1.5px solid #33333366',
      }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1 }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {count}
        </span>
      )}
    </div>
  )
}

export default function GridControls({ polygon, gridParam, setGridParam, options, sistema, setSistema }) {
  const [gridLegend,   setGridLegend]   = useState(null)
  const [rasterLegend, setRasterLegend] = useState(null)

  useEffect(() => {
    const onGrid   = (e) => setGridLegend(e.detail)
    const onRaster = (e) => setRasterLegend(e.detail)
    window.addEventListener('grid-legend',   onGrid)
    window.addEventListener('raster-legend', onRaster)
    return () => {
      window.removeEventListener('grid-legend',   onGrid)
      window.removeEventListener('raster-legend', onRaster)
    }
  }, [])

  useEffect(() => {
    if (!polygon) setGridLegend(null)
    else          setRasterLegend(null)
  }, [polygon])

  const legend = polygon ? gridLegend : rasterLegend
  const mode   = polygon ? 'parcela' : 'comarca'

  const renderLegend = () => {
    if (!legend?.useAgronomic || !legend?.categories) return null

    if (gridParam === 'usda') {
      return (
        <div className="legend">
          <p className="legend-title">Textura USDA</p>
          {Object.entries(USDA_LABELS).map(([cls, label]) => {
            const count = legend.categories?.[cls] || 0
            return (
              <LegendItem
                key={cls}
                color={CAT_COLORS[cls] || '#ccc'}
                label={`${label}`}
                count={count}
                faded={count === 0}
              />
            )
          })}
        </div>
      )
    }

    const cats = Object.entries(legend.categories)
      .sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]))

    return (
      <div className="legend">
        <p className="legend-title">
          {gridParam.toUpperCase()} — {mode === 'comarca' ? 'vista comarca' : 'grid parcela'}
        </p>
        {cats.map(([cat, n]) => (
          <LegendItem
            key={cat}
            color={CAT_COLORS[cat] || '#ccc'}
            label={cat}
            count={n}
            faded={false}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid-controls">
        <label>Sistema de explotación</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {['secano', 'regadio'].map(s => (
            <button
              key={s}
              onClick={() => setSistema(s)}
              style={{
                flex: 1, padding: '6px 0',
                border: '1px solid',
                borderColor: sistema === s ? '#1a3a2a' : '#ddd',
                borderRadius: 4,
                background: sistema === s ? '#1a3a2a' : '#fff',
                color: sistema === s ? '#e8f5ee' : '#555',
                fontSize: 12,
                fontWeight: sistema === s ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {s === 'secano' ? 'Secano' : 'Regadío'}
            </button>
          ))}
        </div>

        <label>Parámetro</label>
        <select
          value={gridParam}
          onChange={e => setGridParam(e.target.value)}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {legend && (
          <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {mode === 'comarca'
              ? `Vista comarca · zoom ${legend.zoom} · ${legend.sistema === 'regadio' ? 'Regadío' : 'Secano'}`
              : `${gridLegend?.cells || 0} celdas · ${legend.sistema === 'regadio' ? 'Regadío' : 'Secano'}`
            }
          </p>
        )}
      </div>

      {renderLegend()}

      {polygon && (
        <div className="warning-note">
          Grid orientativo — densidad LUCAS ~1 punto/18 km². Usar como referencia, no como análisis de precisión parcelaria.
        </div>
      )}
    </>
  )
}
