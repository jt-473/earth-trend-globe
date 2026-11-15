import { useEffect, useMemo, useState } from 'react'
import EventIcon from './EventIcon.jsx'
import { EONET_HOME, TREND_QUESTION, categoryInfo, fmtDate, knotsToKmh, nm2ToKm2, statusLine, timeAgo, worldviewUrl } from '../lib/events.js'
import { loadTrends, findRegion } from '../lib/data.js'
import { nearestCell } from '../lib/cells.js'
import { buildVerdict } from '../lib/verdict.js'
import { fmtCoords } from '../lib/format.js'

function CloseButton({ onClick }) {
  return (
    <button type="button" className="btn btn-quiet h-9 w-9 shrink-0 justify-center px-0" onClick={onClick} aria-label="Close events">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 3l10 10M13 3L3 13" />
      </svg>
    </button>
  )
}

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full justify-between">
      <span>{children}</span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 3h7v7M13 3L4 12" />
      </svg>
    </a>
  )
}

function strength(e) {
  if (!e.magnitude) return null
  const { value, unit } = e.magnitude
  if (/kts/i.test(unit)) return `Winds up to ${knotsToKmh(value).toLocaleString('en-GB')} km/h (${Math.round(value)} knots)`
  if (/NM\^?2/i.test(unit)) return `About ${nm2ToKm2(value).toLocaleString('en-GB')} km² in area`
  if (/acres/i.test(unit)) return `${Math.round(value).toLocaleString('en-GB')} acres burned (${Math.round(value * 0.004047).toLocaleString('en-GB')} km²)`
  return `${value} ${unit}`
}

// The long-term trend from this app's data at the event's location.
function TrendLink({ event, variables, onShowTrend }) {
  const info = categoryInfo(event.category)
  const varDef = variables && info.variable ? variables.find((v) => v.id === info.variable) : null
  const [cell, setCell] = useState(null)

  useEffect(() => {
    if (!varDef) return
    let alive = true
    setCell(null)
    const snapped = nearestCell(event.lat, event.lon)
    loadTrends(varDef.id)
      .then((t) => alive && setCell(t.byId.get(snapped.id) || null))
      .catch(() => alive && setCell(null))
    return () => {
      alive = false
    }
  }, [event.lat, event.lon, varDef])

  if (!info.variable) {
    return (
      <p className="text-muted">
        {info.plural} start deep inside the Earth, not in the weather, so there is no climate trend to compare here.
      </p>
    )
  }
  if (!varDef || !cell) return <p className="text-muted">Loading the long-term trend…</p>
  const verdict = buildVerdict(cell, varDef)
  const toneCls =
    verdict.tone === 'up' ? 'border-rising/40 bg-rising/10' : verdict.tone === 'down' ? 'border-falling/40 bg-falling/10' : 'border-slate-400/25 bg-slate-400/10'
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <div className="text-muted">{TREND_QUESTION[event.category] || `${varDef.name} here since 1981`}</div>
      <div className="mt-1 font-semibold">
        {varDef.name}: {verdict.badge}
      </div>
      <p className="mt-1">{verdict.text}</p>
      <p className="mt-2 text-muted">One event is weather. A trend over 40+ years is climate.</p>
      <button type="button" className="btn btn-primary mt-3 w-full justify-center" onClick={() => onShowTrend(event, varDef.id, cell.id)}>
        Open the full {varDef.name.toLowerCase()} trend
      </button>
    </div>
  )
}

