// Step 2 of the real-data pipeline: turn the NASA POWER download in .cache/power into
// the files the website reads.
//
//   public/data/trends_<variable>.json        trend for every 2-degree point (brief format)
//   public/data/monthly/<variable>.json       description of the monthly data files
//   public/data/monthly/<variable>/band_N.bin monthly values, 9 rows of latitude per file
//   public/data/series/<variable>/<cell>.json full series for the demo locations (brief format)
//
// The browser builds the series for any other point, or any region, from the band files
// with the same statistics code (src/lib/stats.js), so every number on screen agrees.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeries, trendOnly } from '../src/lib/stats.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache', 'power')
const dataDir = join(root, 'public', 'data')

const N_LAT = 89
const N_LON = 180
const N_CELLS = N_LAT * N_LON
const ROWS_PER_BAND = 9
const START_YEAR = 1981
const END_YEAR = 2025
const MONTHS = (END_YEAR - START_YEAR + 1) * 12
const NODATA = -32768

// How each variable is stored: value = int16 * scale. `convert` turns NASA POWER units
// into the units the site shows.
const VARS = {
  temperature: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), air temperature at 2 m' },
  humidity: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), specific humidity at 2 m' },
  rainfall: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), bias-corrected precipitation' },
  sunlight: { scale: 0.1, decimals: 1, convert: (v) => v * 11.574, source: 'NASA GEWEX SRB and CERES (via NASA POWER), all-sky surface shortwave' },
  air_pollution: { scale: 0.0001, decimals: 3, source: 'MERRA-2 (via NASA POWER), aerosol optical depth at 550 nm' },
  ozone: { scale: 0.1, decimals: 1, source: 'MERRA-2 (via NASA POWER), total column ozone' },
}

const cellId = (lat, lon) => `c_${lat}_${lon}`

// ---- Read the download once into compact int16 grids ---------------------------------
const grids = {}
for (const v of Object.keys(VARS)) grids[v] = new Int16Array(N_CELLS * MONTHS).fill(NODATA)
let have = 0
for (let li = 0; li < N_LAT; li++) {
  for (let lo = 0; lo < N_LON; lo++) {
    const f = join(cacheDir, `${li}_${lo}.json`)
    if (!existsSync(f)) continue
    have++
    const d = JSON.parse(readFileSync(f, 'utf8'))
    const idx = li * N_LON + lo
    for (const [v, cfg] of Object.entries(VARS)) {
      const vals = d.values[v] || []
      const g = grids[v]
      for (let m = 0; m < MONTHS; m++) {
        let x = vals[m]
        if (x === null || x === undefined) continue
        if (cfg.convert) x = cfg.convert(x)
        const q = Math.round(x / cfg.scale)
        g[idx * MONTHS + m] = Math.max(-32767, Math.min(32767, q))
      }
    }
  }
}
console.log(`read ${have} of ${N_CELLS} points`)
if (have < N_CELLS) console.log('(missing points are left empty; run fetch-nasa-power.mjs again to fill them)')

const monthlyOf = (v, idx) => {
  const g = grids[v]
  const s = VARS[v].scale
  const out = new Array(MONTHS)
  for (let m = 0; m < MONTHS; m++) {
    const q = g[idx * MONTHS + m]
    out[m] = q === NODATA ? null : q * s
  }
  return out
}

