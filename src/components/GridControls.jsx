import { useEffect, useState } from 'react'

export default function GridControls({ polygon, gridParam, setGridParam, options }) {
  const [legend, setLegend] = useState(null)

  useEffect(() => {
    const handler = (e) => setLegend(e.detail)
    window.addEventListener('grid-legend', handler)
    return () => window.removeEventListener('grid-legend', handler)
  }, [])

  // Limpiar leyenda si se borra el polígono
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
          <p style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {legend.cells} celdas generadas · rango {legend.minVal?.toFixed(1)} – {legend.maxVal?.toFixed(1)}
          </p>
        )}
      </div>

      {legend && (
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
```

Commit: `add GridControls component`

---

## Estructura final del repo

Tu repo debe quedar así:
```
lucas-soil-app/
├── public/
│   └── data/
│       └── lucas_spain.json
├── src/
│   ├── components/
│   │   ├── ParamPanel.jsx
│   │   └── GridControls.jsx
│   ├── utils/
│   │   ├── spatial.js
│   │   ├── grid.js
│   │   └── export.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