function EventDetail({ event, regions, variables, onBack, onClose, onShowTrend }) {
  const info = categoryInfo(event.category)
  const region = findRegion(event.lat, event.lon, regions)
  const str = strength(event)
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <button type="button" className="btn btn-quiet h-9 px-2" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
          All events
        </button>
        <CloseButton onClick={onClose} />
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-5">
        <div className="mt-2 flex items-center gap-2 text-muted">
          <EventIcon category={event.category} size={26} />
          <span>{info.label}</span>
          <span aria-hidden="true">·</span>
          <span className={event.active ? 'text-emerald-300' : ''}>{statusLine(event)}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold leading-tight">{event.headline}</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Where</dt>
          <dd>
            {region.name} <span className="mono text-muted">· {fmtCoords(event.lat, event.lon)}</span>
          </dd>
          <dt className="text-muted">First seen</dt>
          <dd>{fmtDate(event.start)}</dd>
          <dt className="text-muted">Latest report</dt>
          <dd>{fmtDate(event.latest)}</dd>
          {str && (
            <>
              <dt className="text-muted">Size</dt>
              <dd>{str}</dd>
            </>
          )}
        </dl>
        {event.track && <p className="mt-2 text-muted">Its path is drawn on the globe as a dotted line.</p>}
        {event.members && (
          <div className="mt-3">
            <div className="text-muted">Latest reports in this group</div>
            <ul className="mt-1 space-y-0.5">
              {event.members.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="truncate">{m.title}</span>
                  <span className="shrink-0 text-muted">{timeAgo(m.latest)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 className="mt-5 mb-2 font-semibold uppercase tracking-wide text-muted">Long-term trend here</h3>
        <TrendLink event={event} variables={variables} onShowTrend={onShowTrend} />

        <h3 className="mt-5 mb-2 font-semibold uppercase tracking-wide text-muted">See the evidence</h3>
        <div className="space-y-2">
          <ExternalLink href={worldviewUrl(event)}>Satellite images on NASA Worldview</ExternalLink>
          {event.sources.map((s) => (
            <ExternalLink key={s.id} href={s.url}>
              Report from {s.id}
            </ExternalLink>
          ))}
        </div>
      </div>
    </>
  )
}

export default function EventsDrawer({ feed, selected, regions, variables, onSelect, onClose, onShowTrend, className = '' }) {
  const [filter, setFilter] = useState('all')
  const counts = useMemo(() => {
    const c = new Map()
    for (const e of feed.events) c.set(e.category, (c.get(e.category) || 0) + 1)
    return [...c.entries()].sort((a, b) => categoryInfo(b[0]).weight - categoryInfo(a[0]).weight)
  }, [feed.events])
  const list = filter === 'all' ? feed.events : feed.events.filter((e) => e.category === filter)

  return (
    <aside className={`glass pointer-events-auto flex h-full flex-col overflow-hidden ${className}`} style={{ borderRadius: 18 }} aria-label="Natural events around the world">
      {selected ? (
        <EventDetail
          event={selected}
          regions={regions}
          variables={variables}
          onBack={() => onSelect(null)}
          onClose={onClose}
          onShowTrend={onShowTrend}
        />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div>
              <h2 className="text-xl font-semibold leading-tight">Happening around the world</h2>
              <p className="mt-0.5 text-muted">
                Storms, floods, fires and ice tracked by NASA in the past 30 days.
                {feed.offline && feed.savedAt ? ` Offline: showing the copy saved ${timeAgo(new Date(feed.savedAt).toISOString())}.` : ''}
              </p>
            </div>
            <CloseButton onClick={onClose} />
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pb-3" role="radiogroup" aria-label="Filter by type">
            {[['all', feed.events.length], ...counts].map(([id, n]) => {
              const active = filter === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilter(id)}
                  className={`rounded-full border px-3 py-1 transition-colors ${
                    active ? 'border-accent bg-accent text-[#06202a] font-semibold' : 'border-slate-400/25 bg-slate-400/10 hover:bg-slate-400/20'
                  }`}
                >
                  {id === 'all' ? 'All' : categoryInfo(id).plural} <span className={active ? '' : 'text-muted'}>{n}</span>
                </button>
              )
            })}
          </div>
          <ul className="scroll-thin flex-1 overflow-y-auto border-t border-slate-400/10 px-2 py-2">
            {feed.status === 'loading' && <li className="px-3 py-2 text-muted">Loading NASA events…</li>}
            {feed.status === 'error' && (
              <li className="px-3 py-2 text-muted">
                Could not reach NASA's event tracker.{' '}
                <button type="button" className="underline" onClick={feed.retry}>
                  Try again
                </button>
              </li>
            )}
            {list.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-400/10 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <EventIcon category={e.category} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium max-lg:line-clamp-2 lg:truncate">{e.headline}</span>
                    <span className={`block ${e.active ? 'text-emerald-300' : 'text-muted'}`}>{statusLine(e)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-400/10 px-5 py-2 text-muted">
            Source:{' '}
            <a href={EONET_HOME} target="_blank" rel="noopener noreferrer" className="underline">
              NASA EONET
            </a>
          </div>
        </>
      )}
    </aside>
  )
}

