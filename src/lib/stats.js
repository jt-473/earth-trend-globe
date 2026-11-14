// Trend statistics for real monthly data. Used by the browser (cells and regions) and by
// scripts/build-real-data.mjs, so the globe colours and the charts always agree.
// Pure JavaScript with no browser or Node APIs.

import { mannKendall, monthLabel, twoSidedP } from './fakeSeries.js'

const round = (x, d) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)

// Monthly anomalies: each value minus the long-term average for its calendar month.
// `values` may contain nulls for missing months.
export function deseasonalise(values, startMonth = 1) {
  const sum = new Array(12).fill(0)
  const count = new Array(12).fill(0)
  values.forEach((v, i) => {
    if (v === null) return
    const m = (startMonth - 1 + i) % 12
    sum[m] += v
    count[m]++
  })
  return values.map((v, i) => {
    const m = (startMonth - 1 + i) % 12
    return v === null || !count[m] ? null : v - sum[m] / count[m]
  })
}

// Straight-line fit with a significance test that allows for month-to-month memory in
// the data (lag-1 autocorrelation). Without this, monthly data look far more certain than
// they are. Method: effective sample size n_eff = n (1 - r1) / (1 + r1), Santer et al. 2000.
export function trendFit(t, y) {
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
    sxx += (t[i] - tBar) ** 2
    sxy += (t[i] - tBar) * (y[i] - yBar)
  }
  const slope = sxx > 0 ? sxy / sxx : 0
  const intercept = yBar - slope * tBar
  const res = y.map((v, i) => v - (intercept + slope * t[i]))
  let sse = 0
  let lagNum = 0
  for (let i = 0; i < n; i++) {
    sse += res[i] ** 2
    if (i > 0) lagNum += res[i] * res[i - 1]
  }
  const r1 = sse > 0 ? Math.max(0, Math.min(0.95, lagNum / sse)) : 0
  const nEff = Math.max(3, (n * (1 - r1)) / (1 + r1))
  const s = Math.sqrt(sse / Math.max(1, n - 2))
  const seIid = sxx > 0 ? s / Math.sqrt(sxx) : Infinity
  const seSlope = seIid * Math.sqrt(Math.max(1, (n - 2) / Math.max(1, nEff - 2)))
  const z = seSlope > 0 && Number.isFinite(seSlope) ? slope / seSlope : 0
  return { slope, intercept, s, sxx, tBar, n, nEff, r1, seSlope, z, p_value: twoSidedP(z) }
}

/**
 * Turn a monthly record into the series JSON shape from the design brief.
 * values: numbers or null, one per month from startYear/startMonth.
 * Leading and trailing missing months are trimmed.
 */
export function buildSeries({ variable, cellId, lat, lon, startYear, startMonth = 1, values, decimals = 3, predictEndYear = 2040 }) {
  let a = 0
  let b = values.length - 1
  while (a <= b && values[a] === null) a++
  while (b >= a && values[b] === null) b--
  if (b - a + 1 < 24) return null // under two years: not enough to say anything

  const kept = values.slice(a, b + 1)
  const first = startYear * 12 + (startMonth - 1) + a
  const y0 = Math.floor(first / 12)
  const m0 = (first % 12) + 1
  const dates = kept.map((_, i) => monthLabel(Math.floor((first + i) / 12), ((first + i) % 12) + 1))
  const t = kept.map((_, i) => i / 12) // years since the first month
  const anomalies = deseasonalise(kept, m0)

  const tv = []
  const yv = []
  anomalies.forEach((v, i) => {
    if (v !== null) {
      tv.push(t[i])
      yv.push(v)
    }
  })
  const fit = trendFit(tv, yv)
  // Widen the confidence band by the same autocorrelation factor as the significance test.
  const inflate = fit.seSlope / (fit.s / Math.sqrt(fit.sxx))
  const band = (ty, extra = 0) => 1.96 * fit.s * inflate * Math.sqrt(1 / fit.n + (ty - fit.tBar) ** 2 / fit.sxx + extra)
  const trend = t.map((ty) => fit.intercept + fit.slope * ty)

  const last = first + kept.length - 1
  const tEnd = t[t.length - 1]
  const pred = { dates: [], values: [], low: [], high: [] }
  for (let k = last + 1, pt = tEnd + 1 / 12; Math.floor(k / 12) <= predictEndYear; k++, pt += 1 / 12) {
    const v = fit.intercept + fit.slope * pt
    const ahead = pt - tEnd
    const w = band(pt, (ahead / 12) ** 2)
    pred.dates.push(monthLabel(Math.floor(k / 12), (k % 12) + 1))
    pred.values.push(round(v, decimals))
    pred.low.push(round(v - w, decimals))
    pred.high.push(round(v + w, decimals))
  }

  // Mann-Kendall on yearly averages of the anomalies (full years with at least 9 months).
  const annual = []
  for (let i = 0; i + 12 <= anomalies.length; i += 12) {
    const yr = anomalies.slice(i, i + 12).filter((v) => v !== null)
    if (yr.length >= 9) annual.push(yr.reduce((s, v) => s + v, 0) / yr.length)
  }
  const mk = annual.length >= 4 ? mannKendall(annual) : { tau: 0, p_value: 1 }

  const r = (arr) => arr.map((v) => round(v, decimals))
  return {
    variable,
    cell_id: cellId,
    lat,
    lon,
    dates,
    values: r(kept),
    deseasonalised: r(anomalies),
    trend_line: r(trend),
    ci_low: r(t.map((ty, i) => trend[i] - band(ty))),
    ci_high: r(t.map((ty, i) => trend[i] + band(ty))),
    prediction: pred,
    mann_kendall: { tau: round(mk.tau, 3), p_value: round(mk.p_value, 4) },
    total_change: round(fit.slope * tEnd, decimals),
    slope_per_decade: round(fit.slope * 10, decimals + 1),
    p_value: round(fit.p_value, 4),
    years_of_data: round(tEnd + 1 / 12, 1),
    start_year: y0,
  }
}

// Just the trend numbers, for building the global trends files quickly.
export function trendOnly(values, startMonth = 1) {
  let a = 0
  let b = values.length - 1
  while (a <= b && values[a] === null) a++
  while (b >= a && values[b] === null) b--
  if (b - a + 1 < 24) return null
  const anomalies = deseasonalise(values.slice(a, b + 1), ((startMonth - 1 + a) % 12) + 1)
  const tv = []
  const yv = []
  anomalies.forEach((v, i) => {
    if (v !== null) {
      tv.push(i / 12)
      yv.push(v)
    }
  })
  if (tv.length < 24) return null
  return trendFit(tv, yv)
}

// How many more years of data a trend would need, at the same pace and with the same
// amount of natural variation, before it passes the 95% test. The uncertainty of a
// slope shrinks roughly with (years)^1.5, so years_needed = years * (1.96 / z)^(2/3).
export function yearsToSignificance(zAbs, years) {
  if (!Number.isFinite(zAbs) || zAbs <= 0 || !years) return null
  if (zAbs >= 1.96) return 0
  return years * ((1.96 / zAbs) ** (2 / 3) - 1)
}

// Two-sided p-value back to a z-score (for series files that only carry the p-value).
export function zFromP(p) {
  if (!Number.isFinite(p)) return null
  let lo = 0
  let hi = 10
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (twoSidedP(mid) > p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
