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
  } else if (type === 'bbox') {
    if (!bbox) return res.status(400).json({ error: 'bbox requerido' })
    url = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobybbox/4326/${bbox.split(',').join('/')}.json`
  } else {
    return res.status(400).json({ error: 'type debe ser point o bbox' })
  }

  try {
    const response = await fetch(url, { agent })
    if (!response.ok) {
      return res.status(response.status).json({ error: `SIGPAC error: ${response.status}` })
    }
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
