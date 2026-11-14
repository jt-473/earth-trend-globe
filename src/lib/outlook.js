// The 2040 outlook model. Pure JavaScript, used by scripts/build-outlook.mjs.
//
// For one monthly record (a point or an area average) it:
//   1. removes the seasons (each month minus its usual value for that time of year),
//   2. fits a straight trend line,
//   3. measures how the leftover ups and downs behave: how big they are in each calendar
//      month, how much one month carries over into the next (AR(1) memory), and how much
//      extra year-to-year wobble there is on top (El Niño-type swings),
//   4. runs a few thousand possible futures to 2040: each one draws a trend line that is
//      as uncertain as the data allows, then adds random ups and downs that look like the
//      real ones,
//   5. tests itself on the past: it is trained on the early years only and asked to
//      predict the later years we already have, so we can see how well it would have done.
//
// It is a statistical model of the data, not a climate model. It knows nothing about
// future emissions, volcanoes or policy; it only says what happens if the pattern seen
// since 1981 carries on.

import { mulberry32, twoSidedP } from './fakeSeries.js'

function gaussian(rand) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const quantile = (sorted, q) => {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

// Ordinary least squares y = a + b t, plus the pieces needed for honest uncertainty.
function ols(t, y) {
  const n = t.length
  const tBar = mean(t)
  const yBar = mean(y)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (t[i] - tBar) ** 2
    sxy += (t[i] - tBar) * (y[i] - yBar)
  }
  const b = sxx > 0 ? sxy / sxx : 0
  const a = yBar - b * tBar
  const res = y.map((v, i) => v - (a + b * t[i]))
  return { a, b, tBar, yBar, sxx, n, res }
}

function lag1(res) {
  let num = 0
  let den = 0
  for (let i = 0; i < res.length; i++) {
    den += res[i] ** 2
    if (i > 0) num += res[i] * res[i - 1]
  }
  return den > 0 ? Math.max(0, Math.min(0.95, num / den)) : 0
}

// Variance of the average of 12 standardised AR(1) values.
function ar1MeanVar(phi, k = 12) {
  let s = 0
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) s += phi ** Math.abs(i - j)
  return s / (k * k)
}

/**
 * Fit the model to monthly values.
 * values: monthly numbers or null, starting January of startYear.
 * Returns null if there are fewer than 10 full years.
 */
