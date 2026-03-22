const https = require('https')
const fetch = require('node-fetch')

const agent = new https.Agent({ rejectUnauthorized: false })

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { type, lon, lat, bbox } = req.query

  let url

  if (type === 'point') {
    if (!lon || !lat) return res.status(400).json({ error: 'lon y lat requeridos' })
    url = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/${lon}/${lat}.json`

    try {
      const response = await fetch(url, { agent })
      if (!response.ok) {
        const errText = await response.text()
        return res.status(response.status).json({ error: `SIGPAC error: ${response.status}`, detail: errText, url })
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }

  } else if (type === 'bbox') {
    if (!bbox) return res.status(400).json({ error: 'bbox requerido' })

    const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number)
    const stepLon = (maxLon - minLon) / 3
    const stepLat = (maxLat - minLat) / 3
    const seen = new Map()

    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        const pLon = minLon + i * stepLon
        const pLat = minLat + j * stepLat
        const ptUrl = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/${pLon}/${pLat}.json`
        try {
          const r = await fetch(ptUrl, { agent })
          if (!r.ok) continue
          const data = await r.json()
          const arr = Array.isArray(data) ? data : [data]
          for (const rec of arr) {
            if (rec && rec.provincia != null) {
              const key = `${rec.provincia}-${rec.municipio}-${rec.poligono}-${rec.parcela}-${rec.recinto}`
              if (!seen.has(key)) seen.set(key, rec)
            }
          }
        } catch { continue }
      }
    }

    const features = Array.from(seen.values()).map(r => ({ properties: r }))
    res.setHeader('Cache-Control', 's-maxage=600')
    return res.status(200).json({ features })

  } else {
    return res.status(400).json({ error: 'type debe ser point o bbox' })
  }
}
