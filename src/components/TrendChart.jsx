import { useMemo, useState } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

const Plot = createPlotlyComponent(Plotly)

const ACCENT = '#22d3ee'
const PRED = '#fb923c'
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SPANS = [
  { id: 'all', label: 'All years' },
  { id: '10', label: 'Last 10 years' },
  { id: '2', label: 'Last 2 years' },
]
const signed = (v, dec) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dec)}`

export default function TrendChart({ series, varDef, deseasonalised, year, endYear }) {
  const [span, setSpan] = useState('all')
  const { data, layout } = useMemo(() => {
    if (!series) return { data: [], layout: {} }
    const n = series.values.length
    const mean = series.values.reduce((a, b) => a + b, 0) / n
    const offset = deseasonalised ? 0 : mean // anomalies sit around zero; raw values around the mean
    const shift = (arr) => (offset ? arr.map((v) => v + offset) : arr)
    const monthly = deseasonalised ? series.deseasonalised : series.values
    const pred = series.prediction || { dates: [], values: [], low: [], high: [] }
    const lastDate = series.dates[n - 1]
    const unit = varDef.units
    const dec = varDef.decimals
    const hover = `%{y:.${dec}f} ${unit}`
    // Hover text for each month: its value, and with seasons removed, how far it was from a
    // normal month of the same name.
    const monthText = series.dates.map((d, i) => {
      const v = series.values[i]
      const a = series.deseasonalised[i]
      if (v === null || v === undefined) return 'no data'
      const usual = a === null || a === undefined ? null : v - a
      const mName = MONTH_NAMES[Number(d.slice(5, 7)) - 1]
      const short = mName.slice(0, 3)
      return deseasonalised && usual !== null
        ? `${signed(a, dec)} vs a normal ${short} (${v.toFixed(dec)} ${unit})`
        : `${v.toFixed(dec)} ${unit}${usual !== null ? ` (normal ${short}: ${usual.toFixed(dec)})` : ''}`
    })
    // Visible window: all years, or the last few years so single months can be seen.
    const lastYear = Number(lastDate.slice(0, 4))
    const lastMonth = Number(lastDate.slice(5, 7))
    const zoomYears = span === 'all' ? null : Number(span)
    const pad = (y, m) => `${y}-${String(m).padStart(2, '0')}-15`
    const xRange = zoomYears ? [pad(lastYear - zoomYears, lastMonth), `${lastDate}-28`] : ['1979-06-01', '2041-06-01']
    let yRange = null
    if (zoomYears) {
      const from = `${lastYear - zoomYears}-${String(lastMonth).padStart(2, '0')}`
      let lo = Infinity
      let hi = -Infinity
      series.dates.forEach((d, i) => {
        if (d < from) return
        for (const v of [monthly[i], shift(series.ci_low)[i], shift(series.ci_high)[i]]) {
          if (v === null || v === undefined) continue
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
      })
      if (Number.isFinite(lo)) {
        const m = (hi - lo) * 0.08 || 0.1
        yRange = [lo - m, hi + m]
      }
    }

    const traces = [
      {
        name: 'This month',
        x: series.dates,
        y: monthly,
        text: monthText,
        type: 'scatter',
        mode: zoomYears ? 'lines+markers' : 'lines',
        line: { color: zoomYears ? 'rgba(203,213,225,0.7)' : 'rgba(148,163,184,0.55)', width: zoomYears ? 1.5 : 1 },
        marker: { size: zoomYears === 2 ? 7 : 4, color: '#e2e8f0' },
        hovertemplate: '%{text}<extra></extra>',
      },
      {
        name: 'ci-high',
        x: series.dates,
        y: shift(series.ci_high),
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        name: '95% confidence band',
        x: series.dates,
        y: shift(series.ci_low),
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(34,211,238,0.16)',
        line: { width: 0 },
        hoverinfo: 'skip',
      },
      {
        name: 'Trend line',
        x: series.dates,
        y: shift(series.trend_line),
        type: 'scatter',
        mode: 'lines',
        line: { color: ACCENT, width: 2.5 },
        hovertemplate: hover + '<extra>Trend</extra>',
      },
      {
        name: 'pred-high',
        x: pred.dates,
        y: shift(pred.high),
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        name: 'Projection band',
        x: pred.dates,
        y: shift(pred.low),
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(251,146,60,0.14)',
        line: { width: 0 },
        hoverinfo: 'skip',
      },
      {
        name: 'If this trend continues',
        x: pred.dates,
        y: shift(pred.values),
        type: 'scatter',
        mode: 'lines',
        line: { color: PRED, width: 2.5, dash: 'dot' },
        hovertemplate: hover + '<extra>Projected</extra>',
      },
    ]

    const yearX = `${Math.min(2040, Math.max(1980, year))}-06-15`
    const grid = 'rgba(148,163,184,0.12)'
    const layout = {
      autosize: true,
      height: 280,
      margin: { l: 48, r: 12, t: 28, b: 36 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#cbd5e1' },
      showlegend: false,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#0f172a', bordercolor: 'rgba(148,163,184,0.3)', font: { family: 'JetBrains Mono, monospace', size: 12, color: '#e2e8f0' } },
      xaxis: {
        type: 'date',
        range: xRange,
        gridcolor: grid,
        zeroline: false,
        tickfont: { family: 'JetBrains Mono, monospace' },
        dtick: zoomYears === 2 ? 'M3' : zoomYears ? 'M24' : 'M120',
        tickformat: zoomYears === 2 ? '%b<br>%Y' : '%Y',
        hoverformat: '%B %Y',
      },
      yaxis: {
        title: { text: deseasonalised ? `Change (${unit})` : unit, font: { size: 12 } },
        gridcolor: grid,
        zeroline: deseasonalised,
        zerolinecolor: 'rgba(148,163,184,0.3)',
        tickfont: { family: 'JetBrains Mono, monospace' },
        tickformat: `.${Math.max(0, dec - 1)}f`,
        ...(yRange ? { range: yRange, autorange: false } : {}),
      },
      shapes: [
        {
          type: 'line',
          x0: lastDate,
          x1: lastDate,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: 'rgba(226,232,240,0.5)', width: 1 },
        },
        {
          type: 'rect',
          x0: lastDate,
          x1: '2041-06-01',
          y0: 0,
          y1: 1,
          yref: 'paper',
          fillcolor: 'rgba(251,146,60,0.05)',
          line: { width: 0 },
          layer: 'below',
        },
        {
          type: 'line',
          x0: yearX,
          x1: yearX,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: ACCENT, width: 1, dash: 'dash' },
        },
      ],
      annotations: [
        {
          x: lastDate,
          y: 1,
          yref: 'paper',
          yanchor: 'bottom',
          xanchor: 'right',
          text: 'Measured',
          showarrow: false,
          font: { size: 11, color: '#cbd5e1' },
          xshift: -4,
        },
        {
          x: 1,
          xref: 'paper',
          y: 1,
          yref: 'paper',
          yanchor: 'bottom',
          xanchor: 'right',
          text: 'Projected',
          showarrow: false,
          font: { size: 11, color: PRED },
        },
      ],
    }
    return { data: traces, layout }
  }, [series, varDef, deseasonalised, year, endYear, span])

  if (!series) return <div className="h-[280px] animate-pulse rounded-xl bg-slate-700/30" aria-busy="true" />

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1.5" role="group" aria-label="How much of the record to show">
        {SPANS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSpan(o.id)}
            aria-pressed={span === o.id}
            className={`rounded-full border px-3 py-1 ${span === o.id ? 'border-accent bg-accent/20 text-ink' : 'border-slate-400/25 text-muted hover:border-accent/50'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false }}
        useResizeHandler
        style={{ width: '100%', height: 280 }}
      />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-slate-400/70" /> each month</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-accent" /> trend</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-accent/25" /> 95% band</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dotted border-rising" /> projection</span>
      </div>
    </div>
  )
}
