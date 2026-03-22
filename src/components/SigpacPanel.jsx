import { USO_SIGPAC, USOS_AGRICOLAS } from '../utils/sigpac.js'

const USO_COLOR = (uso) => {
  if (!uso) return '#ccc'
  if (['TA','TH','IV'].includes(uso)) return '#639922'
  if (['CI','CV','CF','CS','OC'].includes(uso)) return '#EF9F27'
  if (['VI','VO','VF','FV'].includes(uso)) return '#7F77DD'
  if (['OV','OF','FL'].includes(uso)) return '#8B9A46'
  if (['FY','FF','FS','FV'].includes(uso)) return '#D2B48C'
  if (['PA','PR','PS'].includes(uso)) return '#9FCC52'
  if (['FO','MT'].includes(uso)) return '#4A2C0A'
  if (['AG'].includes(uso)) return '#378ADD'
  if (['ZU','ED','CA','IM','EP','ZC','ZV'].includes(uso)) return '#888780'
  return '#ccc'
}

export default function SigpacPanel({ data, loading }) {
  if (loading) return (
    <div className="panel-section">
      <h3>Recinto SIGPAC</h3>
      <p className="dist-note" style={{ marginTop: 6 }}>Consultando SIGPAC...</p>
    </div>
  )

  if (!data) return (
    <div className="panel-section">
      <h3>Recinto SIGPAC</h3>
      <p className="dist-note" style={{ marginTop: 6 }}>Sin datos SIGPAC para este punto</p>
    </div>
  )

  const agricola = USOS_AGRICOLAS.has(data.uso)

  return (
    <div className="panel-section">
      <h3>Recinto SIGPAC</h3>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '8px 0 12px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: USO_COLOR(data.uso),
          flexShrink: 0,
          border: '1px solid #33333322',
        }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {data.uso} — {data.usoDesc}
          </div>
          <div style={{
            fontSize: 11,
            color: agricola ? 'var(--color-text-success)' : 'var(--color-text-danger)',
            marginTop: 2,
          }}>
            {agricola ? 'Uso agrícola' : 'Uso no agrícola'}
          </div>
        </div>
      </div>

      <div className="param-row">
        <span className="param-label">Referencia</span>
        <span className="param-value" style={{ fontSize: 12 }}>
          {data.provincia}-{data.municipio}-{data.poligono}-{data.parcela}-{data.recinto}
        </span>
      </div>
      <div className="param-row">
        <span className="param-label">Municipio</span>
        <span className="param-value">{data.municipio}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Superficie</span>
        <span className="param-value">{data.superficie} ha</span>
      </div>
      <div className="param-row">
        <span className="param-label">Admisibilidad</span>
        <span className="param-value">{data.admisibilidad}%</span>
      </div>
      <div className="param-row">
        <span className="param-label">Coef. regadío</span>
        <span className="param-value">{data.regadio}%</span>
      </div>
      <div className="param-row">
        <span className="param-label">Incidencias</span>
        <span className="param-value" style={{ fontSize: 12 }}>{data.incidencias}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Zona nitratos</span>
        <span className="param-value" style={{
          color: data.nitratos === 'Sí' ? 'var(--color-text-warning)' : 'inherit'
        }}>
          {data.nitratos}
        </span>
      </div>
      <div className="param-row">
        <span className="param-label">Altitud media</span>
        <span className="param-value">{data.altitud} m</span>
      </div>
    </div>
  )
}
