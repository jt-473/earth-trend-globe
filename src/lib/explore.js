// Everything the "data detective" needs: a catalogue of places that can be analysed as a
// region, kinds of place with reasons to look there, and a fast ranking of where a
// variable is changing most, worked out from the trends file already in memory.

import { cellsInBox } from './data.js'
import { CONTINENTS, COUNTRIES } from './places.js'

// Rough boxes around each continent: [lonMin, latMin, lonMax, latMax].
const CONTINENT_BOXES = {
  'North America': [-168, 8, -52, 72],
  'South America': [-82, -56, -34, 12],
  Europe: [-12, 36, 40, 71],
  Africa: [-18, -35, 51, 37],
  Asia: [40, 0, 150, 75],
  Australia: [113, -44, 154, -11],
  Antarctica: [-180, -90, 180, -64],
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// A box about this many degrees of latitude either side of a point, wider in longitude
// near the poles so it covers a similar distance.
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

export function buildCatalogue(regionsFile) {
  const out = []
  for (const r of (regionsFile && regionsFile.regions) || []) {
    out.push({ id: `region:${slug(r.name)}`, name: r.name, type: r.type, kind: 'region', bbox: r.bbox })
  }
  for (const c of CONTINENTS) {
    const bbox = CONTINENT_BOXES[c.name]
    if (bbox) out.push({ id: `continent:${slug(c.name)}`, name: c.name, type: 'continent', kind: 'continent', bbox })
  }
  for (const c of COUNTRIES) {
    const half = c.tier === 1 ? 9 : c.tier === 2 ? 5 : 3
    out.push({
      id: `country:${slug(c.name)}`,
      name: c.name,
      type: 'country (box around it)',
      kind: 'country',
      bbox: boxAround(c.lat, c.lon, half),
      approx: true,
    })
  }
  const seen = new Set(out.map((x) => x.name.toLowerCase()))
  for (const p of (regionsFile && regionsFile.places) || []) {
    if (seen.has(p.name.toLowerCase())) continue
    seen.add(p.name.toLowerCase())
    out.push({ id: `place:${slug(p.name)}`, name: p.name, type: `${p.type || 'place'} (area around it)`, kind: 'place', bbox: boxAround(p.lat, p.lon, 3), approx: true })
  }
  return out
}

export function searchCatalogue(catalogue, query, limit = 8) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored = []
  for (const item of catalogue) {
    const name = item.name.toLowerCase()
    let score = -1
    if (name === q) score = 100
    else if (name.startsWith(q)) score = 80
    else if (name.split(/[\s,-]+/).some((w) => w.startsWith(q))) score = 60
    else if (name.includes(q)) score = 40
    else if (item.type.toLowerCase().includes(q)) score = 20
    if (score >= 0) scored.push({ item, score: score + (item.kind === 'region' ? 5 : item.kind === 'continent' ? 4 : 0) })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item)
}

// Kinds of place, matched against the region types in regions.json.
export const PLACE_KINDS = [
  { id: 'desert', label: 'Deserts', match: /desert/i },
  { id: 'rainforest', label: 'Rainforests', match: /rainforest|monsoon/i },
  { id: 'cities', label: 'Cities and farmland', match: /megacit|farmland|lowland/i },
  { id: 'ocean', label: 'Oceans', match: /ocean|warm pool/i },
  { id: 'ice', label: 'Ice and the poles', match: /ice|polar/i },
  { id: 'mountain', label: 'Mountains', match: /mountain|plateau/i },
  { id: 'grassland', label: 'Grasslands and savannas', match: /grassland|savanna|steppe/i },
  { id: 'forest', label: 'Northern forests', match: /boreal/i },
  { id: 'coast', label: 'Coasts and islands', match: /coast|island/i },
]

