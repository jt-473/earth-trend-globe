// Shared by the full rebuild (build-real-data.mjs) and the monthly update (update-data.mjs):
// the grid layout, how each variable is stored, and the code that writes public/data.
//
//   public/data/trends_<variable>.json        trend for every 2-degree point (brief format)
//   public/data/monthly/<variable>.json       description of the monthly data files
//   public/data/monthly/<variable>/band_N.bin monthly values, 9 rows of latitude per file
//   public/data/series/<variable>/<cell>.json full series for the demo locations (brief format)

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeries, trendOnly } from '../../src/lib/stats.js'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA_DIR = join(ROOT, 'public', 'data')

export const N_LAT = 89
export const N_LON = 180
export const N_CELLS = N_LAT * N_LON
export const ROWS_PER_BAND = 9
export const START_YEAR = 1981
export const NODATA = -32768

// NASA POWER parameter code for each variable.
export const POWER_PARAMS = {
  temperature: 'T2M',
  humidity: 'QV2M',
  rainfall: 'PRECTOTCORR',
  sunlight: 'ALLSKY_SFC_SW_DWN',
  air_pollution: 'AOD_55',
  ozone: 'TO3',
}

// How each variable is stored: value = int16 * scale. `convert` turns NASA POWER units
// into the units the site shows.
export const VARS = {
  temperature: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), air temperature at 2 m' },
  humidity: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), specific humidity at 2 m' },
  rainfall: { scale: 0.01, decimals: 2, source: 'MERRA-2 (via NASA POWER), bias-corrected precipitation' },
  sunlight: { scale: 0.1, decimals: 1, convert: (v) => v * 11.574, source: 'NASA GEWEX SRB and CERES (via NASA POWER), all-sky surface shortwave' },
  air_pollution: { scale: 0.0001, decimals: 3, source: 'MERRA-2 (via NASA POWER), aerosol optical depth at 550 nm' },
  ozone: { scale: 0.1, decimals: 1, source: 'MERRA-2 (via NASA POWER), total column ozone' },
}

export const pointOf = (li, lo) => ({ li, lo, lat: -88 + 2 * li, lon: -180 + 2 * lo })
export const cellId = (lat, lon) => `c_${lat}_${lon}`

// NASA POWER value (or null) -> stored int16, NODATA when missing.
export function quantize(variable, x) {
  if (x === null || x === undefined || x === -999) return NODATA
  const cfg = VARS[variable]
  if (cfg.convert) x = cfg.convert(x)
  return Math.max(-32767, Math.min(32767, Math.round(x / cfg.scale)))
}

export function emptyGrids(months) {
  const grids = {}
  for (const v of Object.keys(VARS)) grids[v] = new Int16Array(N_CELLS * months).fill(NODATA)
  return grids
}

// Read what is already in public/data back into int16 grids (the inverse of writeSiteData).
export function readSiteGrids(dataDir = DATA_DIR) {
  const grids = {}
  let startYear = null
  let months = null
  for (const v of Object.keys(VARS)) {
    const meta = JSON.parse(readFileSync(join(dataDir, 'monthly', `${v}.json`), 'utf8'))
    if (meta.n_lat !== N_LAT || meta.n_lon !== N_LON || meta.rows_per_band !== ROWS_PER_BAND) throw new Error(`${v}: unexpected grid layout`)
    if (meta.start_month !== 1 || meta.months % 12 !== 0) throw new Error(`${v}: data must cover whole years`)
    if (startYear === null) {
      startYear = meta.start_year
      months = meta.months
    } else if (meta.start_year !== startYear || meta.months !== months) {
      throw new Error(`${v}: covers a different period from the other variables`)
    }
    const g = new Int16Array(N_CELLS * months)
    for (let b = 0; b < meta.bands; b++) {
      const buf = readFileSync(join(dataDir, 'monthly', v, `band_${b}.bin`))
      g.set(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2), b * ROWS_PER_BAND * N_LON * months)
    }
    grids[v] = g
  }
  return { grids, startYear, months }
}

// Write every file the website reads from int16 grids covering whole years from startYear.
export function writeSiteData({ grids, startYear, months, dataDir = DATA_DIR, log = console.log }) {
  const endYear = startYear + months / 12 - 1
  const monthlyOf = (v, idx) => {
    const g = grids[v]
    const s = VARS[v].scale
    const out = new Array(months)
    for (let m = 0; m < months; m++) {
      const q = g[idx * months + m]
      out[m] = q === NODATA ? null : q * s
    }
    return out
  }

  // ---- Band files and trends ------------------------------------------------------------
  const variables = JSON.parse(readFileSync(join(dataDir, 'variables.json'), 'utf8')).variables
  const nBands = Math.ceil(N_LAT / ROWS_PER_BAND)
  const summary = {}
  for (const [v, cfg] of Object.entries(VARS)) {
    const dir = join(dataDir, 'monthly', v)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (let b = 0; b < nBands; b++) {
      const li0 = b * ROWS_PER_BAND
      const li1 = Math.min(N_LAT, li0 + ROWS_PER_BAND)
      const slice = grids[v].subarray(li0 * N_LON * months, li1 * N_LON * months)
      writeFileSync(join(dir, `band_${b}.bin`), Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength))
    }

    const cells = []
    let firstMonth = months
    for (let idx = 0; idx < N_CELLS; idx++) {
      const { lat, lon } = pointOf(Math.floor(idx / N_LON), idx % N_LON)
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
    const varStart = startYear + Math.floor(firstMonth / 12)
    const vdef = variables.find((x) => x.id === v)
    writeFileSync(
      join(dataDir, `trends_${v}.json`),
      JSON.stringify({
        variable: v,
        units_per_decade: vdef ? vdef.units_per_decade : '',
        source: cfg.source,
        start_year: varStart,
        end_year: endYear,
        end_month: 12,
        cells,
      }),
    )
    writeFileSync(
      join(dataDir, 'monthly', `${v}.json`),
      JSON.stringify({
        variable: v,
        source: cfg.source,
        start_year: startYear,
        start_month: 1,
        months,
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
      start_year: varStart,
      p50: abs[Math.floor(abs.length * 0.5)],
      p90: abs[Math.floor(abs.length * 0.9)],
      p97: abs[Math.floor(abs.length * 0.97)],
    }
  }
  if (log === console.log) console.table(summary)

  // ---- Real series files for the demo locations ---------------------------------------
  const demosFile = join(dataDir, 'demos.json')
  const demos = existsSync(demosFile) ? JSON.parse(readFileSync(demosFile, 'utf8')).demos : []
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
      const { lat, lon } = pointOf(li, lo)
      const s = buildSeries({ variable: v, cellId: cellId(lat, lon), lat, lon, startYear, values: monthlyOf(v, idx), decimals: cfg.decimals })
      if (!s) continue
      writeFileSync(join(seriesDir, v, `${cellId(lat, lon)}.json`), JSON.stringify(s))
      written++
    }
  }
  log(`series files for demo locations: ${written}`)
  return { endYear, summary }
}

// public/data/status.json: what period the site covers and when NASA was last checked.
// The site shows this, and the monthly job updates it on every run.
export function writeStatus(fields, dataDir = DATA_DIR) {
  const file = join(dataDir, 'status.json')
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const next = { source: 'NASA POWER (MERRA-2, GEWEX SRB, CERES)', ...old, ...fields }
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
  return next
}
