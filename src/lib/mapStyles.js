// The three ways the globe can look. Trend colours are drawn on top of each one.
const base = import.meta.env.BASE_URL

export const MAP_STYLES = [
  {
    id: 'satellite',
    name: 'Satellite',
    label: 'Satellite',
    blurb: 'Earth photographed from space',
    image: `${base}textures/earth-blue-marble.jpg`,
    bump: `${base}textures/earth-topology.png`,
    specular: `${base}textures/earth-water.png`,
    thumb: `${base}textures/earth-blue-marble.jpg`,
  },
  {
    id: 'night',
    name: 'Night lights',
    label: 'Night',
    blurb: 'City lights seen from space',
    image: `${base}textures/earth-night.jpg`,
    thumb: `${base}textures/earth-night.jpg`,
  },
  {
    id: 'map',
    name: 'Street map',
    label: 'Street map',
    blurb: 'Countries, cities and place names',
    // Standard OpenStreetMap tiles: free, no key, attribution required. Fine for a
    // hackathon demo; for heavy public traffic switch to a keyed tile provider.
    tiles: (x, y, level) => `https://tile.openstreetmap.org/${level}/${x}/${y}.png`,
    attribution: 'Map data © OpenStreetMap contributors',
    thumb: 'https://tile.openstreetmap.org/0/0/0.png',
  },
]

export const DEFAULT_MAP_STYLE = 'satellite'

export function getMapStyle(id) {
  return MAP_STYLES.find((s) => s.id === id) || MAP_STYLES[0]
}
