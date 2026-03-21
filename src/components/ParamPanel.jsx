export default function ParamPanel({ selected }) {
  const pt = selected.clicked

  const fmt = (v, dec = 1) => v != null ? Number(v).toFixed(dec) : null
  const Val = ({ v, unit = '', dec = 1 }) => {
    if (v == null) return <span className="param-value unavailable">— sin dato</span>
    return <span className="param-value">{fmt(v, dec)}{unit && ` ${unit}`}</span>
  }

  return (
    <>
      {/* Cabecera del punto */}
      <div className="panel-section">
        <h3>Punto más cercano</h3>
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
          <span className="param-value">{pt.date ?? '—'}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Cobertura</span>
          <span className="param-value" style={{ fontSize: 12 }}>{pt.lc ?? '—'}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Elevación</span>
          <Val v={pt.elev} unit="m" dec={0} />
        </div>
      </div>

      {/* Textura */}
      <div className="panel-section">
        <h3>Textura</h3>
        <div className="param-row">
          <span className="param-label">Clase USDA</span>
          {pt.usda
            ? <span className="badge-usda">{pt.usda}</span>
            : <span className="param-value unavailable">— sin dato</span>
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
          <span className="param-label">Fracción gruesa</span>
          <Val v={pt.coarse} unit="%" />
        </div>
      </div>

      {/* Química */}
      <div className="panel-section">
        <h3>Propiedades químicas</h3>
        <div className="param-row">
          <span className="param-label">pH (CaCl₂)</span>
          <Val v={pt.pH} dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">pH (H₂O)</span>
          <Val v={pt.pH_w} dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">OC</span>
          <Val v={pt.OC} unit="g/kg" dec={1} />
        </div>
        <div className="param-row">
          <span className="param-label">MOS (×1,724)</span>
          <Val v={pt.MOS} unit="%" dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">N total</span>
          <Val v={pt.N} unit="g/kg" dec={2} />
        </div>
        <div className="param-row">
          <span className="param-label">P (Fósforo)</span>
          {pt.P_lod
            ? <span className="param-value lod">{'< LOD — P muy bajo'}</span>
            : <Val v={pt.P} unit="mg/kg" dec={1} />
          }
        </div>
        <div className="param-row">
          <span className="param-label">K (Potasio)</span>
          <Val v={pt.K} unit="mg/kg" dec={0} />
        </div>
        <div className="param-row">
          <span className="param-label">CaCO₃</span>
          <Val v={pt.CaCO3} unit="%" dec={1} />
        </div>
        <div className="param-row">
          <span className="param-label">CE</span>
          <Val v={pt.EC} unit="µS/cm" dec={1} />
        </div>
      </div>

      {/* Densidad aparente */}
      <div className="panel-section">
        <h3>Densidad aparente</h3>
        {pt.bd == null && pt.bd10 == null
          ? <p className="dist-note">Sin dato de BD en este punto (~6
