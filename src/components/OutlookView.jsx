import { useEffect, useMemo, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import { fmt, fmtSigned } from '../lib/format.js'

const Plot = createPlotlyComponent(Plotly)
const base = import.meta.env.BASE_URL.replace(/\/$/, '')
const cache = new Map()
const load = (name) => {
  if (!cache.has(name)) cache.set(name, fetch(`${base}/data/outlook/${name}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`outlook ${name}: ${r.status}`)))))
  return cache.get(name)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const NOW = 2026
const AGES = [16, 17, 18, 19, 20, 21, 22, 23]
const GROUPS = ['Big picture', 'Continents', 'Regions', 'Countries', 'Seas and other places']

// Everyday words for each variable.
const WORDS = {
  temperature: { up: 'warmer', down: 'cooler', high: 'hot', low: 'cold', highest: 'hottest', lowest: 'coldest', change: 'warmed', month: 'warmest' },
  humidity: { up: 'more humid', down: 'drier', high: 'humid', low: 'dry', highest: 'most humid', lowest: 'driest', change: 'got more humid', month: 'most humid' },
  rainfall: { up: 'wetter', down: 'drier', high: 'wet', low: 'dry', highest: 'wettest', lowest: 'driest', change: 'got wetter', month: 'wettest' },
  sunlight: { up: 'sunnier', down: 'dimmer', high: 'bright', low: 'dim', highest: 'brightest', lowest: 'dimmest', change: 'got sunnier', month: 'sunniest' },
  air_pollution: { up: 'hazier', down: 'clearer', high: 'hazy', low: 'clear', highest: 'haziest', lowest: 'clearest', change: 'got hazier', month: 'haziest' },
  ozone: { up: 'higher in ozone', down: 'lower in ozone', high: 'high-ozone', low: 'low-ozone', highest: 'highest-ozone', lowest: 'lowest-ozone', change: 'gained ozone', month: 'highest-ozone' },
}

// What the change means in real life. General knowledge, kept short and sourced.
const WHY = {
  temperature: [
    ['Heatwaves', 'A small rise in the average means many more very hot days. The UN climate panel (IPCC, 2021) found that heat extremes that used to come once every 10 years now come almost 3 times as often, and more than 4 times at 1.5 °C of warming.'],
    ['Sleep, health and work', 'Hot nights make it harder to sleep and recover. Heat is most dangerous for older people, babies, outdoor workers and people in cities, where concrete holds on to heat.'],
    ['Food and water', 'Crops such as wheat and maize grow worse in extreme heat, and warmer air dries out soil faster, so droughts hit harder.'],
    ['Ice and sea level', 'Warmer air and oceans melt glaciers and ice sheets, and sea water expands as it warms. Both raise sea level, which reaches coastal cities slowly but keeps going for centuries.'],
  ],
  humidity: [
    ['Heavier downpours', 'Warmer air can hold more water vapour, roughly 7% more for every 1 °C. When it rains, there is more water to fall at once, so floods become more likely.'],
    ['Feeling the heat', 'Your body cools down by sweating. In humid air sweat dries more slowly, so the same temperature feels hotter and is harder on the body.'],
    ['It feeds itself', 'Water vapour traps heat too, so more of it adds a bit more warming on top of what carbon dioxide does.'],
  ],
  rainfall: [
    ['Water to drink and grow food', 'Most farming in the world depends on rain. A small change in the average can decide whether a harvest succeeds.'],
    ['Floods and droughts', 'An average hides how the rain falls. A place can get the same total in fewer, heavier storms, with dry spells in between.'],
    ['Less certain than temperature', 'Rain is patchy and hard to measure from space, so rainfall trends are less certain than temperature trends. Treat these numbers as a rough guide.'],
  ],
  sunlight: [
    ['Clouds and clean air', 'More sunlight reaching the ground usually means fewer clouds or cleaner air. Europe and North America brightened as air pollution was cut from the 1980s on.'],
    ['Solar power', 'More sunlight is good news for solar panels, but it also heats and dries the ground more.'],
  ],
  air_pollution: [
    ['Your lungs', 'Haze is made of tiny particles from traffic, industry, dust and smoke. Breathing them in is linked to asthma, heart disease and shorter lives.'],
    ['Fires and dust', 'Hotter, drier summers mean more wildfires, and their smoke can travel across oceans. Droughts also lift more dust.'],
    ['A strange side effect', 'Haze reflects some sunlight, which hides a little of the warming. Cleaning the air is vital for health, and it can let a bit more warming show through.'],
  ],
  ozone: [
    ['Your sunscreen in the sky', 'The ozone layer blocks most of the sun\'s harmful UV light, which causes sunburn and skin cancer.'],
    ['A problem the world fixed', 'In 1987 every country agreed to ban the chemicals that were destroying ozone (the Montreal Protocol). Scientists expect the layer to be back to 1980 levels around 2040 for most of the world, and later over the poles (UN assessment, 2023).'],
  ],
}

const pct = (x) => `${Math.round(x * 100)}%`
const inTen = (x) => Math.max(0, Math.min(10, Math.round(x * 10)))
const baselineLabel = (b) => (b.from === 1981 ? 'the 1980s' : b.from <= 1985 ? `${b.from} to ${b.to}` : `${b.from} to ${b.to}`)

function TenSquares({ share, tone }) {
  const n = inTen(share)
  return (
    <span className="inline-flex gap-1" aria-label={`${n} in 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i
          key={i}
          className={`inline-block h-3.5 w-3.5 rounded-[3px] ${i < n ? (tone === 'up' ? 'bg-rising' : 'bg-falling') : 'bg-slate-400/20'}`}
        />
      ))}
    </span>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-400/15 bg-slate-400/5 p-4 ${className}`}>
      {title && <h3 className="mb-2 font-semibold">{title}</h3>}
      {children}
    </section>
  )
}

function OutlookChart({ a, varDef, age, showOther, futureLabel }) {
  const { data, layout } = useMemo(() => {
    const unit = varDef.units
    const dec = varDef.decimals
    const hover = `%{y:+.${dec}f} ${unit}`
    const lastObsYear = a.years[a.years.length - 1]
    const fy = a.future_years
    // Join the fan to the last fitted value so there is no gap.
    const joinX = [lastObsYear, ...fy]
    const join0 = a.fitted[a.fitted.length - 1]
    const j = (arr) => [join0, ...arr]
    const traces = [
      { x: joinX, y: j(a.bands.p95), type: 'scatter', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
      { x: joinX, y: j(a.bands.p05), type: 'scatter', mode: 'lines', fill: 'tonexty', fillcolor: 'rgba(251,146,60,0.16)', line: { width: 0 }, hoverinfo: 'skip', name: '9 in 10 chance' },
      { x: joinX, y: j(a.bands.p75), type: 'scatter', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
      { x: joinX, y: j(a.bands.p25), type: 'scatter', mode: 'lines', fill: 'tonexty', fillcolor: 'rgba(251,146,60,0.28)', line: { width: 0 }, hoverinfo: 'skip', name: '1 in 2 chance' },
      ...a.samples.map((s, i) => ({
        x: fy,
        y: s,
        type: 'scatter',
        mode: 'lines',
        line: { color: 'rgba(253,186,116,0.45)', width: 1 },
        hoverinfo: 'skip',
        showlegend: false,
        name: `possible future ${i + 1}`,
      })),
      {
        x: a.years,
        y: a.observed,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: 'rgba(226,232,240,0.75)', width: 1.5 },
        marker: { size: 5, color: '#e2e8f0' },
        name: 'Measured',
        hovertemplate: hover + '<extra>Measured</extra>',
      },
      {
        x: a.years,
        y: a.fitted,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#22d3ee', width: 2.5 },
        name: 'Trend',
        hovertemplate: hover + '<extra>Trend</extra>',
      },
      {
        x: joinX,
        y: j(a.bands.p50),
        type: 'scatter',
        mode: 'lines',
        line: { color: '#fb923c', width: 3, dash: 'dot' },
        name: 'Most likely',
        hovertemplate: hover + '<extra>Most likely</extra>',
      },
    ]
    if (showOther && a.other) {
      traces.push({
        x: fy,
        y: a.other.p50,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#c4b5fd', width: 2, dash: 'dash' },
        name: futureLabel,
        hovertemplate: hover + `<extra>${futureLabel}</extra>`,
      })
    }
    const grid = 'rgba(148,163,184,0.12)'
    const layout = {
      autosize: true,
      height: 340,
      margin: { l: 52, r: 16, t: 34, b: 36 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, system-ui, sans-serif', size: 13, color: '#cbd5e1' },
      showlegend: false,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#0f172a', bordercolor: 'rgba(148,163,184,0.3)', font: { family: 'JetBrains Mono, monospace', size: 12, color: '#e2e8f0' } },
      xaxis: { range: [a.years[0] - 1, 2041], gridcolor: grid, zeroline: false, dtick: 5, tickfont: { family: 'JetBrains Mono, monospace' } },
      yaxis: {
        title: { text: `Change since ${baselineLabel(a.baseline)} (${unit})`, font: { size: 12 } },
        gridcolor: grid,
        zeroline: true,
        zerolinecolor: 'rgba(148,163,184,0.35)',
        tickfont: { family: 'JetBrains Mono, monospace' },
        tickformat: `+.${Math.max(0, dec - 1)}f`,
      },
      shapes: [
        { type: 'rect', x0: lastObsYear + 0.5, x1: 2041, y0: 0, y1: 1, yref: 'paper', fillcolor: 'rgba(251,146,60,0.05)', line: { width: 0 }, layer: 'below' },
        { type: 'line', x0: lastObsYear + 0.5, x1: lastObsYear + 0.5, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(226,232,240,0.5)', width: 1 } },
        { type: 'line', x0: a.years[0] - 1, x1: 2041, y0: a.records.high.value, y1: a.records.high.value, line: { color: 'rgba(248,113,113,0.55)', width: 1, dash: 'dot' } },
      ],
      annotations: [
        { x: lastObsYear + 0.5, y: 1, yref: 'paper', yanchor: 'bottom', xanchor: 'right', text: 'Measured', showarrow: false, font: { size: 12, color: '#cbd5e1' }, xshift: -4 },
        { x: lastObsYear + 0.5, y: 1, yref: 'paper', yanchor: 'bottom', xanchor: 'left', text: 'Model', showarrow: false, font: { size: 12, color: '#fb923c' }, xshift: 4 },
        { x: a.years[0], y: a.records.high.value, xanchor: 'left', yanchor: 'bottom', text: `record so far (${a.records.high.year})`, showarrow: false, font: { size: 11, color: '#fca5a5' } },
        { x: 2040, y: a.bands.p50[a.bands.p50.length - 1], text: `you: ${age + (2040 - NOW)}`, showarrow: true, arrowhead: 0, ax: -34, ay: -30, arrowcolor: '#fb923c', font: { size: 12, color: '#fdba74' } },
      ],
    }
    return { data: traces, layout }
  }, [a, varDef, age, showOther, futureLabel])
  return (
    <div>
      <Plot data={data} layout={layout} config={{ displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false }} useResizeHandler style={{ width: '100%', height: 340 }} />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full bg-slate-200" /> measured each year</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-accent" /> trend</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dotted border-rising" /> most likely</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-rising/50" /> 1 in 2 chance</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-rising/20" /> 9 in 10 chance</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-orange-300/50" /> possible futures</span>
        {showOther && a.other && (
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dashed border-violet-300" /> {futureLabel.toLowerCase()}</span>
        )}
      </div>
    </div>
  )
}

function BacktestChart({ bt, varDef }) {
  const { data, layout } = useMemo(() => {
    const hover = `%{y:+.${varDef.decimals}f} ${varDef.units}`
    return {
      data: [
        { x: bt.years, y: bt.p95, type: 'scatter', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip' },
        { x: bt.years, y: bt.p05, type: 'scatter', mode: 'lines', fill: 'tonexty', fillcolor: 'rgba(251,146,60,0.2)', line: { width: 0 }, hoverinfo: 'skip' },
        { x: bt.years, y: bt.p50, type: 'scatter', mode: 'lines', line: { color: '#fb923c', width: 2, dash: 'dot' }, name: 'Model guessed', hovertemplate: hover + '<extra>Model guessed</extra>' },
        { x: bt.years, y: bt.observed, type: 'scatter', mode: 'markers', marker: { size: 7, color: '#e2e8f0' }, name: 'What happened', hovertemplate: hover + '<extra>What happened</extra>' },
      ],
      layout: {
        autosize: true,
        height: 200,
        margin: { l: 48, r: 10, t: 10, b: 30 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#cbd5e1' },
        showlegend: false,
        hovermode: 'x unified',
        hoverlabel: { bgcolor: '#0f172a', bordercolor: 'rgba(148,163,184,0.3)', font: { family: 'JetBrains Mono, monospace', size: 12, color: '#e2e8f0' } },
        xaxis: { gridcolor: 'rgba(148,163,184,0.12)', dtick: 5, tickfont: { family: 'JetBrains Mono, monospace' } },
        yaxis: { gridcolor: 'rgba(148,163,184,0.12)', zeroline: false, tickfont: { family: 'JetBrains Mono, monospace' }, tickformat: `+.${Math.max(0, varDef.decimals - 1)}f` },
      },
    }
  }, [bt, varDef])
  return <Plot data={data} layout={layout} config={{ displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false }} useResizeHandler style={{ width: '100%', height: 200 }} />
}

export default function OutlookView({ variables, onClose }) {
  const [variableId, setVariableId] = useState('temperature')
  const [areaId, setAreaId] = useState('world')
  const [age, setAge] = useState(18)
  const [file, setFile] = useState(null)
  const [links, setLinks] = useState(null)
  const [error, setError] = useState(null)
  const [showOther, setShowOther] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let live = true
    setFile(null)
    setError(null)
    load(variableId)
      .then((f) => live && setFile(f))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [variableId])
  useEffect(() => {
    load('links').then(setLinks, () => {})
  }, [])

  const varDef = (variables || []).find((v) => v.id === variableId)
  const a = file ? file.areas.find((x) => x.id === areaId) || file.areas[0] : null
  const w = WORDS[variableId]
  const grouped = useMemo(() => {
    if (!file) return []
    return GROUPS.map((g) => [g, file.areas.filter((x) => x.group === g).sort((p, q) => (g === 'Big picture' ? 0 : p.name.localeCompare(q.name)))])
  }, [file])

  let body = null
  if (error) body = <p className="text-rising">Could not load the outlook ({error}). Run npm run build-outlook.</p>
  else if (!a || !varDef) body = <div className="h-96 animate-pulse rounded-2xl bg-slate-700/30" aria-busy="true" />
  else {
    const dec = varDef.decimals
    const u = varDef.units
    const last = a.bands.p50.length - 1
    const mid = a.bands.p50[last]
    const lo = a.bands.p05[last]
    const hi = a.bands.p95[last]
    const sure = lo > 0 || hi < 0
    const dirUp = mid >= 0
    const baseL = baselineLabel(a.baseline)
    const born = NOW - age
    const nowFit = a.fitted[a.fitted.length - 1]
    const sinceBorn = born >= a.start_year ? (a.slope_per_decade * (a.end_year - born)) / 10 : null
    const more = mid - nowFit
    const recent = a.months.periods[a.months.periods.length - 1]
    const fut = a.months.future
    const rec = a.records
    const bt = a.backtest
    const cal = file.calibration
    const isRecentModel = a.model.startsWith('recent')
    const otherLabel = isRecentModel ? 'If the pace of the whole record carries on' : `If the pace of the last ${cal.recent_years} years carries on`
    const paceUp = a.pace.first.per_decade !== null && a.pace.second.per_decade !== null
    const ratio = paceUp && Math.abs(a.pace.first.per_decade) > 1e-9 ? a.pace.second.per_decade / a.pace.first.per_decade : null
    const showMonth = ['temperature', 'humidity', 'rainfall'].includes(variableId)
    const tone = dirUp ? 'up' : 'down'

    body = (
      <div className="space-y-4">
        {/* Headline */}
        <section className={`rounded-2xl border p-5 ${!sure ? 'border-slate-400/25 bg-slate-400/10' : dirUp ? 'border-rising/40 bg-rising/10' : 'border-falling/40 bg-falling/10'}`}>
          <div className="text-muted">{a.name} · {varDef.name} in 2040</div>
          {sure ? (
            <p className="mt-1 text-2xl font-semibold leading-snug">
              A typical year is likely to be{' '}
              <span className={dirUp ? 'text-orange-300' : 'text-sky-300'}>
                {fmtSigned(mid, dec)} {u}
              </span>{' '}
              {dirUp ? w.up : w.down} than in {baseL}.
            </p>
          ) : (
            <p className="mt-1 text-2xl font-semibold leading-snug">
              No clear direction. By 2040 a typical year could end up {w.up} or {w.down} than in {baseL}.
            </p>
          )}
          <p className="mt-2 text-muted">
            9 in 10 chance it lands between <span className="mono text-ink">{fmtSigned(lo, dec)}</span> and{' '}
            <span className="mono text-ink">{fmtSigned(hi, dec)} {u}</span>. {isRecentModel ? `Trend over the last ${cal.recent_years} years` : `Trend since ${a.start_year}`}:{' '}
            <span className="mono text-ink">{fmtSigned(a.slope_per_decade, dec)} {u}</span> every 10 years.
          </p>
        </section>

        {/* You */}
        <Card title="What it means for you">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-muted">How old are you?</span>
            {AGES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAge(n)}
                aria-pressed={age === n}
                className={`mono h-9 w-10 rounded-full border ${age === n ? 'border-accent bg-accent/20 text-ink' : 'border-slate-400/25 text-muted hover:border-accent/50'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p>
            You were born around <span className="mono">{born}</span>.
            {sinceBorn !== null && (
              <>
                {' '}Since then, {a.name === 'The whole world' ? 'the world' : a.name} has {sinceBorn >= 0 ? w.change : `become ${w.down}`} by about{' '}
                <span className="mono font-semibold">{fmt(Math.abs(sinceBorn), dec)} {u}</span>.
              </>
            )}{' '}
            In 2040 you'll be <span className="font-semibold">{age + (2040 - NOW)}</span>. By then the model expects{' '}
            {Math.abs(more) < 10 ** -dec ? 'about the same again' : (
              <>
                another <span className="mono font-semibold">{fmt(Math.abs(more), dec)} {u}</span> {more >= 0 ? w.up : w.down}
              </>
            )}
            {!sure && ', though it could go either way'}.
          </p>
        </Card>

        {/* Chart */}
        <Card
          title={
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>Every year since {a.start_year}, and {a.future_years.length > 0 ? 'thousands of possible futures' : ''} to 2040</span>
              {a.other && (
                <label className="flex cursor-pointer items-center gap-2 font-normal text-muted select-none">
                  <input type="checkbox" className="h-4 w-4 accent-violet-300" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} />
                  Compare: {otherLabel.toLowerCase()}
                </label>
              )}
            </span>
          }
        >
          <OutlookChart a={a} varDef={varDef} age={age} showOther={showOther} futureLabel={otherLabel} />
          <p className="mt-2 text-muted">
            The model ran {file.runs.toLocaleString()} possible futures. Each thin line is one of them: none is a prediction on its own, but together they show what is likely.
            {showOther && a.other && (
              <>
                {' '}The purple line is a second version of the model that only looks at{' '}
                {isRecentModel ? 'the whole record' : `the last ${cal.recent_years} years`}: it reaches{' '}
                <span className="mono text-ink">{fmtSigned(a.other.p50[a.other.p50.length - 1], dec)} {u}</span> by 2040.
              </>
            )}
          </p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title={`Unusually ${w.high} months`}>
            <p className="mb-3 text-muted">
              In {baseL}, 1 month in 10 was unusually {w.high} for its time of year. That's what "unusual" means here.
            </p>
            <ul className="space-y-2">
              {[
                [`${a.months.periods[0].from}–${a.months.periods[0].to}`, a.months.periods[0].high],
                [`${recent.from}–${recent.to}`, recent.high],
                [`${fut.from}–${fut.to} (model)`, fut.high],
              ].map(([label, share]) => (
                <li key={label} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mono text-muted">{label}</span>
                  <span className="flex items-center gap-2">
                    <TenSquares share={share} tone="up" />
                    <span className="mono w-16 whitespace-nowrap text-right">{inTen(share)} in 10</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-muted">
              Unusually {w.low} months: {inTen(a.months.periods[0].low)} in 10 then, {inTen(fut.low)} in 10 by the late 2030s
              {fut.low < 0.02 && a.months.periods[0].low >= 0.05 ? ', so they almost disappear' : ''}.
            </p>
          </Card>

          <Card title="Records">
            <p>
              The {w.highest} year measured so far was <span className="mono">{rec.high.year}</span>
              {rec.high.year >= a.end_year - 3 ? ', very recently' : ''}.
            </p>
            <p className="mt-2">
              Chance that 2040 beats it: <span className="mono font-semibold">{pct(rec.chance_2040_above_high)}</span>
              <span className="text-muted"> (about {inTen(rec.chance_2040_above_high)} in 10)</span>.
            </p>
            <p className="mt-2">
              Chance of at least one new record by 2040: <span className="mono font-semibold">{pct(rec.chance_any_new_high)}</span>.
            </p>
            <p className="mt-2 text-muted">
              A typical 2040 would be {w.up.startsWith('more') || w.up.startsWith('higher') ? w.up : w.up} than {rec.typical_2040_beats} of the {rec.measured_years} years we've
              measured.
            </p>
          </Card>

          {showMonth && (
            <Card title={`The ${w.month} month`}>
              <p>
                {MONTHS[a.monthly.high.month]} is usually the {w.month} month here. In {baseL} it averaged{' '}
                <span className="mono">{fmt(a.monthly.high.then, dec)} {u}</span>. In the late 2030s the model expects about{' '}
                <span className="mono font-semibold">{fmt(a.monthly.high.in2040s, dec)} {u}</span>.
              </p>
              {variableId === 'temperature' && (
                <p className="mt-2 text-muted">
                  The coldest month, {MONTHS[a.monthly.low.month]}: <span className="mono">{fmt(a.monthly.low.then, dec)}</span> →{' '}
                  <span className="mono">{fmt(a.monthly.low.in2040s, dec)} {u}</span>. These are averages over the whole area, day and night, so single days get far hotter.
                </p>
              )}
            </Card>
          )}

          {paceUp && (
            <Card title="Is it speeding up?">
              <p>
                <span className="mono">{a.pace.first.from}–{a.pace.first.to}</span>: <span className="mono">{fmtSigned(a.pace.first.per_decade, dec)} {u}</span> per 10 years
                <br />
                <span className="mono">{a.pace.second.from}–{a.pace.second.to}</span>: <span className="mono">{fmtSigned(a.pace.second.per_decade, dec)} {u}</span> per 10 years
              </p>
              <p className="mt-2 text-muted">
                {ratio !== null && ratio > 1.25 && Math.sign(a.pace.first.per_decade) === Math.sign(a.pace.second.per_decade)
                  ? `The change in the second half was about ${fmt(ratio, 1)} times as fast as in the first. If that faster pace holds, 2040 will be further along than the main forecast shows (tick "Compare" above the chart).`
                  : ratio !== null && ratio < 0.8 && ratio > 0
                    ? 'The change has slowed down in the second half.'
                    : Math.sign(a.pace.first.per_decade) !== Math.sign(a.pace.second.per_decade)
                      ? 'The direction flipped between the two halves, which is one reason the forecast here is uncertain.'
                      : 'The pace has been fairly steady.'}
              </p>
            </Card>
          )}
        </div>

        {variableId === 'temperature' && links && links.humidity_percent_per_degree && a.id === 'world' && (
          <Card title="Our data agrees with the physics">
            <p className="text-muted">
              Physics says warmer air should hold about 7% more water vapour for every 1 °C. In NASA's data the world's air gained{' '}
              <span className="mono text-ink">{fmt(links.humidity_percent_per_degree, 1)}%</span> more water vapour for each degree it warmed. Switch to Humidity to see it.
            </p>
          </Card>
        )}

        <Card title={`Why ${varDef.name.toLowerCase()} matters`}>
          <ul className="grid gap-3 md:grid-cols-2">
            {WHY[variableId].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-slate-400/10 bg-space/40 p-3">
                <div className="font-semibold">{t}</div>
                <p className="mt-1 text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </Card>

        {bt && (
          <Card title="Can we trust it? We tested it on the past">
            <p className="text-muted">
              We gave the model only {bt.trained.from}–{bt.trained.to} and asked it to guess {bt.tested.from}–{bt.tested.to}, years we already know. Then we checked.
            </p>
            <BacktestChart bt={bt} varDef={varDef} />
            <ul className="mt-2 space-y-1">
              <li>
                <span className="mono font-semibold">{bt.inside} of {bt.counted}</span> real years landed inside the model's 9 in 10 range.
              </li>
              <li>
                Its guesses were off by <span className="mono">{fmt(bt.error_model, dec)} {u}</span> on average. Guessing "nothing changes" was off by{' '}
                <span className="mono">{fmt(bt.error_no_change, dec)} {u}</span>
                {bt.error_model < bt.error_no_change ? ', so the model did better.' : ', so here the model was no better than guessing. Small areas and noisy variables are hard to predict.'}
              </li>
            </ul>
          </Card>
        )}

        <Card>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left font-semibold" onClick={() => setHowOpen((o) => !o)} aria-expanded={howOpen}>
            How the model works, and what it can't do
            <span className="text-accent">{howOpen ? 'Hide' : 'Show'}</span>
          </button>
          {howOpen && (
            <div className="mt-3 space-y-3 text-muted">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  It takes NASA's monthly record for this area ({a.points.toLocaleString()} grid points averaged, {a.start_year}–{a.end_year}) and removes the seasons, so a normal July
                  counts as zero.
                </li>
                <li>
                  It draws the best straight line through {isRecentModel ? `the last ${cal.recent_years} years` : 'the whole record'}. We tried both the whole record and
                  only the last {cal.recent_years} years, tested each on the past, and kept the one that guessed better for {varDef.name.toLowerCase()}.
                </li>
                <li>It measures the natural ups and downs: how big they are, and how much one month or year tends to carry into the next (El Niño-type swings).</li>
                <li>
                  It runs {file.runs.toLocaleString()} possible futures. Each one picks a slightly different trend line (we can't know the exact one) and adds random ups and
                  downs that look like the real ones.
                </li>
                <li>
                  Tested on the past, the first version was too confident: its 9 in 10 ranges caught only {pct(cal.coverage_before)} of real years. So we widened the
                  uncertainty {cal.spread > 1 ? `${fmt(cal.spread, 1)} times` : ''} until they caught {pct(cal.coverage_after)}.
                </li>
              </ol>
              <p>
                <span className="font-semibold text-ink">It is a statistical model, not a climate model.</span> It only learns from the pattern in the data. It doesn't know
                what people will do about emissions, and it can't see a big volcanic eruption coming. Climate models used by the IPCC simulate the physics instead, and they
                show warming carrying on while emissions continue.
              </p>
              <p>Our record starts in 1981. The world had already warmed before then, so these changes come on top of that.</p>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="anim-fade fixed inset-0 z-50 overflow-y-auto bg-space/90 backdrop-blur-sm scroll-thin" role="dialog" aria-modal="true" aria-label="2040 outlook">
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-6">
        <header className="sticky top-0 z-10 -mx-4 mb-4 bg-space/95 px-4 pt-4 pb-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold leading-tight md:text-2xl">What could 2040 look like?</h2>
              <p className="text-muted">A statistical model built on NASA's real measurements since 1981.</p>
            </div>
            <button type="button" className="btn btn-quiet h-9 w-9 shrink-0 justify-center px-0" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="scroll-thin -mx-1 flex max-w-full gap-1 overflow-x-auto px-1" role="tablist" aria-label="Variable">
              {(variables || []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={variableId === v.id}
                  onClick={() => setVariableId(v.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 ${variableId === v.id ? 'border-accent bg-accent/20 text-ink' : 'border-slate-400/25 text-muted hover:border-accent/50'}`}
                >
                  {v.name}
                </button>
              ))}
            </div>
            <label className="ml-auto flex min-w-0 items-center gap-2">
              <span className="text-muted">Where</span>
              <select className="field min-w-0 max-w-[16rem]" value={areaId} onChange={(e) => setAreaId(e.target.value)} aria-label="Choose an area">
                {grouped.map(([g, items]) => (
                  <optgroup key={g} label={g}>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        </header>
        {body}
      </div>
    </div>
  )
}
