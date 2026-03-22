import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { findNearest } from './utils/spatial.js'
import { exportExcel } from './utils/export.js'
import ParamPanel from './components/ParamPanel.jsx'
import GridControls from './components/GridControls.jsx'
import { paintGrid } from './utils/grid.js'

const PARAM_OPTIONS = [
  { value: 'pH',   label: 'pH (CaCl₂)' },
  { value: 'MOS',  label: 'MOS — Materia orgánica' },
  { value: 'P',    label: 'P — Fósforo' },
  { value: 'K',    label: 'K — Potasio' },
  { value: 'N',    label: 'N — Nitrógeno' },
  { value: 'clay', label: 'Arcilla %' },
  { value: 'sand', label: 'Arena %' },
  { value: 'bd',   label: 'BD — Densidad aparente' },
]

const BASEMAPS = {
  'OpenStreetMap': L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
  ),
  'PNOA (IGN España)': L.tileLayer(
    'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg',
    { attribution: '© IGN España — PNOA', maxZoom: 19 }
  ),
  'Esri Satellite': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri, Maxar, Earthstar Geographics', maxZoom: 19 }
  ),
}

export default function App() {
  const mapRef     = useRef(null)
  const mapObj     = useRef(null)
  const drawnItems = useRef(null)
  const gridLayer  = useRef(null)
  const markersRef = useRef([])
  const pointsRef  = useRef([])

  const [points,    setPoints]    = useState([])
  const [selected,  setSelected]  = useState(null)
  const [gridParam, setGridParam] = useState('pH')
  const [polygon,   setPolygon]   = useState(null)
  const [loading,   setLoading]   = useState(true)

  // Cargar datos
  useEffect(() => {
    fetch('/data/lucas_spain.json')
      .then(r => r.json())
      .then(data => {
        setPoints(data.points)
        pointsRef.current = data.points
        setLoading(false)
      })
  }, [])

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (mapObj.current) return

    const map = L.map(mapRef.current, {
      center: [40.0, -3.5],
      zoom: 6,
    })

    // Capa base por defecto
    BASEMAPS['OpenStreetMap'].addTo(map)

    // Control de capas base
    L.control.layers(BASEMAPS, {}, { position: 'topright' }).addTo(map)

    drawnItems.current = new L.FeatureGroup().addTo(map)
    gridLayer.current  = new L.FeatureGroup().addTo(map)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon:      true,
        rectangle:    true,
        circle:       false,
        marker:       false,
        polyline:     false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems.current },
    })
    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.current.clearLayers()
      drawnItems.current.addLayer(e.layer)
      const geojson = e.layer.toGeoJSON()
      setPolygon(geojson)

      // Centroide del polígono → nearest point
      const coords = geojson.geometry.coordinates[0]
      const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
      const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
      const pts = pointsRef.current
      if (pts.length) {
        const nearest = findNearest({ lat: centLat, lng: centLon }, pts, 5)
        setSelected({ clicked: nearest[0], nearest })
      }
    })

    map.on(L.Draw.Event.DELETED, () => {
      setPolygon(null)
      setSelected(null)
      gridLayer.current.clearLayers()
    })

    mapObj.current = map
  }, [])

  // Pintar puntos LUCAS cuando carguen
  useEffect(() => {
    if (!points.length || !mapObj.current) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    points.forEach(pt => {
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius:      4,
        color:       '#1a5c38',
        fillColor:   '#2d9d5c',
        fillOpacity: 0.6,
        weight:      1,
      }).addTo(mapObj.current)

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        const nearest = findNearest({ lat: pt.lat, lng: pt.lon }, points, 5)
        setSelected({ clicked: nearest[0], nearest })
      })

      markersRef.current.push(marker)
    })

    mapObj.current.on('click', (e) => {
      const { lat, lng } = e.latlng
      const nearest = findNearest({ lat, lng }, points, 5)
      setSelected({ clicked: nearest[0], nearest })
    })
  }, [points])

  // Regenerar grid cuando cambia polígono o parámetro
  useEffect(() => {
    if (!polygon || !points.length || !gridLayer.current) return
    paintGrid(polygon, points, gridParam, gridLayer.current)
  }, [polygon, gridParam, points])

  const handleExport = () => {
    if (!selected) return
    exportExcel(selected.nearest, gridParam)
  }

  return (
    <>
      <header className="app-header">
        <h1>LUCAS Soil Explorer — España</h1>
        <span className="subtitle">
          {loading
            ? 'Cargando datos…'
            : `${points.length.toLocaleString()} puntos · LUCAS 2018`}
        </span>
      </header>

      <div className="app-body">
        <div id="map" ref={mapRef} />

        <aside className="panel">
          {!selected ? (
            <div className="panel-empty">
              <span className="icon">📍</span>
              <p>Haz clic en el mapa o en un punto LUCAS para ver los parámetros del suelo</p>
            </div>
          ) : (
            <>
              <ParamPanel selected={selected} polygon={polygon} />
              <button className="btn-export" onClick={handleExport}>
                Descargar informe Excel
              </button>
            </>
          )}

          <GridControls
            polygon={polygon}
            gridParam={gridParam}
            setGridParam={setGridParam}
            options={PARAM_OPTIONS}
          />

          {polygon && (
            <div className="warning-note">
              Grid orientativo — densidad LUCAS ~1 punto/18 km². Usar como referencia, no como análisis de precisión parcelaria.
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
