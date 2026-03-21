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

export default function App() {
  const mapRef      = useRef(null)
  const mapObj      = useRef(null)
  const drawnItems  = useRef(null)
  const gridLayer   = useRef(null)

  const [points,    setPoints]    = useState([])
  const [selected,  setSelected]  = useState(null)   // punto más cercano + vecinos
  const [gridParam, setGridParam] = useState('pH')
  const [polygon,   setPolygon]   = useState(null)
  const [loading,   setLoading]   = useState(true)

  // Cargar datos
  useEffect(() => {
    fetch('/data/lucas_spain.json')
      .then(r => r.json())
      .then(data => {
        setPoints(data.points)
        setLoading(false)
      })
  }, [])

  // Inicializar mapa
  useEffect(() => {
    if (mapObj.current) return
    const map = L.map(mapRef.current, {
      center: [40.0, -3.5],
      zoom: 6,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    drawnItems.current = new L.FeatureGroup().addTo(map)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon:   true,
        rectangle: true,
        circle:    false,
        marker:    false,
        polyline:  false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems.current },
    })
    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.current.clearLayers()
      drawnItems.current.addLayer(e.layer)
      setPolygon(e.layer.toGeoJSON())
    })

    map.on(L.Draw.Event.DELETED, () => {
      setPolygon(null)
      if (gridLayer.current) {
        gridLayer.current.clearLayers()
      }
    })

    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      setSelected(null)
      // nearest se calcula cuando points esté cargado
      window._mapClick = { lat, lng }
    })

    mapObj.current = map
  }, [])

  // Pintar puntos LUCAS cuando carguen
  useEffect(() => {
    if (!points.length || !mapObj.current) return
    const map = mapObj.current

    const icon = L.circleMarker

    points.forEach(pt => {
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius: 4,
        color: '#1a5c38',
        fillColor: '#2d9d5c',
        fillOpacity: 0.6,
        weight: 1,
      }).addTo(map)

      marker.on('click', () => {
        const nearest = findNearest({ lat: pt.lat, lng: pt.lon }, points, 5)
        setSelected({ clicked: pt, nearest })
      })
    })

    // Clic en mapa vacío (no en marcador)
    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      const nearest = findNearest({ lat, lng }, points, 5)
      setSelected({ clicked: nearest[0], nearest })
    })
  }, [points])

  // Regenerar grid cuando cambia polígono o parámetro
  useEffect(() => {
    if (!polygon || !points.length || !mapObj.current) return
    if (!gridLayer.current) {
      gridLayer.current = L.featureGroup().addTo(mapObj.current)
    }
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
          {loading ? 'Cargando datos…' : `${points.length.toLocaleString()} puntos · LUCAS 2018`}
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
              <ParamPanel selected={selected} />
              <button
                className="btn-export"
                onClick={handleExport}
              >
                Descargar informe Excel
