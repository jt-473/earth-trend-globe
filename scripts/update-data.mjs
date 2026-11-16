// The regular refresh, run by .github/workflows/update-data.yml once a month (or by hand
// with `npm run update-data`). It never re-downloads the whole record:
//
//   1. Asks NASA POWER, for one test point, whether a year after the one the site ends
//      on is complete yet. POWER publishes monthly MERRA-2 data a whole year at a time,
//      so most months the answer is no and the script just records that it checked.
//   2. If there is a new year, downloads only that year for all 16,020 points into
//      .cache/power-update/<years> (resumable: the workflow keeps this folder between runs).
//   3. Adds it to the band files already in public/data, checks the new values look
//      sensible, and only then rewrites the trends, demo series and 2040 outlook.
//
//   node scripts/update-data.mjs                  check, download, build
//   node scripts/update-data.mjs --check-only     only say whether there is a new year
//   node scripts/update-data.mjs --max-minutes 300   stop downloading after this long
//   node scripts/update-data.mjs --skip-outlook   leave the 2040 outlook as it is
//
// Writes `result=<updated|no-new-data|partial|failed>` and `end_year=` to $GITHUB_OUTPUT
// when run in GitHub Actions. Exits with code 1 only when the new data failed its checks,
// in which case nothing in public/data has been changed apart from status.json.

import { readdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  ROOT,
  DATA_DIR,
  N_LAT,
  N_LON,
  N_CELLS,
  NODATA,
  VARS,
  POWER_PARAMS,
  quantize,
  readSiteGrids,
  writeSiteData,
  writeStatus,
} from './lib/site-data.mjs'

const API = process.env.POWER_API || 'https://power.larc.nasa.gov'
const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback)
const MAX_MINUTES = opt('--max-minutes', Infinity)
// Points allowed to stay missing in the new year (failed downloads). Above this the run
// counts as partial and the workflow tries again later.
const MAX_MISSING = opt('--max-missing', Math.round(N_CELLS * 0.002))
// Test points for "is the year complete?": places where every variable has data.
const PROBES = [
  { lat: 20, lon: 10 }, // Sahara: haze, sun, ozone, temperature all present
  { lat: 52, lon: -6 }, // Irish Sea
]

const output = (key, value) => {
  console.log(`${key}=${value}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}
const now = () => new Date().toISOString()

// ---- 1. What does the site have, and what does NASA have? ----------------------------
const meta = JSON.parse(readFileSync(join(DATA_DIR, 'monthly', 'temperature.json'), 'utf8'))
const haveEnd = meta.start_year + meta.months / 12 - 1
const thisYear = new Date().getUTCFullYear()
console.log(`site has ${meta.start_year} to ${haveEnd}`)

async function completeYears(from, to) {
  // Returns the years in from..to that are complete (all 12 months, every variable) at
  // every test point. A year can only count if the years before it count too.
  if (from > to) return []
  const okByYear = new Map()
  for (let y = from; y <= to; y++) okByYear.set(y, true)
  for (const p of PROBES) {
    const url =
      `${API}/api/temporal/monthly/point?parameters=${Object.values(POWER_PARAMS).join(',')}` +
      `&community=AG&longitude=${p.lon}&latitude=${p.lat}&start=${from}&end=${to}&format=JSON`
    let json = null
    for (let attempt = 0; attempt < 4 && !json; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
        if (r.ok) json = await r.json()
        // POWER answers 422 when the end year has no data at all yet.
        else if (r.status === 422 && to > from) return completeYears(from, to - 1)
        else if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`)
      } catch (err) {
        if (String(err.message).startsWith('HTTP')) throw err
      }
      if (!json) await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt))
    }
    if (!json) throw new Error('NASA POWER did not answer')
    const param = json.properties && json.properties.parameter
    if (!param) throw new Error('NASA POWER answered without data')
    for (let y = from; y <= to; y++) {
      for (const code of Object.values(POWER_PARAMS)) {
        for (let m = 1; m <= 12; m++) {
          const v = param[code] && param[code][`${y}${String(m).padStart(2, '0')}`]
          if (v === undefined || v === null || v === -999) okByYear.set(y, false)
        }
      }
    }
  }
  const years = []
  for (let y = from; y <= to && okByYear.get(y); y++) years.push(y)
  return years
}

let newYears
try {
  newYears = await completeYears(haveEnd + 1, thisYear)
} catch (err) {
  console.error(`could not check NASA POWER: ${err.message}`)
  output('result', 'failed')
  process.exit(1)
}
if (!newYears.length) {
  console.log(`no complete year after ${haveEnd} at NASA POWER yet`)
  writeStatus({ start_year: meta.start_year, end_year: haveEnd, end_month: 12, last_checked: now() })
  output('result', 'no-new-data')
  output('end_year', haveEnd)
  process.exit(0)
}
const newStart = newYears[0]
const newEnd = newYears.at(-1)
console.log(`NASA POWER has ${newStart === newEnd ? newStart : `${newStart} to ${newEnd}`}`)
if (args.includes('--check-only')) {
  output('result', 'new-data-available')
  output('end_year', newEnd)
  process.exit(0)
}

