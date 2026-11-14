// Generates PLACEHOLDER trend grids (and a few time series) in the brief's format.
// The real data comes from scripts/fetch-nasa-power.mjs and scripts/build-real-data.mjs.
// Run with: npm run generate-fake-data -- --force
//   --all-series   also write a series file for every cell (large: ~100k files)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allCellCentres, cellId } from '../src/lib/cells.js'
import { hashString, mulberry32, synthesiseSeries, twoSidedP } from '../src/lib/fakeSeries.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'public', 'data')

// Real NASA data lives in public/data/monthly. Never overwrite it with placeholders by accident.
if (existsSync(join(dataDir, 'monthly')) && !process.argv.includes('--force')) {
  console.error('public/data already holds real NASA data (public/data/monthly exists).')
  console.error('Placeholder data would overwrite the real trends. Use --force if you really mean it,')
  console.error('or run `npm run build-data` to rebuild the real data instead.')
  process.exit(1)
}
const START_YEAR = 1980
const now = new Date()
const END_YEAR = now.getFullYear()
const END_MONTH = Math.max(1, now.getMonth()) // last complete month
const writeAllSeries = process.argv.includes('--all-series')

const variables = JSON.parse(readFileSync(join(dataDir, 'variables.json'), 'utf8')).variables
const demos = JSON.parse(readFileSync(join(dataDir, 'demos.json'), 'utf8')).demos

// Smooth random field so neighbouring cells look alike (sum of sine waves).
function makeField(seed, octaves = 6) {
  const rand = mulberry32(seed)
  const waves = []
  for (let i = 0; i < octaves; i++) {
    waves.push({
      fLat: 0.02 + rand() * 0.09,
      fLon: 0.02 + rand() * 0.06,
      pLat: rand() * Math.PI * 2,
      pLon: rand() * Math.PI * 2,
      amp: 1 / (i + 1),
    })
  }
  return (lat, lon) => {
    let v = 0
    let norm = 0
    for (const w of waves) {
      v += w.amp * Math.sin(lat * w.fLat + w.pLat) * Math.cos(lon * w.fLon + w.pLon)
      norm += w.amp
    }
    return v / norm // roughly -0.6 .. 0.6
  }
}

const deg = Math.PI / 180
const bump = (lat, lon, cLat, cLon, rLat, rLon) => {
  const dLat = (lat - cLat) / rLat
  let dLon = lon - cLon
  if (dLon > 180) dLon -= 360
  if (dLon < -180) dLon += 360
  dLon /= rLon
  return Math.exp(-(dLat * dLat + dLon * dLon))
}

// Expected trend per decade for each variable, loosely inspired by real patterns.
const patterns = {
  temperature: (lat, lon, f) =>
    0.14 + 0.5 * Math.pow(Math.max(0, lat) / 90, 2) + 0.06 * Math.pow(Math.abs(lat) / 90, 2) + 0.22 * f(lat, lon)
    - 0.3 * bump(lat, lon, -62, -40, 10, 70) - 0.28 * bump(lat, lon, 52, -32, 7, 16) + 0.12 * bump(lat, lon, 45, 40, 20, 50)
    - 0.2 * bump(lat, lon, -5, -110, 8, 30) + 0.1 * bump(lat, lon, 30, 110, 12, 25),
  humidity: (lat, lon, f) =>
    0.08 * Math.cos(lat * deg) + 0.06 * f(lat, lon) + 0.1 * bump(lat, lon, 5, 110, 15, 40) - 0.05 * bump(lat, lon, 25, 40, 12, 30),
  rainfall: (lat, lon, f) =>
    0.25 * f(lat, lon) + 0.18 * bump(lat, lon, 14, 5, 5, 35) - 0.16 * bump(lat, lon, 38, 15, 6, 25)
    + 0.15 * bump(lat, lon, 0, 130, 10, 40) - 0.12 * bump(lat, lon, -28, 134, 10, 20) - 0.1 * bump(lat, lon, 36, -118, 8, 15),
  sunlight: (lat, lon, f) =>
    1.4 * f(lat, lon) + 2.4 * bump(lat, lon, 50, 12, 12, 30) - 3.2 * bump(lat, lon, 26, 82, 10, 25) - 2.6 * bump(lat, lon, 34, 112, 10, 20)
    + 1.2 * bump(lat, lon, 40, -95, 12, 35),
  air_pollution: (lat, lon, f) =>
    0.008 * f(lat, lon) + 0.035 * bump(lat, lon, 26, 82, 9, 22) + 0.02 * bump(lat, lon, 34, 112, 10, 20) - 0.022 * bump(lat, lon, 50, 12, 12, 30)
    - 0.015 * bump(lat, lon, 40, -95, 12, 35) + 0.012 * bump(lat, lon, 20, 10, 10, 30),
  ozone: (lat, lon, f) =>
    1.1 * f(lat, lon) + 1.2 * (Math.abs(lat) > 35 ? 1 : 0.3) - 3.5 * bump(lat, lon, -80, 0, 12, 400) + 0.8 * bump(lat, lon, 45, 0, 20, 400),
}