// ---- Band files and trends --------------------------------------------------------------
const nBands = Math.ceil(N_LAT / ROWS_PER_BAND)
const summary = {}
for (const [v, cfg] of Object.entries(VARS)) {
  const dir = join(dataDir, 'monthly', v)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (let b = 0; b < nBands; b++) {
    const li0 = b * ROWS_PER_BAND
    const li1 = Math.min(N_LAT, li0 + ROWS_PER_BAND)
    const slice = grids[v].subarray(li0 * N_LON * MONTHS, li1 * N_LON * MONTHS)
    writeFileSync(join(dir, `band_${b}.bin`), Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength))
  }

  const cells = []
  let firstMonth = MONTHS
  for (let idx = 0; idx < N_CELLS; idx++) {
    const li = Math.floor(idx / N_LON)
    const lo = idx % N_LON
    const lat = -88 + 2 * li
    const lon = -180 + 2 * lo
    const vals = monthlyOf(v, idx)
    const f = vals.findIndex((x) => x !== null)
    if (f >= 0) firstMonth = Math.min(firstMonth, f)
    const fit = trendOnly(vals)
    if (!fit) continue
    const slope = fit.slope * 10
    // An exactly flat record (no change at all, e.g. no haze over Antarctica) is not a trend.
    const p = fit.s === 0 ? 1 : fit.p_value
    cells.push({
      id: cellId(lat, lon),
      lat,
      lon,
      slope_per_decade: Number(slope.toFixed(cfg.decimals + 2)),
      p_value: Number(p.toFixed(4)),
      significant: p < 0.05,
      direction: slope >= 0 ? 'up' : 'down',
    })
  }
  const startYear = START_YEAR + Math.floor(firstMonth / 12)
  const vdef = JSON.parse(readFileSync(join(dataDir, 'variables.json'), 'utf8')).variables.find((x) => x.id === v)
  writeFileSync(
    join(dataDir, `trends_${v}.json`),
    JSON.stringify({
      variable: v,
      units_per_decade: vdef ? vdef.units_per_decade : '',
      source: cfg.source,
      start_year: startYear,
      end_year: END_YEAR,
      end_month: 12,
      cells,
    }),
  )
  writeFileSync(
    join(dataDir, 'monthly', `${v}.json`),
    JSON.stringify({
      variable: v,
      source: cfg.source,
      start_year: START_YEAR,
      start_month: 1,
      months: MONTHS,
      scale: cfg.scale,
      decimals: cfg.decimals,
      nodata: NODATA,
      n_lat: N_LAT,
      n_lon: N_LON,
      rows_per_band: ROWS_PER_BAND,
      bands: nBands,
    }),
  )
  const sig = cells.filter((c) => c.significant)
  const abs = cells.map((c) => Math.abs(c.slope_per_decade)).sort((a, b) => a - b)
  summary[v] = {
    cells: cells.length,
    significant: `${((100 * sig.length) / Math.max(1, cells.length)).toFixed(0)}%`,
    start_year: startYear,
    p50: abs[Math.floor(abs.length * 0.5)],
    p90: abs[Math.floor(abs.length * 0.9)],
    p97: abs[Math.floor(abs.length * 0.97)],
  }
}
console.table(summary)

// ---- Real series files for the demo locations ------------------------------------------
const demos = JSON.parse(readFileSync(join(dataDir, 'demos.json'), 'utf8')).demos
const wanted = new Map()
for (const d of demos) {
  for (const s of d.steps) {
    const li = Math.max(0, Math.min(N_LAT - 1, Math.round((s.lat + 88) / 2)))
    const lo = ((Math.round((s.lon + 180) / 2) % N_LON) + N_LON) % N_LON
    wanted.set(li * N_LON + lo, { li, lo })
  }
}
const seriesDir = join(dataDir, 'series')
rmSync(seriesDir, { recursive: true, force: true })
let written = 0
for (const [v, cfg] of Object.entries(VARS)) {
  mkdirSync(join(seriesDir, v), { recursive: true })
  for (const [idx, { li, lo }] of wanted) {
    const lat = -88 + 2 * li
    const lon = -180 + 2 * lo
    const s = buildSeries({ variable: v, cellId: cellId(lat, lon), lat, lon, startYear: START_YEAR, values: monthlyOf(v, idx), decimals: cfg.decimals })
    if (!s) continue
    writeFileSync(join(seriesDir, v, `${cellId(lat, lon)}.json`), JSON.stringify(s))
    written++
  }
}
console.log(`series files for demo locations: ${written}`)
