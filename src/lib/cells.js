// 2-degree global grid helpers. Cell centres sit on even degrees:
// lat -88..88 (89 rows), lon -180..178 (180 columns). Cell "c_54_-6" covers
// lat 53..55 and lon -7..-5, matching the brief's data format.
export const STEP = 2
export const LAT_MIN = -88
export const LON_MIN = -180
export const N_LAT = 89
export const N_LON = 180
export const N_CELLS = N_LAT * N_LON

export function cellId(lat, lon) {
  return `c_${lat}_${lon}`
}

export function cellIndexFromCentre(lat, lon) {
  const li = Math.round((lat - LAT_MIN) / STEP)
  const lo = Math.round((lon - LON_MIN) / STEP)
  if (li < 0 || li >= N_LAT || lo < 0 || lo >= N_LON) return -1
  return li * N_LON + lo
}

export function centreFromIndex(index) {
  const li = Math.floor(index / N_LON)
  const lo = index % N_LON
  return { lat: LAT_MIN + li * STEP, lon: LON_MIN + lo * STEP }
}

// Snap any lat/lon to the cell that contains it.
export function nearestCell(lat, lon) {
  let li = Math.round((lat - LAT_MIN) / STEP)
  li = Math.max(0, Math.min(N_LAT - 1, li))
  let lo = Math.round((lon - LON_MIN) / STEP)
  lo = ((lo % N_LON) + N_LON) % N_LON
  const centre = { lat: LAT_MIN + li * STEP, lon: LON_MIN + lo * STEP }
  return { ...centre, id: cellId(centre.lat, centre.lon), index: li * N_LON + lo }
}

// GeoJSON polygon covering one cell (used for the selected-cell outline).
export function cellPolygon(cell) {
  const h = STEP / 2
  const { lat, lon } = cell
  return {
    type: 'Feature',
    properties: { id: cell.id },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [lon - h, lat - h],
        [lon + h, lat - h],
        [lon + h, lat + h],
        [lon - h, lat + h],
        [lon - h, lat - h],
      ]],
    },
  }
}

export function allCellCentres() {
  const out = new Array(N_CELLS)
  for (let i = 0; i < N_CELLS; i++) out[i] = centreFromIndex(i)
  return out
}