// ---- 2. Download only the new year(s) --------------------------------------------------
const cacheDir = join(ROOT, '.cache', 'power-update', `${newStart}-${newEnd}`)
const fetchArgs = ['scripts/fetch-nasa-power.mjs', '--start', String(newStart), '--end', String(newEnd), '--cache-dir', cacheDir]
if (Number.isFinite(MAX_MINUTES)) fetchArgs.push('--max-minutes', String(MAX_MINUTES))
const run = spawnSync(process.execPath, fetchArgs, { cwd: ROOT, stdio: 'inherit' })
if (run.status !== 0) {
  console.error('download step failed')
  output('result', 'partial')
  process.exit(0)
}
const have = existsSync(cacheDir) ? readdirSync(cacheDir).filter((f) => /^\d+_\d+\.json$/.test(f)).length : 0
console.log(`${have} of ${N_CELLS} points downloaded for the new year(s)`)
if (N_CELLS - have > MAX_MISSING) {
  writeStatus({ last_checked: now(), pending_year: newEnd, pending_points: have })
  output('result', 'partial')
  output('downloaded', have)
  process.exit(0)
}

// ---- 3. Merge, check, build -------------------------------------------------------------
const old = readSiteGrids()
const oldMonths = old.months
const addMonths = newYears.length * 12
const months = oldMonths + addMonths
const grids = {}
for (const v of Object.keys(VARS)) {
  const g = new Int16Array(N_CELLS * months).fill(NODATA)
  for (let idx = 0; idx < N_CELLS; idx++) g.set(old.grids[v].subarray(idx * oldMonths, (idx + 1) * oldMonths), idx * months)
  grids[v] = g
}
for (let li = 0; li < N_LAT; li++) {
  for (let lo = 0; lo < N_LON; lo++) {
    const f = join(cacheDir, `${li}_${lo}.json`)
    if (!existsSync(f)) continue
    const d = JSON.parse(readFileSync(f, 'utf8'))
    if (d.start !== `${newStart}-01`) throw new Error(`${f} starts at ${d.start}, expected ${newStart}-01`)
    const idx = li * N_LON + lo
    for (const v of Object.keys(VARS)) {
      const vals = d.values[v] || []
      for (let m = 0; m < addMonths; m++) grids[v][idx * months + oldMonths + m] = quantize(v, vals[m])
    }
  }
}

// Checks on the new data before anything is written. Each returns a problem or null.
function check(v) {
  const g = grids[v]
  const s = VARS[v].scale
  // a) Coverage: the new year should have values wherever the last old year did.
  let hadLast = 0
  let haveNew = 0
  // b) Range: new values should sit within the range seen so far, give or take a margin.
  let min = Infinity
  let max = -Infinity
  // c) Area-weighted world mean of each year, to compare the new year with the old ones.
  const yearSum = new Float64Array(months / 12)
  const yearW = new Float64Array(months / 12)
  for (let idx = 0; idx < N_CELLS; idx++) {
    const w = Math.cos(((-88 + 2 * Math.floor(idx / N_LON)) * Math.PI) / 180) || 0.01
    let lastOk = false
    let newOk = false
    for (let m = 0; m < months; m++) {
      const q = g[idx * months + m]
      if (q === NODATA) continue
      if (m < oldMonths) {
        if (q < min) min = q
        if (q > max) max = q
        if (m >= oldMonths - 12) lastOk = true
      } else newOk = true
      yearSum[Math.floor(m / 12)] += w * q
      yearW[Math.floor(m / 12)] += w
    }
    if (lastOk) hadLast++
    if (lastOk && newOk) haveNew++
  }
  if (haveNew < hadLast * 0.98) return `only ${haveNew} of ${hadLast} points have new values`
  const margin = (max - min) * 0.2
  let outside = 0
  let count = 0
  for (let idx = 0; idx < N_CELLS; idx++) {
    for (let m = oldMonths; m < months; m++) {
      const q = g[idx * months + m]
      if (q === NODATA) continue
      count++
      if (q < min - margin || q > max + margin) outside++
    }
  }
  if (outside > count * 0.001) return `${outside} new values are far outside anything seen before`
  const means = Array.from(yearSum, (x, i) => (yearW[i] ? (x / yearW[i]) * s : null))
  const oldMeans = means.slice(0, oldMonths / 12).filter((x) => x !== null)
  const recent = oldMeans.slice(-10)
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length
  const sd = Math.sqrt(oldMeans.slice(1).reduce((a, x, i) => a + (x - oldMeans[i]) ** 2, 0) / Math.max(1, oldMeans.length - 1))
  for (const [i, m] of means.slice(oldMonths / 12).entries()) {
    if (m === null) return `no values for ${newStart + i}`
    // Year-to-year jumps bigger than 6x the usual ones point to a units or format change.
    if (Math.abs(m - avg) > Math.max(6 * sd, Math.abs(avg) * 0.02)) return `world average for ${newStart + i} is ${m.toFixed(3)}, the last 10 years averaged ${avg.toFixed(3)}`
  }
  return null
}
const problems = Object.keys(VARS)
  .map((v) => [v, check(v)])
  .filter(([, p]) => p)
if (problems.length) {
  for (const [v, p] of problems) console.error(`${v}: ${p}`)
  console.error('new data failed its checks; public/data was not changed')
  writeStatus({ last_checked: now(), pending_year: newEnd, last_error: problems.map(([v, p]) => `${v}: ${p}`).join('; ') })
  output('result', 'failed')
  process.exit(1)
}

const { endYear } = writeSiteData({ grids, startYear: old.startYear, months })
if (!args.includes('--skip-outlook')) {
  const o = spawnSync(process.execPath, ['scripts/build-outlook.mjs'], { cwd: ROOT, stdio: 'inherit' })
  if (o.status !== 0) {
    console.error('outlook build failed')
    output('result', 'failed')
    process.exit(1)
  }
}
const t = now()
writeStatus({ start_year: old.startYear, end_year: endYear, end_month: 12, last_updated: t, last_checked: t, pending_year: undefined, pending_points: undefined, last_error: undefined })
output('result', 'updated')
output('end_year', endYear)
