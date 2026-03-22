import { exportGeoJSON, exportShapefile } from '../utils/export.js'

export default function ParamPanel({ selected, polygon }) {
  const pt = selected.clicked

  const fmt = (v, dec = 1) => v != null ? Number(v).toFixed(dec) : null

  const Val = ({ v, unit = '', dec = 1 }) => {
    if (v == null) return <span className="param-value unavailable">sin dato</span>
    return <span className="param-value">{fmt(v, dec)}{unit ? ' ' + unit : ''}</span>
  }

  return (
    <>
      <div className="panel-section">
        <h3>Punto de muestreo LUCAS 2018 Topsoil</h3>
        <div className="param-row">
          <span className="param-label">POINTID</span>
          <span className="param-value">{pt.id}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Coordenadas</span>
          <span className="param-value">{pt.lat?.toFixed(5)}, {pt.lon?.toFixed(5)}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Distancia</span>
          <span className="param-value">{pt.dist_km?.toFixed(2)} km</span>
        </div>
        <div className="param-row">
          <span className="param-label">Fecha muestreo</span>
          <span className="param-value">{pt.date ?? 'sin dato'}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Cobertura</span>
          <span className="param-value" style={{ fontSize: 12 }}>{pt.lc ?? 'sin dato'}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Elevacion</span>
          <Val v={pt.elev} unit="m" dec={0} />
        </div>
      </div>

      <div className="panel-section">
        <h3>Textura</h3>
        <div className="param-row">
          <span className="param-label">Clase USDA</span>
          {pt.usda
            ? <span className="badge-usda">{pt.usda}</span>
            : <span className="param-value unavailable">sin dato</span>
          }
        </div>
        <div className="param-row">
          <span className="param-label">Arcilla</span>
          <Val v={pt.clay} unit="%" />
        </div>
        <div className="param-row">
          <span className="param-label">Arena</span>
          <Val v={pt.sand} unit="%" />
        </div>
        <div className="param-row">
          <span className="param-label">Limo</span>
          <Val v={pt.silt} unit="%" />
        </div>
        <div className="param-row">
          <span className="param-label">Fraccion gruesa</span>
          <Val v={pt.coarse} unit="%" />
        </div>
      </div>

      <div className="panel-section">
        <h3>Propiedades quimicas</h3>
        <div className="param-row">
          <span className="param-label">pH (CaCl2)</span>
          <Val v={pt.pH} dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">pH (H2O)</span>
          <Val v={pt.pH_w} dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">OC</span>
          <Val v={pt.OC} unit="g/kg" dec={1} />
        </div>
        <div className="param-row">
          <span className="param-label">MOS (x1,724)</span>
          <Val v={pt.MOS} unit="%" dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">N total</span>
          <Val v={pt.N} unit="g/kg" dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">P (Fosforo)</span>
          {pt.P_lod
            ? <span className="param-value lod">menos de LOD - P muy bajo</span>
            : <Val v={pt.P} unit="mg/kg" dec={1} />
          }
        </div>
        <div className="param-row">
          <span className="param-label">K (Potasio)</span>
          <Val v={pt.K} unit="mg/kg" dec={0} />
        </div>
        <div className="param-row">
          <span className="param-label">CaCO3</span>
          <Val v={pt.CaCO3} unit="%" dec={1} />
        </div>
        <div className="param-row">
          <span className="param-label">CE</span>
          <Val v={pt.EC} unit="uS/cm" dec={1} />
        </div>
      </div>

      <div className="panel-section">
        <h3>Densidad aparente</h3>
        {pt.bd == null && pt.bd10 == null
          ? <p className="dist-note">Sin dato de BD en este punto</p>
          : <>
              <div className="param-row">
                <span className="param-label">BD 0-20 cm</span>
                <Val v={pt.bd} unit="g/cm3" dec={3} />
              </div>
              <div className="param-row">
                <span className="param-label">BD 0-10 cm</span>
                <Val v={pt.bd10} unit="g/cm3" dec={3} />
              </div>
            </>
        }
      </div>

      <div className="panel-section">
        <h3>Puntos vecinos en informe</h3>
        {selected.nearest.map((n, i) => (
          <div key={n.id} className="param-row">
            <span className="param-label">
              {i === 0 ? 'sel. ' : (i + 1) + '. '}{n.id}
            </span>
            <span className="param-value">{n.dist_km?.toFixed(2)} km</span>
          </div>
        ))}
        <p className="dist-note" style={{ marginTop: 6 }}>sel. = punto seleccionado</p>
      </div>

      <button
        className="btn-export"
        style={{ background: '#185FA5', marginTop: 8 }}
        onClick={() => exportGeoJSON(selected.nearest, polygon)}
      >
        Descargar GeoJSON
      </button>
      <button
        className="btn-export"
        style={{ background: '#3B6D11', marginTop: 6, marginBottom: 8 }}
        onClick={() => exportShapefile(selected.nearest, polygon)}
      >
        Descargar Shapefile (.zip)
      </button>
    </>
  )
}
