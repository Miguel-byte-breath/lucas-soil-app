import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { findNearest } from './utils/spatial.js'
import { exportExcel } from './utils/export.js'
import ParamPanel from './components/ParamPanel.jsx'
import GridControls from './components/GridControls.jsx'
import SearchBox from './components/SearchBox.jsx'
import SigpacPanel from './components/SigpacPanel.jsx'
import { paintGrid } from './utils/grid.js'
import { paintRaster } from './utils/raster.js'
import { consultarPunto, consultarBbox, formatearRecinto, esAgricola } from './utils/sigpac.js'

const PARAM_OPTIONS = [
  { value: 'pH',   label: 'pH (H₂O)' },
  { value: 'MOS',  label: 'MOS — Materia orgánica' },
  { value: 'P',    label: 'P — Fósforo' },
  { value: 'K',    label: 'K — Potasio' },
  { value: 'N',    label: 'N — Nitrógeno' },
  { value: 'usda', label: 'Textura USDA' },
  { value: 'bd',   label: 'BD — Densidad aparente' },
  { value: 'iva',  label: 'IVA — Índice de Variabilidad Agronómica' },
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
  const mapRef        = useRef(null)
  const mapObj        = useRef(null)
  const drawnItems    = useRef(null)
  const gridLayer     = useRef(null)
  const rasterLayer   = useRef(null)
  const rasterEnabled = useRef(true)
  const markersRef    = useRef([])
  const pointsRef     = useRef([])

  const [points,       setPoints]       = useState([])
  const [selected,     setSelected]     = useState(null)
  const [gridParam,    setGridParam]    = useState('iva')
  const [polygon,      setPolygon]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [coords,       setCoords]       = useState(null)
  const [sistema,      setSistema]      = useState('secano')
  const [sigpacData,   setSigpacData]   = useState(null)
  const [sigpacLoading,setSigpacLoading]= useState(false)

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

  // Inicializar mapa
  useEffect(() => {
    if (mapObj.current) return

    const map = L.map(mapRef.current, {
      center: [40.0, -3.5],
      zoom: 6,
    })

    BASEMAPS['Esri Satellite'].addTo(map)

    rasterLayer.current = new L.FeatureGroup()
    drawnItems.current  = new L.FeatureGroup().addTo(map)
    gridLayer.current   = new L.FeatureGroup().addTo(map)

    L.control.layers(
      BASEMAPS,
      { 'Raster agronómico': rasterLayer.current },
      { position: 'topright', collapsed: true }
    ).addTo(map)

    map.on('overlayadd', (e) => {
      if (e.name === 'Raster agronómico') {
        rasterEnabled.current = true
        if (!polygon && pointsRef.current.length && map.getZoom() >= 9) {
          paintRaster(map, pointsRef.current, gridParam, rasterLayer.current, sistema)
        }
      }
    })
    map.on('overlayremove', (e) => {
      if (e.name === 'Raster agronómico') {
        rasterEnabled.current = false
        rasterLayer.current.clearLayers()
      }
    })

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon:      true,
        rectangle:    false,
        circle:       false,
        marker:       false,
        polyline:     false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems.current },
    })
    map.addControl(drawControl)

    map.on('mousemove', (e) => {
      const { lat, lng } = e.latlng
      setCoords({ lat: lat.toFixed(5), lng: lng.toFixed(5) })
    })
    map.on('mouseout', () => setCoords(null))

    map.on(L.Draw.Event.CREATED, async (e) => {
      drawnItems.current.clearLayers()
      drawnItems.current.addLayer(e.layer)
      const geojson = e.layer.toGeoJSON()
      setPolygon(geojson)
      window._sigpacPoligono = geojson

      const coords = geojson.geometry.coordinates[0]
      const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
      const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
      const pts = pointsRef.current
      if (pts.length) {
        const nearest = findNearest({ lat: centLat, lng: centLon }, pts, 5)
        setSelected({ clicked: nearest[0], nearest })
      }

      // Consultar recintos SIGPAC del bbox del polígono
      const lons = coords.map(c => c[0])
      const lats = coords.map(c => c[1])
      const minLon = Math.min(...lons), maxLon = Math.max(...lons)
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)

      try {
        const features = await consultarBbox(minLon, minLat, maxLon, maxLat)
        window._sigpacRecintos = features.map(f => formatearRecinto(f))
      } catch {
        window._sigpacRecintos = []
      }
    })

    map.on(L.Draw.Event.DELETED, () => {
      setPolygon(null)
      window._sigpacPoligono = null
      setSelected(null)
      setSigpacData(null)
      gridLayer.current.clearLayers()
      window._sigpacRecintos = []
    })

    mapObj.current = map
  }, [])

  // Pintar puntos LUCAS
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

    mapObj.current.on('click', async (e) => {
      const { lat, lng } = e.latlng
      const nearest = findNearest({ lat, lng }, points, 5)
      setSelected({ clicked: nearest[0], nearest })

      // Consultar SIGPAC por punto
      setSigpacLoading(true)
      setSigpacData(null)
      try {
        const raw = await consultarPunto(lat, lng)
        setSigpacData(formatearRecinto(raw))
      } catch {
        setSigpacData(null)
      } finally {
        setSigpacLoading(false)
      }
    })
  }, [points])

  // Raster continuo
  useEffect(() => {
    if (!points.length || !mapObj.current || !rasterLayer.current) return
    if (polygon) {
      rasterLayer.current.clearLayers()
      return
    }

    const render = () => {
      if (
        !polygon &&
        rasterEnabled.current &&
        pointsRef.current.length &&
        mapObj.current?.getZoom() >= 9
      ) {
        paintRaster(mapObj.current, pointsRef.current, gridParam, rasterLayer.current, sistema)
      }
    }

    render()
    mapObj.current.on('moveend', render)
    return () => mapObj.current?.off('moveend', render)
  }, [points, polygon, gridParam, sistema])

  // Grid parcelario
  useEffect(() => {
    if (!polygon || !points.length || !gridLayer.current) return
    paintGrid(polygon, points, gridParam, gridLayer.current, sistema)
  }, [polygon, gridParam, points, sistema])

 const handleExport = () => {
    if (!selected) return
    exportExcel(selected.nearest, gridParam, sistema, polygon)
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
        <div style={{ position: 'relative', flex: 1 }}>
          <div id="map" ref={mapRef} style={{ height: '100%', width: '100%' }} />

          <SearchBox onResult={(result) => {
            if (!mapObj.current) return
            mapObj.current.setView([result.lat, result.lon], 12)
            L.marker([result.lat, result.lon], {
              icon: L.divIcon({
                className: '',
                html: '<div style="background:#1a3a2a;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
                iconAnchor: [5, 5],
              })
            }).addTo(mapObj.current)
              .bindPopup(result.label.split(',')[0])
              .openPopup()
          }} />

          {coords && (
            <div style={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(26,58,42,0.85)',
              color: '#e8f5ee',
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              zIndex: 1000,
              pointerEvents: 'none',
              letterSpacing: '0.04em',
            }}>
              {coords.lat}° N &nbsp;|&nbsp; {coords.lng}° E &nbsp;·&nbsp; EPSG:4326
            </div>
          )}
        </div>

        <aside className="panel">
          {!selected ? (
            <div className="panel-empty">
              <span className="icon">📍</span>
              <p>Haz clic en el mapa o en un punto LUCAS para ver los parámetros del suelo</p>
            </div>
          ) : (
            <>
              <ParamPanel selected={selected} polygon={polygon} />
              <SigpacPanel data={sigpacData} loading={sigpacLoading} />
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
            sistema={sistema}
            setSistema={setSistema}
          />
        </aside>
      </div>
    </>
  )
}
