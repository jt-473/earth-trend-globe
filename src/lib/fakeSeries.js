// Deterministic fake time series in exactly the shape the data team will send.
// Shared by scripts/generate-fake-data.mjs (writes files) and the browser
// (synthesises a series on the fly when no file exists for a cell yet).
// Pure JavaScript, no imports, so it runs in Node and the browser.

export const FAKE_PARAMS = {
  temperature: { level: 14, latLevel: -0.45, seasonalAmp: 11, noiseSd: 1.1, min: -80 },
  humidity: { level: 9, latLevel: -0.12, seasonalAmp: 2.5, noiseSd: 0.6, min: 0 },
  rainfall: { level: 2.6, latLevel: -0.025, seasonalAmp: 1.2, noiseSd: 0.9, min: 0 },
  sunlight: { level: 200, latLevel: -1.6, seasonalAmp: 70, noiseSd: 9, min: 0 },
  air_pollution: { level: 0.18, latLevel: -0.0015, seasonalAmp: 0.05, noiseSd: 0.035, min: 0 },
  ozone: { level: 300, latLevel: 0.4, seasonalAmp: 18, noiseSd: 7, min: 100 },
}

export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function erf(x) {
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-x * x)
  return sign * y
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

export function twoSidedP(z) {
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  return Math.min(1, Math.max(1e-6, p))
}

function round(x, d) {
  const f = Math.pow(10, d)
  return Math.round(x * f) / f
}

export function monthLabel(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function mannKendall(xs) {
  const n = xs.length
  let s = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = xs[j] - xs[i]
      s += d > 0 ? 1 : d < 0 ? -1 : 0
    }
  }
  const tau = s / ((n * (n - 1)) / 2)
  const varS = (n * (n - 1) * (2 * n + 5)) / 18
  const z = s === 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(varS)
  return { tau, s, z, p_value: twoSidedP(z) }
}

export function linearFit(t, y) {
  const n = t.length
  let st = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    st += t[i]
    sy += y[i]
  }
  const tBar = st / n
  const yBar = sy / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (t[i] - tBar) * (t[i] - tBar)
    sxy += (t[i] - tBar) * (y[i] - yBar)
  }
  const slope = sxy / sxx
  const intercept = yBar - slope * tBar
  let sse = 0
  for (let i = 0; i < n; i++) {
    const r = y[i] - (intercept + slope * t[i])
    sse += r * r
  }
  const s = Math.sqrt(sse / (n - 2))
  const seSlope = s / Math.sqrt(sxx)
  const z = slope / seSlope
  return { slope, intercept, s, sxx, tBar, n, seSlope, p_value: twoSidedP(z) }
}

/**
 * Build a fake monthly series for one cell and one variable.
 * cell: { id, lat, lon, slope_per_decade }
 * Returns the JSON shape described in the brief, plus a few extra numbers.
 */
