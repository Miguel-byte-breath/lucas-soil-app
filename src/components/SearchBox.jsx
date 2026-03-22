import { useRef, useState } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const CARTOCIUDAD = 'https://www.cartociudad.es/geocoder/api/geocoder/findJsonp'

export default function SearchBox({ onResult }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const debounceRef             = useRef(null)

  const searchNominatim = async (q) => {
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&countrycodes=es&format=json&limit=6&addressdetails=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } })
    const data = await res.json()
    return data.map(r => ({
      label: r.display_name.split(',').slice(0, 3).join(', '),
      lat:   parseFloat(r.lat),
      lon:   parseFloat(r.lon),
    }))
  }

  const searchCartoCity = async (q) => {
    const url = `https://www.cartociudad.es/geocoder/api/geocoder/candidatesJsonp?q=${encodeURIComponent(q)}&limit=6`
    const res = await fetch(url)
    const text = await res.text()
    const json = JSON.parse(text.replace(/^[^(]+\(/, '').replace(/\);?$/, ''))
    return (json.candidates || []).map(c => ({
      label: c.address,
      lat:   c.lat,
      lon:   c.lng,
    }))
  }

  const handleInput = (e) => {
    const q = e.target.value
    setQuery(q)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.length < 3) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        let res = await searchNominatim(q)
        if (!res.length) res = await searchCartoCity(q)
        setResults(res)
      } catch {
        try {
          const res = await searchCartoCity(q)
          setResults(res)
        } catch {
          setError('Error al buscar. Inténtalo de nuevo.')
          setResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  const handleSelect = (r) => {
    onResult(r)
    setQuery(r.label.split(',')[0])
    setResults([])
  }

  return (
    <div style={{
      position: 'absolute',
      top: 80,
      left: 10,
      zIndex: 1000,
      width: 280,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        border: '1px solid #ddd',
      }}>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Buscar municipio o localidad..."
          style={{
            width: '100%',
            padding: '9px 12px',
            border: 'none',
            outline: 'none',
            fontSize: 13,
            fontFamily: 'inherit',
            background: '#fff',
            color: '#1a1a1a',
          }}
        />
        {loading && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: '#999' }}>
            Buscando...
          </div>
        )}
        {error && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: '#c0392b' }}>
            {error}
          </div>
        )}
        {results.length > 0 && (
          <ul style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            borderTop: '1px solid #eee',
            maxHeight: 220,
            overflowY: 'auto',
          }}>
            {results.map((r, i) => (
              <li
                key={i}
                onClick={() => handleSelect(r)}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  color: '#1a1a1a',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f5f5f5',
                  lineHeight: 1.4,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0f7f3'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                {r.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