// How noisy each variable is, which controls which cells pass the significance test.
const noiseSd = { temperature: 0.11, humidity: 0.03, rainfall: 0.045, sunlight: 0.3, air_pollution: 0.0025, ozone: 0.8 }

const centres = allCellCentres()
mkdirSync(join(dataDir, 'series'), { recursive: true })

const trendsByVar = {}
for (const v of variables) {
  const field = makeField(hashString(`field:${v.id}`))
  const rand = mulberry32(hashString(`trend:${v.id}`))
  const cells = centres.map(({ lat, lon }) => {
    const slope = patterns[v.id](lat, lon, field) + (rand() - 0.5) * noiseSd[v.id] * 0.6
    const z = Math.abs(slope) / (noiseSd[v.id] * (0.75 + rand() * 0.5))
    const p = twoSidedP(z)
    const d = v.decimals + 1
    return {
      id: cellId(lat, lon),
      lat,
      lon,
      slope_per_decade: Number(slope.toFixed(d)),
      p_value: Number(p.toFixed(4)),
      significant: p < 0.05,
      direction: slope >= 0 ? 'up' : 'down',
    }
  })
  const trends = {
    variable: v.id,
    units_per_decade: v.units_per_decade,
    start_year: START_YEAR,
    end_year: END_YEAR,
    end_month: END_MONTH,
    cells,
  }
  trendsByVar[v.id] = trends
  writeFileSync(join(dataDir, `trends_${v.id}.json`), JSON.stringify(trends))
  const sig = cells.filter((c) => c.significant).length
  console.log(`trends_${v.id}.json  ${cells.length} cells, ${sig} significant (${((100 * sig) / cells.length).toFixed(0)}%)`)
}

// Time series files: every demo location for every variable, or everything with --all-series.
const wanted = new Set()
for (const demo of demos) for (const s of demo.steps) wanted.add(cellId(...Object.values(snap(s.lat, s.lon))))
function snap(lat, lon) {
  const c = centres.reduce((best, c) => {
    const d = Math.abs(c.lat - lat) + Math.abs(c.lon - lon)
    return d < best.d ? { d, lat: c.lat, lon: c.lon } : best
  }, { d: Infinity })
  return { lat: c.lat, lon: c.lon }
}

let written = 0
for (const v of variables) {
  const dir = join(dataDir, 'series', v.id)
  mkdirSync(dir, { recursive: true })
  for (const cell of trendsByVar[v.id].cells) {
    if (!writeAllSeries && !wanted.has(cell.id)) continue
    const series = synthesiseSeries({ variable: v.id, cell, startYear: START_YEAR, endYear: END_YEAR, endMonth: END_MONTH })
    writeFileSync(join(dir, `${cell.id}.json`), JSON.stringify(series))
    written++
  }
}
console.log(`series files written: ${written}${writeAllSeries ? '' : ' (demo locations only; other cells are synthesised in the browser)'}`)
