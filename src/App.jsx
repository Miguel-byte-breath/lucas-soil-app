import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { findNearest } from './utils/spatial.js'
import { exportExcel, exportExcelComparativo } from './utils/export.js'
import ParamPanel from './components/ParamPanel.jsx'
import GridControls from './components/GridControls.jsx'
import SearchBox from './components/SearchBox.jsx'
import SigpacPanel from './components/SigpacPanel.jsx'
import { paintGrid } from './utils/grid.js'
import { paintRaster } from './utils/raster.js'
import { consultarPunto, consultarBbox, formatearRecinto, esAgricola } from './utils/sigpac.js'
import shpjs from 'shpjs'

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
  const parcelasRef   = useRef([])
  const labelLayers   = useRef({})
  const gridLayers    = useRef({})
  const parcelaCount       = useRef(0)
  const parcelaActivaIdRef = useRef(null)
  const fileInputRef       = useRef(null)
  const [points,       setPoints]       = useState([])
  const [selected,     setSelected]     = useState(null)
  const [gridParam,    setGridParam]    = useState('iva')
  const [parcelas,        setParcelas]        = useState([])
  const [parcelaActivaId, setParcelaActivaId] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [coords,       setCoords]       = useState(null)
  const [sistema,      setSistema]      = useState('secano')
  const [sigpacData,   setSigpacData]   = useState(null)
  const [sigpacLoading,setSigpacLoading]= useState(false)
  const [infoModal,    setInfoModal]    = useState(false)

  // ── Cargar parcela desde GeoJSON feature (externo) ──
  const crearParcelaDesdeFeature = async (feature) => {
    const map = mapObj.current
    if (!map) return

    parcelaCount.current += 1
    const id    = parcelaCount.current
    const props = feature.properties || {}
    const nombre = props.name || props.nombre || props.NOMBRE || props.Name || `Parcela ${id}`

    const geojson = { type: 'Feature', geometry: feature.geometry, properties: props }

    const geoLayer = L.geoJSON(geojson, { style: { color: '#3388ff', weight: 2, fillOpacity: 0.1 } })
    const layer    = geoLayer.getLayers()[0]
    if (!layer) return
    layer.addTo(map)

    const ring   = geojson.geometry.type === 'MultiPolygon'
      ? geojson.geometry.coordinates[0][0]
      : geojson.geometry.coordinates[0]
    const centLat = ring.reduce((s, c) => s + c[1], 0) / ring.length
    const centLon = ring.reduce((s, c) => s + c[0], 0) / ring.length

    const label = L.marker([centLat, centLon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:#1a3a2a;color:#e8f5ee;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;white-space:nowrap">${nombre}</div>`,
        iconAnchor: [0, 0],
      }),
      interactive: false,
    }).addTo(map)
    labelLayers.current[id] = label

    const gLayer = new L.FeatureGroup().addTo(map)
   gLayer.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      setParcelaActivaId(id)
      parcelaActivaIdRef.current = id
      const p = parcelasRef.current.find(p => p.id === id)
      if (p && pointsRef.current.length) {
        const nearest = findNearest({ lat: p.centLat, lng: p.centLon }, pointsRef.current, 5)
        setSelected({ clicked: nearest[0], nearest })
      }
      setSigpacLoading(true)
      setSigpacData(null)
      consultarPunto(ev.latlng.lat, ev.latlng.lng)
        .then(raw => setSigpacData(formatearRecinto(raw)))
        .catch(() => setSigpacData(null))
        .finally(() => setSigpacLoading(false))
    })
    gridLayers.current[id] = gLayer

   layer.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      setParcelaActivaId(id)
      parcelaActivaIdRef.current = id
      const p = parcelasRef.current.find(p => p.id === id)
      if (p && pointsRef.current.length) {
        const nearest = findNearest({ lat: p.centLat, lng: p.centLon }, pointsRef.current, 5)
        setSelected({ clicked: nearest[0], nearest })
      }
      setSigpacLoading(true)
      setSigpacData(null)
      consultarPunto(ev.latlng.lat, ev.latlng.lng)
        .then(raw => setSigpacData(formatearRecinto(raw)))
        .catch(() => setSigpacData(null))
        .finally(() => setSigpacLoading(false))
    })

    const nuevaParcela = { id, nombre, geojson, layer, centLat, centLon }
    parcelasRef.current = [...parcelasRef.current, nuevaParcela]
    setParcelas([...parcelasRef.current])
    setParcelaActivaId(id)
    parcelaActivaIdRef.current = id

    if (pointsRef.current.length) {
      const nearest = findNearest({ lat: centLat, lng: centLon }, pointsRef.current, 5)
      setSelected({ clicked: nearest[0], nearest })
    }

    const bounds = layer.getBounds()
    try {
      const feats    = await consultarBbox(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth())
      const recintos = feats.map(f => formatearRecinto(f))
      window._sigpacRecintos = recintos
      window._sigpacPoligono = geojson
      if (!window._sigpacRecintosPorParcela) window._sigpacRecintosPorParcela = {}
      window._sigpacRecintosPorParcela[id] = { recintos, geojson }
    } catch {
      window._sigpacRecintos = []
      if (!window._sigpacRecintosPorParcela) window._sigpacRecintosPorParcela = {}
      window._sigpacRecintosPorParcela[id] = { recintos: [], geojson }
    }
  }

  // ── Cargar archivo GeoJSON o Shapefile (.zip) ──
  const handleFileLoad = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    let features = []
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const buffer = await file.arrayBuffer()
        const result = await shpjs(buffer)
        const fcs    = Array.isArray(result) ? result : [result]
        features     = fcs.flatMap(fc => fc.features || [])
      } else {
        const text   = await file.text()
        const parsed = JSON.parse(text)
        if (parsed.type === 'FeatureCollection')    features = parsed.features || []
        else if (parsed.type === 'Feature')          features = [parsed]
        else if (parsed.type === 'Polygon' || parsed.type === 'MultiPolygon')
          features = [{ type: 'Feature', geometry: parsed, properties: {} }]
      }
    } catch (err) {
      alert('Error al cargar el archivo: ' + err.message)
      return
    }

    features = features.filter(f =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
    )
    if (!features.length) {
      alert('No se encontraron geometrías de tipo Polígono en el archivo.')
      return
    }
    const CAP = 20
    if (features.length > CAP) {
      alert(`El archivo contiene ${features.length} polígonos. Se cargarán los primeros ${CAP}.`)
      features = features.slice(0, CAP)
    }

    const startId = parcelaCount.current
    for (const feat of features) {
      await crearParcelaDesdeFeature(feat)
    }

    const nuevas = parcelasRef.current.filter(p => p.id > startId)
    if (nuevas.length && mapObj.current) {
      const group = L.featureGroup(nuevas.map(p => p.layer))
      mapObj.current.fitBounds(group.getBounds(), { padding: [40, 40] })
    }
  }

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
    map.attributionControl.addAttribution(
      '© <a href="https://www.fega.gob.es" target="_blank">FEGA</a> — SIGPAC CC BY 4.0'
    )

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

    map.pm.addControls({
      position:       'topleft',
      drawPolygon:    true,
      drawMarker:     false,
      drawCircle:     false,
      drawPolyline:   false,
      drawRectangle:  false,
      drawCircleMarker: false,
      editMode:       true,
      dragMode:       false,
      cutPolygon:     false,
      removalMode:    false,
      rotateMode:     false,
    })

    map.pm.setLang('es')
    // Control personalizado — Eliminar parcela activa
    map.pm.Toolbar.createCustomControl({
      name: 'deleteActiva',
      block: 'draw',
      title: 'Eliminar parcela activa',
      html: '',
      afterClick: () => {},
      cssClass: 'pm-delete-activa',
      toggle: false,
      onClick: () => {
        const id = parcelaActivaIdRef.current
        if (!id) return
        const parcela = parcelasRef.current.find(p => p.id === id)
        if (!parcela) return
        mapObj.current.removeLayer(parcela.layer)
        if (labelLayers.current[id]) {
          mapObj.current.removeLayer(labelLayers.current[id])
          delete labelLayers.current[id]
        }
        if (gridLayers.current[id]) {
          mapObj.current.removeLayer(gridLayers.current[id])
          delete gridLayers.current[id]
        }
        parcelasRef.current = parcelasRef.current.filter(p => p.id !== id)
        setParcelas([...parcelasRef.current])
        if (parcelasRef.current.length > 0) {
          setParcelaActivaId(parcelasRef.current[parcelasRef.current.length - 1].id)
        } else {
          setParcelaActivaId(null)
          setSelected(null)
          setSigpacData(null)
          window._sigpacPoligono = null
          window._sigpacRecintos = []
        }
      },
    })
    
