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

// Formatea un valor numérico con su unidad; '—' si no hay dato.
const fmt = (v, unidad) => (v == null || v === '' ? '—' : `${v}${unidad}`)

const ORIGEN_TXT = {
  clic:    'Punto consultado: clic en el mapa',
  parcela: 'Punto consultado: punto de referencia de la parcela',
}

function Cabecera({ origen }) {
  return (
    <>
      <h3>Recinto SIGPAC</h3>
      {origen && ORIGEN_TXT[origen] && (
        <p className="dist-note" style={{ marginTop: 4 }}>{ORIGEN_TXT[origen]}</p>
      )}
    </>
  )
}

function Mensaje({ origen, texto, color }) {
  return (
    <div className="panel-section">
      <Cabecera origen={origen} />
      <p className="dist-note" style={{ marginTop: 6, ...(color ? { color } : {}) }}>{texto}</p>
    </div>
  )
}

export default function SigpacPanel({ data, loading, estado, origen }) {
  if (loading) return <Mensaje origen={origen} texto="Consultando SIGPAC..." />

  if (estado === 'error') return (
    <Mensaje
      origen={origen}
      color="var(--color-text-danger)"
      texto="No se pudo consultar SIGPAC (servicio no disponible). Reintenta en unos segundos."
    />
  )

  if (estado === 'vacio') return (
    <Mensaje origen={origen} texto="No hay recinto SIGPAC en este punto." />
  )

  if (!data) return (
    <Mensaje texto="Haz clic en el mapa o crea una parcela para consultar el recinto SIGPAC." />
  )

  const agricola = USOS_AGRICOLAS.has(data.uso)
  // Referencia oficial completa: provincia-municipio-agregado-zona-polígono-parcela-recinto
  const referencia = [
    data.provincia, data.municipio, data.agregado, data.zona,
    data.poligono, data.parcela, data.recinto,
  ].join('-')

  return (
    <div className="panel-section">
      <Cabecera origen={origen} />

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
        <span className="param-value" style={{ fontSize: 12 }}>{referencia}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Municipio (código)</span>
        <span className="param-value">{data.municipio}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Superficie</span>
        <span className="param-value">{fmt(data.superficie, ' ha')}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Admisibilidad</span>
        <span className="param-value">{fmt(data.admisibilidad, '%')}</span>
      </div>
      <div className="param-row">
        <span className="param-label">Coef. regadío</span>
        <span className="param-value">{fmt(data.regadio, '%')}</span>
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
        <span className="param-value">{fmt(data.altitud, ' m')}</span>
      </div>
    </div>
  )
}
