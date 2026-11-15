// Step 1 of the real-data pipeline: download monthly NASA POWER data (MERRA-2 based,
// free, no key) for every 2-degree grid point and keep a compact copy in .cache/power.
// Safe to stop and re-run: points already downloaded are skipped.
//
//   node scripts/fetch-nasa-power.mjs            # all 16,020 points, 1981 to last year
//   node scripts/fetch-nasa-power.mjs --limit 50 # quick test
//   node scripts/fetch-nasa-power.mjs --reverse  # start from the north (run alongside a normal copy)
//
// Options used by the monthly update (update-data.mjs):
//   --start 2026 --end 2026     only these years (default: 1981 to last year)
//   --cache-dir <dir>           where to keep the download (default: .cache/power)
//   --max-minutes 300           stop cleanly after this long; run again to carry on
//
// Then run `node scripts/build-real-data.mjs` to turn the cache into public/data.

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, N_LAT, N_LON, START_YEAR, POWER_PARAMS, pointOf } from './lib/site-data.mjs'

// Set POWER_API to point at a test server.
const API = process.env.POWER_API || 'https://power.larc.nasa.gov'

const args = process.argv.slice(2)
const opt = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback)
const str = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const START = opt('--start', START_YEAR)
// NASA POWER's monthly MERRA-2 data runs to the end of the previous year.
const END = opt('--end', new Date().getUTCFullYear() - 1)
const cacheDir = str('--cache-dir', join(ROOT, '.cache', 'power'))
const limit = opt('--limit', Infinity)
// NASA POWER rate-limits busy clients. Keep it gentle: a few requests at a time with a pause.
const CONCURRENCY = opt('--concurrency', 3)
const PAUSE_MS = opt('--pause', 500)
const deadline = Date.now() + opt('--max-minutes', Infinity) * 60000
mkdirSync(cacheDir, { recursive: true })

const points = []
for (let li = 0; li < N_LAT; li++) for (let lo = 0; lo < N_LON; lo++) points.push(pointOf(li, lo))
const missing = points.filter((p) => !existsSync(join(cacheDir, `${p.li}_${p.lo}.json`)))
// --reverse starts from the north pole, so a second copy can run alongside the first.
if (args.includes('--reverse')) missing.reverse()
const todo = missing.slice(0, limit)
console.log(`${START} to ${END}: ${points.length - missing.length} already downloaded, ${todo.length} to download now`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let rateLimitedUntil = 0
async function waitForRateLimit() {
  while (Date.now() < rateLimitedUntil) await sleep(Math.min(15000, rateLimitedUntil - Date.now()))
}

async function fetchPoint(p) {
  const url =
    `${API}/api/temporal/monthly/point?parameters=${Object.values(POWER_PARAMS).join(',')}` +
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
let stoppedEarly = false
const t0 = Date.now()
let next = 0
async function worker() {
  while (next < todo.length) {
    if (Date.now() > deadline) {
      stoppedEarly = true
      return
    }
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
console.log(`finished: ${done} downloaded, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s${stoppedEarly ? ' (time limit reached, run again to carry on)' : ''}`)
