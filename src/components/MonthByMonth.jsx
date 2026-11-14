import { useMemo, useState } from 'react'
import { fmt, fmtSigned } from '../lib/format.js'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Words for "higher than normal" and "lower than normal" for each variable.
const MORE_LESS = {
  temperature: ['warmer', 'cooler'],
  humidity: ['more humid', 'drier'],
  rainfall: ['wetter', 'drier'],
  sunlight: ['sunnier', 'dimmer'],
  air_pollution: ['hazier', 'clearer'],
  ozone: ['more ozone', 'less ozone'],
}

// Every month of one chosen year: the value NASA measured, and how it compares with a
// normal month of the same name (the average of that month over the whole record).
export default function MonthByMonth({ series, varDef }) {
  const years = useMemo(() => {
    if (!series) return []
    return [...new Set(series.dates.map((d) => d.slice(0, 4)))].reverse()
  }, [series])
  const [picked, setPicked] = useState(null)
  if (!series || !years.length) return null
  const year = picked && years.includes(picked) ? picked : years[0]
  const dec = varDef.decimals
  const u = varDef.units
  const [more, less] = MORE_LESS[varDef.id] || ['higher', 'lower']
  const rows = series.dates
    .map((d, i) => ({ d, v: series.values[i], a: series.deseasonalised[i] }))
    .filter((r) => r.d.startsWith(year))
  const known = rows.filter((r) => r.v !== null && r.v !== undefined)
  const top = known.length ? known.reduce((p, q) => (q.v > p.v ? q : p)) : null
  const bottom = known.length ? known.reduce((p, q) => (q.v < p.v ? q : p)) : null
  const tiny = 0.5 * 10 ** -dec

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Month by month</h4>
        <label className="flex items-center gap-2 text-muted">
          Year
          <select className="field mono" value={year} onChange={(e) => setPicked(e.target.value)} aria-label="Choose a year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-400/15">
        <table className="w-full border-collapse">
          <thead className="bg-slate-400/10 text-left text-muted">
            <tr>
              <th className="px-2 py-1.5 sm:px-3 font-normal">Month</th>
              <th className="px-2 py-1.5 sm:px-3 text-right font-normal">Measured</th>
              <th className="px-2 py-1.5 sm:px-3 text-right font-normal">Compared with normal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = MONTH_NAMES[Number(r.d.slice(5, 7)) - 1]
              const has = r.v !== null && r.v !== undefined
              const hasA = r.a !== null && r.a !== undefined
              const diff = hasA && Math.abs(r.a) >= tiny ? r.a : 0
              return (
                <tr key={r.d} className="border-t border-slate-400/10">
                  <td className="px-2 py-1.5 sm:px-3">
                    {m}
                    {r === top && known.length > 1 && <span className="ml-2 text-orange-300">highest</span>}
                    {r === bottom && known.length > 1 && <span className="ml-2 text-sky-300">lowest</span>}
                  </td>
                  <td className="mono whitespace-nowrap px-2 py-1.5 sm:px-3 text-right">{has ? `${fmt(r.v, dec)} ${u}` : 'no data'}</td>
                  <td className={`mono whitespace-nowrap px-2 py-1.5 sm:px-3 text-right ${!hasA || diff === 0 ? 'text-muted' : diff > 0 ? 'text-orange-300' : 'text-sky-300'}`}>
                    {!hasA ? (
                      '–'
                    ) : diff === 0 ? (
                      'normal'
                    ) : (
                      <>
                        {fmtSigned(diff, dec)} {u} <span className="block sm:inline">{diff > 0 ? more : less}</span>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-muted">
        "Normal" is the average for that month of the year, worked out over every year from {series.start_year || series.dates[0].slice(0, 4)} to{' '}
        {years[0]}. So "+0.5 {u} {more}" in July means 0.5 {u} above a normal July.
      </p>
    </div>
  )
}
