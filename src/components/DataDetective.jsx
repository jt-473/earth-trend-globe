import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { loadTrends } from '../lib/data.js'
import { PLACE_KINDS, buildCatalogue, describeStats, hintFor, rankPlaces, searchCatalogue, statsTone } from '../lib/explore.js'

function StepLabel({ n, children }) {
  return (
    <div className="mb-2 flex items-center gap-2 font-semibold">
      <span className="mono h-7 w-7 shrink-0 rounded-full bg-accent/20 text-center leading-7 text-accent">{n}</span>
      {children}
    </div>
  )
}

function PlaceRow({ entry, varDef, onPick }) {
  const { item, stats } = entry
  const hint = hintFor(item, varDef.id)
  const tone = statsTone(stats)
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className="flex w-full items-start gap-3 rounded-xl border border-slate-400/15 bg-slate-400/5 px-3 py-2.5 text-left hover:border-accent/50 hover:bg-slate-400/10 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone === 'up' ? 'bg-rising' : tone === 'down' ? 'bg-falling' : tone === 'mixed' ? 'bg-gradient-to-r from-falling to-rising' : 'bg-slate-500'}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {item.name} <span className="font-normal text-muted">· {item.type}</span>
          </span>
          {stats && <span className="block text-muted">{describeStats(stats, varDef)}</span>}
          {hint && <span className="mt-0.5 block text-muted italic">Why look here: {hint}</span>}
        </span>
        <span className="shrink-0 self-center text-accent">Analyse →</span>
      </button>
    </li>
  )
}

// A short series of questions: what to investigate, then where. It ends with a ranked list
// of places, and picking one opens the full analysis for that region.
export default function DataDetective({ variables, regionsFile, initialVariable, onClose, onAnalyse, onDraw }) {
  const [variableId, setVariableId] = useState(null)
  const [where, setWhere] = useState(null) // { kind: 'type', id } | { kind: 'anywhere' }
  const [query, setQuery] = useState('')
  const [trends, setTrends] = useState(null)
  const catalogue = useMemo(() => buildCatalogue(regionsFile), [regionsFile])
  const varDef = variables ? variables.find((v) => v.id === variableId) : null
  const step2Ref = useRef(null)
  const step3Ref = useRef(null)

  // Bring the next question into view once one is answered (matters on phones).
  useEffect(() => {
    if (variableId && step2Ref.current) step2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [variableId])
  useEffect(() => {
    if (where && step3Ref.current) step3Ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [where])

  useEffect(() => {
    if (!variableId) return
    let alive = true
    setTrends(null)
    loadTrends(variableId).then((t) => alive && setTrends(t))
    return () => {
      alive = false
    }
  }, [variableId])

  const matches = useMemo(() => searchCatalogue(catalogue, query), [catalogue, query])

  const ranked = useMemo(() => {
    if (!trends || !varDef || !where) return null
    let items
    if (where.kind === 'anywhere') items = catalogue.filter((c) => c.kind === 'region' || c.kind === 'continent')
    else {
      const kind = PLACE_KINDS.find((k) => k.id === where.id)
      items = catalogue.filter((c) => c.kind === 'region' && kind.match.test(c.type))
    }
    return rankPlaces(trends, items, varDef.colour_range_per_decade)
  }, [trends, varDef, where, catalogue])

  const pick = (item) => onAnalyse(item, variableId)

  return (
    <Modal title="Be a data detective" onClose={onClose} wide>
      <p className="-mt-2 mb-4 text-muted">
        Answer two questions and we'll suggest places to investigate. Every suggestion is worked out from the data, so you can check whether the change is real.
      </p>

      <StepLabel n="1">What do you want to investigate?</StepLabel>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Variable">
        {(variables || []).map((v) => {
          const active = v.id === variableId
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVariableId(v.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active ? 'border-accent bg-accent/15' : 'border-slate-400/20 bg-slate-400/5 hover:bg-slate-400/10'
              }`}
            >
              <span className="block font-semibold">{v.name}</span>
              <span className="block text-muted">{v.definition}.</span>
            </button>
          )
        })}
      </div>
      {!variableId && initialVariable && (
        <button type="button" className="link-quiet mt-2" onClick={() => setVariableId(initialVariable)}>
          Use the one on the globe now
        </button>
      )}

      {varDef && (
        <>
          <div className="mt-6" ref={step2Ref}>
            <StepLabel n="2">Where?</StepLabel>
            <label className="sr-only" htmlFor="detective-search">
              Search for a place
            </label>
            <input
              id="detective-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place: Amazon, India, Sahara, Arctic…"
              className="w-full rounded-xl border border-slate-400/25 bg-slate-400/10 px-3 py-2 text-ink placeholder:text-slate-400 focus:border-accent focus:outline-none"
              autoComplete="off"
            />
            {query && (
              <ul className="mt-2 space-y-1.5">
                {matches.length === 0 && <li className="text-muted">No match. Try a country, region or continent.</li>}
                {matches.map((item) => (
                  <PlaceRow key={item.id} entry={{ item, stats: null }} varDef={varDef} onPick={pick} />
                ))}
              </ul>
            )}

            {!query && (
              <>
                <div className="mt-3 text-muted">Or pick a kind of place:</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[{ id: 'anywhere', label: 'Anywhere: biggest changes' }, ...PLACE_KINDS].map((k) => {
                    const active = where && (where.kind === 'anywhere' ? k.id === 'anywhere' : where.id === k.id)
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setWhere(k.id === 'anywhere' ? { kind: 'anywhere' } : { kind: 'type', id: k.id })}
                        className={`rounded-full border px-3 py-1 transition-colors ${
                          active ? 'border-accent bg-accent font-semibold text-[#06202a]' : 'border-slate-400/25 bg-slate-400/10 hover:bg-slate-400/20'
                        }`}
                      >
                        {k.label}
                      </button>
                    )
                  })}
                  <button type="button" onClick={() => onDraw(variableId)} className="rounded-full border border-dashed border-accent/60 px-3 py-1 text-accent hover:bg-accent/10">
                    Draw my own area on the globe
                  </button>
                </div>
              </>
            )}
          </div>

          {!query && where && (
            <div className="mt-6" ref={step3Ref}>
              <StepLabel n="3">Suggested places, clearest change first</StepLabel>
              {!ranked && <p className="text-muted">Working it out…</p>}
              {ranked && ranked.length === 0 && <p className="text-muted">No places of this kind yet. Try another, or draw your own area.</p>}
              {ranked && (
                <ul className="space-y-1.5">
                  {ranked.slice(0, 8).map((entry) => (
                    <PlaceRow key={entry.item.id} entry={entry} varDef={varDef} onPick={pick} />
                  ))}
                </ul>
              )}
              <p className="mt-3 text-muted">
                Red dot: {varDef.name.toLowerCase()} rising. Blue: falling. Half and half: rising in some parts and falling in others. Grey: no clear trend
                over most of the area. A trend that isn't significant yet can still be
                interesting: sometimes it only needs more years of data.
              </p>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
