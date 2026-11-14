// Builds the 2040 outlook from the real NASA data already in public/data/monthly.
//
//   public/data/outlook/<variable>.json   one entry per area: measured yearly values,
//                                         the fitted trend, possible futures to 2040,
//                                         records, unusual months and a test on the past
//
// The model itself is in src/lib/outlook.js. Run with: npm run build-outlook

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { outlook } from '../src/lib/outlook.js'
import { CONTINENTS, COUNTRIES } from '../src/lib/places.js'
import { hashString } from '../src/lib/fakeSeries.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'public', 'data')
const outDir = join(dataDir, 'outlook')
mkdirSync(outDir, { recursive: true })

const RUNS = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) || 2000)

// Same boxes as src/lib/explore.js (that file runs in the browser only).
const CONTINENT_BOXES = {
  'North America': [-168, 8, -52, 72],
  'South America': [-82, -56, -34, 12],
  Europe: [-12, 36, 40, 71],
  Africa: [-18, -35, 51, 37],
  Asia: [40, 0, 150, 75],
  Australia: [113, -44, 154, -11],
  Antarctica: [-180, -90, 180, -64],
}
function boxAround(lat, lon, half) {
  const latMin = Math.max(-90, lat - half)
  const latMax = Math.min(90, lat + half)
  const lonHalf = Math.min(60, half / Math.max(0.3, Math.cos((lat * Math.PI) / 180)))
  let lonMin = lon - lonHalf
  let lonMax = lon + lonHalf
  if (lonMin < -180) lonMin += 360
  if (lonMax > 180) lonMax -= 360
  return [Math.round(lonMin), Math.round(latMin), Math.round(lonMax), Math.round(latMax)]
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const regionsFile = JSON.parse(readFileSync(join(dataDir, 'regions.json'), 'utf8'))
const areas = [
  { id: 'world', name: 'The whole world', group: 'Big picture', bbox: [-180, -90, 180, 90] },
  { id: 'north', name: 'Northern Hemisphere', group: 'Big picture', bbox: [-180, 0, 180, 90] },
  { id: 'south', name: 'Southern Hemisphere', group: 'Big picture', bbox: [-180, -90, 180, 0] },
  { id: 'tropics', name: 'The tropics', group: 'Big picture', bbox: [-180, -23, 180, 23] },
  { id: 'arctic', name: 'The Arctic', group: 'Big picture', bbox: [-180, 66, 180, 90] },
]
for (const c of CONTINENTS) if (CONTINENT_BOXES[c.name]) areas.push({ id: `continent:${slug(c.name)}`, name: c.name, group: 'Continents', bbox: CONTINENT_BOXES[c.name] })
for (const c of COUNTRIES) {
  const half = c.tier === 1 ? 9 : c.tier === 2 ? 5 : 3
  areas.push({ id: `country:${slug(c.name)}`, name: c.name, group: 'Countries', bbox: boxAround(c.lat, c.lon, half) })
}
for (const r of regionsFile.regions) areas.push({ id: `region:${slug(r.name)}`, name: r.name, group: 'Regions', bbox: r.bbox })
const seen = new Set(areas.map((a) => a.name.toLowerCase()))
for (const p of regionsFile.places || []) {
  if (seen.has(p.name.toLowerCase())) continue
  seen.add(p.name.toLowerCase())
  areas.push({ id: `place:${slug(p.name)}`, name: p.name, group: 'Seas and other places', bbox: boxAround(p.lat, p.lon, 3) })
}

function cellsInBox([lonMin, latMin, lonMax, latMax], nLat, nLon) {
  const rows = []
  for (let li = 0; li < nLat; li++) {
    const lat = -88 + 2 * li
    if (lat >= latMin && lat <= latMax) rows.push(li)
  }
  const cols = []
  for (let lo = 0; lo < nLon; lo++) {
    const lon = -180 + 2 * lo
    if (lonMin <= lonMax ? lon >= lonMin && lon <= lonMax : lon >= lonMin || lon <= lonMax) cols.push(lo)
  }
  return { rows, cols }
}

const variables = JSON.parse(readFileSync(join(dataDir, 'variables.json'), 'utf8')).variables
const RECENT = 20 // years used by the "recent pace" model

function areaValues(grid, meta, area) {
  const { rows, cols } = cellsInBox(area.bbox, meta.n_lat, meta.n_lon)
  if (!rows.length || !cols.length) return null
  const sum = new Float64Array(meta.months)
  const wsum = new Float64Array(meta.months)
  let wTotal = 0
  for (const li of rows) {
    const w = Math.cos(((-88 + 2 * li) * Math.PI) / 180) || 0.01
    for (const lo of cols) {
      wTotal += w
      const off = (li * meta.n_lon + lo) * meta.months
      for (let m = 0; m < meta.months; m++) {
        const q = grid[off + m]
        if (q === meta.nodata) continue
        sum[m] += w * q * meta.scale
        wsum[m] += w
      }
    }
  }
  return { values: Array.from(sum, (s, m) => (wsum[m] >= wTotal * 0.5 ? s / wsum[m] : null)), points: rows.length * cols.length }
}

// Test one model setting on the past for every area: how far off it was, and how often
// the real years fell inside its 90% range.
function testOnPast(records, meta, vdef, opts) {
  let inside = 0
  let counted = 0
  const ratios = []
  for (const { area, values } of records) {
    const o = outlook(values, meta.start_year, { ...opts, backtestOnly: true, backtestRuns: 300, seed: hashString(`${vdef.id}:${area.id}:test`), decimals: vdef.decimals })
    if (!o || !o.backtest) continue
    inside += o.backtest.inside
    counted += o.backtest.counted
    if (o.backtest.error_no_change > 0) ratios.push(o.backtest.error_model / o.backtest.error_no_change)
  }
  // Typical (median) error compared with simply assuming nothing changes: under 1 means
  // the model did better than "no change".
  ratios.sort((a, b) => a - b)
  return { coverage: inside / counted, relErr: ratios[Math.floor(ratios.length / 2)], wins: ratios.filter((x) => x < 1).length / ratios.length }
}

const summary = {}
const calibration = {}
const world = {}
for (const vdef of variables) {
  const v = vdef.id
  const meta = JSON.parse(readFileSync(join(dataDir, 'monthly', `${v}.json`), 'utf8'))
  const grid = new Int16Array(meta.n_lat * meta.n_lon * meta.months)
  for (let b = 0; b < meta.bands; b++) {
    const buf = readFileSync(join(dataDir, 'monthly', v, `band_${b}.bin`))
    const arr = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
    grid.set(arr, b * meta.rows_per_band * meta.n_lon * meta.months)
  }
  const records = []
  for (const area of areas) {
    const av = areaValues(grid, meta, area)
    if (av) records.push({ area, ...av })
  }

  // 1. Which model would have predicted the recent past better: the trend of the whole
  //    record, or the trend of the most recent years only?
  const whole = testOnPast(records, meta, vdef, { trendYears: null })
  const recent = testOnPast(records, meta, vdef, { trendYears: RECENT })
  const trendYears = recent.relErr < whole.relErr ? RECENT : null
  // 2. Widen the ranges until they would have caught 9 in 10 of the real years.
  let lo = 1
  let hi = 4
  let cov = (trendYears ? recent : whole).coverage
  let spread = 1
  if (cov < 0.9) {
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2
      const c = testOnPast(records, meta, vdef, { trendYears, spread: mid }).coverage
      if (c < 0.9) lo = mid
      else hi = mid
    }
    spread = hi
    cov = testOnPast(records, meta, vdef, { trendYears, spread }).coverage
  }
  calibration[v] = {
    model: trendYears ? `recent ${RECENT} years` : 'whole record',
    error_vs_no_change_whole: whole.relErr.toFixed(2),
    error_vs_no_change_recent: recent.relErr.toFixed(2),
    coverage_before: ((trendYears ? recent : whole).coverage * 100).toFixed(0) + '%',
    spread: spread.toFixed(2),
    coverage_after: (cov * 100).toFixed(0) + '%',
  }

  // 3. The real run, plus the other model for comparison.
  const out = []
  for (const { area, values, points } of records) {
    const seed = hashString(`${v}:${area.id}`)
    const o = outlook(values, meta.start_year, { runs: RUNS, seed, decimals: vdef.decimals, trendYears, spread })
    if (!o) continue
    const other = outlook(values, meta.start_year, { runs: 600, seed: seed + 1, decimals: vdef.decimals, trendYears: trendYears ? null : RECENT, spread, backtestOnly: false, backtestRuns: 20 })
    if (o.backtest) delete o.backtest.z
    out.push({
      id: area.id,
      name: area.name,
      group: area.group,
      bbox: area.bbox,
      points,
      ...o,
      other: other
        ? { model: other.model, trend_from: other.trend_from, slope_per_decade: other.slope_per_decade, p50: other.bands.p50, p05: other.bands.p05, p95: other.bands.p95 }
        : null,
    })
  }
  writeFileSync(
    join(outDir, `${v}.json`),
    JSON.stringify({
      variable: v,
      runs: RUNS,
      end_year: 2040,
      calibration: {
        model: trendYears ? 'recent' : 'whole_record',
        recent_years: RECENT,
        error_whole: Number(whole.relErr.toFixed(3)),
        error_recent: Number(recent.relErr.toFixed(3)),
        areas_better_than_no_change: Number(((trendYears ? recent : whole).wins).toFixed(3)),
        coverage_before: Number(((trendYears ? recent : whole).coverage).toFixed(3)),
        spread: Number(spread.toFixed(2)),
        coverage_after: Number(cov.toFixed(3)),
      },
      areas: out,
    }),
  )
  const w = out.find((a) => a.id === 'world')
  // Whole-record slope for comparing variables like for like.
  world[v] = { slope_per_decade: w.model === 'whole_record' ? w.slope_per_decade : w.other.slope_per_decade, mean_level: w.mean_level }
  summary[v] = { areas: out.length, model: w.model, world_per_decade: w.slope_per_decade, world_2040: `${w.bands.p50.at(-1)} (${w.bands.p05.at(-1)} to ${w.bands.p95.at(-1)})`, other_2040: w.other?.p50.at(-1) }
  console.log(v, 'done')
}
// Links between variables for the whole world, e.g. how much more water vapour the air
// holds for each degree of warming (physics says about 7% per °C).
const t = world.temperature
const h = world.humidity
writeFileSync(
  join(outDir, 'links.json'),
  JSON.stringify({
    world,
    humidity_percent_per_degree: t && h && t.slope_per_decade > 0 ? Number(((100 * h.slope_per_decade) / h.mean_level / t.slope_per_decade).toFixed(1)) : null,
  }),
)
console.table(calibration)
console.table(summary)