// Inyectar iconos CSS en botones geoman personalizados
    setTimeout(() => {
      const btns = document.querySelectorAll('.leaflet-pm-toolbar .button-container')
      btns.forEach(btn => {
        const title = btn.getAttribute('title')
        const icon = btn.querySelector('.control-icon')
        if (!icon) return
        if (title === 'Eliminar parcela activa') {
          icon.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpolyline points='3 6 5 6 21 6'/%3E%3Cpath d='M19 6l-1 14H6L5 6'/%3E%3Cpath d='M10 11v6M14 11v6'/%3E%3Cpath d='M9 6V4h6v2'/%3E%3C/svg%3E\")"
        }
        if (title === 'Mi ubicacion') {
          icon.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M12 2v4M12 18v4M2 12h4M18 12h4'/%3E%3C/svg%3E\")"
        }
      })
    }, 500)
    // Control personalizado — Mi ubicación
    map.pm.Toolbar.createCustomControl({
      name: 'miUbicacion',
      block: 'custom',
      title: 'Mi ubicacion',
      html: '',
      cssClass: 'pm-mi-ubicacion',
      toggle: false,
      onClick: () => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords
          mapObj.current.setView([latitude, longitude], 14)
          L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#1a3a2a',
            fillColor: '#2d9d5c',
            fillOpacity: 0.9,
            weight: 2,
          }).addTo(mapObj.current)
            .bindPopup('Mi ubicacion')
            .openPopup()
        })
      },
    })
