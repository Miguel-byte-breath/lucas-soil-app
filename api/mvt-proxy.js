export default async function handler(req, res) {
  const { z, x, y } = req.query

  if (!z || !x || !y) {
    return res.status(400).json({ error: 'Parámetros z, x, y requeridos' })
  }

  const url = `https://sigpac-hubcloud.es/mvt/recinto@3857@geojson/${z}/${x}/${y}.geojson`

  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 8000)
    let upstream
    try {
      upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `SIGPAC MVT respondió ${upstream.status}` })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({ error: 'Error conectando con SIGPAC MVT', detail: err.message })
  }
}
