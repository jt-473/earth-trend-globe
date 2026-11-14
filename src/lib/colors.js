// Diverging scale: warm = rising, cool = falling. Colour-blind safe (no red-green).
// Each side is a ramp that gets both deeper and stronger with the size of the trend,
// starting from a soft near-white so small changes barely tint the map underneath.

export const BACKGROUND = '#0B1020'
export const ACCENT = '#22d3ee'
export const RISING = '#e8274b'
export const FALLING = '#2f6bff'
export const NOT_SIGNIFICANT = '#cbd5e1'

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Ramps from "no change" (index 0) to "full change" (last index).
const RISING_RAMP = ['#f6f1e7', '#ffe08a', '#ffb24a', '#ff6a3d', '#e8274b'].map(hexToRgb)
const FALLING_RAMP = ['#eef4fb', '#b5e3ff', '#6cc0ff', '#3d8eff', '#2f6bff'].map(hexToRgb)
const GREY = hexToRgb(NOT_SIGNIFICANT)

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function sampleRamp(ramp, t) {
  const f = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(f))
  return mix(ramp[i], ramp[i + 1], f - i)
}

// How strong a trend is, 0..1, with a gentle curve so mid-size trends still show.
export function trendStrength(value, range) {
  const v = Math.max(-1, Math.min(1, value / range))
  return Math.pow(Math.abs(v), 0.7)
}

// value: signed number, range: positive number that maps to full colour.
export function trendRgb(value, range, significant = true) {
  if (!significant) return GREY
  const t = trendStrength(value, range)
  return value >= 0 ? sampleRamp(RISING_RAMP, t) : sampleRamp(FALLING_RAMP, t)
}

// How solid the colour is over the map, before the user's "Trend colours" slider.
// Weak trends stay see-through, strong ones are nearly solid.
export function trendAlpha(value, range, significant = true) {
  if (!significant) return 0.22
  return 0.2 + 0.8 * trendStrength(value, range)
}

export function rgbToCss([r, g, b], a = 1) {
  const R = Math.round(r * 255)
  const G = Math.round(g * 255)
  const B = Math.round(b * 255)
  return a >= 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${a})`
}

// CSS gradient string for the legend bar, from -range (left) to +range (right).
export function legendGradient(steps = 21) {
  const stops = []
  for (let i = 0; i < steps; i++) {
    const v = -1 + (2 * i) / (steps - 1)
    stops.push(`${rgbToCss(trendRgb(v, 1))} ${(i / (steps - 1)) * 100}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// The legend swatch for "not significant": the pale wash as it looks over a dark map.
export const notSignificantCss = rgbToCss(GREY, 0.35)
