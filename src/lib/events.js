// Live natural events from NASA's Earth Observatory Natural Event Tracker (EONET).
// https://eonet.gsfc.nasa.gov/docs/v3 — free, no key, allows browser requests.
// Everything from the feed is treated as untrusted text: it is only ever rendered as
// text, and links are kept only when they are plain http(s) URLs.

export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=30'
export const EONET_HOME = 'https://eonet.gsfc.nasa.gov/'
const CACHE_KEY = 'etg.eonet.v1'
const FRESH_MS = 20 * 60 * 1000 // refetch after 20 minutes

// Plain names, colours and simple line icons (24x24, stroke) per EONET category.
export const CATEGORIES = {
  severeStorms: { label: 'Storm', plural: 'Storms', color: '#a78bfa', variable: 'rainfall', weight: 300,
    icon: 'M21 4H3M18 8H6M19 12H9M16 16h-6M11 20H9' },
  volcanoes: { label: 'Volcano', plural: 'Volcanoes', color: '#fb7185', variable: 'air_pollution', weight: 280,
    icon: 'M8 3l4 8 5-5 5 15H2L8 3z' },
  earthquakes: { label: 'Earthquake', plural: 'Earthquakes', color: '#facc15', variable: null, weight: 260,
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  floods: { label: 'Flood', plural: 'Floods', color: '#38bdf8', variable: 'rainfall', weight: 200,
    icon: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' },
  tempExtremes: { label: 'Heat or cold', plural: 'Heat and cold', color: '#f97316', variable: 'temperature', weight: 200,
    icon: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z' },
  drought: { label: 'Drought', plural: 'Droughts', color: '#d6a85c', variable: 'rainfall', weight: 150,
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4' },
  landslides: { label: 'Landslide', plural: 'Landslides', color: '#c08457', variable: 'rainfall', weight: 150,
    icon: 'M3 20h18L14 8l-3 5-3-3-5 10z' },
  dustHaze: { label: 'Dust and haze', plural: 'Dust and haze', color: '#d4b483', variable: 'air_pollution', weight: 120,
    icon: 'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2' },
  wildfires: { label: 'Wildfire', plural: 'Wildfires', color: '#ff9f1c', variable: 'temperature', weight: 100,
    icon: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z' },
  snow: { label: 'Snow', plural: 'Snow', color: '#e2e8f0', variable: 'temperature', weight: 90,
    icon: 'M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1' },
  seaLakeIce: { label: 'Ice', plural: 'Icebergs and ice', color: '#bae6fd', variable: 'temperature', weight: 60,
    icon: 'M12 3l7 9-7 9-7-9 7-9z' },
  waterColor: { label: 'Water colour', plural: 'Water colour', color: '#2dd4bf', variable: 'temperature', weight: 50,
    icon: 'M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0L12 2.7z' },
  manmade: { label: 'Human-made', plural: 'Human-made', color: '#94a3b8', variable: 'air_pollution', weight: 50,
    icon: 'M3 21h18M5 21V8l7-5 7 5v13' },
}
const OTHER = { label: 'Event', plural: 'Other events', color: '#94a3b8', variable: null, weight: 40, icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' }
export const categoryInfo = (id) => CATEGORIES[id] || OTHER

// Why the trend for this category is worth a look, in plain words.
export const TREND_QUESTION = {
  severeStorms: 'Is rainfall here changing over the long run?',
  floods: 'Is rainfall here changing over the long run?',
  landslides: 'Is rainfall here changing over the long run?',
  drought: 'Is rainfall here changing over the long run?',
  wildfires: 'Is it getting hotter here over the long run?',
  tempExtremes: 'Is it getting hotter here over the long run?',
  seaLakeIce: 'Is the air here warming over the long run?',
  snow: 'Is the air here warming over the long run?',
  volcanoes: 'Is the air here getting dirtier over the long run?',
  dustHaze: 'Is the air here getting dirtier over the long run?',
}

export function safeUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

function pointOf(g) {
  if (!g || !g.coordinates) return null
  if (g.type === 'Point') return { lon: +g.coordinates[0], lat: +g.coordinates[1] }
  if (g.type === 'Polygon' && g.coordinates[0] && g.coordinates[0].length) {
    const ring = g.coordinates[0]
    let lat = 0
    let lon = 0
    for (const [x, y] of ring) {
      lon += +x
      lat += +y
    }
    return { lon: lon / ring.length, lat: lat / ring.length }
  }
  return null
}

const titleCase = (t) => t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())

// "Wildfire FOOT CREEK, Johnson, Wyoming" -> "Foot Creek wildfire, Wyoming"
// "Prescribed Fire Cold Springs RX, Wasatch, Utah" -> "Planned burn in Utah"
// "Flood in Myanmar 1104280" -> "Flood in Myanmar"
function cleanTitle(t) {
  const title = String(t || '').replace(/\s+\d{5,}$/, '').trim()
  const m = title.match(/^(Wildfire|Prescribed Fire)\s+(.+?),\s*(.+)$/i)
  if (!m || /^in\s/i.test(m[2])) return title
  const parts = m[3].split(',').map((x) => x.trim())
  const state = parts[parts.length - 1]
  if (/prescribed/i.test(m[1])) return `Planned burn in ${state}`
  return `${titleCase(m[2].replace(/\s+RX$/i, ''))} wildfire, ${state}`
}

function placeFromTitle(title) {
  const m = title.match(/\bin (.+)$/i)
  if (m) return m[1]
  const w = title.match(/wildfire, (.+)$/i)
  if (w) return w[1]
  const parts = title.split(',')
  return parts.length > 1 ? parts[parts.length - 1].trim() : title
}

// One clean record per feed event.
function normalise(raw) {
  const geoms = (raw.geometry || [])
    .map((g) => ({ ...pointOf(g), date: g.date, mag: g.magnitudeValue, unit: g.magnitudeUnit }))
    .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon) && g.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  if (!geoms.length) return null
  const last = geoms[geoms.length - 1]
  const category = (raw.categories && raw.categories[0] && raw.categories[0].id) || 'other'
  const mags = geoms.filter((g) => Number.isFinite(g.mag))
  let magnitude = null
  if (mags.length) {
    const pick = category === 'severeStorms' ? mags.reduce((a, b) => (b.mag > a.mag ? b : a)) : mags[mags.length - 1]
    magnitude = { value: pick.mag, unit: pick.unit || '' }
  }
  return {
    id: String(raw.id),
    category,
    title: cleanTitle(raw.title),
    lat: last.lat,
    lon: last.lon,
    start: geoms[0].date,
    latest: last.date,
    closed: raw.closed || null,
    active: !raw.closed,
    magnitude,
    track: category === 'severeStorms' && geoms.length > 1 ? geoms.map((g) => ({ lat: g.lat, lon: g.lon })) : null,
    sources: (raw.sources || []).map((s) => ({ id: String(s.id || 'Source'), url: safeUrl(s.url) })).filter((s) => s.url),
    count: 1,
    planned: /prescribed/i.test(raw.title || ''),
  }
}

// Wildfire detections come in hundreds, so nearby ones are grouped into one marker
// ("124 wildfires in Australia"), named after the place most of them are in.
const BIN = 15
function groupWildfires(fires) {
  const groups = new Map()
  for (const f of fires) {
    const key = `${Math.floor(f.lat / BIN)}|${Math.floor(f.lon / BIN)}`
    if (!groups.has(key)) groups.set(key, { members: [] })
    groups.get(key).members.push(f)
  }
  const out = []
  for (const [key, { members }] of groups) {
    const tally = new Map()
    for (const m of members) {
      const p = placeFromTitle(m.title)
      tally.set(p, (tally.get(p) || 0) + 1)
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1])
    const place = ranked.length > 1 ? `${ranked[0][0]} and nearby` : ranked[0][0]
    if (members.length === 1) {
      out.push(members[0])
      continue
    }
    members.sort((a, b) => new Date(b.latest) - new Date(a.latest))
    const lat = members.reduce((s, m) => s + m.lat, 0) / members.length
    const lon = members.reduce((s, m) => s + m.lon, 0) / members.length
    const prescribed = members.every((m) => /planned burn/i.test(m.title))
    out.push({
      id: `fires:${key}`,
      category: 'wildfires',
      title: `${members.length} ${prescribed ? 'planned burns' : 'wildfires'} in ${place}`,
      place,
      lat,
      lon,
      start: members.reduce((a, m) => (m.start < a ? m.start : a), members[0].start),
      latest: members[0].latest,
      closed: members.some((m) => m.active) ? null : members[0].closed,
      active: members.some((m) => m.active),
      magnitude: null,
      track: null,
      sources: dedupeSources(members),
      count: members.length,
      planned: prescribed,
      members: members.slice(0, 8).map((m) => ({ id: m.id, title: m.title, latest: m.latest, active: m.active })),
    })
  }
  return out
}

function dedupeSources(members) {
  const seen = new Map()
  for (const m of members) for (const s of m.sources) if (!seen.has(s.id)) seen.set(s.id, s)
  return [...seen.values()].slice(0, 3)
}

export function knotsToKmh(kts) {
  return Math.round(kts * 1.852)
}
export function nm2ToKm2(nm2) {
  return Math.round(nm2 * 3.4299)
}

// A short plain-English line for the ticker and the list.
export function headline(e) {
  const n = (v) => Math.round(v).toLocaleString('en-GB')
  switch (e.category) {
    case 'severeStorms': {
      const wind = e.magnitude && /kts/i.test(e.magnitude.unit) ? `, winds up to ${n(knotsToKmh(e.magnitude.value))} km/h` : ''
      return `${e.title} ${e.active ? 'is active' : 'has passed'}${wind}`
    }
    case 'floods':
      return e.title.replace(/^Flood in /i, 'Flooding in ')
    case 'seaLakeIce': {
      const size = e.magnitude && /NM/i.test(e.magnitude.unit) ? `, about ${n(nm2ToKm2(e.magnitude.value))} km² in area` : ''
      return /iceberg/i.test(e.title) ? `${e.title} is drifting${size}` : e.title
    }
    case 'wildfires':
      return e.count > 1 ? `${e.title} in the past month` : e.title
    case 'volcanoes':
      return `Volcano activity: ${e.title}`
    default:
      return e.title
  }
}

export function timeAgo(iso, now = Date.now()) {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function statusLine(e) {
  if (e.active) return `Active · updated ${timeAgo(e.latest)}`
  return `Ended ${new Date(e.closed || e.latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

// Most newsworthy first: still active, big categories, then most recent.
function score(e, now) {
  const days = (now - new Date(e.latest).getTime()) / 86400000
  const size = e.category === 'wildfires' ? Math.min(e.count, 60) * 2 : 0
  const planned = e.planned ? -250 : 0 // planned burns are routine, not news
  return (e.active ? 150 : 0) + categoryInfo(e.category).weight + size + planned - days * 15
}

export function prepareEvents(rawEvents, now = Date.now()) {
  const all = (rawEvents || []).map(normalise).filter(Boolean)
  const fires = all.filter((e) => e.category === 'wildfires')
  const rest = all.filter((e) => e.category !== 'wildfires')
  const events = [...rest, ...groupWildfires(fires)]
  for (const e of events) {
    e.headline = headline(e)
    e.score = score(e, now)
    // Hidden when zoomed right out, so the globe isn't buried in markers.
    const days = (now - new Date(e.latest).getTime()) / 86400000
    e.minor = (e.category === 'wildfires' && e.count < 10) || (!e.active && days > 7 && e.category !== 'severeStorms')
  }
  events.sort((a, b) => b.score - a.score)
  return { events, rawCount: all.length }
}

// NASA Worldview opened on the same place and day, so people can see the satellite images.
export function worldviewUrl(e) {
  const day = String(e.latest).slice(0, 10)
  const pad = e.category === 'severeStorms' ? 10 : 5
  const v = [e.lon - pad * 1.5, e.lat - pad, e.lon + pad * 1.5, e.lat + pad].map((x) => x.toFixed(2)).join(',')
  return `https://worldview.earthdata.nasa.gov/?v=${v}&t=${day}`
}

function readCache() {
  try {
    const v = JSON.parse(window.localStorage.getItem(CACHE_KEY))
    return v && Array.isArray(v.events) ? v : null
  } catch {
    return null
  }
}
function writeCache(events) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), events }))
  } catch {
    // storage full or blocked; we just won't have an offline copy
  }
}

// Returns { raw, savedAt, offline }. Uses a fresh saved copy when there is one, otherwise
// asks NASA, and falls back to an older saved copy when the network is down.
export async function fetchEvents({ force = false } = {}) {
  const cached = readCache()
  if (!force && cached && Date.now() - cached.savedAt < FRESH_MS) return { raw: cached.events, savedAt: cached.savedAt, offline: false }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(EONET_URL, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json()
    const raw = Array.isArray(json.events) ? json.events : []
    writeCache(raw)
    return { raw, savedAt: Date.now(), offline: false }
  } catch (err) {
    if (cached) return { raw: cached.events, savedAt: cached.savedAt, offline: true }
    throw err
  }
}
