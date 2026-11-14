import { legendGradient, notSignificantCss } from '../lib/colors.js'
import { fmt } from '../lib/format.js'

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
        Globe shows change built up from {startYear} to <span className="mono text-ink">{year}</span>
      </div>
    </aside>
  )
}