// Why a kind of place is worth checking for each variable. Kept short and hedged: these
// are reasons to look, not results.
const HINTS = {
  desert: {
    temperature: 'Dry air heats up quickly, so deserts can warm faster than wetter places.',
    rainfall: 'Rain is rare here, so even a small change is a big deal for life.',
    humidity: 'Very dry air means small changes in moisture stand out.',
    sunlight: 'Few clouds, so changes in dust can change how much sunlight gets through.',
    air_pollution: 'Desert dust is a big part of the haze in the air.',
    ozone: 'Ozone above deserts follows the global pattern, a useful comparison.',
  },
  rainforest: {
    temperature: 'Clearing forest can warm the land around it.',
    rainfall: 'Rainforests make much of their own rain, so forest loss can change it.',
    humidity: 'Forests breathe out water, so humidity can follow forest health.',
    sunlight: 'Smoke from fires and changing clouds affect the sunlight reaching the ground.',
    air_pollution: 'Fire season smoke can show up as haze.',
    ozone: 'Tropical ozone changes slowly, a good test of a "no trend" result.',
  },
  cities: {
    temperature: 'Cities trap heat, and farming changes the land surface.',
    rainfall: 'Irrigation and pollution can change local rain.',
    humidity: 'Irrigated farmland puts a lot of water into the air.',
    sunlight: 'Smog can dim the sunlight that reaches the ground.',
    air_pollution: 'Traffic, industry and burning crops make some of the haziest air on Earth.',
    ozone: 'A useful comparison with cleaner places at the same latitude.',
  },
  ocean: {
    temperature: 'Oceans store most of the extra heat, so they warm steadily.',
    rainfall: 'Most rain falls over the ocean, and warmer seas can change where it falls.',
    humidity: 'Warmer sea surfaces put more water vapour into the air.',
    sunlight: 'Changing cloud cover over the ocean changes the sunlight reaching the surface.',
    air_pollution: 'Smoke and dust blow far out over the sea.',
    ozone: 'Shows the global ozone pattern without local pollution.',
  },
  ice: {
    temperature: 'The poles can change faster than anywhere else, and not always in the same direction.',
    rainfall: 'Warmer air holds more water, so polar snow and rain can increase.',
    humidity: 'Very cold air holds little water, so the change shows up clearly.',
    sunlight: 'Less sea ice and changing clouds affect the light at the surface.',
    air_pollution: 'Very clean air, so any haze from far away shows up.',
    ozone: 'The ozone hole over Antarctica is where ozone changed most.',
  },
  mountain: {
    temperature: 'High places can warm faster than the lowlands around them.',
    rainfall: 'Mountains squeeze rain out of the air, and changing winds shift it.',
    humidity: 'Thin, dry air at height means small changes stand out.',
    sunlight: 'Less snow and changing clouds affect sunlight on the slopes.',
    air_pollution: 'Haze from nearby lowlands can drift up the valleys.',
    ozone: 'High ground sits under less air, a useful ozone comparison.',
  },
  grassland: {
    temperature: 'Dry grasslands swing between drought and wet years.',
    rainfall: 'Rain decides whether grass grows, so trends matter to farmers and herders.',
    humidity: 'Shows whether the air is getting drier as it warms.',
    sunlight: 'Dust and fire smoke can dim the sun.',
    air_pollution: 'Grass fires and dust both add haze.',
    ozone: 'A steady background place for comparing ozone.',
  },
  forest: {
    temperature: 'Northern forests are warming fast, with longer summers.',
    rainfall: 'Warmer air brings more snow and rain to the far north.',
    humidity: 'More moisture in the air can come with the warming.',
    sunlight: 'Wildfire smoke can block sunlight in summer.',
    air_pollution: 'Wildfire smoke shows up as haze in bad fire years.',
    ozone: 'High latitudes saw some of the larger ozone changes.',
  },
  coast: {
    temperature: 'The sea next door slows warming, a good contrast with inland places.',
    rainfall: 'Storm tracks shifting north or south change coastal rain.',
    humidity: 'Warmer seas nearby can make the air more humid.',
    sunlight: 'Coastal clouds and haze change the light reaching the ground.',
    air_pollution: 'Shipping and nearby cities add to the haze.',
    ozone: 'A comparison with nearby inland places.',
  },
}

export function hintFor(item, variableId) {
  const kind = PLACE_KINDS.find((k) => k.match.test(item.type || ''))
  return kind && HINTS[kind.id] ? HINTS[kind.id][variableId] || null : null
}

// Fast summary of a box from the trends file: area-weighted average slope and the share
// of the area where the trend passes the significance test.
export function quickStats(trends, bbox) {
  if (!trends) return null
  const { rows, cols } = cellsInBox(bbox)
  let w = 0
  let ws = 0
  let wUp = 0
  let wDown = 0
  let n = 0
  for (const li of rows) {
    const lat = -88 + 2 * li
    const cw = Math.cos((lat * Math.PI) / 180) || 0.01
    for (const lo of cols) {
      const c = trends.byId.get(`c_${lat}_${-180 + 2 * lo}`)
      if (!c) continue
      n++
      w += cw
      ws += cw * c.slope_per_decade
      if (c.significant && c.slope_per_decade > 0) wUp += cw
      if (c.significant && c.slope_per_decade < 0) wDown += cw
    }
  }
  if (!n) return null
  // Share of the area with a significant rise, and with a significant fall. A place can
  // have plenty of both: the same process can push nearby areas in opposite directions.
  return { slope: ws / w, upShare: wUp / w, downShare: wDown / w, sigShare: Math.max(wUp, wDown) / w, cells: n }
}

// Places where this variable is changing most clearly, strongest first.
export function rankPlaces(trends, items, colourRange) {
  const out = []
  for (const item of items) {
    const q = quickStats(trends, item.bbox)
    if (!q) continue
    const strength = Math.min(1, Math.abs(q.slope) / (colourRange || 1))
    out.push({ item, stats: q, score: strength * (0.3 + 0.7 * q.sigShare) })
  }
  return out.sort((a, b) => b.score - a.score)
}

export function statsTone(q) {
  if (!q) return 'none'
  if (q.upShare >= 0.2 && q.downShare >= 0.2) return 'mixed'
  if (q.upShare >= 0.3 && q.upShare > q.downShare) return 'up'
  if (q.downShare >= 0.3) return 'down'
  return 'none'
}

export function describeStats(q, varDef) {
  if (!q) return ''
  const pct = (x) => `${Math.round(x * 100)}%`
  const tone = statsTone(q)
  if (tone === 'mixed') return `Mixed: significant rise over ${pct(q.upShare)} of the area, significant fall over ${pct(q.downShare)}`
  if (tone === 'up') return `${varDef.verbs.up} · significant over ${pct(q.upShare)} of the area`
  if (tone === 'down') return `${varDef.verbs.down} · significant over ${pct(q.downShare)} of the area`
  return 'No clear trend over most of the area'
}