export function synthesiseSeries({ variable, cell, startYear = 1980, endYear, endMonth, predictEndYear = 2040 }) {
  const p = FAKE_PARAMS[variable] || FAKE_PARAMS.temperature
  const rand = mulberry32(hashString(`${variable}:${cell.id}`))
  const decimals = p.level < 1 ? 4 : p.level < 50 ? 3 : 2

  const dates = []
  const t = []
  const values = []
  const absLat = Math.abs(cell.lat)
  const level = p.level + p.latLevel * absLat + gaussian(rand) * p.noiseSd * 2
  const amp = p.seasonalAmp * (0.15 + 0.85 * Math.pow(absLat / 90, 0.8)) * (0.8 + 0.4 * rand())
  const hemisphere = cell.lat >= 0 ? 1 : -1
  const phase = rand() * 0.6 - 0.3
  const slopePerYear = cell.slope_per_decade / 10
  let ar = 0
  const phi = 0.45

  // 1. Weather noise on its own.
  const noise = []
  const seasonals = []
  let idx = 0
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === endYear && m > endMonth) break
      ar = phi * ar + gaussian(rand) * p.noiseSd * Math.sqrt(1 - phi * phi)
      dates.push(monthLabel(y, m))
      t.push(idx / 12)
      noise.push(ar)
      seasonals.push(amp * hemisphere * Math.cos(((m - 7) / 12) * 2 * Math.PI + phase))
      idx++
    }
  }
  const n = noise.length

  // 2. Random noise can tilt by itself. Take that tilt out so the chart's trend line is
  //    the cell's real slope, not an accident of the noise.
  const noiseFit = linearFit(t, noise)
  const flat = noise.map((x, i) => x - (noiseFit.intercept + noiseFit.slope * t[i]))

  // 3. Make the chart tell the same story as the cell's significance. Keep the natural
  //    amount of noise, and only shrink it when a real trend would be hidden by it, or
  //    grow it a little when an insignificant trend would look too clean.
  let scale = 1
  if (typeof cell.significant === 'boolean' && Math.abs(slopePerYear) > 0) {
    const flatFit = linearFit(t, flat)
    const zNow = Math.abs(slopePerYear) / Math.max(1e-12, flatFit.s / Math.sqrt(flatFit.sxx))
    if (cell.significant && zNow < 2.4) scale = Math.max(0.25, zNow / 2.4)
    if (!cell.significant && zNow > 1.6) scale = Math.min(3, zNow / 1.6)
  }

  for (let i = 0; i < n; i++) {
    let v = level + seasonals[i] + slopePerYear * t[i] + flat[i] * scale
    // Values like rainfall can't go below zero: mirror them back up so the wiggle keeps its size.
    if (v < p.min) v = p.min + (p.min - v)
    values.push(v)
  }

  // Remove the seasonal cycle: subtract the long-term mean for each calendar month.
  const deseasonalise = () => {
    const monthSum = new Array(12).fill(0)
    const monthCount = new Array(12).fill(0)
    for (let i = 0; i < n; i++) {
      monthSum[i % 12] += values[i]
      monthCount[i % 12]++
    }
    return values.map((v, i) => v - monthSum[i % 12] / monthCount[i % 12])
  }

  // The floor (rainfall never below zero) nudges the slope a little. Correct the slope,
  // re-apply the floor, and repeat until both hold, so the line matches the cell.
  let deseasonalised = deseasonalise()
  for (let pass = 0; pass < 6; pass++) {
    const f = linearFit(t, deseasonalised)
    const nudge = slopePerYear - f.slope
    let clipped = false
    for (let i = 0; i < n; i++) {
      values[i] += nudge * (t[i] - f.tBar)
      if (values[i] < p.min) {
        values[i] = p.min + (p.min - values[i])
        clipped = true
      }
    }
    deseasonalised = deseasonalise()
    if (!clipped && Math.abs(nudge) < 1e-9) break
  }

  const fit = linearFit(t, deseasonalised)
  const band = (ty, extra = 0) =>
    1.96 * fit.s * Math.sqrt(1 / fit.n + ((ty - fit.tBar) * (ty - fit.tBar)) / fit.sxx + extra)

  const trend_line = t.map((ty) => fit.intercept + fit.slope * ty)
  const ci_low = t.map((ty, i) => trend_line[i] - band(ty))
  const ci_high = t.map((ty, i) => trend_line[i] + band(ty))

  const tEnd = t[n - 1]
  const predDates = []
  const predValues = []
  const predLow = []
  const predHigh = []
  let py = endYear
  let pm = endMonth
  let pt = tEnd
  while (true) {
    pm++
    if (pm > 12) {
      pm = 1
      py++
    }
    if (py > predictEndYear) break
    pt += 1 / 12
    const v = fit.intercept + fit.slope * pt
    const ahead = pt - tEnd
    const w = band(pt, (ahead / 12) * (ahead / 12))
    predDates.push(monthLabel(py, pm))
    predValues.push(v)
    predLow.push(v - w)
    predHigh.push(v + w)
  }

  // Mann-Kendall on annual means of the deseasonalised series.
  const annual = []
  for (let i = 0; i + 12 <= n; i += 12) {
    let s = 0
    for (let k = 0; k < 12; k++) s += deseasonalised[i + k]
    annual.push(s / 12)
  }
  const mk = mannKendall(annual)

  const r = (arr, d) => arr.map((x) => round(x, d))
  return {
    variable,
    cell_id: cell.id,
    lat: cell.lat,
    lon: cell.lon,
    dates,
    values: r(values, decimals),
    deseasonalised: r(deseasonalised, decimals),
    trend_line: r(trend_line, decimals),
    ci_low: r(ci_low, decimals),
    ci_high: r(ci_high, decimals),
    prediction: {
      dates: predDates,
      values: r(predValues, decimals),
      low: r(predLow, decimals),
      high: r(predHigh, decimals),
    },
    mann_kendall: { tau: round(mk.tau, 3), p_value: round(mk.p_value, 4) },
    total_change: round(fit.slope * tEnd, decimals),
    slope_per_decade: round(fit.slope * 10, decimals + 1),
    p_value: round(fit.p_value, 4),
    years_of_data: round(tEnd + 1 / 12, 1),
  }
}