// Inyectar iconos CSS en botones geoman personalizados
    setTimeout(() => {
      const btns = document.querySelectorAll('.leaflet-pm-toolbar .leaflet-buttons-control-button')
      btns.forEach(btn => {
        const title = btn.getAttribute('title')
        const icon = btn.querySelector('.control-icon')
        if (!icon) return
        if (title === 'Eliminar parcela activa') {
          icon.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpolyline points='3 6 5 6 21 6'/%3E%3Cpath d='M19 6l-1 14H6L5 6'/%3E%3Cpath d='M10 11v6M14 11v6'/%3E%3Cpath d='M9 6V4h6v2'/%3E%3C/svg%3E\")"
        }
        if (title === 'Mi ubicacion') {
          icon.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M12 2v4M12 18v4M2 12h4M18 12h4'/%3E%3C/svg%3E\")"
        }
      })
    }, 500)
    // Control personalizado — Cargar GeoJSON / Shapefile
    map.pm.Toolbar.createCustomControl({
      name:     'cargarGeometria',
      block:    'draw',
      title:    'Cargar geometria',
      html:     '',
      cssClass: 'pm-cargar-geometria',
      toggle:   false,
      onClick:  () => { fileInputRef.current?.click() },
    })
    setTimeout(() => {
      const btns = document.querySelectorAll(
        '.leaflet-pm-toolbar .button-container, .leaflet-pm-toolbar .leaflet-buttons-control-button'
      )
      btns.forEach(btn => {
        if (btn.getAttribute('title') !== 'Cargar geometria') return
        const icon = btn.querySelector('.control-icon')
        if (icon) icon.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='17 8 12 3 7 8'/%3E%3Cline x1='12' y1='3' x2='12' y2='15'/%3E%3C/svg%3E\")"
      })
    }, 500)
    map.on('mousemove', (e) => {
      const { lat, lng } = e.latlng
      setCoords({ lat: lat.toFixed(5), lng: lng.toFixed(5) })
    })
    map.on('mouseout', () => setCoords(null))

   map.on('pm:create', async (e) => {
      parcelaCount.current += 1
      const id = parcelaCount.current
      const nombre = `Parcela ${id}`
      const geojson = e.layer.toGeoJSON()

      const coords = geojson.geometry.coordinates[0]
      const centLat = coords.reduce((s, c) => s + c[1], 0) / coords.length
      const centLon = coords.reduce((s, c) => s + c[0], 0) / coords.length

      // Etiqueta en mapa
      const label = L.marker([centLat, centLon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#1a3a2a;color:#e8f5ee;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;white-space:nowrap">${nombre}</div>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(map)
      labelLayers.current[id] = label

      // Grid layer individual
      const gLayer = new L.FeatureGroup().addTo(map)
     gLayer.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev)
      setParcelaActivaId(id)
      parcelaActivaIdRef.current = id
      const p = parcelasRef.current.find(p => p.id === id)
      if (p && pointsRef.current.length) {
        const nearest = findNearest({ lat: p.centLat, lng: p.centLon }, pointsRef.current, 5)
        setSelected({ clicked: nearest[0], nearest })
      }
      setSigpacLoading(true)
      setSigpacData(null)
      consultarPunto(ev.latlng.lat, ev.latlng.lng)
        .then(raw => setSigpacData(formatearRecinto(raw)))
        .catch(() => setSigpacData(null))
        .finally(() => setSigpacLoading(false))
    })
    gridLayers.current[id] = gLayer
      gridLayers.current[id] = gLayer

   // Clic en polígono → activar parcela
      e.layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setParcelaActivaId(id)
        parcelaActivaIdRef.current = id
        const parcela = parcelasRef.current.find(p => p.id === id)
        if (parcela && pointsRef.current.length) {
          const nearest = findNearest({ lat: parcela.centLat, lng: parcela.centLon }, pointsRef.current, 5)
          setSelected({ clicked: nearest[0], nearest })
        }
        setSigpacLoading(true)
        setSigpacData(null)
        consultarPunto(e.latlng.lat, e.latlng.lng)
          .then(raw => setSigpacData(formatearRecinto(raw)))
          .catch(() => setSigpacData(null))
          .finally(() => setSigpacLoading(false))
      })

      const nuevaParcela = { id, nombre, geojson, layer: e.layer, centLat, centLon }
      parcelasRef.current = [...parcelasRef.current, nuevaParcela]
      setParcelas([...parcelasRef.current])
      setParcelaActivaId(id)

      // Puntos vecinos del centroide
      const pts = pointsRef.current
      if (pts.length) {
        const nearest = findNearest({ lat: centLat, lng: centLon }, pts, 5)
        setSelected({ clicked: nearest[0], nearest })
      }

      // SIGPAC bbox
      const lons = coords.map(c => c[0])
      const lats = coords.map(c => c[1])
      const minLon = Math.min(...lons), maxLon = Math.max(...lons)
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)
     try {
        const features = await consultarBbox(minLon, minLat, maxLon, maxLat)
        const recintos = features.map(f => formatearRecinto(f))
        window._sigpacRecintos = recintos
        window._sigpacPoligono = geojson
        if (!window._sigpacRecintosPorParcela) window._sigpacRecintosPorParcela = {}
        window._sigpacRecintosPorParcela[id] = { recintos, geojson }
      } catch {
        window._sigpacRecintos = []
        if (!window._sigpacRecintosPorParcela) window._sigpacRecintosPorParcela = {}
        window._sigpacRecintosPorParcela[id] = { recintos: [], geojson }
      }
    })
    map.on('pm:remove', (e) => {
      const id = Object.keys(labelLayers.current).find(k =>
        parcelasRef.current.find(p => p.id === parseInt(k) && p.layer === e.layer)
      )
      if (id) {
        const numId = parseInt(id)
        if (labelLayers.current[numId]) {
          map.removeLayer(labelLayers.current[numId])
          delete labelLayers.current[numId]
        }
        if (gridLayers.current[numId]) {
          map.removeLayer(gridLayers.current[numId])
          delete gridLayers.current[numId]
        }
        parcelasRef.current = parcelasRef.current.filter(p => p.id !== numId)
        setParcelas([...parcelasRef.current])
        if (parcelasRef.current.length > 0) {
          setParcelaActivaId(parcelasRef.current[parcelasRef.current.length - 1].id)
        } else {
          setParcelaActivaId(null)
          setSelected(null)
          setSigpacData(null)
          window._sigpacPoligono = null
          window._sigpacRecintos = []
        }
      }
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
    if (parcelas.length > 0) {
      rasterLayer.current.clearLayers()
      return
    }

    const render = () => {
      if (
        parcelas.length === 0 &&
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
  }, [points, parcelas, gridParam, sistema])

  // Grid parcelario — repintar al cambiar parcela activa o parámetro
  useEffect(() => {
    if (!points.length) return
    Object.entries(gridLayers.current).forEach(([id, gLayer]) => {
      const parcela = parcelasRef.current.find(p => p.id === parseInt(id))
      if (parcela) {
        paintGrid(parcela.geojson, points, gridParam, gLayer, sistema)
      }
    })
  }, [parcelaActivaId, gridParam, points, sistema])

const parcelaActiva = parcelas.find(p => p.id === parcelaActivaId) || null
parcelaActivaIdRef.current = parcelaActivaId
  window._parcelaActivaId = parcelaActivaId
  // Resaltar polígono activo
  parcelasRef.current.forEach(p => {
    if (p.layer) {
      p.layer.setStyle(p.id === parcelaActivaId
        ? { color: '#f0a500', weight: 3, fillOpacity: 0.15 }
        : { color: '#3388ff', weight: 2, fillOpacity: 0.1 }
      )
    }
  })
  const handleExport = () => {
    if (parcelaActivaId === 'todas') {
      exportExcelComparativo(parcelas, pointsRef.current, sistema)
    } else {
      if (!selected) return
      exportExcel(selected.nearest, gridParam, sistema, parcelaActiva?.geojson || null)
    }
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
        <button
          onClick={() => setInfoModal(true)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: '1px solid #9fd3b5',
            borderRadius: '50%',
            color: '#9fd3b5',
            width: 24,
            height: 24,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Información sobre la metodología"
        >ℹ</button>
      </header>
{infoModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setInfoModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 8, padding: 32,
            maxWidth: 640, width: '90%', maxHeight: '80vh',
            overflowY: 'auto', position: 'relative',
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setInfoModal(false)} style={{
              position: 'absolute', top: 12, right: 16,
              background: 'transparent', border: 'none',
              fontSize: 20, cursor: 'pointer', color: '#888',
            }}>X</button>
            <h2 style={{ color: '#1a3a2a', marginBottom: 16, fontSize: 16 }}>
              LUCAS Soil Explorer — Metodologia
            </h2>
            <h3 style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Que es?</h3>
            <p style={{ fontSize: 13, color: '#333', marginBottom: 16, lineHeight: 1.6 }}>
              Explorador de datos de suelo LUCAS 2018 (JRC, Comision Europea) para Espana.
              Combina 3.867 puntos de muestreo con datos SIGPAC para caracterizar el entorno
              edafico de cualquier parcela, en coherencia con el RD 1051/2022.
            </p>
            <h3 style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>IVA — Indice de Variabilidad Agronomica</h3>
            <p style={{ fontSize: 13, color: '#333', marginBottom: 8, lineHeight: 1.6 }}>
              Indice compuesto (0-100) calculado por IDW sobre los puntos LUCAS del entorno.
            </p>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#f0f7f0' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Parametro</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Peso</th>
                </tr>
              </thead>
              <tbody>
                {[['pH (H2O)', '25%'], ['Textura USDA', '25%'], ['MOS', '20%'], ['P Fosforo', '15%'], ['K Potasio', '15%']].map(([p, w]) => (
                  <tr key={p}>
                    <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{p}</td>
                    <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{w}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#f0f7f0' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Rango IVA</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #ddd' }}>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {[['80-100','Muy buena aptitud'],['60-80','Buena aptitud'],['40-60','Aptitud moderada'],['20-40','Limitaciones importantes'],['0-20','Limitaciones severas']].map(([r, c]) => (
                  <tr key={r}>
                    <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{r}</td>
                    <td style={{ padding: '5px 8px', border: '1px solid #eee' }}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Fuentes y licencias</h3>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
              <strong>Datos suelo:</strong> LUCAS Soil 2018, JRC, Comision Europea. Uso libre con atribucion.
            </p>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
              <strong>Datos SIGPAC:</strong> FEGA, Creative Commons BY 4.0.
            </p>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
              <strong>Marco normativo:</strong> RD 1051/2022, nutricion sostenible de suelos agrarios.
            </p>
            <a href="https://github.com/Miguel-byte-breath/lucas-soil-app"
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#1a5c38' }}>
              Ver documentacion completa en GitHub
            </a>
          </div>
        </div>
      )}

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
          {parcelas.length > 0 && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0ea' }}>
              <label style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Parcela activa
              </label>
              <select
                value={parcelaActivaId || ''}
                onChange={e => setParcelaActivaId(e.target.value === 'todas' ? 'todas' : parseInt(e.target.value))}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13, background: '#fff' }}
              >
                <option value="todas">Todas las parcelas</option>
              {parcelas.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
              </select>
              <button
               onClick={() => {
                  if (!parcelaActivaId) return
                  const id = parcelaActivaId
                  const parcela = parcelasRef.current.find(p => p.id === id)
                  if (!parcela) return
                  mapObj.current.removeLayer(parcela.layer)
                  if (labelLayers.current[id]) {
                    mapObj.current.removeLayer(labelLayers.current[id])
                    delete labelLayers.current[id]
                  }
                  if (gridLayers.current[id]) {
                    mapObj.current.removeLayer(gridLayers.current[id])
                    delete gridLayers.current[id]
                  }
                  parcelasRef.current = parcelasRef.current.filter(p => p.id !== id)
                  setParcelas([...parcelasRef.current])
                  if (parcelasRef.current.length > 0) {
                    setParcelaActivaId(parcelasRef.current[parcelasRef.current.length - 1].id)
                  } else {
                    setParcelaActivaId(null)
                    setSelected(null)
                    setSigpacData(null)
                    window._sigpacPoligono = null
                    window._sigpacRecintos = []
                  }
                }}
                style={{ marginTop: 6, width: '100%', padding: '5px', background: '#f5f5f0', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: '#c0392b' }}
              >
                Eliminar parcela activa
              </button>
            </div>
          )}

          {!selected ? (
            <div className="panel-empty">
              <span className="icon">📍</span>
              <p>Haz clic en el mapa o en un punto LUCAS para ver los parámetros del suelo</p>
            </div>
          ) : (
            <>
              <ParamPanel selected={selected} polygon={parcelaActiva?.geojson || null} />
              <SigpacPanel data={sigpacData} loading={sigpacLoading} />
              <button className="btn-export" onClick={handleExport}>
                Descargar informe Excel
              </button>
            </>
          )}

          <GridControls
            polygon={parcelaActiva?.geojson || null}
            gridParam={gridParam}
            setGridParam={setGridParam}
            options={PARAM_OPTIONS}
            sistema={sistema}
            setSistema={setSistema}
          />
        </aside>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".geojson,.json,.zip"
        style={{ display: 'none' }}
        onChange={handleFileLoad}
      />
    </>
  )
}
