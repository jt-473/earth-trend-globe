// Step 2 of the full real-data pipeline: turn the NASA POWER download in .cache/power into
// the files the website reads (see scripts/lib/site-data.mjs for the list).
//
// The browser builds the series for any other point, or any region, from the band files
// with the same statistics code (src/lib/stats.js), so every number on screen agrees.
//
// For the regular monthly refresh use update-data.mjs instead: it only downloads the
// newest year and adds it to what is already in public/data.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, N_LAT, N_LON, N_CELLS, START_YEAR, VARS, emptyGrids, quantize, writeSiteData, writeStatus } from './lib/site-data.mjs'

const args = process.argv.slice(2)
const cacheDir = args.includes('--cache-dir') ? args[args.indexOf('--cache-dir') + 1] : join(ROOT, '.cache', 'power')

// ---- Work out the period from the download -----------------------------------------------
let months = 0
for (let li = 0; li < N_LAT && !months; li++) {
  for (let lo = 0; lo < N_LON; lo++) {
    const f = join(cacheDir, `${li}_${lo}.json`)
    if (!existsSync(f)) continue
    const d = JSON.parse(readFileSync(f, 'utf8'))
    if (d.start !== `${START_YEAR}-01`) throw new Error(`${f} starts at ${d.start}, expected ${START_YEAR}-01`)
    months = d.values.temperature.length
    break
  }
}
if (!months) throw new Error(`nothing downloaded in ${cacheDir}; run fetch-nasa-power.mjs first`)

// ---- Read the download once into compact int16 grids ---------------------------------
const grids = emptyGrids(months)
let have = 0
for (let li = 0; li < N_LAT; li++) {
  for (let lo = 0; lo < N_LON; lo++) {
    const f = join(cacheDir, `${li}_${lo}.json`)
    if (!existsSync(f)) continue
    have++
    const d = JSON.parse(readFileSync(f, 'utf8'))
    const idx = li * N_LON + lo
    for (const v of Object.keys(VARS)) {
      const vals = d.values[v] || []
      const g = grids[v]
      for (let m = 0; m < months; m++) g[idx * months + m] = quantize(v, vals[m])
    }
  }
}
console.log(`read ${have} of ${N_CELLS} points, ${START_YEAR} to ${START_YEAR + months / 12 - 1}`)
if (have < N_CELLS) console.log('(missing points are left empty; run fetch-nasa-power.mjs again to fill them)')

const { endYear } = writeSiteData({ grids, startYear: START_YEAR, months })
const now = new Date().toISOString()
writeStatus({ start_year: START_YEAR, end_year: endYear, end_month: 12, last_updated: now, last_checked: now })