export function fitModel(values, startYear, { trendYears = null, spread = 1 } = {}) {
  // Trim to whole years with data.
  let a = 0
  while (a < values.length && values[a] === null) a++
  a = Math.ceil(a / 12) * 12
  let b = values.length
  while (b > a && values[b - 1] === null) b--
  b = a + Math.floor((b - a) / 12) * 12
  if (b - a < 120) return null
  const v = values.slice(a, b)
  const y0 = startYear + a / 12
  const nYears = v.length / 12

  // Seasons: usual value for each calendar month over the whole record.
  const clim = new Array(12).fill(0)
  const cnt = new Array(12).fill(0)
  v.forEach((x, i) => {
    if (x === null) return
    clim[i % 12] += x
    cnt[i % 12]++
  })
  for (let m = 0; m < 12; m++) clim[m] = cnt[m] ? clim[m] / cnt[m] : 0
  const anom = v.map((x, i) => (x === null ? null : x - clim[i % 12]))

  // The trend can be fitted to the whole record or only to its most recent years.
  const fitFrom = trendYears ? y0 + nYears - trendYears : -Infinity
  const t = []
  const y = []
  const month = []
  anom.forEach((x, i) => {
    if (x === null || y0 + (i + 0.5) / 12 < fitFrom) return
    t.push(y0 + (i + 0.5) / 12)
    y.push(x)
    month.push(i % 12)
  })
  const fit = ols(t, y)
  const phi = lag1(fit.res)

  // Size of the ups and downs in each calendar month.
  const sdM = new Array(12).fill(0)
  const nM = new Array(12).fill(0)
  fit.res.forEach((r, i) => {
    sdM[month[i]] += r * r
    nM[month[i]]++
  })
  for (let m = 0; m < 12; m++) sdM[m] = Math.sqrt(sdM[m] / Math.max(1, nM[m] - 1)) || 1e-9

  // Year-to-year wobble beyond what month-to-month memory explains.
  const annualRes = []
  for (let k = Math.max(0, Math.ceil(fitFrom - y0)); k < nYears; k++) {
    const rs = []
    for (let i = 0; i < t.length; i++) if (t[i] >= y0 + k && t[i] < y0 + k + 1) rs.push(fit.res[i])
    if (rs.length >= 9) annualRes.push(mean(rs))
  }
  const sdMean = Math.sqrt(mean(sdM.map((s) => s * s)))
  const annualVarObs = annualRes.length > 2 ? annualRes.reduce((s, r) => s + r * r, 0) / (annualRes.length - 1) : 0
  const annualVarAr = sdMean ** 2 * ar1MeanVar(phi)
  const yearVar = Math.max(0, annualVarObs - annualVarAr)
  // The annual wobble also has some memory from one year to the next.
  const phiYear = Math.min(0.8, lag1(annualRes))

  // Slope uncertainty with an effective sample size for the memory in the data, using the
  // annual residuals so slow wobbles are counted too.
  const nEffMonthly = (fit.n * (1 - phi)) / (1 + phi)
  const nEffAnnual = (annualRes.length * (1 - phiYear)) / (1 + phiYear)
  const resVar = fit.res.reduce((s, r) => s + r * r, 0) / Math.max(1, fit.n - 2)
  const seIid = Math.sqrt(resVar / fit.sxx)
  const inflateM = Math.sqrt(Math.max(1, (fit.n - 2) / Math.max(1, nEffMonthly - 2)))
  // Annual version: slope from yearly means and their own spread.
  const ta = annualRes.map((_, k) => y0 + k + 0.5)
  const sxxA = ta.reduce((s, x) => s + (x - mean(ta)) ** 2, 0)
  const seAnnual = Math.sqrt(annualVarObs / sxxA) * Math.sqrt(Math.max(1, (annualRes.length - 2) / Math.max(1, nEffAnnual - 2)))
  const seSlope = Math.max(seIid * inflateM, seAnnual)
  const seLevel = Math.sqrt(annualVarObs / Math.max(1, nEffAnnual))
  const z = seSlope > 0 ? fit.b / seSlope : 0

  return {
    y0,
    nYears,
    clim,
    anom,
    a: fit.a,
    b: fit.b,
    tBar: fit.tBar,
    seSlope,
    seLevel,
    p_value: twoSidedP(z),
    phi,
    sdM,
    yearVar,
    phiYear,
    spread,
    trendYears,
    lastRes: fit.res[fit.res.length - 1],
    lastMonth: month[month.length - 1],
  }
}

// Annual averages of a monthly anomaly array (null when fewer than 9 months).
export function annualMeans(anom) {
  const out = []
  for (let i = 0; i + 12 <= anom.length; i += 12) {
    const yr = anom.slice(i, i + 12).filter((x) => x !== null)
    out.push(yr.length >= 9 ? mean(yr) : null)
  }
  return out
}

/**
 * Simulate monthly futures from the end of the record to endYear.
 * Returns an array of paths; each path is a Float64Array of monthly anomalies.
 */
export function simulate(model, endYear, runs, seed) {
  const rand = mulberry32(seed)
  const startT = model.y0 + model.nYears // first month after the record
  const months = Math.round((endYear + 1 - startT) * 12)
  const paths = []
  // `spread` widens the uncertainty by the amount the test on the past showed was needed.
  const k = model.spread || 1
  const sdYear = Math.sqrt(model.yearVar) * k
  for (let r = 0; r < runs; r++) {
    // One possible trend line: level and slope drawn from their uncertainty.
    const level = model.a + model.b * model.tBar + k * model.seLevel * gaussian(rand)
    const slope = model.b + k * model.seSlope * gaussian(rand)
    let u = model.lastRes / model.sdM[model.lastMonth]
    let yearShock = 0
    const path = new Float64Array(months)
    for (let k = 0; k < months; k++) {
      const m = k % 12
      if (m === 0) yearShock = model.phiYear * yearShock + Math.sqrt(1 - model.phiYear ** 2) * sdYear * gaussian(rand)
      u = model.phi * u + Math.sqrt(1 - model.phi ** 2) * gaussian(rand)
      const tt = startT + (k + 0.5) / 12
      path[k] = level + slope * (tt - model.tBar) + u * model.sdM[m] + yearShock
    }
    paths.push(path)
  }
  return { startYear: startT, months, paths }
}

