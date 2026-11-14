import { analyseSeries, synthesiseSeries } from './fakeSeries.js'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const cache = new Map()

async function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${base}${path}`).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
        return r.json()
      }),
    )
  }
  return cache.get(path)
}

export const loadVariables = () => loadJSON('/data/variables.json')
export const loadRegions = () => loadJSON('/data/regions.json')
export const loadDemos = () => loadJSON('/data/demos.json')

// Trend grid for one variable, with a lookup map by cell id added.
export async function loadTrends(variableId) {
  const key = `trends:${variableId}`
  if (!cache.has(key)) {
    cache.set(
      key,
      loadJSON(`/data/trends_${variableId}.json`).then((t) => {
        const byId = new Map()
        for (const c of t.cells) byId.set(c.id, c)
        return { ...t, byId, variableId } // which file this is, so stale data is never mixed up
      }),
    )
  }
  return cache.get(key)
}

// Time series for one cell. Uses the static file when it exists. Compact files (written
// by scripts/planetary_computer, just dates + values) are completed here with the same
// maths as the fake series. If the file is missing, placeholder variables get a
// synthesised series so the UI works before data arrives; real variables get null
// rather than a made-up chart.
export async function loadSeries(variableId, cell, trends) {
  const key = `series:${variableId}:${cell.id}`
  if (!cache.has(key)) {
    const decimals = trends.series_decimals ?? 3
    cache.set(
      key,
      fetch(`${base}/data/series/${variableId}/${cell.id}.json`)
        .then(async (r) => {
          if (!r.ok) throw new Error('missing')
          const ct = r.headers.get('content-type') || ''
          if (!ct.includes('json')) throw new Error('not json')
          const json = await r.json()
          if (!json.trend_line) {
            return { variable: variableId, cell_id: cell.id, lat: cell.lat, lon: cell.lon, ...analyseSeries({ dates: expandDates(json), values: json.values, decimals }), source: 'file' }
          }
          return { ...json, source: 'file' }
        })
        .catch(() =>
          trends.data_source
            ? null
            : {
                ...synthesiseSeries({
                  variable: variableId,
                  cell,
                  startYear: trends.start_year,
                  endYear: trends.end_year,
                  endMonth: trends.end_month || 12,
                }),
                source: 'synthetic',
              },
        ),
    )
  }
  return cache.get(key)
}

// Compact files may give { start: "1980-01", values } instead of a full dates list.
function expandDates(json) {
  if (Array.isArray(json.dates)) return json.dates
  let y = Number(json.start.slice(0, 4))
  let m = Number(json.start.slice(5, 7))
  return json.values.map(() => {
    const d = `${y}-${String(m).padStart(2, '0')}`
    m++
    if (m > 12) {
      m = 1
      y++
    }
    return d
  })
}

function inBbox(lon, lat, [lonMin, latMin, lonMax, latMax]) {
  if (lat < latMin || lat > latMax) return false
  if (lonMin <= lonMax) return lon >= lonMin && lon <= lonMax
  return lon >= lonMin || lon <= lonMax // box crosses the antimeridian
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

// Name for a point: first matching region, otherwise "near <nearest place>".
export function findRegion(lat, lon, regionsFile) {
  if (!regionsFile) return { name: 'Loading…', type: '' }
  for (const r of regionsFile.regions) if (inBbox(lon, lat, r.bbox)) return { name: r.name, type: r.type }
  let best = null
  let bestD = Infinity
  for (const p of regionsFile.places) {
    const d = haversine(lat, lon, p.lat, p.lon)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return { name: 'Unnamed area', type: '' }
  return { name: `Near ${best.name}`, type: best.type }
}
