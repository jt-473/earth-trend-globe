import { useMemo } from 'react'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

const Plot = createPlotlyComponent(Plotly)

const ACCENT = '#22d3ee'
const PRED = '#fb923c'

export default function TrendChart({ series, varDef, deseasonalised, year, endYear }) {
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

    const traces = [
      {
        name: deseasonalised ? 'Monthly, seasons removed' : 'Monthly value',
        x: series.dates,
        y: monthly,
        type: 'scatter',
        mode: 'lines',
        line: { color: 'rgba(148,163,184,0.55)', width: 1 },
        hovertemplate: hover + '<extra>Monthly</extra>',
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
        range: ['1979-06-01', '2041-06-01'],
        gridcolor: grid,
        zeroline: false,
        tickfont: { family: 'JetBrains Mono, monospace' },
        dtick: 'M120',
        tickformat: '%Y',
      },
      yaxis: {
        title: { text: deseasonalised ? `Change (${unit})` : unit, font: { size: 12 } },
        gridcolor: grid,
        zeroline: deseasonalised,
        zerolinecolor: 'rgba(148,163,184,0.3)',
        tickfont: { family: 'JetBrains Mono, monospace' },
        tickformat: `.${Math.max(0, dec - 1)}f`,
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
  }, [series, varDef, deseasonalised, year, endYear])

  if (!series) return <div className="h-[280px] animate-pulse rounded-xl bg-slate-700/30" aria-busy="true" />

  return (
    <div>
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true, scrollZoom: false, doubleClick: false }}
        useResizeHandler
        style={{ width: '100%', height: 280 }}
      />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-slate-400/70" /> monthly</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-accent" /> trend</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-accent/25" /> 95% band</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 border-t-2 border-dotted border-rising" /> projection</span>
      </div>
    </div>
  )
}