// Thresholds for an "unusually high" and "unusually low" month: the top and bottom 10% of
// each calendar month during the first `baseYears` years of the record.
function thresholds(anom, baseYears) {
  const hi = []
  const lo = []
  for (let m = 0; m < 12; m++) {
    const xs = []
    for (let k = 0; k < baseYears; k++) {
      const x = anom[k * 12 + m]
      if (x !== null && x !== undefined) xs.push(x)
    }
    xs.sort((p, q) => p - q)
    hi.push(quantile(xs, 0.9))
    lo.push(quantile(xs, 0.1))
  }
  return { hi, lo }
}

/**
 * Everything the outlook screen shows for one record.
 * decimals: rounding for this variable.
 */
export function outlook(values, startYear, { endYear = 2040, runs = 2000, seed = 1, decimals = 2, baseYears = 10, trendYears = null, spread = 1, backtestRuns = 1000, backtestOnly = false } = {}) {
  const model = fitModel(values, startYear, { trendYears, spread })
  if (!model) return null
  const r = (x, d = decimals + 1) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d)

  const obsAnnual = annualMeans(model.anom)
  const base = mean(obsAnnual.slice(0, baseYears).filter((x) => x !== null))
  const years = obsAnnual.map((_, k) => model.y0 + k)
  const lastYear = years[years.length - 1]

  const sim = simulate(model, endYear, backtestOnly ? 20 : runs, seed)
  const fYears = []
  for (let y = lastYear + 1; y <= endYear; y++) fYears.push(y)
  // Annual averages of each simulated future.
  const simAnnual = sim.paths.map((p) => fYears.map((_, k) => mean(Array.from(p.subarray(k * 12, k * 12 + 12)))))
  const bands = { p05: [], p25: [], p50: [], p75: [], p95: [] }
  fYears.forEach((_, k) => {
    const xs = simAnnual.map((s) => s[k] - base).sort((p, q) => p - q)
    bands.p05.push(r(quantile(xs, 0.05)))
    bands.p25.push(r(quantile(xs, 0.25)))
    bands.p50.push(r(quantile(xs, 0.5)))
    bands.p75.push(r(quantile(xs, 0.75)))
    bands.p95.push(r(quantile(xs, 0.95)))
  })
  // A few possible futures to draw as thin lines (chosen evenly through the spread of 2040).
  const order = simAnnual.map((s, i) => [s[s.length - 1], i]).sort((p, q) => p[0] - q[0])
  const samples = [0.15, 0.4, 0.6, 0.85].map((q) => simAnnual[order[Math.floor(q * (order.length - 1))][1]].map((x) => r(x - base)))

  // Records: highest and lowest yearly value measured so far, and how often the futures beat them.
  const known = obsAnnual.filter((x) => x !== null)
  const maxObs = Math.max(...known)
  const minObs = Math.min(...known)
  const maxYear = years[obsAnnual.indexOf(maxObs)]
  const minYear = years[obsAnnual.indexOf(minObs)]
  let beatHigh2040 = 0
  let beatLow2040 = 0
  const newHighs = []
  const newLows = []
  for (const s of simAnnual) {
    if (s[s.length - 1] > maxObs) beatHigh2040++
    if (s[s.length - 1] < minObs) beatLow2040++
    let hi = maxObs
    let lo = minObs
    let nh = 0
    let nl = 0
    for (const x of s) {
      if (x > hi) {
        hi = x
        nh++
      }
      if (x < lo) {
        lo = x
        nl++
      }
    }
    newHighs.push(nh)
    newLows.push(nl)
  }
  // How many of the measured years a typical 2040 would beat.
  const med2040 = bands.p50[bands.p50.length - 1] + base
  const beatsYears = known.filter((x) => x < med2040).length

  // Unusually high / low months: share per decade, measured and projected.
  const th = thresholds(model.anom, baseYears)
  const shareObs = (from, to) => {
    let hi = 0
    let lo = 0
    let n = 0
    for (let y = from; y <= to; y++) {
      for (let m = 0; m < 12; m++) {
        const x = model.anom[(y - model.y0) * 12 + m]
        if (x === null || x === undefined) continue
        n++
        if (x > th.hi[m]) hi++
        if (x < th.lo[m]) lo++
      }
    }
    return n ? { high: r(hi / n, 3), low: r(lo / n, 3), from, to } : null
  }
  const periods = []
  for (let y = model.y0; y <= lastYear; y += 10) periods.push(shareObs(y, Math.min(lastYear, y + 9)))
  const futureShare = (from, to) => {
    let hi = 0
    let lo = 0
    let n = 0
    for (const p of sim.paths) {
      for (let k = 0; k < p.length; k++) {
        const yy = Math.floor(sim.startYear + k / 12)
        if (yy < from || yy > to) continue
        const m = k % 12
        n++
        if (p[k] > th.hi[m]) hi++
        if (p[k] < th.lo[m]) lo++
      }
    }
    return { high: r(hi / n, 3), low: r(lo / n, 3), from, to }
  }
  const future = futureShare(endYear - 9, endYear)

  // Typical value of the warmest and coolest calendar month (actual values, not changes).
  const cm = model.clim
  const baseClim = cm.map((_, m) => {
    const xs = []
    for (let k = 0; k < baseYears; k++) {
      const x = values[(model.y0 - startYear + k) * 12 + m]
      if (x !== null && x !== undefined) xs.push(x)
    }
    return xs.length ? mean(xs) : cm[m]
  })
  const hotM = baseClim.indexOf(Math.max(...baseClim))
  const coldM = baseClim.indexOf(Math.min(...baseClim))
  const monthIn = (m, from, to) => {
    const xs = []
    for (const p of sim.paths) for (let k = m; k < p.length; k += 12) if (Math.floor(sim.startYear + k / 12) >= from && Math.floor(sim.startYear + k / 12) <= to) xs.push(p[k])
    return mean(xs)
  }
  const anomBase = (m) => {
    const xs = []
    for (let k = 0; k < baseYears; k++) {
      const x = model.anom[k * 12 + m]
      if (x !== null && x !== undefined) xs.push(x)
    }
    return mean(xs)
  }
  const monthly = {
    high: { month: hotM, then: r(baseClim[hotM], decimals), in2040s: r(baseClim[hotM] + monthIn(hotM, endYear - 4, endYear) - anomBase(hotM), decimals) },
    low: { month: coldM, then: r(baseClim[coldM], decimals), in2040s: r(baseClim[coldM] + monthIn(coldM, endYear - 4, endYear) - anomBase(coldM), decimals) },
  }

  // Is it speeding up? Slope of the first half of the years against the second half.
  const half = Math.floor(known.length / 2)
  const halfSlope = (xs, ys) => (xs.length > 2 ? ols(xs, ys).b * 10 : null)
  const ky = years.filter((_, k) => obsAnnual[k] !== null)
  const pace = {
    first: { from: ky[0], to: ky[half - 1], per_decade: r(halfSlope(ky.slice(0, half), known.slice(0, half))) },
    second: { from: ky[half], to: ky[ky.length - 1], per_decade: r(halfSlope(ky.slice(half), known.slice(half))) },
  }

  // Test on the past: train on the first part, predict the rest.
  let backtest = null
  const trainYears = Math.max(10, Math.min(30, Math.round(model.nYears * 0.6)))
  if (model.nYears - trainYears >= 5) {
    const off = (model.y0 - startYear) * 12
    const train = values.slice(0, off + trainYears * 12)
    const m2 = fitModel(train, startYear, { trendYears, spread })
    if (m2) {
      const s2 = simulate(m2, lastYear, backtestRuns, seed + 7)
      const testYears = []
      for (let y = m2.y0 + m2.nYears; y <= lastYear; y++) testYears.push(y)
      // Compare in the training model's own anomaly frame.
      const obsTest = testYears.map((y) => {
        const xs = []
        for (let m = 0; m < 12; m++) {
          const x = values[(y - startYear) * 12 + m]
          if (x !== null && x !== undefined) xs.push(x - m2.clim[m])
        }
        return xs.length >= 9 ? mean(xs) : null
      })
      const trainAnnual = annualMeans(m2.anom).filter((x) => x !== null)
      const flat = mean(trainAnnual.slice(-10))
      const base2 = mean(annualMeans(m2.anom).slice(0, baseYears).filter((x) => x !== null))
      let inside = 0
      let counted = 0
      const zs = []
      let errModel = 0
      let errFlat = 0
      const p05 = []
      const p50 = []
      const p95 = []
      testYears.forEach((_, k) => {
        const xs = s2.paths.map((p) => mean(Array.from(p.subarray(k * 12, k * 12 + 12)))).sort((p, q) => p - q)
        const lo = quantile(xs, 0.05)
        const md = quantile(xs, 0.5)
        const hi = quantile(xs, 0.95)
        p05.push(r(lo - base2))
        p50.push(r(md - base2))
        p95.push(r(hi - base2))
        const o = obsTest[k]
        if (o === null) return
        counted++
        if (o >= lo && o <= hi) inside++
        zs.push((o - md) / Math.max(1e-9, (hi - lo) / 2))
        errModel += Math.abs(o - md)
        errFlat += Math.abs(o - flat)
      })
      backtest = {
        trained: { from: m2.y0, to: m2.y0 + m2.nYears - 1 },
        tested: { from: testYears[0], to: testYears[testYears.length - 1] },
        years: testYears,
        observed: obsTest.map((x) => (x === null ? null : r(x - base2))),
        p05,
        p50,
        p95,
        inside,
        counted,
        error_model: r(errModel / counted),
        error_no_change: r(errFlat / counted),
        z: zs,
      }
    }
  }

  const fitStart = trendYears ? lastYear - trendYears + 1 : -Infinity
  const fitted = years.map((y) => (y < fitStart ? null : r(model.a + model.b * (y + 0.5) - base)))
  const sorted = (a) => [...a].sort((p, q) => p - q)
  return {
    model: trendYears ? `recent_${trendYears}` : 'whole_record',
    trend_from: trendYears ? fitStart : model.y0,
    spread: r(spread, 2),
    mean_level: r(mean(model.clim), decimals + 1),
    start_year: model.y0,
    end_year: lastYear,
    baseline: { from: model.y0, to: model.y0 + baseYears - 1 },
    years,
    observed: obsAnnual.map((x) => (x === null ? null : r(x - base))),
    fitted,
    slope_per_decade: r(model.b * 10),
    slope_range: [r((model.b - 1.645 * model.seSlope) * 10), r((model.b + 1.645 * model.seSlope) * 10)],
    p_value: r(model.p_value, 4),
    future_years: fYears,
    bands,
    samples,
    records: {
      high: { value: r(maxObs - base), year: maxYear },
      low: { value: r(minObs - base), year: minYear },
      chance_2040_above_high: r(beatHigh2040 / runs, 3),
      chance_2040_below_low: r(beatLow2040 / runs, 3),
      new_highs_median: quantile(sorted(newHighs), 0.5),
      new_lows_median: quantile(sorted(newLows), 0.5),
      chance_any_new_high: r(newHighs.filter((x) => x > 0).length / runs, 3),
      typical_2040_beats: beatsYears,
      measured_years: known.length,
    },
    months: { periods, future },
    monthly,
    pace,
    backtest,
  }
}
