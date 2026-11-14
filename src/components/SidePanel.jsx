import { useState } from 'react'
import TrendChart from './TrendChart.jsx'
import Sparkline from './Sparkline.jsx'
import { buildVerdict, directionWord } from '../lib/verdict.js'
import { fmt, fmtSigned, fmtP, fmtCoords } from '../lib/format.js'
import { yearsToSignificance, zFromP } from '../lib/stats.js'

function Section({ title, children, right }) {
  return (
    <section className="border-t border-slate-400/10 px-5 py-4 first:border-t-0">
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-muted uppercase tracking-wide text-[14px]">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export default function SidePanel({
  cell,
  varDef,
  variables,
  trends,
  series,
  region,
  year,
  otherSeries,
  serial,
  onClose,
  onOpenSignificance,
  onSwitchVariable,
  regionMix = null,
  className = '',
}) {
  const [deseasonalised, setDeseasonalised] = useState(true)
  const [numbersOpen, setNumbersOpen] = useState(false)
  if (!cell || !varDef) return null

  const verdict = buildVerdict(cell, varDef)
  const endYear = trends.end_year
  const reading = serial.status === 'connected' && varDef.sensor ? serial.readings[varDef.sensor.key] : undefined
  const latest = series ? series.values[series.values.length - 1] : null
  const latestDate = series ? series.dates[series.dates.length - 1] : null
  const others = (variables || []).filter((v) => v.id !== varDef.id)

  // A trend that isn't significant yet can still become significant with more data.
  let notYet = null
  if (!cell.significant && series && cell.slope_per_decade !== 0) {
    const extra = yearsToSignificance(zFromP(cell.p_value), series.years_of_data)
    if (extra !== null && extra <= 60) {
      notYet = `Not significant yet. If it keeps changing at this pace, about ${Math.max(1, Math.round(extra))} more years of data could be enough to show it's real.`
    } else if (extra !== null) {
      notYet = 'At this pace it would take more than 60 more years of data to show a real trend, so this is most likely natural ups and downs.'
    }
  }

  return (
    <aside
      className={`glass pointer-events-auto flex h-full flex-col overflow-hidden ${className}`}
      aria-label="Details for the selected place"
      style={{ borderRadius: 18 }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <div className="text-muted">{region.type || 'Selected place'}</div>
          <h2 className="text-xl font-semibold leading-tight">{region.name}</h2>
          <div className="mono mt-1 text-muted">
            {cell.isRegion ? `Region · average of ${cell.cellCount} grid points` : `${fmtCoords(cell.lat, cell.lon)} · 2° area`}
          </div>
        </div>
        <button type="button" className="btn btn-quiet h-9 w-9 justify-center px-0" onClick={onClose} aria-label="Close panel">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <Section>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold">{varDef.name}</div>
            <div className="mono text-muted">{varDef.units_long || varDef.units}</div>
          </div>
          <p className="mt-0.5 text-muted">{varDef.definition}.</p>
        </Section>

        <Section>
          <div
            className={`rounded-2xl border p-4 ${
              verdict.tone === 'up'
                ? 'border-rising/40 bg-rising/10'
                : verdict.tone === 'down'
                  ? 'border-falling/40 bg-falling/10'
                  : 'border-slate-400/25 bg-slate-400/10'
            }`}
          >
            <span className={`badge badge-${verdict.tone}`}>{verdict.badge}</span>
            <p className="mt-3 text-lg font-semibold leading-snug">{verdict.text}</p>
            <p className="mt-2 text-muted">
              Direction in words: <span className="text-ink">{directionWord(cell)}</span>.{' '}
              <button type="button" className="link-quiet" onClick={onOpenSignificance}>
                What does significant mean?
              </button>
            </p>
            {notYet && <p className="mt-2 border-t border-slate-400/15 pt-2">{notYet}</p>}
          </div>
        </Section>

        <Section
          title={`Monthly values since ${series && series.start_year ? series.start_year : trends.start_year}`}
          right={
            <label className="flex cursor-pointer items-center gap-2 text-muted select-none">
              <input
                type="checkbox"
                className="h-4 w-4 accent-cyan-400"
                checked={deseasonalised}
                onChange={(e) => setDeseasonalised(e.target.checked)}
              />
              Seasons removed
            </label>
          }
        >
          <TrendChart series={series} varDef={varDef} deseasonalised={deseasonalised} year={year} endYear={endYear} />
          <p className="mt-3 rounded-xl border border-rising/30 bg-rising/5 px-3 py-2 text-muted">
            <span className="font-semibold text-rising">If this trend continues…</span> the dotted line extends the measured trend to 2040. It is a
            straight-line extension, not a climate forecast, and the band widens because the further ahead we look, the less certain we are.
          </p>
          {cell.isRegion && (
            <p className="mt-2 text-muted">
              Every month is the average of {cell.cellCount} grid points inside the outlined area, each weighted by the ground it covers.
            </p>
          )}
          {cell.isRegion && regionMix && regionMix.upShare >= 0.1 && regionMix.downShare >= 0.1 && (
            <p className="mt-2 rounded-xl border border-slate-400/20 bg-slate-400/5 px-3 py-2">
              Inside this area the trend goes both ways: a significant rise over {Math.round(regionMix.upShare * 100)}% of it and a significant fall over{' '}
              {Math.round(regionMix.downShare * 100)}%. An average can hide changes that pull in opposite directions, so look at the colours on the globe too.
            </p>
          )}
          {series && series.source === 'synthetic' && (
            <p className="mt-2 text-muted">Showing placeholder data generated in the browser until the real series file arrives.</p>
          )}
        </Section>

        <Section
          title="The numbers"
          right={
            <button type="button" className="link-quiet" onClick={() => setNumbersOpen((o) => !o)} aria-expanded={numbersOpen}>
              {numbersOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          {numbersOpen && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt className="text-muted">Slope per decade</dt>
              <dd className="mono text-right">{fmtSigned(cell.slope_per_decade, varDef.decimals)} {varDef.units}</dd>
              <dt className="text-muted">Total change since {trends.start_year}</dt>
              <dd className="mono text-right">{series ? `${fmtSigned(series.total_change, varDef.decimals)} ${varDef.units}` : '…'}</dd>
              <dt className="text-muted">p-value (trend line)</dt>
              <dd className="mono text-right">{fmtP(cell.p_value)}</dd>
              <dt className="text-muted">Mann-Kendall tau</dt>
              <dd className="mono text-right">{series ? fmtSigned(series.mann_kendall.tau, 2) : '…'}</dd>
              <dt className="text-muted">Mann-Kendall p-value</dt>
              <dd className="mono text-right">{series ? fmtP(series.mann_kendall.p_value) : '…'}</dd>
              <dt className="text-muted">Years of data</dt>
              <dd className="mono text-right">{series ? fmt(series.years_of_data, 1) : '…'} years</dd>
              <dt className="text-muted">{cell.isRegion ? 'Grid points averaged' : 'Grid cell'}</dt>
              <dd className="mono text-right">{cell.isRegion ? cell.cellCount : cell.id}</dd>
            </dl>
          )}
          {!numbersOpen && (
            <p className="text-muted">
              Slope <span className="mono text-ink">{fmtSigned(cell.slope_per_decade, varDef.decimals)} {varDef.units_per_decade}</span>, p-value{' '}
              <span className="mono text-ink">{fmtP(cell.p_value)}</span>.
            </p>
          )}
        </Section>

        <Section title="How it connects">
          <p className="mb-3 text-muted">The other five variables at this same place. Click one to switch the globe.</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {others.map((v) => {
              const s = otherSeries ? otherSeries[v.id] : null
              const sig = s ? s.p_value < 0.05 : false
              const tone = s && sig ? (s.slope_per_decade >= 0 ? 'up' : 'down') : 'none'
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSwitchVariable(v.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-400/15 bg-slate-400/5 px-3 py-2 text-left hover:border-accent/50 hover:bg-slate-400/10"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{v.name}</div>
                      <div className="mono text-muted truncate">
                        {s ? `${fmtSigned(s.slope_per_decade, v.decimals)} ${v.units}/decade` : '…'}
                        {s && !sig ? ' · not sig.' : ''}
                      </div>
                    </div>
                    <Sparkline series={s} tone={tone} width={96} height={32} />
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>

        {varDef.sensor && (
          <Section title="Live from the room">
            {serial.status === 'connected' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                  <div className="text-muted">{varDef.sensor.name}</div>
                  <div className="mono mt-1 text-2xl font-semibold">
                    {reading === undefined ? '–' : fmt(reading, 1)} <span className="text-base text-muted">{varDef.sensor.units}</span>
                  </div>
                  <div className="text-muted">right now, in this room</div>
                </div>
                <div className="rounded-xl border border-slate-400/20 bg-slate-400/5 p-3">
                  <div className="text-muted">NASA latest value</div>
                  <div className="mono mt-1 text-2xl font-semibold">
                    {latest === null ? '–' : fmt(latest, varDef.decimals)} <span className="text-base text-muted">{varDef.units}</span>
                  </div>
                  <div className="text-muted">{latestDate}, this place</div>
                </div>
              </div>
            ) : (
              <p className="text-muted">
                Connect the controller box to compare the {varDef.sensor.name.toLowerCase()} in this room with NASA's latest value for this place.
              </p>
            )}
          </Section>
        )}
      </div>
    </aside>
  )
}
