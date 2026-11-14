export function fmt(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–'
  return Number(value).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtSigned(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–'
  const s = fmt(Math.abs(value), decimals)
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s
}

export function fmtWithUnits(value, units, decimals = 2, signed = false) {
  const n = signed ? fmtSigned(value, decimals) : fmt(value, decimals)
  return units ? `${n} ${units}` : n
}

export function fmtP(p) {
  if (p === null || p === undefined) return '–'
  if (p < 0.001) return '< 0.001'
  return fmt(p, 3)
}

export function fmtCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(0)}° ${ns}, ${Math.abs(lon).toFixed(0)}° ${ew}`
}
