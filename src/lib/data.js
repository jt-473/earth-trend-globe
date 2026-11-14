import { synthesiseSeries } from './fakeSeries.js'
import { buildSeries } from './stats.js'

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

// ---- Real monthly data (written by scripts/build-real-data.mjs) ------------------------
// Each variable has a small description file and band files of int16 values: 9 rows of
// latitude per band, every cell's months in a row. Bands load only when needed.

export function loadMonthlyMeta(variableId) {
  const key = `monthly-meta:${variableId}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`${base}/data/monthly/${variableId}.json`)
        .then((r) => {
          const ct = r.headers.get('content-type') || ''
          return r.ok && ct.includes('json') ? r.json() : null
        })
        .catch(() => null),
    )
  }
  return cache.get(key)
}

function loadBand(variableId, b) {
  const key = `band:${variableId}:${b}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`${base}/data/monthly/${variableId}/band_${b}.bin`).then((r) => {
        if (!r.ok) throw new Error(`band ${b}: HTTP ${r.status}`)
        return r.arrayBuffer().then((buf) => new Int16Array(buf))
      }),
    )
  }
  return cache.get(key)
}

const rowOf = (lat, meta) => Math.max(0, Math.min(meta.n_lat - 1, Math.round((lat + 88) / 2)))
const colOf = (lon, meta) => ((Math.round((lon + 180) / 2) % meta.n_lon) + meta.n_lon) % meta.n_lon

async function rowValues(variableId, meta, li, lo) {
  const b = Math.floor(li / meta.rows_per_band)
  const band = await loadBand(variableId, b)
  const off = ((li - b * meta.rows_per_band) * meta.n_lon + lo) * meta.months
  const out = new Array(meta.months)
  for (let m = 0; m < meta.months; m++) {
    const q = band[off + m]
    out[m] = q === meta.nodata ? null : q * meta.scale
  }
  return out
}

// Grid rows and columns whose centres fall inside a [lonMin, latMin, lonMax, latMax] box.
// Handles boxes that cross the date line. Tiny boxes fall back to the nearest cell.
export function cellsInBox([lonMin, latMin, lonMax, latMax], meta = { n_lat: 89, n_lon: 180 }) {
  const rows = []
  for (let li = 0; li < meta.n_lat; li++) {
    const lat = -88 + 2 * li
    if (lat >= latMin && lat <= latMax) rows.push(li)
  }
  const cols = []
  for (let lo = 0; lo < meta.n_lon; lo++) {
    const lon = -180 + 2 * lo
    const inside = lonMin <= lonMax ? lon >= lonMin && lon <= lonMax : lon >= lonMin || lon <= lonMax
    if (inside) cols.push(lo)
  }
  if (!rows.length || !cols.length) {
    const cLat = (latMin + latMax) / 2
    let cLon = lonMin <= lonMax ? (lonMin + lonMax) / 2 : (lonMin + lonMax + 360) / 2
    if (cLon >= 180) cLon -= 360
    return { rows: [rowOf(cLat, meta)], cols: [colOf(cLon, meta)] }
  }
  return { rows, cols }
}

// Area-weighted average of every cell in a box, month by month. A month counts only when
// at least half of the box (by area) has data.
export async function regionMonthly(variableId, bbox) {
  const meta = await loadMonthlyMeta(variableId)
  if (!meta) return null
  const { rows, cols } = cellsInBox(bbox, meta)
  const bands = [...new Set(rows.map((li) => Math.floor(li / meta.rows_per_band)))]
  const loaded = await Promise.all(bands.map((b) => loadBand(variableId, b)))
  const bandOf = new Map(bands.map((b, i) => [b, loaded[i]]))
  const sum = new Float64Array(meta.months)
  const wsum = new Float64Array(meta.months)
  let wTotal = 0
  for (const li of rows) {
    const b = Math.floor(li / meta.rows_per_band)
    const band = bandOf.get(b)
    const w = Math.cos(((-88 + 2 * li) * Math.PI) / 180) || 0.01
    for (const lo of cols) {
      wTotal += w
      const off = ((li - b * meta.rows_per_band) * meta.n_lon + lo) * meta.months
      for (let m = 0; m < meta.months; m++) {
        const q = band[off + m]
        if (q === meta.nodata) continue
        sum[m] += w * q * meta.scale
        wsum[m] += w
      }
    }
  }
  const values = Array.from(sum, (v, m) => (wsum[m] >= wTotal * 0.5 ? v / wsum[m] : null))
  return { meta, values, cellCount: rows.length * cols.length }
}

// Full series and trend record for a region, built in the browser from the band files.
export async function loadRegionSeries(variableId, region) {
  const key = `region:${variableId}:${region.bbox.join(',')}`
  if (!cache.has(key)) {
    cache.set(
      key,
      regionMonthly(variableId, region.bbox).then((r) => {
        if (!r) return null
        const [lonMin, latMin, lonMax, latMax] = region.bbox
        let lon = lonMin <= lonMax ? (lonMin + lonMax) / 2 : (lonMin + lonMax + 360) / 2
        if (lon >= 180) lon -= 360
        const lat = (latMin + latMax) / 2
        const series = buildSeries({
          variable: variableId,
          cellId: region.id,
          lat,
          lon,
          startYear: r.meta.start_year,
          startMonth: r.meta.start_month,
          values: r.values,
          decimals: r.meta.decimals,
        })
        if (!series) return null
        const record = {
          id: region.id,
          lat,
          lon,
          slope_per_decade: series.slope_per_decade,
          p_value: series.p_value,
          significant: series.p_value < 0.05,
          direction: series.slope_per_decade >= 0 ? 'up' : 'down',
          isRegion: true,
          cellCount: r.cellCount,
        }
        return { series: { ...series, source: 'region' }, record }
      }),
    )
  }
  return cache.get(key)
}

// Time series for one cell: the brief's per-cell JSON file when it exists (the data team
// can drop these in), otherwise built from the real monthly band files, and only as a
// last resort a synthesised placeholder.
export async function loadSeries(variableId, cell, trends) {
  const key = `series:${variableId}:${cell.id}`
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(`${base}/data/series/${variableId}/${cell.id}.json`)
        .then(async (r) => {
          if (!r.ok) throw new Error('missing')
          const ct = r.headers.get('content-type') || ''
          if (!ct.includes('json')) throw new Error('not json')
          const json = await r.json()
          return { ...json, source: 'file' }
        })
        .catch(async () => {
          const meta = await loadMonthlyMeta(variableId)
          if (meta) {
            const values = await rowValues(variableId, meta, rowOf(cell.lat, meta), colOf(cell.lon, meta))
            const s = buildSeries({
              variable: variableId,
              cellId: cell.id,
              lat: cell.lat,
              lon: cell.lon,
              startYear: meta.start_year,
              startMonth: meta.start_month,
              values,
              decimals: meta.decimals,
            })
            if (s) return { ...s, source: 'monthly' }
          }
          return {
            ...synthesiseSeries({
              variable: variableId,
              cell,
              startYear: trends.start_year,
              endYear: trends.end_year,
              endMonth: trends.end_month || 12,
            }),
            source: 'synthetic',
          }
        }),
    )
  }
  return cache.get(key)
}

export function inBbox(lon, lat, [lonMin, latMin, lonMax, latMax]) {
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
