import { legendGradient, notSignificantCss } from '../lib/colors.js'
import { fmt } from '../lib/format.js'
import { useState } from 'react'

export default function Legend({ varDef, year, startYear }) {
  if (!varDef) return null
  const r = varDef.colour_range_per_decade
  return (
    <aside className="glass pointer-events-auto w-[min(300px,calc(100vw-32px))] px-4 py-3" aria-label="Colour legend">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{varDef.name} trend</div>
        <div className="text-muted">{varDef.units_per_decade}</div>
      </div>
      <div className="mt-2 h-3 rounded-full" style={{ background: legendGradient() }} />
      <div className="mono mt-1 flex justify-between text-muted">
        <span>−{fmt(r, varDef.decimals)}</span>
        <span>0</span>
        <span>+{fmt(r, varDef.decimals)}</span>
      </div>
      <div className="mt-1 flex justify-between text-muted">
        <span>Falling</span>
        <span>Rising</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-muted">
        <span className="inline-block h-3 w-5 rounded-sm" style={{ background: notSignificantCss }} aria-hidden="true" />
        <span>Pale = not significant (p ≥ 0.05)</span>
      </div>
      <div className="mt-1 text-muted">
        The globe shows the change built up from {startYear} to <span className="mono text-ink">{year}</span>
      </div>
    </aside>
  )
}

// Phones and tablets: a slim colour key that takes little room over the globe. Tap it to
// see the same details as the full legend.
export function LegendStrip({ varDef, year, startYear }) {
  const [open, setOpen] = useState(false)
  if (!varDef) return null
  const r = varDef.colour_range_per_decade
  return (
    <aside className="glass pointer-events-auto px-3 py-2" aria-label="Colour legend">
      <button type="button" className="block w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{varDef.name} trend</span>
          <span className="flex items-center gap-1 text-muted">
            {varDef.units_per_decade}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={open ? 'rotate-180' : ''}>
              <path d="M2 4l4 4 4-4" />
            </svg>
          </span>
        </span>
        <span className="mt-1.5 block h-2.5 rounded-full" style={{ background: legendGradient() }} />
        <span className="mono mt-1 flex justify-between text-muted">
          <span>−{fmt(r, varDef.decimals)} falling</span>
          <span>rising +{fmt(r, varDef.decimals)}</span>
        </span>
      </button>
      {open && (
        <div className="mt-2 border-t border-slate-400/15 pt-2 text-muted">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-5 rounded-sm" style={{ background: notSignificantCss }} aria-hidden="true" />
            <span>Pale = not significant (p ≥ 0.05)</span>
          </div>
          <div className="mt-1">
            The globe shows the change built up from {startYear} to <span className="mono text-ink">{year}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
