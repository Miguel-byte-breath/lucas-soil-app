import { useEffect, useState } from 'react'

const CAT_COLORS = {
  'Muy ácido':    '#A32D2D',
  'Ácido':        '#EF9F27',
  'Neutro':       '#639922',
  'Básico':       '#378ADD',
  'Muy básico':   '#7F77DD',
  'Muy bajo':     '#A32D2D',
  'Bajo':         '#EF9F27',
  'Normal':       '#639922',
  'Alto':         '#378ADD',
  'Muy alto':     '#7F77DD',
  'Medio':        '#639922',
  'Baja densidad':'#378ADD',
  'Compactado':   '#A32D2D',
}

export default function GridControls({ polygon, gridParam, setGridParam, options, sistema, setSistema }) {
  const [legend, setLegend] = useState(null)

  useEffect(() => {
    const handler = (e) => setLegend(e.detail)
    window.addEventListener('grid-legend', handler)
    return () => window.removeEventListener('grid-legend', handler)
  }, [])

  useEffect(() => {
    if (!polygon) setLegend(null)
  }, [polygon])

  if (!polygon) return (
    <div className="grid-controls">
      <label>Grid de variabilidad</label>
      <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
        Dibuja un polígono en el mapa para generar el grid agronómico
      </p>
    </div>
  )

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
                flex: 1,
                padding: '6px 0',
                border: '1px solid',
                borderColor: sistema === s ? '#1a3a2a' : '#ddd',
                borderRadius: 4,
                background: sistema === s ? '#1a3a2a' : '#fff',
                color: sistema === s ? '#e8f5ee' : '#555',
                fontSize: 12,
                fontWeight: sistema === s ? 500 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s === 'secano' ? 'Secano' : 'Regadío'}
            </button>
          ))}
        </div>

        <label>Parámetro del grid</label>
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
            {legend.cells} celdas · {legend.sistema === 'regadio' ? 'Regadío' : 'Secano'}
          </p>
        )}
      </div>

      {legend && legend.useAgronomic && legend.categories && (
        <div className="legend">
          <p className="legend-title">
            {gridParam.toUpperCase()} — clasificación agronómica
          </p>
          {Object.entries(legend.categories)
            .sort((a, b) => {
              const order = ['Muy bajo','Bajo','Normal','Medio','Alto','Muy alto','Muy ácido','Ácido','Neutro','Básico','Muy básico','Baja densidad','Compactado']
              return order.indexOf(a[0]) - order.indexOf(b[0])
            })
            .map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: CAT_COLORS[cat] || '#ccc',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: '#444', flex: 1 }}>{cat}</span>
                <span style={{ fontSize: 11, color: '#999' }}>{n} celdas</span>
              </div>
            ))
          }
        </div>
      )}

      {legend && !legend.useAgronomic && (
        <div className="legend">
          <p className="legend-title">{gridParam.toUpperCase()} — bajo → alto</p>
          <div className="legend-scale">
            {['#44015499','#3b82af99','#21aa7799','#fde72599','#dc323099'].map((c, i) => (
              <div key={i} style={{ flex: 1, background: c }} />
            ))}
          </div>
          <div className="legend-labels">
            <span>{legend.minVal?.toFixed(1)}</span>
            <span>{((legend.minVal + legend.maxVal) / 2).toFixed(1)}</span>
            <span>{legend.maxVal?.toFixed(1)}</span>
          </div>
        </div>
      )}
    </>
  )
}
