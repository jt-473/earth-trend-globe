// Step 1 of the real-data pipeline: download monthly NASA POWER data (MERRA-2 based,
// free, no key) for every 2-degree grid point and keep a compact copy in .cache/power.
// Safe to stop and re-run: points already downloaded are skipped.
//
//   node scripts/fetch-nasa-power.mjs            # all 16,020 points, ~1 hour
//   node scripts/fetch-nasa-power.mjs --limit 50 # quick test
//   node scripts/fetch-nasa-power.mjs --reverse  # start from the north (run alongside a normal copy)
//
// Then run `node scripts/build-real-data.mjs` to turn the cache into public/data.

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache', 'power')
mkdirSync(cacheDir, { recursive: true })

export const POWER_PARAMS = {
  temperature: 'T2M',
  humidity: 'QV2M',
  rainfall: 'PRECTOTCORR',
  sunlight: 'ALLSKY_SFC_SW_DWN',
  air_pollution: 'AOD_55',
  ozone: 'TO3',
}
const START = 1981
const END = 2025

const N_LAT = 89
const N_LON = 180

const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback)
const limit = opt('--limit', Infinity)
// NASA POWER rate-limits busy clients. Keep it gentle: a few requests at a time with a pause.
const CONCURRENCY = opt('--concurrency', 3)
const PAUSE_MS = opt('--pause', 500)

const points = []
for (let li = 0; li < N_LAT; li++) for (let lo = 0; lo < N_LON; lo++) points.push({ li, lo, lat: -88 + 2 * li, lon: -180 + 2 * lo })
const missing = points.filter((p) => !existsSync(join(cacheDir, `${p.li}_${p.lo}.json`)))
// --reverse starts from the north pole, so a second copy can run alongside the first.
if (args.includes('--reverse')) missing.reverse()
const todo = missing.slice(0, limit)
console.log(`${points.length - missing.length} already downloaded, ${todo.length} to download now`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let rateLimitedUntil = 0
async function waitForRateLimit() {
  while (Date.now() < rateLimitedUntil) await sleep(Math.min(15000, rateLimitedUntil - Date.now()))
}

async function fetchPoint(p) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${Object.values(POWER_PARAMS).join(',')}` +
    `&community=AG&longitude=${p.lon}&latitude=${p.lat}&start=${START}&end=${END}&format=JSON`
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (r.status === 429) {
        // Too many requests: everyone waits, then this point is tried again (not counted).
        rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + 5 * 60 * 1000)
        console.log('NASA says too many requests; pausing 5 minutes')
        await waitForRateLimit()
        attempt--
        continue
      }
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
      if (!r.ok) throw new Error(`HTTP ${r.status} (not retrying)`)
      const json = await r.json()
      const param = json.properties && json.properties.parameter
      if (!param) throw new Error('no data in response')
      // Keep only the 12 monthly values per year (POWER adds a 13th "annual" value).
      const out = { lat: p.lat, lon: p.lon, start: `${START}-01`, values: {} }
      for (const [id, code] of Object.entries(POWER_PARAMS)) {
        const series = param[code] || {}
        const vals = []
        for (let y = START; y <= END; y++) for (let m = 1; m <= 12; m++) {
          const v = series[`${y}${String(m).padStart(2, '0')}`]
          vals.push(v === undefined || v === -999 ? null : v)
        }
        out.values[id] = vals
      }
      writeFileSync(join(cacheDir, `${p.li}_${p.lo}.json`), JSON.stringify(out))
      return true
    } catch (err) {
      if (String(err.message).includes('not retrying')) {
        console.warn(`skip ${p.lat},${p.lon}: ${err.message}`)
        return false
      }
      await sleep(2000 * 2 ** attempt)
    }
  }
  console.warn(`gave up on ${p.lat},${p.lon}`)
  return false
}

let done = 0
let failed = 0
const t0 = Date.now()
let next = 0
async function worker() {
  while (next < todo.length) {
    const p = todo[next++]
    // Another copy may have fetched it since we started.
    if (existsSync(join(cacheDir, `${p.li}_${p.lo}.json`))) continue
    await waitForRateLimit()
    if (PAUSE_MS) await sleep(PAUSE_MS)
    const ok = await fetchPoint(p)
    if (ok) done++
    else failed++
    if ((done + failed) % 250 === 0) {
      const rate = (done + failed) / ((Date.now() - t0) / 1000)
      const left = Math.round((todo.length - done - failed) / rate / 60)
      console.log(`${done + failed}/${todo.length} (${failed} failed), about ${left} min left`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`finished: ${done} downloaded, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s`)
